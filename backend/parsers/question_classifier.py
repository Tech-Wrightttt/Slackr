"""Build-time labels for each question: kind (recall vs solving), weight tier, and repeat groups.

generate_index.py writes these onto every question, so the frontend only reads them.
Everything here is pure and deterministic so the same vault always yields the same labels.
"""
import json
import math
import re
from collections import Counter, defaultdict
from pathlib import Path
from typing import Dict, Iterable, List, Optional, Tuple

# Topics whose questions are worked out rather than recalled
SOLVING_TOPICS = {
    "algorithms",
    "data-structures",
    "number-systems",
    "probability",
    "statistics",
    "math",
    "digital-logic",
    "automata-theory",
}

CODE_MARKERS = re.compile(
    r"```|←|<-\s*\w|\bend\s*(?:if|while|for)\b|\bendif\b|\bwhile\b.*\bdo\b|\bif\b.+\bthen\b"
    r"|\bfor\s+\w+\s*(?:=|←|from)|\breturn\b\s*\w|\bprint\s*\(|\w+\[\w+\]\s*(?:=|←)",
    re.IGNORECASE,
)
FLOWCHART = re.compile(r"flow\s*chart|pseudo-?code|program|algorithm below|following procedure", re.IGNORECASE)
FORMULA = re.compile(r"\$[^$\n]+\$")
ASKS_FOR_VALUE = re.compile(
    r"how many|how much|calculate|compute|what is the (?:value|output|result|minimum|maximum|number|total"
    r"|probability|expected|average|mean|ratio|rate|amount|sum)|which of the following is the (?:value|output"
    r"|result|correct value|number|minimum|maximum|total|probability|expected)|\bminimum\b|\bmaximum\b"
    r"|resulting value|evaluat|convert|equivalent to|in (?:decimal|binary|hexadecimal|octal)"
    r"|approximately|at least|at most",
    re.IGNORECASE,
)
NUMBER_WITH_UNIT = re.compile(
    r"\b\d[\d,.]*\s*(?:%|ms|μs|ns|sec(?:onds?)?|minutes?|hours?|days?|bytes?|bits?|[kmgt]b(?:ps)?|[kmg]bytes?"
    r"|kbps|mbps|gbps|hz|[kmg]hz|mips|dollars?|pesos?|yen|units?|items?|records?|pages?|blocks?|tracks?"
    r"|sectors?|people|times)\b",
    re.IGNORECASE,
)
NUMERIC_OPTION = re.compile(r"^[\s$\\(){}\[\]0-9.,:+\-−*/×÷^=<>≤≥%a-zA-Z_]*$")
WORD = re.compile(r"[a-z]{2,}")
MARKDOWN_NOISE = re.compile(r"!\[[^\]]*\]\([^)]*\)|\[\[[^\]]*\]\]|`+|[*_#>|]|\$[^$]*\$")

STOPWORDS = set(
    "the of and to in is a an for which following be by on as that are with this it or from at its what "
    "when can used where here these those there their than then into each one two all any not no such "
    "has have was were will would should could also only both other more most when how why who whom".split()
)


def _plain(text: str) -> str:
    return MARKDOWN_NOISE.sub(" ", text or "")


def _options_are_values(options: Dict[str, str]) -> bool:
    """True when every choice is a number or a short expression (so the stem must be worked out)."""
    texts = [t.strip() for t in (options or {}).values() if t and t.strip()]
    if len(texts) < 2:
        return False
    for t in texts:
        words = WORD.findall(t.lower())
        if len(t) > 40 or len(words) > 2 or not re.search(r"\d|\$|[+\-−*/×÷^=]", t):
            return False
        if not NUMERIC_OPTION.match(t):
            return False
    return True


def classify_kind(q: dict) -> str:
    """'solving' when the question needs working out (calculation, tracing, code), else 'recall'."""
    if q.get("paper") in ("FE-B", "PM"):
        return "solving"
    if SOLVING_TOPICS.intersection(q.get("topics") or []):
        return "solving"
    stem = q.get("question") or ""
    if CODE_MARKERS.search(stem) or FORMULA.search(stem):
        return "solving"
    plain = _plain(stem)
    if ASKS_FOR_VALUE.search(plain) or NUMBER_WITH_UNIT.search(plain):
        return "solving"
    if _options_are_values(q.get("options") or {}):
        return "solving"
    return "recall"


