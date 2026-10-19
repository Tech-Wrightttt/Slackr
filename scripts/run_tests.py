"""
SLACKR automated test run: backend (pytest + coverage.py with branch coverage) and frontend
(Vitest + V8 coverage), merged into one PDF report under test-reports/.

    backend\\venv\\Scripts\\python.exe scripts/run_tests.py

Test techniques are tagged in the suites themselves: pytest markers in backend/tests and
[tag] prefixes in frontend/tests describe titles (blackbox, whitebox, EP, BVA, branch, statement).
Exits non-zero when any test fails, so it can gate CI as well.
"""

import json
import os
import platform
import re
import shutil
import subprocess
import sys
import time
from collections import Counter, defaultdict
from datetime import datetime
from pathlib import Path

from reportlab.lib import colors
from reportlab.lib.enums import TA_CENTER
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import mm
from reportlab.platypus import (
    KeepTogether, PageBreak, Paragraph, SimpleDocTemplate, Spacer, Table, TableStyle,
)

ROOT = Path(__file__).resolve().parent.parent
BACKEND = ROOT / "backend"
FRONTEND = ROOT / "frontend"
OUT_DIR = ROOT / "test-reports"
RAW = OUT_DIR / ".raw"  # machine-readable results of the latest run, overwritten each time

TECHNIQUES = [
    ("blackbox", "Black-box", "Tests derived from the specification only: inputs, documented outputs and the HTTP contract."),
    ("whitebox", "White-box", "Tests written against the source code to exercise its internal structure."),
    ("ep", "Equivalence partitioning", "Inputs split into classes expected to behave alike; one representative per class."),
    ("bva", "Boundary value analysis", "Values just below, on and just above each limit (e.g. password length 7/8/9, 127/128/129)."),
    ("branch", "Branch coverage", "Each decision driven to both outcomes; measured with coverage.py --branch and V8."),
    ("statement", "Statement coverage", "Tests that execute statements no other test reaches; measured as line/statement coverage."),
]
TECH_KEYS = [t[0] for t in TECHNIQUES]


def backend_python() -> str:
    for rel in ("venv/Scripts/python.exe", "venv/bin/python"):
        if (BACKEND / rel).exists():
            return str(BACKEND / rel)
    return sys.executable


def run(cmd, cwd, env=None) -> int:
    print(f"\n$ {' '.join(cmd)}  (in {cwd.relative_to(ROOT) or '.'})", flush=True)
    return subprocess.run(cmd, cwd=cwd, env={**os.environ, **(env or {})}).returncode


def git_revision() -> str:
    try:
        sha = subprocess.check_output(["git", "rev-parse", "--short", "HEAD"], cwd=ROOT, text=True).strip()
        dirty = subprocess.check_output(["git", "status", "--porcelain"], cwd=ROOT, text=True).strip()
        return sha + (" (uncommitted changes)" if dirty else "")
    except (OSError, subprocess.CalledProcessError):
        return "unknown"


# ── Running the suites ───────────────────────────────────────────────────────

def run_backend() -> dict:
    py = backend_python()
    results_path = RAW / "backend_results.json"
    cov_env = {"COVERAGE_FILE": str(RAW / ".coverage"), "SLACKR_TEST_RESULTS": str(results_path)}
    started = time.time()
    code = run([py, "-m", "coverage", "run", "--branch",
                "--source=algorithms,parsers,services,routers,main",
                "-m", "pytest", "-q", "-p", "no:cacheprovider"], BACKEND, cov_env)
    duration = time.time() - started
    run([py, "-m", "coverage", "json", "-q", "-o", str(RAW / "backend_coverage.json")], BACKEND, cov_env)

    tests = json.loads(results_path.read_text(encoding="utf-8")) if results_path.exists() else []
    cov = json.loads((RAW / "backend_coverage.json").read_text(encoding="utf-8"))
    files = []
    for path, info in sorted(cov["files"].items()):
        s = info["summary"]
        files.append({
            "file": "backend/" + path.replace("\\", "/"),
            "statements": (s["covered_lines"], s["num_statements"]),
            "branches": (s["covered_branches"], s["num_branches"]),
            "missing": compress_lines(info.get("missing_lines", [])),
        })
    t = cov["totals"]
    return {
        "name": "Backend (Python / FastAPI)", "tool": f"pytest + coverage.py {cov['meta']['version']} (--branch)",
        "exit": code, "duration": duration, "tests": tests, "files": files,
        "totals": {"statements": (t["covered_lines"], t["num_statements"]),
                   "branches": (t["covered_branches"], t["num_branches"])},
    }


