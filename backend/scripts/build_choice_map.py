"""Map the exact answer choices of every image-only question from the official exam PDFs.

Choices for image questions (most afternoon / Subject B cards and some morning ones) live in the
question image, so the Markdown vault never says how many there are. The official question PDFs in
backend/data/pelnets/Exam_Q&A/ do: each question (or subquestion) ends with its answer group, often one
group per blank ("Answer group for C", "Answer group for D and E").

This script reads those PDFs and writes backend/data/choice_map.json:

  { "2024A_FE-B_10":   {"choices": ["a", ..., "h"]},
    "2019S_FE_PM_2.2": {"blanks": {"1": ["a", ..., "f"], "2": [...], "3": [...]}} }

Blank keys use the card's own blank labels (see `blanks` in questions_index.json). A mapping is only
written when every correct letter on the card falls inside it; everything else is listed in the report
so it can be fixed in backend/data/choice_overrides.json (same shape, applied after this map).

Needs PyMuPDF (requirements-dev.txt). Run it after the vault or its PDFs change, then generate_index.py:
  backend/venv/Scripts/python.exe backend/scripts/build_choice_map.py [--report]
"""
import json
import re
import sys
from pathlib import Path

backend_dir = Path(__file__).resolve().parent.parent
if str(backend_dir) not in sys.path:
    sys.path.insert(0, str(backend_dir))

import pymupdf  # noqa: E402

from parsers.markdown_parser import parse_markdown_file  # noqa: E402

VAULT = backend_dir / "data" / "pelnets"
PDF_ROOT = VAULT / "Exam_Q&A"
OUT_PATH = backend_dir / "data" / "choice_map.json"
LETTERS = "abcdefghijklmnop"

# --- PDF text -----------------------------------------------------------------------------------

_text_cache: dict = {}


def pdf_text(path: Path) -> str:
    if path not in _text_cache:
        with pymupdf.open(path) as doc:
            pages = [p.get_text() for p in doc]
        # Drop page footers ("- 12 -") so they never split a heading
        _text_cache[path] = "\n".join(re.sub(r"^\s*-\s*\d+\s*-\s*$", "", p, flags=re.M) for p in pages)
    return _text_cache[path]


SEASON_FOLDERS = {"S": ("April", "May"), "Apr": ("April",), "May": ("May",), "A": ("October",), "Oct": ("October",)}
# Card paper labels and PDF names don't always agree (2018 AM cards are tagged FE-A; 2022-2023
# Subject B cards come from _PM files), so each side of the exam accepts both names
PAPER_TAGS = {"AM": ("_AM", "FE-A"), "FE-A": ("_AM", "FE-A"), "PM": ("_PM", "FE-B"), "FE-B": ("_PM", "FE-B")}


def question_pdf(qid: str, paper: str):
    """The question PDF for a card: folder from the id's season token, file from the paper."""
    m = re.match(r"^(\d{4})(S|A|Apr|May|Oct)_", qid)
    if not m:
        return None
    year, season = m.groups()
    candidates = []
    for folder in SEASON_FOLDERS[season]:
        d = PDF_ROOT / year / folder
        if d.exists():
            candidates += [p for p in d.glob("*.pdf") if any(t in p.name for t in PAPER_TAGS[paper])]
    # Answer keys are tiny and named *_Answer / *_Ans; questions are the large file
    candidates = [p for p in candidates if not re.search(r"_Ans(wer)?\b|Ans\.pdf$", p.name)] or candidates
    return max(candidates, key=lambda p: p.stat().st_size) if candidates else None


# --- Segmenting ---------------------------------------------------------------------------------

# "Q12." or "Q6  Read the following ...": a numbered question start. Cover-page lists ("Q1 – Q6",
# "Q7 , Q8") and page headers ("Q2  2020") have neither the period nor a sentence after the number.
Q_HEADING = re.compile(r"^\s*Q\s?(\d+)\s*\.|^\s*Q\s?(\d+)[ \t]+(?=[A-Z])", re.M)
SQ_HEADING = re.compile(r"^\s*\[?\s*Sub-?question\s*(\d*)\s*\]?\s*$|^\s*\[?\s*Sub-?question\s*(\d+)\s*\]?", re.M | re.I)


