import re
from pathlib import Path
from urllib.parse import quote, unquote
from typing import Dict, Any, List, Optional, Tuple
import frontmatter

REGISTERED_TOPICS = [
    "accounting",
    "algorithms",
    "artificial-intelligence",
    "automata-theory",
    "business-administration",
    "cloud-computing",
    "cybersecurity",
    "data-encoding",
    "data-structures",
    "devops",
    "digital-logic",
    "hardware",
    "information-management",
    "math",
    "networking",
    "number-systems",
    "object-oriented-programming",
    "operating-systems",
    "probability",
    "programming",
    "project-management",
    "service-management",
    "sets",
    "software",
    "software-engineering",
    "software-testing",
    "statistics",
    "systems-architecture",
    "web-technologies"
]

TOPIC_ALIASES = {
    "finance": "accounting",
    "flowcharts": "algorithms",
    "ai": "artificial-intelligence",
    "ml": "artificial-intelligence",
    "deep-learning": "artificial-intelligence",
    "automata": "automata-theory",
    "state-transitions": "automata-theory",
    "management": "business-administration",
    "business-strategy": "business-administration",
    "corporate-strategy": "business-administration",
    "hr": "business-administration",
    "marketing": "business-administration",
    "cloud": "cloud-computing",
    "saas": "cloud-computing",
    "security": "cybersecurity",
    "network-security": "cybersecurity",
    "cryptography": "cybersecurity",
    "compression": "data-encoding",
    "data-representation": "data-encoding",
    "check-digit": "data-encoding",
    "stack": "data-structures",
    "queue": "data-structures",
    "tree": "data-structures",
    "containers": "devops",
    "sysadmin": "devops",
    "logic-circuits": "digital-logic",
    "boolean-algebra": "digital-logic",
    "computer-architecture": "hardware",
    "storage": "hardware",
    "raid": "hardware",
    "database": "information-management",
    "sql": "information-management",
    "dbms": "information-management",
    "relational-database": "information-management",
    "algebra": "math",
    "arithmetic": "math",
    "network": "networking",
    "osi-model": "networking",
    "routing": "networking",
    "tcp-ip": "networking",
    "ip": "networking",
    "binary": "number-systems",
    "hexadecimal": "number-systems",
    "floating-point": "number-systems",
    "oop": "object-oriented-programming",
    "classes": "object-oriented-programming",
    "os": "operating-systems",
    "cpu-scheduling": "operating-systems",
    "memory-management": "operating-systems",
    "queuing-theory": "probability",
    "combinatorics": "probability",
    "coding": "programming",
    "compilation": "programming",
    "pm": "project-management",
    "agile": "project-management",
    "scrum": "project-management",
    "itil": "service-management",
    "sla": "service-management",
    "system-reliability": "service-management",
    "venn-diagrams": "sets",
    "set-theory": "sets",
    "tools": "software",
    "applications": "software",
    "uml": "software-engineering",
    "design-patterns": "software-engineering",
    "system-design": "software-engineering",
    "testing": "software-testing",
    "qa": "software-testing",
    "tdd": "software-testing",
    "regression": "statistics",
    "standard-deviation": "statistics",
    "system-architecture": "systems-architecture",
    "reliability": "systems-architecture",
    "web": "web-technologies",
    "frontend": "web-technologies",
    "apis": "web-technologies"
}


def clean_obsidian_comments(text: str) -> str:
    """Remove %% comments %% used in Obsidian."""
    return re.sub(r'%%.*?%%', '', text, flags=re.DOTALL)


def files_url(img_name: str) -> str:
    """Web path for a vault image.

    Obsidian allows spaces and brackets in file names (e.g. "Pasted image 2024....png"), but a
    Markdown link destination may not contain raw spaces, so the name is percent-encoded.
    unquote() first keeps this idempotent for names that are already encoded.
    """
    return f"/files/{quote(unquote(img_name))}"


