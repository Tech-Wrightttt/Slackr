# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

---

## Commands

### Frontend (from `frontend/`)

```powershell
bun run dev        # Dev server at http://localhost:5173
bun run build      # Production build → frontend/dist/
bun run preview    # Serve the production build locally
```

### Backend (from workspace root)

```powershell
# Compile the Markdown vault into questions_index.json (run after vault changes)
backend\venv\Scripts\python.exe backend/scripts/generate_index.py

# Exact choice letters for image-only questions (most PM / Subject B) from the official exam PDFs in
# backend/data/pelnets/Exam_Q&A -> backend/data/choice_map.json. Run before generate_index.py whenever the
# vault changes; --report lists cards to fix by hand in backend/data/choice_overrides.json. Needs requirements-dev.txt.
backend\venv\Scripts\python.exe backend/scripts/build_choice_map.py --report

# Report broken questions in the index (few options, leftover Markdown, ungradable answer keys)
backend\venv\Scripts\python.exe backend/scripts/audit_index.py

# Optional companion API at http://127.0.0.1:8000
backend\venv\Scripts\python.exe -m uvicorn main:app --app-dir backend --host 127.0.0.1 --port 8000 --reload

# Run tests
backend\venv\Scripts\python.exe backend/tests/test_backend.py

# Full automated suite (pytest + Vitest, branch/statement coverage) → PDF in test-reports/
# One-time setup: backend\venv\Scripts\python.exe -m pip install -r backend/requirements-dev.txt
backend\venv\Scripts\python.exe scripts/run_tests.py
```

---

## Architecture

SLACKR is a two-layer system built around **offline-first** operation:

### Data Flow

1. **Source of truth**: Markdown files in `backend/data/pelnets/` (Obsidian vault of PhilNITS questions). It is a git submodule of https://github.com/Joryuoo/pelnets pinned to one commit: clone with `git clone --recurse-submodules`, update with `git -C backend/data/pelnets pull`, then regenerate the JSON and commit both.
2. **Compile step**: `backend/scripts/generate_index.py` parses all Markdown into `backend/data/questions_index.json`, then the build copies it to `frontend/public/data/`.
3. **Runtime**: The frontend loads `questions_index.json` once via `fetch('/data/questions_index.json')`, caches it in-memory (module-level variable in `questionsService.ts`), and never touches the network again for question data.
4. **User progress**: All attempts, SRS schedules, and settings are stored locally in IndexedDB via `Dexie.js` (schema at `frontend/src/db/index.ts`).
5. **Optional online accounts**: The FastAPI backend (`backend/main.py`) owns online sign-up/sign-in, the per-user JSON backup and bug reports (`/api/account/*`, `/api/reports`, `backend/routers/account.py`). It is the only code that talks to Supabase (`backend/services/supabase_gateway.py`, configured by `SUPABASE_URL` / `SUPABASE_ANON_KEY` in `backend/.env`); the browser never does. The app works 100% offline without it. See `SUPABASE_VERCEL_DEPLOYMENT.md`.

### Frontend (`frontend/src/`)