def weight_tier(q: dict, kind: str) -> int:
    """Pseudo-weight for the mock score: 3 heavy (Subject B / PM, code or flowcharts), 2 other solving, 1 recall."""
    if q.get("paper") in ("FE-B", "PM"):
        return 3
    if kind != "solving":
        return 1
    stem = q.get("question") or ""
    if CODE_MARKERS.search(stem) or FLOWCHART.search(_plain(stem)):
        return 3
    return 2


def load_overrides(path: Path) -> Dict[str, str]:
    """Manual kind fixes (question id -> 'recall' | 'solving') for cases the rules get wrong."""
    if not path.exists():
        return {}
    data = json.loads(path.read_text(encoding="utf-8"))
    return {k: v for k, v in data.items() if not k.startswith("_") and v in ("recall", "solving")}


# --- Repeat detection -------------------------------------------------------------------------

REPEAT_THRESHOLD = 0.6
MIN_TOKENS = 6


def stem_tokens(text: str) -> List[str]:
    """Lowercased content words of a stem, without Markdown, numbers or punctuation."""
    words = WORD.findall(_plain(text).lower())
    return [w for w in words if w not in STOPWORDS]


def _tfidf(docs: Dict[str, List[str]]) -> Dict[str, Dict[str, float]]:
    df = Counter()
    for toks in docs.values():
        df.update(set(toks))
    n = len(docs)
    vectors = {}
    for qid, toks in docs.items():
        tf = Counter(toks)
        vec = {t: (1 + math.log(c)) * math.log((1 + n) / (1 + df[t])) for t, c in tf.items()}
        norm = math.sqrt(sum(v * v for v in vec.values())) or 1.0
        vectors[qid] = {t: v / norm for t, v in vec.items()}
    return vectors


def similar_pairs(docs: Dict[str, List[str]], threshold: float = REPEAT_THRESHOLD) -> Iterable[Tuple[str, str, float]]:
    """Every pair of stems whose TF-IDF cosine similarity reaches the threshold."""
    vectors = _tfidf(docs)
    postings: Dict[str, List[Tuple[str, float]]] = defaultdict(list)
    for qid, vec in vectors.items():
        for t, w in vec.items():
            postings[t].append((qid, w))
    for qid, vec in vectors.items():
        scores: Dict[str, float] = defaultdict(float)
        for t, w in vec.items():
            for other, w2 in postings[t]:
                if other > qid:
                    scores[other] += w * w2
        for other, s in scores.items():
            if s >= threshold:
                yield qid, other, s


def repeat_groups(questions: Dict[str, dict], threshold: float = REPEAT_THRESHOLD) -> Dict[str, Tuple[Optional[str], int]]:
    """
    question id -> (repeat_group, repeat_count). Similar stems from different exam sittings join one
    group; repeat_count is the number of distinct years in it. Questions without a repeat get (None, 1).
    """
    docs = {}
    for qid, q in questions.items():
        toks = stem_tokens(q.get("question") or "")
        if len(toks) >= MIN_TOKENS:
            docs[qid] = toks

    parent = {qid: qid for qid in docs}

    def find(x: str) -> str:
        while parent[x] != x:
            parent[x] = parent[parent[x]]
            x = parent[x]
        return x

    for a, b, _ in similar_pairs(docs, threshold):
        # The same sitting never repeats itself; near-identical stems there are sub-questions
        if questions[a].get("session_id") == questions[b].get("session_id"):
            continue
        ra, rb = find(a), find(b)
        if ra != rb:
            parent[max(ra, rb)] = min(ra, rb)

    members: Dict[str, List[str]] = defaultdict(list)
    for qid in docs:
        members[find(qid)].append(qid)

    out: Dict[str, Tuple[Optional[str], int]] = {qid: (None, 1) for qid in questions}
    for root, ids in members.items():
        years = {questions[i].get("year") for i in ids}
        if len(ids) < 2 or len(years) < 2:
            continue
        group = f"rg_{root}"
        for i in ids:
            out[i] = (group, len(years))
    return out