def normalize_image_links(text: str) -> str:
    """Convert Obsidian wikilinks and relative file links to /files/ normalized web paths."""
    # First remove Obsidian comments
    text = clean_obsidian_comments(text)
    
    # Obsidian wikilink: ![[Files/image.png|options]] or ![[image.png]]
    def wikilink_sub(match):
        raw_target = match.group(1).strip()
        # Remove any alias/width like ![[image.png|300]]
        img_file = raw_target.split('|')[0].strip()
        img_name = Path(img_file).name
        return f'![{img_name}]({files_url(img_name)})'
    
    text = re.sub(r'!\[\[(.*?)\]\]', wikilink_sub, text)
    
    # Standard markdown image: ![alt](Files/image.png) or ![alt](image.png)
    def md_img_sub(match):
        alt = match.group(1)
        raw_url = match.group(2).strip()
        if raw_url.startswith(('http://', 'https://')):
            return match.group(0)
        # Relative links and already-/files/ links alike end up as an encoded /files/ path
        img_name = raw_url[len('/files/'):] if raw_url.startswith('/files/') else Path(raw_url).name
        return f'![{alt}]({files_url(img_name)})'

    text = re.sub(r'!\[(.*?)\]\((.*?)\)', md_img_sub, text)
    return text


def extract_image_paths(text: str) -> List[str]:
    """Find all image paths matching /files/... in the text."""
    matches = re.findall(r'!\[.*?\]\((/files/[^)]+)\)', text)
    # Deduplicate while preserving order
    seen = set()
    res = []
    for m in matches:
        if m not in seen:
            seen.add(m)
            res.append(m)
    return res


def parse_filename(filename: str) -> Dict[str, Any]:
    """
    Extracts metadata from filename strictly following PelNETS hierarchy:
    {Year}{Season}_FE_{Paper}_{QuestionNumber}.md
    """
    stem = Path(filename).stem
    pattern = r'^(20\d\d)([A-Za-z]+)?_(.*)$'
    m = re.match(pattern, stem)
    if not m:
        return {
            "id": stem,
            "year": "unknown",
            "season": "S",
            "paper": "AM",
            "number": 0,
            "sub_number": None,
            "session_id": "unknown",
            "session_title": "General",
            "season_title": "General",
            "sort_index": 999999
        }

    year, raw_season, rest = m.groups()
    season = "S"
    if raw_season:
        raw_s = raw_season.upper()
        if "A" in raw_s or "OCT" in raw_s or "FALL" in raw_s:
            season = "A"
        else:
            season = "S"

    m_num = re.search(r'_(\d+)(?:\.(\d+))?$', rest)
    if m_num:
        num = int(m_num.group(1))
        sub_num = m_num.group(2)
        paper_raw = rest[:m_num.start()].strip('_')
    else:
        num = 0
        sub_num = None
        paper_raw = rest

    # Normalize paper type
    p_up = paper_raw.upper().replace('_', '-').replace(' ', '-')
    if 'PM' in p_up or 'SQ' in p_up:
        paper_type = 'PM'
        paper_name = 'Afternoon (PM)'
    elif 'FE-B' in p_up or p_up.endswith('-B'):
        paper_type = 'FE-B'
        paper_name = 'Subject B (FE-B)'
    elif 'FE-A' in p_up or p_up.endswith('-A'):
        paper_type = 'FE-A'
        paper_name = 'Subject A (FE-A)'
    elif 'AM' in p_up:
        paper_type = 'FE-A' if int(year) >= 2023 else 'AM'
        paper_name = 'Subject A (FE-A)' if int(year) >= 2023 else 'Morning (AM)'
    else:
        if int(year) >= 2023:
            paper_type = 'FE-A'
            paper_name = 'Subject A (FE-A)'
        else:
            paper_type = 'AM'
            paper_name = 'Morning (AM)'

    season_name = "Spring" if season == "S" else "Autumn"
    session_id = f"{year}{season}_{paper_type}"
    session_title = f"{year} {season_name} • {paper_name}"

    # Calculate absolute sequential sort key:
    # Year (descending) -> Season (S=0, A=1) -> Paper (FE-A/AM=0, FE-B/PM=1) -> Number (1-80) -> Subnumber
    season_idx = 0 if season == "S" else 1
    paper_idx = 0 if paper_type in ("FE-A", "AM") else 1
    sub_idx = int(sub_num) if sub_num and sub_num.isdigit() else 0
    sort_index = (season_idx * 100000) + (paper_idx * 10000) + (num * 100) + sub_idx

    return {
        "id": stem,
        "year": year,
        "season": season,
        "paper": paper_type,
        "number": num,
        "sub_number": sub_num,
        "session_id": session_id,
        "session_title": session_title,
        "season_title": f"{season_name} ({year}{season})",
        "sort_index": sort_index
    }