def run_frontend() -> dict:
    bun = shutil.which("bun")
    if not bun:
        raise SystemExit("bun is not on PATH; install it to run the frontend suite.")
    results_path = RAW / "frontend_results.json"
    cov_dir = RAW / "frontend_coverage"
    started = time.time()
    code = run([bun, "x", "vitest", "run", "--coverage", f"--coverage.reportsDirectory={cov_dir}",
                "--reporter=default", "--reporter=json", f"--outputFile.json={results_path}"], FRONTEND)
    duration = time.time() - started

    tests = []
    if results_path.exists():
        for suite in json.loads(results_path.read_text(encoding="utf-8"))["testResults"]:
            file = "frontend/" + Path(suite["name"]).relative_to(FRONTEND).as_posix()
            for a in suite["assertionResults"]:
                titles = " ".join(a["ancestorTitles"] + [a["title"]])
                tags = {m.lower() for m in re.findall(r"\[(\w+)\]", titles)}
                group = re.sub(r"\[\w+\]\s*", "", " > ".join(a["ancestorTitles"])).strip()
                outcome = {"passed": "passed", "failed": "failed"}.get(a["status"], "skipped")
                tests.append({
                    "suite": "frontend", "file": file, "group": group,
                    "name": re.sub(r"\[\w+\]\s*", "", a["title"]),
                    "description": "", "outcome": outcome,
                    "duration_ms": round(a.get("duration") or 0, 2),
                    "techniques": sorted(tags & set(TECH_KEYS)),
                    "message": (a.get("failureMessages") or [""])[0].splitlines()[0] if outcome == "failed" else "",
                })

    summary = json.loads((cov_dir / "coverage-summary.json").read_text(encoding="utf-8"))
    final = json.loads((cov_dir / "coverage-final.json").read_text(encoding="utf-8"))
    files = []
    for path, s in sorted(summary.items()):
        if path == "total":
            continue
        uncovered = sorted({loc["start"]["line"] for sid, loc in final[path]["statementMap"].items()
                            if final[path]["s"][sid] == 0})
        files.append({
            "file": "frontend/" + Path(path).relative_to(FRONTEND).as_posix(),
            "statements": (s["statements"]["covered"], s["statements"]["total"]),
            "branches": (s["branches"]["covered"], s["branches"]["total"]),
            "missing": compress_lines(uncovered),
        })
    t = summary["total"]
    return {
        "name": "Frontend (TypeScript / React services)", "tool": "Vitest + V8 coverage",
        "exit": code, "duration": duration, "tests": tests, "files": files,
        "totals": {"statements": (t["statements"]["covered"], t["statements"]["total"]),
                   "branches": (t["branches"]["covered"], t["branches"]["total"])},
    }


def compress_lines(lines) -> str:
    """[1, 2, 3, 7, 9, 10] -> '1-3, 7, 9-10'"""
    out, lines = [], sorted(lines)
    i = 0
    while i < len(lines):
        j = i
        while j + 1 < len(lines) and lines[j + 1] == lines[j] + 1:
            j += 1
        out.append(str(lines[i]) if i == j else f"{lines[i]}-{lines[j]}")
        i = j + 1
    return ", ".join(out)


# ── PDF ──────────────────────────────────────────────────────────────────────

GREEN, RED, AMBER, GREY = colors.HexColor("#2E7D32"), colors.HexColor("#C62828"), colors.HexColor("#B26A00"), colors.HexColor("#616161")
HEAD_BG, ROW_ALT, RULE = colors.HexColor("#1F3B2C"), colors.HexColor("#F3F6F4"), colors.HexColor("#C8D3CC")
OUTCOME_COLOR = {"passed": GREEN, "failed": RED, "xfailed": AMBER, "skipped": GREY}
OUTCOME_LABEL = {"passed": "PASS", "failed": "FAIL", "xfailed": "XFAIL", "skipped": "SKIP"}

styles = getSampleStyleSheet()
H1 = ParagraphStyle("H1", parent=styles["Heading1"], fontSize=20, spaceAfter=4, textColor=HEAD_BG)
H2 = ParagraphStyle("H2", parent=styles["Heading2"], fontSize=13, spaceBefore=10, spaceAfter=6, textColor=HEAD_BG)
H3 = ParagraphStyle("H3", parent=styles["Heading3"], fontSize=10.5, spaceBefore=8, spaceAfter=4)
BODY = ParagraphStyle("Body", parent=styles["BodyText"], fontSize=9, leading=12)
SMALL = ParagraphStyle("Small", parent=BODY, fontSize=7.5, leading=9.5)
CELL = ParagraphStyle("Cell", parent=BODY, fontSize=7.5, leading=9.5)
BANNER = ParagraphStyle("Banner", parent=BODY, fontSize=14, leading=18, alignment=TA_CENTER, textColor=colors.white)