def split_numbered(text: str, pattern: re.Pattern, sequential: bool = True) -> dict:
    """
    {number: segment} for numbered headings. Sequential mode takes 1, 2, 3... in order; otherwise any
    increasing numbers are kept, so one heading missing from the PDF text does not lose the rest.
    """
    marks = []
    expected = 1
    for m in pattern.finditer(text):
        num = next((g for g in m.groups() if g), None)
        n = int(num) if num else expected
        if (sequential and n == expected) or (not sequential and n >= expected):
            marks.append((n, m.start()))
            expected = n + 1
    segs = {}
    for i, (n, start) in enumerate(marks):
        end = marks[i + 1][1] if i + 1 < len(marks) else len(text)
        segs[n] = text[start:end]
    return segs


def questions_in(pdf: Path) -> dict:
    """Questions of a paper. Pages printed as pictures (2020 April PM Q3 and Q7) have no text and stay missing."""
    return split_numbered(pdf_text(pdf), Q_HEADING, sequential=False)


# --- Answer groups ------------------------------------------------------------------------------

GROUP_HEADING = re.compile(r"Answer\s+group(?:s)?\s*(?:for\s+(.*))?$", re.I)
CHOICE_MARK = re.compile(r"(?:^|(?<=\s))\(?([a-p])\)\s?")
LABEL_TOKEN = re.compile(r"\b([A-Z]\d?|\d+[A-Z]?)\b")


def heading_labels(rest: str) -> list:
    """Blank labels named after "Answer group for": "C", "D and E", "A1 through A3", "B to D"."""
    rest = re.sub(r"\(.*?\)", " ", rest or "")
    m = re.search(r"\b([A-Z])\s*(?:through|to|-|–)\s*([A-Z])\b", rest)
    if m:
        a, b = m.groups()
        return [chr(c) for c in range(ord(a), ord(b) + 1)]
    return [t for t in LABEL_TOKEN.findall(rest) if t not in ("I",) or len(rest.split()) == 1]


def answer_groups(segment: str) -> list:
    """
    Choice runs in a segment, in order: [{"labels": [...] | None, "letters": ["a", ...]}].

    Under an "Answer group ..." heading every mark up to the next heading belongs to that one group,
    in any layout (one per line, two columns "a) 1   f) 6", a 2x2 grid "a) c)" / "b) d)", or a table
    that repeats "a)" per column). Outside a heading (morning questions) a run starts at "a)" and the
    last run wins. A group's letters are a up to the last letter with no gap.
    Groups whose choices are drawn as pictures have no marks and come back with no letters.
    """
    groups = []
    seen: set = set()
    state = {"label": None, "heading": False, "open": False}

    def close():
        nonlocal seen
        letters = []
        for ch in LETTERS:
            if ch not in seen:
                break
            letters.append(ch)
        if state["open"]:
            groups.append({"labels": state["label"], "letters": letters if len(letters) >= 2 else []})
        seen = set()
        state["open"] = False

    for line in segment.splitlines():
        stripped = line.strip()
        h = GROUP_HEADING.search(stripped)
        if h and stripped.lower().startswith("answer group"):
            close()
            state.update(label=heading_labels(h.group(1)) or None, heading=True, open=True)
            continue
        # A mark that lost its parenthesis in the PDF ("c" alone between "b) ..." and "d) ...")
        if seen and len(stripped) == 1 and stripped in LETTERS:
            seen.add(stripped)
            continue
        for m in CHOICE_MARK.finditer(line):
            before = line[: m.start()]
            if before.strip():
                # Mid-line marks count in an answer group's columns, and after a wide gap elsewhere;
                # never right after a word ("f(x)", "case a)")
                loose = state["heading"] and re.search(r"\s$", before)
                if not (loose or re.search(r"\s{2,}$", before)):
                    continue
            letter = m.group(1)
            if letter == "a" and not state["heading"]:
                close()
                state.update(label=None, open=True)
            if state["open"]:
                seen.add(letter)
    close()
    return [g for g in groups if g["letters"] or g["labels"]]


# --- Cards --------------------------------------------------------------------------------------

def bare(label: str) -> str:
    """Card blank label without its subquestion prefix: "SQ2 A" -> "A", "1A" -> "A"."""
    label = label.split(" ")[-1]
    return re.sub(r"^\d+(?=[A-Z])", "", label)


def label_letters(groups: list) -> dict:
    """
    Blank label -> letters, from the labelled groups ("Answer group for D and E"). Picture-only groups
    map to [] (unknown). Blanks no label names fall to a single unlabelled "Answer group" in map_card.
    """
    out = {}
    for g in groups:
        for lbl in g["labels"] or []:
            out.setdefault(lbl, g["letters"])
    return out


