import type { QuestionData } from '../db/schema';

/**
 * Client-side question search.
 *
 * Three query shapes are supported:
 *  - loose terms      `hash table`          → every term must appear somewhere (substring, case-insensitive)
 *  - exact phrases    `"binary search tree"` → the word sequence must appear verbatim (whitespace-tolerant)
 *  - pasted question  long free text         → fuzzy ranked by unigram + bigram containment
 */

export interface ParsedQuery {
  raw: string;
  exactPhrases: string[];
  looseTerms: string[];
  isPastedQuestion: boolean;
  isEmpty: boolean;
}

export type MatchField = 'question' | 'option' | 'explanation' | 'id' | 'topic';

export interface SearchMatch {
  question: QuestionData;
  /** Paste mode: similarity in 0..1. Term mode: 1. */
  score: number;
  /** Highest-priority field that matched. */
  field: MatchField;
  /** Plain text of the matched field (for highlighting). */
  fieldText: string;
  optionKey?: string;
}

export interface MatchRange {
  start: number;
  end: number;
}

const PASTE_MIN_LENGTH = 40;
const PASTE_MIN_WORDS = 7;
const PASTE_MIN_SIMILARITY = 0.35;
/** Drop paste results scoring below this fraction of the best match. */
const PASTE_RELATIVE_CUTOFF = 0.6;

// ---------------------------------------------------------------------------
// Parsing
// ---------------------------------------------------------------------------

export function parseQuery(input: string): ParsedQuery {
  const raw = input.replace(/[“”„‟]/g, '"');
  const trimmed = raw.trim();
  const wordCount = trimmed ? trimmed.split(/\s+/).length : 0;

  // A typed `"a" "b" c` query rarely has sentence punctuation; a pasted question almost always does.
  const isPastedQuestion =
    trimmed.length >= PASTE_MIN_LENGTH &&
    wordCount >= PASTE_MIN_WORDS &&
    (/\n/.test(trimmed) || /[?.:;,()]/.test(trimmed) || !trimmed.includes('"'));

  const exactPhrases: string[] = [];
  let rest = trimmed;
  if (!isPastedQuestion) {
    rest = trimmed.replace(/"([^"]*)("|$)/g, (_, phrase: string) => {
      const p = phrase.trim();
      if (p) exactPhrases.push(p);
      return ' ';
    });
  }

  const looseTerms = isPastedQuestion
    ? []
    : rest
        .split(/\s+/)
        .map((t) => t.replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, ''))
        .filter(Boolean);

  return {
    raw: trimmed,
    exactPhrases,
    looseTerms,
    isPastedQuestion,
    isEmpty: !isPastedQuestion && exactPhrases.length === 0 && looseTerms.length === 0,
  };
}

// ---------------------------------------------------------------------------
// Text helpers
// ---------------------------------------------------------------------------