def esc(s) -> str:
    return str(s).replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")


def pct(pair) -> str:
    covered, total = pair
    return f"{100 * covered / total:.1f}%  ({covered}/{total})" if total else "n/a"


def table(rows, widths, header=True, extra=()):
    t = Table(rows, colWidths=widths, repeatRows=1 if header else 0)
    style = [
        ("FONTSIZE", (0, 0), (-1, -1), 8),
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("GRID", (0, 0), (-1, -1), 0.4, RULE),
        ("TOPPADDING", (0, 0), (-1, -1), 3), ("BOTTOMPADDING", (0, 0), (-1, -1), 3),
    ]
    if header:
        style += [("BACKGROUND", (0, 0), (-1, 0), HEAD_BG), ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
                  ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold")]
    style += [("BACKGROUND", (0, r), (-1, r), ROW_ALT) for r in range(2 if header else 1, len(rows), 2)]
    t.setStyle(TableStyle(style + list(extra)))
    return t


def counts(tests):
    c = Counter(t["outcome"] for t in tests)
    return [len(tests), c["passed"], c["failed"], c["xfailed"], c["skipped"]]


def build_pdf(suites, path: Path, started: datetime, elapsed: float):
    all_tests = [t for s in suites for t in s["tests"]]
    total, passed, failed, xfailed, skipped = counts(all_tests)
    ok = failed == 0 and all(s["exit"] in (0, None) for s in suites)
    story = []

    # Cover / summary
    story += [Paragraph("SLACKR Automated Test Report", H1),
              Paragraph(f"Run {started:%Y-%m-%d %H:%M:%S} · commit {esc(git_revision())} · "
                        f"{platform.system()} {platform.release()} · Python {platform.python_version()} · "
                        f"total time {elapsed:.1f}s", SMALL),
              Spacer(1, 8)]
    banner = Table([[Paragraph(f"<b>{'ALL TESTS PASSED' if ok else 'TEST FAILURES'}</b> — "
                               f"{passed} passed, {failed} failed, {xfailed} expected failures, {skipped} skipped "
                               f"of {total}", BANNER)]], colWidths=[180 * mm])
    banner.setStyle(TableStyle([("BACKGROUND", (0, 0), (-1, -1), GREEN if ok else RED),
                                ("TOPPADDING", (0, 0), (-1, -1), 8), ("BOTTOMPADDING", (0, 0), (-1, -1), 8)]))
    story += [banner, Spacer(1, 6)]

    story.append(Paragraph("Summary by suite", H2))
    rows = [["Suite", "Tool", "Tests", "Pass", "Fail", "XFail", "Skip", "Statement cov.", "Branch cov.", "Time"]]
    for s in suites:
        rows.append([Paragraph(esc(s["name"]), CELL), Paragraph(esc(s["tool"]), CELL), *counts(s["tests"]),
                     pct(s["totals"]["statements"]), pct(s["totals"]["branches"]), f"{s['duration']:.1f}s"])
    story.append(table(rows, [34 * mm, 34 * mm, 11 * mm, 10 * mm, 10 * mm, 11 * mm, 10 * mm, 25 * mm, 25 * mm, 12 * mm]))

    story.append(Paragraph("Test design techniques", H2))
    rows = [["Technique", "How it is applied", "Backend", "Frontend", "Passed"]]
    for key, label, how in TECHNIQUES:
        tagged = [t for t in all_tests if key in t["techniques"]]
        per = {s: sum(1 for t in tagged if t["suite"] == s) for s in ("backend", "frontend")}
        good = sum(1 for t in tagged if t["outcome"] in ("passed", "xfailed"))
        rows.append([Paragraph(f"<b>{label}</b>", CELL), Paragraph(esc(how), CELL),
                     per["backend"], per["frontend"], f"{good}/{len(tagged)}"])
    story.append(table(rows, [32 * mm, 92 * mm, 17 * mm, 17 * mm, 18 * mm]))
    story.append(Paragraph("A test may carry several tags (e.g. white-box + branch + BVA). Coverage figures below are "
                           "measured by the tools, not inferred from the tags.", SMALL))

    # Failures and known defects
    failures = [t for t in all_tests if t["outcome"] == "failed"]
    known = [t for t in all_tests if t["outcome"] == "xfailed"]
    if failures:
        story.append(Paragraph("Failures", H2))
        rows = [["Test", "Message"]] + [[Paragraph(esc(f"{t['file']} :: {t['group']} :: {t['name']}"), CELL),
                                         Paragraph(esc(t["message"]), CELL)] for t in failures]
        story.append(table(rows, [80 * mm, 100 * mm]))
    if known:
        story.append(Paragraph("Known defects (expected failures)", H2))
        rows = [["Test", "Defect"]] + [[Paragraph(esc(f"{t['file']} :: {t['name']}"), CELL),
                                        Paragraph(esc(" — ".join(filter(None, [t["message"], t["description"]]))), CELL)]
                                       for t in known]
        story.append(table(rows, [80 * mm, 100 * mm]))

    # Coverage per file
    story += [PageBreak(), Paragraph("Coverage by file", H2)]
    for s in suites:
        rows = [["File", "Statements", "Branches", "Uncovered lines"]]
        extra = []
        for i, f in enumerate(s["files"], start=1):
            rows.append([Paragraph(esc(f["file"]), CELL), pct(f["statements"]), pct(f["branches"]),
                         Paragraph(esc(f["missing"] or "—"), CELL)])
            st, bt = f["statements"], f["branches"]
            low = (st[1] and st[0] / st[1] < 0.6) or (bt[1] and bt[0] / bt[1] < 0.6)
            if low:
                extra.append(("TEXTCOLOR", (1, i), (2, i), RED))
        rows.append([Paragraph("<b>Total</b>", CELL), pct(s["totals"]["statements"]), pct(s["totals"]["branches"]), ""])
        story += [Paragraph(esc(s["name"]), H3), table(rows, [62 * mm, 31 * mm, 31 * mm, 56 * mm], extra=extra)]
    story.append(Paragraph("Red figures are under 60%. backend/services/supabase_gateway.py and the account routes "
                           "talk to Supabase over the network and are only partly reachable offline.", SMALL))

    # Detailed cases
    story += [PageBreak(), Paragraph("Test cases", H2)]
    for s in suites:
        story.append(Paragraph(esc(s["name"]), H3))
        by_group = defaultdict(list)
        for t in s["tests"]:
            by_group[(t["file"], t["group"])].append(t)
        for (file, group), tests in by_group.items():
            rows = [["Result", "Case", "Techniques", "ms"]]
            extra = []
            for i, t in enumerate(tests, start=1):
                name = esc(t["name"]) + (f"<br/><font color='#616161'>{esc(t['description'])}</font>" if t["description"] else "")
                if t["message"] and t["outcome"] == "failed":
                    name += f"<br/><font color='#C62828'>{esc(t['message'])}</font>"
                rows.append([OUTCOME_LABEL[t["outcome"]], Paragraph(name, CELL),
                             Paragraph(", ".join(t["techniques"]), CELL), f"{t['duration_ms']:.1f}"])
                extra += [("TEXTCOLOR", (0, i), (0, i), OUTCOME_COLOR[t["outcome"]]),
                          ("FONTNAME", (0, i), (0, i), "Helvetica-Bold")]
            story.append(KeepTogether([Paragraph(f"<b>{esc(group)}</b> <font size=7 color='#616161'>{esc(file)}</font>", BODY),
                                       Spacer(1, 2)]))
            story += [table(rows, [14 * mm, 116 * mm, 36 * mm, 14 * mm], extra=extra), Spacer(1, 6)]

    def footer(canvas, doc):
        canvas.saveState()
        canvas.setFont("Helvetica", 7)
        canvas.setFillColor(GREY)
        canvas.drawString(15 * mm, 10 * mm, f"SLACKR test report · {started:%Y-%m-%d %H:%M}")
        canvas.drawRightString(195 * mm, 10 * mm, f"Page {doc.page}")
        canvas.restoreState()

    doc = SimpleDocTemplate(str(path), pagesize=A4, leftMargin=15 * mm, rightMargin=15 * mm,
                            topMargin=15 * mm, bottomMargin=16 * mm, title="SLACKR Automated Test Report",
                            author="scripts/run_tests.py")
    doc.build(story, onFirstPage=footer, onLaterPages=footer)


def main():
    started = datetime.now()
    t0 = time.time()
    RAW.mkdir(parents=True, exist_ok=True)
    suites = [run_backend(), run_frontend()]
    pdf = OUT_DIR / f"SLACKR_Test_Report_{started:%Y%m%d_%H%M%S}.pdf"
    build_pdf(suites, pdf, started, time.time() - t0)

    total, passed, failed, xfailed, skipped = counts([t for s in suites for t in s["tests"]])
    print(f"\n{passed} passed, {failed} failed, {xfailed} xfailed, {skipped} skipped of {total}")
    for s in suites:
        print(f"  {s['name']}: statements {pct(s['totals']['statements'])}, branches {pct(s['totals']['branches'])}")
    print(f"PDF report: {pdf}")
    sys.exit(0 if failed == 0 and all(s["exit"] == 0 for s in suites) else 1)


if __name__ == "__main__":
    main()