# A whole line wrapped in bold or underscore emphasis: **a) text**
BOLD_LINE = re.compile(r'^(\s*)(\*\*|__)(.*?)\2\s*$')


def strip_line_emphasis(line: str) -> str:
    """Drops bold that wraps a choice line, or that opens on one line and closes lines later."""
    line = BOLD_LINE.sub(r'\1\3', line)
    # Only the label in bold: **a)** text
    line = re.sub(r'^(\s*)\*\*(\(?[a-hA-H][).])\*\*', r'\1\2', line)
    if line.count('**') % 2 == 1:
        if line.lstrip().startswith('**'):
            line = line.replace('**', '', 1)
        else:
            line = re.sub(r'\*\*\s*$', '', line)
    return line


def split_inline_options(options: Dict[str, str]) -> Dict[str, str]:
    """Splits choices written on one line, e.g. 'a) 12,000 b) 20,000 c) 21,000'."""
    out: Dict[str, str] = {}
    for key in sorted(options):
        text = options[key]
        current = key
        while True:
            nxt = chr(ord(current) + 1)
            m = re.search(r'\s\(?' + nxt + r'\)\s+', text)
            if not m or nxt in options:
                break
            out[current] = text[:m.start()].strip()
            text = text[m.end():]
            current = nxt
        out[current] = text.strip()
    return out


def parse_options_and_stem(question_text: str) -> Tuple[str, Dict[str, str], bool]:
    """
    Parses options (e.g., a) ..., b) ...) from question text.
    Returns: (cleaned_stem, options_dict, is_image_based)
    """
    options: Dict[str, str] = {}
    lines = question_text.splitlines()
    
    # Check if there is an image in the question
    has_image = bool(re.search(r'!\[.*?\]\(/files/[^)]+\)', question_text))
    
    # Find options lines. PhilNITS options typically look like:
    # a) Option text
    # b) Option text
    # or a. Option text
    # or (a) Option text
    # Choices can go from a to h (or even i/j for PM questions)
    # The text may also start on the next line ("a)" alone, then SQL or a code block)
    option_regex = re.compile(r'^\s*(?:\(?([a-hA-H])\)|\b([a-hA-H])\.)(?:\s+(.+))?\s*$')
    
    stem_lines = []
    option_lines_found = False
    current_opt = None
    current_opt_text = []

    for line in lines:
        # Some notes bold the choice lines: **a) text**, or ** opening on a) and closing on d)
        m = option_regex.match(strip_line_emphasis(line))
        if m:
            option_lines_found = True
            if current_opt:
                options[current_opt.lower()] = "\n".join(current_opt_text).strip()
            current_opt = m.group(1) or m.group(2)
            current_opt_text = [(m.group(3) or '').strip()]
        elif current_opt and line.strip() and not line.strip().startswith('#'):
            # Continuation of a wrapped or multi-line choice (code, pseudocode, table rows): keep the
            # line breaks so Markdown renders it as written
            current_opt_text.append(strip_line_emphasis(line).rstrip())
        else:
            if current_opt:
                options[current_opt.lower()] = "\n".join(current_opt_text).strip()
                current_opt = None
                current_opt_text = []
            stem_lines.append(line)

    if current_opt:
        options[current_opt.lower()] = "\n".join(current_opt_text).strip()

    options = split_inline_options(options)
    # Bare "a)" ... "d)" lines under an image: the choices live in the picture
    if options and not any(options.values()):
        options = {}

    stem_text = "\n".join(stem_lines).strip()
    
    # If no textual options are parsed, question text may be in an image
    # Or choices are inside the diagram itself
    is_image_based = False
    text_content_only = re.sub(r'!\[.*?\]\(/files/[^)]+\)', '', stem_text).strip()
    # Remove title header if any like # 2024S_FE-A_1
    text_content_only = re.sub(r'^#\s+.*$', '', text_content_only, flags=re.MULTILINE).strip()
    
    if has_image and len(text_content_only) < 60:
        is_image_based = True
    elif has_image and not options:
        is_image_based = True

    return stem_text, options, is_image_based


