"""Audit questions_index.json for broken or suspicious question data.

Reports, per check, the question ids that fail it:
  - few_options:        fewer than 4 parsed options (and not an image-only question)
  - short_option:       an option with no letter or digit in it
  - leftover_markdown:  an option that still holds a table row, a code fence, an embed or an unclosed $
  - correct_missing:    a correct letter (or blank answer) that is not one of the choices
  - ungradable:         no single correct letter and no blank answers, so no pick can be marked right
  - choices_estimated:  an image-only question whose letters are not mapped from the exam PDF yet
                        (fix in choice_overrides.json; see build_choice_map.py --report)
  - missing_from_index: ids the session map counts but the index lacks
  - unparsed_files:     vault files that produced no question

Usage:
  python backend/scripts/audit_index.py           # summary plus up to 15 ids per check
  python backend/scripts/audit_index.py --all     # every id
  python backend/scripts/audit_index.py --json    # machine-readable
With --strict the exit code is 1 when any check fails.
"""
import json
import re
import sys
from collections import defaultdict
from pathlib import Path

backend_dir = Path(__file__).resolve().parent.parent
if str(backend_dir) not in sys.path:
    sys.path.insert(0, str(backend_dir))

from parsers.markdown_parser import parse_markdown_file  # noqa: E402

INDEX_PATH = backend_dir / "data" / "questions_index.json"
SUMMARY_PATH = backend_dir / "data" / "metadata_summary.json"
VAULT_DIR = backend_dir / "data" / "pelnets"

CURRENCY = re.compile(r"\$\d[\d,]*(?:\.\d+)?(?!\$)")

UNCLOSED_DOLLAR = re.compile(r"(?<!\\)\$")


def audit_question(q: dict) -> list:
    """Names of the checks this question fails."""
    issues = []
    options = q.get("options") or {}
    if len(options) < 4 and not q.get("is_image_based"):
        issues.append("few_options")
    # A lone digit or letter is a real choice ("5"); an empty or punctuation-only one is not
    if any(not re.search(r"[0-9A-Za-z]", text or "") for text in options.values()):
        issues.append("short_option")
    for text in options.values():
        text = text or ""
        if "```" in text or "![[" in text or re.search(r"^\s*\|.*\|\s*$", text, re.M):
            issues.append("leftover_markdown")
            break
        # An odd count of $ means unclosed math, unless one of them is a currency sign ($145)
        dollars = re.findall(r"(?<!\\)\$", text)
        if len(dollars) % 2 == 1 and not CURRENCY.search(text):
            issues.append("leftover_markdown")
            break
    correct = (q.get("correct") or "").strip().lower()
    choices = set(options) or set(q.get("fallback_choices") or [])
    if q.get("blanks"):
        if any(b["correct"] not in choices for b in q["blanks"]):
            issues.append("correct_missing")
    elif len(correct) != 1:
        issues.append("ungradable")
    elif correct not in choices:
        issues.append("correct_missing")
    if not options and q.get("choices_exact") is False:
        issues.append("choices_estimated")
    return issues


def run_audit(index: dict, summary: dict | None = None, vault_dir: Path | None = None) -> dict:
    report = defaultdict(list)
    for qid, q in index.items():
        for issue in audit_question(q):
            report[issue].append(qid)

    if summary:
        per_session = defaultdict(int)
        for q in index.values():
            per_session[q.get("session_id")] += 1
        for sessions in summary.get("sessions_by_year", {}).values():
            for s in sessions:
                if per_session.get(s["session_id"], 0) < s.get("question_count", 0):
                    report["missing_from_index"].append(s["session_id"])

    if vault_dir and vault_dir.exists():
        for md in sorted(vault_dir.glob("20*/**/*.md")):
            if parse_markdown_file(md) is None:
                report["unparsed_files"].append(str(md.relative_to(vault_dir)))

    return dict(report)


def main():
    args = set(sys.argv[1:])
    index = json.loads(INDEX_PATH.read_text(encoding="utf-8"))
    summary = json.loads(SUMMARY_PATH.read_text(encoding="utf-8")) if SUMMARY_PATH.exists() else None
    report = run_audit(index, summary, VAULT_DIR)

    if "--json" in args:
        print(json.dumps(report, indent=2))
    else:
        print(f"Audited {len(index)} questions")
        for check in ("few_options", "short_option", "leftover_markdown", "correct_missing", "ungradable", "choices_estimated",
                      "missing_from_index", "unparsed_files"):
            ids = report.get(check, [])
            print(f"  {check:20s} {len(ids)}")
            shown = ids if "--all" in args else ids[:15]
            for qid in shown:
                print(f"      {qid}")
    failing = {qid for check, ids in report.items() for qid in ids}
    if "--strict" in args and failing:
        sys.exit(1)


if __name__ == "__main__":
    main()