- **Router**: React Router v7 with lazy-loaded page components. Routes defined in `App.tsx`.
- **State**: Zustand store (`store/useStore.ts`) holds only transient UI state: theme, offline flag, active SRS algorithm, session preferences. **No question data lives in Zustand**.
- **IndexedDB**: `db/index.ts` exports a singleton `db` (Dexie `SlackrDatabase`) with nine tables: `attempts`, `srSchedules`, `topicStats`, `settings`, `deferred`, `sessions` (finished sessions keep a per-question `log` for the after-session report), `accounts` (device profiles), `reports`, `examAttempts` (v7: one finished exam per set, unique `setKey`; an exam in progress is the `exam_in_progress` settings row). Schema versions must be incremented when adding tables or indexes. Profiles live in `registry` (`SlackrDB`); study data opens per profile (`SlackrDB` for the first profile and guests, `SlackrDB_<dataId>` for later ones). Per-profile localStorage keys go through `scopedKey()`.
- **Services** (pure static classes, no React):
  - `questionsService.ts` — loads and filters question data; implements the PelNETS sorting algorithm (Year desc → Season S before A → Paper FE-A/AM before FE-B/PM → Question# → Sub#).
  - `srsEngine.ts` — in-browser implementations of SM-2, FSRS, and Custom SRS algorithms.
  - `analyticsEngine.ts` — calculates error rates, heatmaps, and calibration from IndexedDB data.
  - `statsDb.ts` — direct Dexie helpers for reading/writing attempt records and finished sessions.
  - `choiceOrder.ts` — grading helpers: seeded choice shuffle, multi-blank (Subject B / PM) answers, self-graded keys.
  - `scoring.ts` — accuracy over the whole set, estimated 1000-point mock score from `weight_tier`, mock paper builder.
  - `sessionReport.ts`, `yearDetail.ts` — pure stats for the after-session report and the year stats panel.
  - `examClock.ts`, `examService.ts` — wall-clock exam countdown and exam persistence/locks (used by `hooks/useExamSession.ts`).
  - `syncService.ts` — serializes IndexedDB to JSON for export / backend sync.
- **Components**: `QuestionCard` is the main interactive unit (practice and `variant="exam"`). `QuizSession` runs every practice set (year, topic, combined, custom, SRS, ready-made sets) and ends in `SessionReport`; `pages/QuizExam.tsx` runs timed exams. `MarkdownRenderer` handles `$math$`/`$$display$$` via KaTeX + `react-markdown`.
- **PWA**: `public/sw.js` manages four cache buckets: `slackr-app-v7` (shell), `slackr-images-v2` (diagram PNGs), `slackr-data-v3` (JSON bundles), `slackr-fonts-v1` (Google Fonts).

### Backend (`backend/`)

- **FastAPI** app at `main.py` — question query endpoints, SRS grading, analytics, and data import/export. Loads `questions_index.json` into an in-memory dict at startup.
- **Algorithms** (`algorithms/`) — Python reference implementations of SM-2, FSRS, and Custom SRS; these mirror the TypeScript implementations in `srsEngine.ts`.
- **Parser** (`parsers/markdown_parser.py`) — converts Obsidian-flavored Markdown (WikiLinks, frontmatter) into the `QuestionData` schema (`models/schemas.py`).

### Build-Time Question Labels

`generate_index.py` adds fields the frontend only reads (rules in `backend/parsers/question_classifier.py`, manual fixes in `backend/data/kind_overrides.json`): `kind` (`recall` | `solving`), `weight_tier` (1-3, for the mock score), `repeat_group` / `repeat_count` (near-identical stems across exam years, via TF-IDF), and `blanks` (Subject B / PM cards answered per blank, e.g. `A=c, B=e`). Image-only questions take their exact letters from `choice_map.json` + `choice_overrides.json` (`fallback_choices` for one answer, `blanks[].choices` per blank); `choices_exact: false` marks the ones still estimated. Vault text or answer keys that are wrong upstream (checked against the official PDFs) are fixed in `backend/data/content_overrides.json` (`question`, `explanation`, `correct`, `correct_display` per id), applied before labelling; drop an entry once PelNETS fixes it. `metadata_summary.json` carries `set_counts` for the Home question sets.

### Question ID Format

Question IDs follow the pattern `{YEAR}{SEASON}_FE_{PAPER}_{NUMBER}` (e.g. `2024S_FE_AM_Q15`). PM questions from 2008 onward have sub-questions: `2008A_FE_PM_Q1_SQ1`.

### Static Data Bundles

`frontend/public/data/` contains four JSON files consumed entirely offline:
- `questions_index.json` — all 3,600+ questions
- `metadata_summary.json` — year/topic counts and session maps
- `analytical_breakdowns.json` — pre-written topic breakdowns
- `learning_resources.json` — per-topic study links

These files are the output of `generate_index.py` and must be regenerated whenever the Markdown vault is updated.

### Design System

CSS custom properties on `:root` define the color tokens (e.g. `--color-primary`, `--color-surface-container-lowest`). Dark/light theming is applied by toggling the `dark` class on `<html>`. Tailwind v4 classes reference these tokens directly (e.g. `bg-surface-container-lowest`, `text-on-surface`).