def map_card(card: dict, segments: dict):
    """
    (entry, problems) for one card. `segments` maps subquestion number -> text (key 0 is the card's
    own segment). Blanks that cannot be resolved are left out of the entry and listed in problems.
    """
    blanks = card.get("blanks") or []
    own = answer_groups(segments[0])
    if not blanks:
        runs = [g for g in own if g["letters"]]
        if not runs:
            return None, ["no answer group found"]
        letters = runs[-1]["letters"]
        correct = (card.get("correct") or "").strip().lower()
        if len(correct) == 1 and correct not in letters:
            return None, [f"correct '{correct}' outside a-{letters[-1]}"]
        return {"choices": letters}, []

    out, problems = {}, []
    cache = {}
    for i, b in enumerate(blanks):
        m = re.match(r"^SQ(\d+)", b["label"])
        sq = int(m.group(1)) if m else 0
        if sq not in cache:
            seg = segments.get(sq) if sq else segments[0]
            cache[sq] = answer_groups(seg) if seg else []
        groups = cache[sq]
        named = label_letters(groups)
        key = bare(b["label"])
        letters = None
        if key in named:
            letters = named[key]
        elif key.isdigit() and named and len(named) >= int(key) and not any(g["labels"] is None for g in groups):
            # Positional answers ("c, d, b") follow the blanks in label order
            letters = named[sorted(named, key=lambda s: (len(s), s))[int(key) - 1]]
        else:
            free = [g for g in groups if g["labels"] is None]
            if len(free) == 1 and (not named or not key.isdigit()):
                letters = free[0]["letters"]
            elif not named and len(groups) == 1:
                letters = groups[0]["letters"]
            elif key.isdigit() and named:
                # Numbered answers with mixed labelled and shared groups: walk the groups in order
                order = []
                for g in groups:
                    order += [g["letters"]] * (len(g["labels"]) if g["labels"] else 1)
                letters = order[int(key) - 1] if int(key) - 1 < len(order) else None
        if not letters:
            problems.append(f"blank {b['label']}: " + ("choices are pictures in the PDF" if letters == [] else f"no answer group (groups: {[g['labels'] for g in groups]})"))
            continue
        if b["correct"] not in letters:
            problems.append(f"blank {b['label']} correct '{b['correct']}' outside a-{letters[-1]}")
            continue
        out[b["label"]] = letters
    return ({"blanks": out} if out else None), problems


def image_cards():
    """Every vault card whose choices are not written in its Markdown (or that has blanks)."""
    for md in sorted(VAULT.glob("20*/**/*.md")):
        q = parse_markdown_file(md)
        if q and (not q["options"] or q.get("blanks")):
            yield q


def build(report: bool = False) -> dict:
    result, problems = {}, {}
    for card in image_cards():
        pdf = question_pdf(card["id"], card["paper"])
        if not pdf:
            problems[card["id"]] = "no question PDF"
            continue
        qsegs = questions_in(pdf)
        seg = qsegs.get(card["number"])
        if seg is None:
            problems[card["id"]] = f"Q{card['number']} not found in {pdf.name}"
            continue
        subs = split_numbered(seg, SQ_HEADING)
        own = seg
        if card.get("sub_number"):
            head = str(card["sub_number"]).split(".")[0]
            sq = int(head) if head.isdigit() else 1
            # A question without subquestion headings is one subquestion
            own = subs.get(sq, seg if not subs and sq == 1 else None)
            if own is None:
                problems[card["id"]] = f"Subquestion {sq} not found in Q{card['number']} ({pdf.name})"
                continue
        entry, issues = map_card(card, {0: own, **subs})
        if issues:
            problems[card["id"]] = "; ".join(issues)
        if entry:
            entry["source"] = f"{pdf.parent.parent.name}/{pdf.parent.name}/{pdf.name}"
            result[card["id"]] = entry
    OUT_PATH.write_text(json.dumps(result, indent=1, ensure_ascii=False, sort_keys=True), encoding="utf-8")
    print(f"Mapped {len(result)} image-only cards; {len(problems)} have blanks or cards that need a manual entry in choice_overrides.json")
    if report:
        for qid, why in sorted(problems.items()):
            print(f"  {qid}: {why}")
    return {"mapped": result, "problems": problems}


if __name__ == "__main__":
    build(report="--report" in sys.argv)