/** Strip markdown/HTML noise so matching and display operate on the same visible text. */
export function toPlainText(text: string | undefined | null): string {
  if (!text) return '';
  return text
    .replace(/!\[\[[^\]]*\]\]/g, ' ') // Obsidian embeds
    .replace(/!\[[^\]]*\]\([^)]*\)/g, ' ') // markdown images
    .replace(/\[\[(?:[^\]|]*\|)?([^\]]*)\]\]/g, '$1') // wikilinks → label
    .replace(/<[^>]*>?/g, ' ')
    .replace(/^#{1,6}\s*/gm, '')
    .replace(/\*\*|__|`/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

const escapeRegExp = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const foldWord = (w: string) => w.toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '');

/** Content words only — single characters (option labels, "a") are noise for similarity. */
function tokenize(text: string): string[] {
  const out: string[] = [];
  for (const m of text.matchAll(/[\p{L}\p{N}]+/gu)) {
    const w = foldWord(m[0]);
    if (w.length > 1) out.push(w);
  }
  return out;
}

function bigramsOf(tokens: string[], into = new Set<string>()): Set<string> {
  for (let i = 1; i < tokens.length; i++) into.add(`${tokens[i - 1]} ${tokens[i]}`);
  return into;
}

function needlePatterns(parsed: ParsedQuery): string[] {
  return [
    ...parsed.exactPhrases.map((p) => p.split(/\s+/).map(escapeRegExp).join('\\s+')),
    ...parsed.looseTerms.map(escapeRegExp),
  ];
}

// ---------------------------------------------------------------------------
// Per-question index (built lazily, cached for the lifetime of the question object)
// ---------------------------------------------------------------------------

interface IndexedDoc {
  question: string;
  options: [string, string][];
  explanation: string;
  tokens: Set<string>;
  bigrams: Set<string>;
}

const docCache = new WeakMap<QuestionData, IndexedDoc>();

function indexOf(q: QuestionData): IndexedDoc {
  let doc = docCache.get(q);
  if (doc) return doc;

  const question = toPlainText(q.question);
  const options = Object.entries(q.options || {}).map(([k, v]) => [k, toPlainText(v)] as [string, string]);
  const tokens = new Set<string>();
  const bigrams = new Set<string>();
  for (const text of [question, ...options.map(([, v]) => v)]) {
    const t = tokenize(text);
    t.forEach((w) => tokens.add(w));
    bigramsOf(t, bigrams);
  }

  doc = { question, options, explanation: toPlainText(q.explanation), tokens, bigrams };
  docCache.set(q, doc);
  return doc;
}

// ---------------------------------------------------------------------------
// Searching
// ---------------------------------------------------------------------------

interface SearchField {
  field: MatchField;
  text: string;
  optionKey?: string;
}

const FIELD_RANK: Record<MatchField, number> = { question: 0, option: 1, explanation: 2, id: 3, topic: 4 };

export function searchQuestions(questions: QuestionData[], parsed: ParsedQuery): SearchMatch[] {
  if (parsed.isEmpty) return questions.map((q) => ({ question: q, score: 1, field: 'question', fieldText: '' }));
  return parsed.isPastedQuestion ? searchPasted(questions, parsed) : searchTerms(questions, parsed);
}

function searchTerms(questions: QuestionData[], parsed: ParsedQuery): SearchMatch[] {
  const phrases = parsed.exactPhrases.map((p) => new RegExp(p.split(/\s+/).map(escapeRegExp).join('\\s+'), 'i'));
  const terms = parsed.looseTerms.map((t) => new RegExp(escapeRegExp(t), 'i'));
  const results: SearchMatch[] = [];

  for (const q of questions) {
    const doc = indexOf(q);
    // Fields in priority order, so the first hit for any needle is also its best field.
    const body: SearchField[] = [
      { field: 'question', text: doc.question },
      ...doc.options.map(([k, v]): SearchField => ({ field: 'option', text: v, optionKey: k })),
      { field: 'explanation', text: doc.explanation },
    ];
    // Phrases search question content; loose terms may also hit the ID or topic labels.
    const everything: SearchField[] = [
      ...body,
      { field: 'id', text: q.id },
      ...(q.topics || []).map((t): SearchField => ({ field: 'topic', text: t })),
    ];

    const hits: SearchField[] = [];
    let ok = true;
    for (const [re, fields] of [...phrases.map((re) => [re, body] as const), ...terms.map((re) => [re, everything] as const)]) {
      const hit = fields.find((f) => re.test(f.text));
      if (!hit) {
        ok = false;
        break;
      }
      hits.push(hit);
    }
    if (!ok) continue;

    const best = hits.reduce((a, b) => (FIELD_RANK[b.field] < FIELD_RANK[a.field] ? b : a));
    results.push({ question: q, score: 1, field: best.field, fieldText: best.text, optionKey: best.optionKey });
  }

  // Stable sort: stem hits first, original order preserved within a rank.
  return results.sort((a, b) => FIELD_RANK[a.field] - FIELD_RANK[b.field]);
}

function searchPasted(questions: QuestionData[], parsed: ParsedQuery): SearchMatch[] {
  const qTokens = tokenize(parsed.raw);
  const qSet = new Set(qTokens);
  const qBigrams = bigramsOf(qTokens);
  if (qSet.size === 0) return [];

  // IDF weights so exam boilerplate ("which of the following is…") counts less than distinctive words.
  const idf = idfFor(questions);
  const weight = (t: string) => idf.get(t) ?? idf.get(UNSEEN_TOKEN)!;
  const bigramWeight = (b: string) => {
    const [x, y] = b.split(' ') as [string, string];
    return (weight(x) + weight(y)) / 2;
  };
  let uniTotal = 0;
  for (const t of qSet) uniTotal += weight(t);
  let biTotal = 0;
  for (const b of qBigrams) biTotal += bigramWeight(b);

  const results: SearchMatch[] = [];
  for (const q of questions) {
    const doc = indexOf(q);
    let uni = 0;
    for (const t of qSet) if (doc.tokens.has(t)) uni += weight(t);
    let bi = 0;
    for (const b of qBigrams) if (doc.bigrams.has(b)) bi += bigramWeight(b);

    // Containment (not Jaccard): a pasted stem should fully match a question that also has options.
    const uniScore = uni / uniTotal;
    const biScore = biTotal ? bi / biTotal : uniScore;
    const score = 0.4 * uniScore + 0.6 * biScore;
    if (score >= PASTE_MIN_SIMILARITY) {
      results.push({ question: q, score, field: 'question', fieldText: doc.question });
    }
  }

  results.sort((a, b) => b.score - a.score);
  const cutoff = (results[0]?.score ?? 0) * PASTE_RELATIVE_CUTOFF;
  return results.filter((r) => r.score >= cutoff);
}

const UNSEEN_TOKEN = '\u0000';
const idfCache = new WeakMap<QuestionData[], Map<string, number>>();

function idfFor(questions: QuestionData[]): Map<string, number> {
  let idf = idfCache.get(questions);
  if (idf) return idf;

  const df = new Map<string, number>();
  for (const q of questions) for (const t of indexOf(q).tokens) df.set(t, (df.get(t) ?? 0) + 1);
  const n = questions.length;
  idf = new Map([[UNSEEN_TOKEN, Math.log(1 + n)]]);
  for (const [t, f] of df) idf.set(t, Math.log(1 + n / f));
  idfCache.set(questions, idf);
  return idf;
}

// ---------------------------------------------------------------------------
// Highlight ranges
// ---------------------------------------------------------------------------

let lastPasteBigrams: { raw: string; bigrams: Set<string> } | null = null;

function pasteBigrams(raw: string): Set<string> {
  if (lastPasteBigrams?.raw !== raw) lastPasteBigrams = { raw, bigrams: bigramsOf(tokenize(raw)) };
  return lastPasteBigrams.bigrams;
}

function mergeRanges(ranges: MatchRange[]): MatchRange[] {
  const sorted = ranges.filter((r) => r.end > r.start).sort((a, b) => a.start - b.start);
  const out: MatchRange[] = [];
  for (const r of sorted) {
    const last = out[out.length - 1];
    if (last && r.start <= last.end) last.end = Math.max(last.end, r.end);
    else out.push({ ...r });
  }
  return out;
}

export function computeMatchRanges(text: string, parsed: ParsedQuery): MatchRange[] {
  if (!text || parsed.isEmpty) return [];

  if (!parsed.isPastedQuestion) {
    const ranges: MatchRange[] = [];
    for (const src of needlePatterns(parsed)) {
      for (const m of text.matchAll(new RegExp(src, 'gi'))) {
        ranges.push({ start: m.index!, end: m.index! + m[0].length });
      }
    }
    return mergeRanges(ranges);
  }

  // Paste mode: highlight every run of words whose adjacent pairs also occur in the pasted text.
  const bigrams = pasteBigrams(parsed.raw);
  const words: { w: string; start: number; end: number }[] = [];
  for (const m of text.matchAll(/[\p{L}\p{N}]+/gu)) {
    const w = foldWord(m[0]);
    if (w.length > 1) words.push({ w, start: m.index!, end: m.index! + m[0].length });
  }

  const ranges: MatchRange[] = [];
  words.forEach((cur, i) => {
    const prev = words[i - 1];
    if (prev && bigrams.has(`${prev.w} ${cur.w}`)) ranges.push({ start: prev.start, end: cur.end });
  });
  return mergeRanges(ranges);
}

/** Cut a window of `text` around the first match so highlights stay visible in tight layouts. */
export function excerptAround(
  text: string,
  ranges: MatchRange[],
  radius: number
): { text: string; ranges: MatchRange[] } {
  const max = radius * 2;
  if (text.length <= max) return { text, ranges };

  let start = 0;
  const first = ranges[0];
  if (first) {
    start = Math.max(0, first.start - radius);
    if (start > 0) {
      const space = text.indexOf(' ', start);
      if (space !== -1 && space < first.start) start = space + 1;
    }
  }
  const end = Math.min(text.length, start + max);

  const prefix = start > 0 ? '…' : '';
  const suffix = end < text.length ? '…' : '';
  const shift = prefix.length - start;
  return {
    text: prefix + text.slice(start, end) + suffix,
    ranges: ranges
      .filter((r) => r.end > start && r.start < end)
      .map((r) => ({ start: Math.max(r.start, start) + shift, end: Math.min(r.end, end) + shift })),
  };
}