def parse_answer(ans_raw_lines: List[str]) -> Tuple[str, str]:
    """
    Parses the answer line following the `?` delimiter.
    Returns: (normalized_correct, correct_display)
    """
    ans_line = ""
    for line in ans_raw_lines:
        line_s = line.strip()
        if line_s:
            ans_line = line_s
            break
            
    if not ans_line:
        return "", ""

    # Patterns:
    # 1. Single letter with paren: "c) 291.25" -> "c"
    # 2. Comma separated letters: "c, b, c" -> "c, b, c"
    # 3. Labelled blanks: "A=e, B=d, C=c" -> "A=e, B=d, C=c" or "1=c"
    # 4. Single letter: "c" -> "c"
    
    m_paren = re.match(r'^([a-hA-H])\)\s*', ans_line)
    if m_paren:
        return m_paren.group(1).lower(), ans_line

    m_dot = re.match(r'^([a-hA-H])\.\s*', ans_line)
    if m_dot:
        return m_dot.group(1).lower(), ans_line

    m_comma = re.match(r'^([a-hA-H](?:\s*,\s*[a-hA-H])+)\s*$', ans_line)
    if m_comma:
        # Normalize to "a, b, c"
        norm = ", ".join(x.strip().lower() for x in ans_line.split(','))
        return norm, ans_line

    m_eq = re.match(r'^([0-9a-zA-Z]+\s*=\s*[a-zA-Z](?:\s*,\s*[0-9a-zA-Z]+\s*=\s*[a-zA-Z])*)\s*$', ans_line)
    if m_eq:
        return ans_line.strip(), ans_line

    m_single = re.match(r'^([a-hA-H])$', ans_line)
    if m_single:
        return m_single.group(1).lower(), ans_line

    # If it starts with any single letter
    m_loose = re.match(r'^([a-hA-H])\b', ans_line)
    if m_loose:
        return m_loose.group(1).lower(), ans_line

    return ans_line.strip().lower(), ans_line


ANSWER_MARKUP = re.compile(r'\*\*|__|`')
SUBQUESTION_PREFIX = re.compile(r'^Sub-?question\s*(\d*)\s*:?\s*', re.IGNORECASE)
SINGLE_CHOICE = re.compile(r'^(?:Answer\s*:\s*)?\(?([a-jA-J])(?:\)|\.|\s*$)')
BARE_LETTER_LIST = re.compile(r'^[a-jA-J](?:\s*,\s*[a-jA-J])+$')
# "A: c) text", "A=e", "1A: d) text", "2=e": a blank label, then the chosen letter
LABELLED_BLANK = re.compile(r'(?<![\w\[])(\d?[A-Z]|\d)\s*[:=]\s*\(?([a-jA-J])(?:\)|(?=\s*(?:,|;|$)))')


