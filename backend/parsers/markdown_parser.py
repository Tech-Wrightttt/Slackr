import re
from pathlib import Path
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
        return f'![{img_name}](/files/{img_name})'
    
    text = re.sub(r'!\[\[(.*?)\]\]', wikilink_sub, text)
    
    # Standard markdown image: ![alt](Files/image.png) or ![alt](image.png)
    def md_img_sub(match):
        alt = match.group(1)
        raw_url = match.group(2).strip()
        if not raw_url.startswith(('http://', 'https://', '/files/')):
            img_name = Path(raw_url).name
            return f'![{alt}](/files/{img_name})'
        return match.group(0)

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
    option_regex = re.compile(r'^\s*(?:\(?([a-hA-H])\)|\b([a-hA-H])\.)\s+(.+)$')
    
    stem_lines = []
    option_lines_found = False
    current_opt = None
    current_opt_text = []

    for line in lines:
        m = option_regex.match(line)
        if m:
            option_lines_found = True
            if current_opt:
                options[current_opt.lower()] = " ".join(current_opt_text).strip()
            current_opt = m.group(1) or m.group(2)
            current_opt_text = [m.group(3).strip()]
        elif current_opt and line.strip() and not line.strip().startswith('#'):
            # Continuation of option text if indented or wrapped
            current_opt_text.append(line.strip())
        else:
            if current_opt:
                options[current_opt.lower()] = " ".join(current_opt_text).strip()
                current_opt = None
                current_opt_text = []
            stem_lines.append(line)

    if current_opt:
        options[current_opt.lower()] = " ".join(current_opt_text).strip()

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
    correct, correct_display = parse_answer(ans_lines)
    
    # Locate where the explanation begins (usually after answer line or ### Explanation)
    expl_lines = []
    found_first_non_empty = False
    for line in ans_lines:
        if not found_first_non_empty:
            if line.strip():
                found_first_non_empty = True
            continue
        expl_lines.append(line)
        
    explanation = clean_explanation("\n".join(expl_lines))

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
    if options:
        fallback_choices = sorted(list(options.keys()))
    elif correct and len(correct) == 1 and correct in 'abcdefghij':
        # Ensure correct choice is included
        max_letter = max('d', correct)
        all_opts = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'i', 'j']
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
        "explanation": explanation,
        "image_paths": question_images,
        "all_images": all_images,
        "is_image_based": is_image_based,
        "created": str(post.get('created', ''))
    }