def _answer_line_pairs(line: str) -> Tuple[List[Tuple[str, str]], bool]:
    """(label, letter) pairs on one answer line, and whether the line was a subquestion header only."""
    text = ANSWER_MARKUP.sub('', line).strip().lstrip('-*').strip()
    if not text:
        return [], False
    sq = None
    m = SUBQUESTION_PREFIX.match(text)
    if m:
        sq = m.group(1)
        text = text[m.end():].strip()
        if not text:
            return [], True
    prefix = f"SQ{sq} " if sq else ""
    m = SINGLE_CHOICE.match(text)
    if m and sq:
        # "Subquestion 3: a) text": one choice answers the whole subquestion
        return [(f"SQ{sq}", m.group(1).lower())], False
    if BARE_LETTER_LIST.match(text):
        letters = [x.strip().lower() for x in text.split(',')]
        return [(f"{prefix}{i + 1}", x) for i, x in enumerate(letters)], False
    pairs = [(f"{prefix}{lbl}", letter.lower()) for lbl, letter in LABELLED_BLANK.findall(text)]
    return pairs, False


def parse_answer_block(ans_raw_lines: List[str]) -> Tuple[str, str, List[Dict[str, str]], int]:
    """
    Reads the answer at the top of the card back.
    Returns (correct, correct_display, blanks, lines_used). `blanks` lists each blank's label and
    letter when the card asks for several answers (Subject B / PM blanks), else it is empty.
    """
    start = next((i for i, line in enumerate(ans_raw_lines) if line.strip()), None)
    if start is None:
        return "", "", [], 0

    first = ANSWER_MARKUP.sub('', ans_raw_lines[start]).strip().lstrip('|').strip()
    # A single choice ("c) 14.0", "**Answer: C**") answers the whole card
    single = None if SUBQUESTION_PREFIX.match(first) else SINGLE_CHOICE.match(first)
    if single:
        return single.group(1).lower(), ans_raw_lines[start].strip(), [], start + 1

    # Otherwise collect blank answers line by line until the explanation starts
    pairs: List[Tuple[str, str]] = []
    used = start + 1
    for i in range(start, len(ans_raw_lines)):
        line = ans_raw_lines[i]
        if re.match(r'^\s*(#{1,6}\s|---\s*$)', line):
            break
        if not line.strip():
            continue
        found, header = _answer_line_pairs(line)
        if not found and not header:
            break
        pairs.extend(found)
        used = i + 1

    if len(pairs) >= 2:
        seen: Dict[str, int] = {}
        blanks = []
        for label, letter in pairs:
            seen[label] = seen.get(label, 0) + 1
            blanks.append({"label": label if seen[label] == 1 else f"{label}#{seen[label]}", "correct": letter})
        correct = ", ".join(f"{b['label']}={b['correct']}" for b in blanks)
        display = "\n".join(line.strip() for line in ans_raw_lines[start:used] if line.strip())
        return correct, display, blanks, used
    if len(pairs) == 1:
        display = "\n".join(line.strip() for line in ans_raw_lines[start:used] if line.strip())
        return pairs[0][1], display, [], used

    correct, display = parse_answer(ans_raw_lines[start:start + 1])
    return correct, display, [], start + 1


def clean_explanation(explanation_text: str) -> str:
    """Removes trailing references and extra trailing whitespace."""
    text = clean_obsidian_comments(explanation_text)
    # Cut off standard references header at bottom if it's just links or empty
    # But keep the core explanation intact
    lines = text.splitlines()
    clean_lines = []
    in_references = False
    for line in lines:
        if re.match(r'^#+\s+References', line, re.IGNORECASE):
            in_references = True
            clean_lines.append(line)
            continue
        clean_lines.append(line)
        
    res = "\n".join(clean_lines).strip()
    # Strip any trailing delimiter dashes
    res = re.sub(r'\n\s*---\s*$', '', res)
    return res.strip()


def parse_markdown_file(file_path: Path) -> Optional[Dict[str, Any]]:
    """Parse a single pelnets markdown question file."""
    try:
        with open(file_path, 'r', encoding='utf-8', errors='ignore') as fp:
            post = frontmatter.load(fp)
    except Exception as e:
        return None

    meta = parse_filename(file_path.name)
    tags_raw = post.get('tags', [])
    if isinstance(tags_raw, str):
        tags_raw = [tags_raw]
    tags = [str(t).strip() for t in tags_raw if t]

    topics = []
    year_tag = None
    for t in tags:
        clean_t = t.lstrip('#').strip()
        parts = clean_t.split('/')
        cat = parts[0].strip().lower()
        if cat == 'year' and len(parts) > 1:
            year_tag = parts[1].strip()
        elif cat in REGISTERED_TOPICS:
            if cat not in topics:
                topics.append(cat)
        elif cat in TOPIC_ALIASES:
            mapped = TOPIC_ALIASES[cat]
            if mapped not in topics:
                topics.append(mapped)

    # If no topics extracted from tags, infer or set general
    if not topics:
        topics = ["software"]

    year = year_tag or meta["year"]
    content = post.content

    # Normalize image links throughout content
    content = normalize_image_links(content)

    # Split question and answer by line containing only '?'
    parts = re.split(r'^\s*\?\s*$', content, flags=re.MULTILINE)
    if len(parts) < 2:
        return None

    raw_question = parts[0].strip()
    raw_ans_and_expl = parts[1].strip()

    # Split answer and explanation
    ans_lines = raw_ans_and_expl.splitlines()
    correct, correct_display, blanks, answer_lines_used = parse_answer_block(ans_lines)

    # The explanation starts after the answer line(s)
    explanation = clean_explanation("\n".join(ans_lines[answer_lines_used:]))

    # Clean question stem: remove leading # QuestionID header
    q_lines = raw_question.splitlines()
    if q_lines and re.match(r'^#\s+' + re.escape(meta["id"]), q_lines[0].strip(), re.IGNORECASE):
        q_lines = q_lines[1:]
    elif q_lines and re.match(r'^#\s+20\d\d', q_lines[0].strip()):
        q_lines = q_lines[1:]
        
    cleaned_question_block = "\n".join(q_lines).strip()
    question_stem, options, is_image_based = parse_options_and_stem(cleaned_question_block)

    # Collect images
    all_images = extract_image_paths(cleaned_question_block + "\n" + explanation)
    question_images = extract_image_paths(cleaned_question_block)

    # Determine fallback choices for questions where options are in diagrams or extended
    fallback_choices = ["a", "b", "c", "d"]
    all_opts = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'i', 'j']
    answer_letters = [b["correct"] for b in blanks] or ([correct] if len(correct) == 1 else [])
    answer_letters = [x for x in answer_letters if x in all_opts]
    if options:
        fallback_choices = sorted(list(options.keys()))
    elif answer_letters:
        # Subject B / PM choices sit in the image and often run to g or h; AM papers use a-d.
        # Always offer at least that range and never cut off the correct letter.
        floor = 'h' if meta["paper"] in ("FE-B", "PM") else 'd'
        max_letter = max([floor] + answer_letters)
        fallback_choices = all_opts[:all_opts.index(max_letter) + 1]

    # 3-Way Deck Sorting Subdecks: e.g. ["networking/2024", "hardware/2024"]
    subdecks = []
    for top in topics:
        subdecks.append(f"{top}/{year}")

    return {
        "id": meta["id"],
        "year": year,
        "season": meta["season"],
        "paper": meta["paper"],
        "number": meta["number"],
        "sub_number": meta["sub_number"],
        "session_id": meta["session_id"],
        "session_title": meta["session_title"],
        "season_title": meta["season_title"],
        "sort_index": meta["sort_index"],
        "tags": tags,
        "topics": topics,
        "subdecks": subdecks,
        "question": question_stem,
        "options": options,
        "fallback_choices": fallback_choices,
        "correct": correct,
        "correct_display": correct_display,
        "blanks": blanks,
        "explanation": explanation,
        "image_paths": question_images,
        "all_images": all_images,
        "is_image_based": is_image_based,
        "created": str(post.get('created', ''))
    }
