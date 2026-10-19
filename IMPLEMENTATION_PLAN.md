# SLACKR Implementation Plan: v1.2 Features and Fixes

Items are ordered from **quickest** to **largest**. Effort is a rough estimate for one developer.
Each item lists the files it touches, the approach, and when it counts as done.

| # | Item | Source request | Effort |
|---|------|----------------|--------|
| 1 | CI workflow for every PR | #12 | 1 h |
| 2 | Drawing: Ctrl+Y redo | #5 | 1 h |
| 3 | Drawing: double-tap to undo (touch) | #13 | 1–2 h |
| 4 | Restyle correct / incorrect choice states | #6 | 2–3 h |
| 5 | Question review: keep the answer when you come back | #4 | 3–4 h |
| 6 | Practice mode toggles | #3 | 1 day |
| 7 | Custom builder redesign | #11 | 1 day |
| 8 | Drawing: scribble over strokes to erase | #5, #13 | 1 day |
| 9 | Progress by exam year | #10 | 1–2 days |
| 10 | Data integrity: FE-B options and parser vs PelNETS | #7 | 1–3 days |
| 11 | Question sets: Frequently tested, Recall only, Solving only | new | 2–3 days |
| 12 | Scoring investigation, pseudo-weights, mock paper | #9 | 1–2 days |
| 13 | After-session report | #2 | 2–3 days |
| 14 | Exam mode | #1 | 3–5 days |
| 15 | Community references | #8 | 3–5 days |

Dependencies that break the strict order:
- **13 (report)** adds a per-question session event log. **14 (exam mode)** reuses it, so build 13 first.
- **11 (question sets)** adds the `kind` classifier that **12 (scoring)** uses for its weight tiers, so build 11 first.
- **6 (practice toggles)** adds the shuffle and timer controls that **14** reuses.
- **5 (review)** and **14** both need the answer to survive navigation, so they share one state shape.
- Every new Dexie table or index needs a new `this.version(N)` in `frontend/src/db/index.ts` (current top is v6).

---

## 1. CI workflow for every PR (#12)

**Files:** new `.github/workflows/ci.yml`

Approach:
- Trigger on `pull_request` and on `push` to `main`.
- Job `frontend` (ubuntu-latest): `oven-sh/setup-bun`, `bun install --frozen-lockfile`, `bun run build`, then `bunx vitest run` (config at `frontend/vitest.config.ts`).
- Job `backend`: `actions/setup-python` (match the local venv version), `pip install -r backend/requirements.txt -r backend/requirements-dev.txt`, then `pytest` from `backend/` (uses `backend/pytest.ini`).
- Check out with `submodules: recursive` so `backend/data/pelnets` exists for parser tests.
- Optional job: run `generate_index.py` and fail if `git diff --exit-code backend/data/questions_index.json` shows drift. This catches a vault bump that was committed without regenerating the JSON.
- Do not run `scripts/run_tests.py` in CI. It produces a PDF report, which CI does not need. Upload coverage as an artifact instead if wanted.
- Tests that hit Supabase must stay mocked. CI has no `backend/.env`.

Done when: a PR shows two green checks, and a failing test turns a check red.

---

## 2. Drawing: Ctrl+Y redo (#5)

**Files:** `frontend/src/components/DrawOverlay.tsx`

Today: `historyRef` (line ~97) holds undo snapshots. `undo()` pops it (line ~301). There is no redo stack.

Approach:
- Add `redoRef = useRef<Stroke[][]>([])`.
- `undo()`: push the current `strokes()` onto `redoRef` before restoring the popped snapshot.
- `redo()`: pop `redoRef`, push current onto `historyRef`, restore.
- Any new stroke or clear empties `redoRef` (standard editor rule).
- Reset `redoRef` with `historyRef` when the question changes (line ~181).
- Key handler (next to the `Escape` handler, line ~164): `Ctrl+Y` and `Ctrl+Shift+Z` run redo. `Ctrl+Z` runs undo if it is not bound yet. Use `metaKey` too for macOS.
- Add a redo button next to undo (`material-symbols` `redo`), disabled when `redoRef` is empty.
- Skip shortcuts while focus is in an `input` or `textarea`.

Done when: draw 3 strokes, undo 2, Ctrl+Y twice restores both, and a new stroke after undo disables redo.

---

## 3. Drawing: double-tap to undo on touch (#13)

**Files:** `frontend/src/components/DrawOverlay.tsx`

Approach:
- In the pointer-down handler, for `pointerType === 'touch'` and `'pen'`, record the time and position of each short tap.
- A tap is a down and up within ~200 ms and under ~10 px of movement. A tap draws no stroke, so discard any dot it made.
- Two taps within ~300 ms and ~30 px of each other run `undo()`.
- Keep the existing two-finger and palm-rejection logic (line ~226) untouched.
- Show a short toast ("Undone") so the gesture is discoverable. Mention the gesture in the toolbar tooltip.

Done when: on a phone or tablet, double-tap removes the last stroke, and fast single dots still draw.

---

## 4. Restyle correct / incorrect choice states (#6)

**Files:** `frontend/src/components/QuestionCard.tsx` (choice rendering around lines 386–420), CSS tokens in the global stylesheet

Approach:
- Audit the four states in both themes: selected (not submitted), correct answer, your wrong pick, other choices after submit.
- Use tokens, not raw colors. Add `--color-success` / `--color-on-success-container` style tokens if they do not exist, mirrored for `.dark`.
- Suggested style: a tinted container plus a 2 px border plus a leading icon (`check_circle` / `cancel`). Mute the other choices to ~60% opacity after submit.
- Never rely on color alone. The icon and an `aria-label` ("Correct answer", "Your answer, incorrect") carry the meaning for color-blind users.
- Check contrast at WCAG AA in light and dark mode.
- Apply the same classes in `AnswerFeedback.tsx` if it repeats the choice list.

Done when: screenshots of all four states in both themes look consistent and pass contrast checks.

---

## 5. Question review: keep the answer when you come back (#4)

**Files:** `frontend/src/components/QuestionCard.tsx`, the quiz pages (`QuizByYear.tsx`, `QuizByTopic.tsx`, `QuizCombined.tsx`, `QuizCustom.tsx`), `frontend/src/store/useStore.ts`

Today: `selectedChoice`, `isSubmitted`, and `isCorrect` are local state in `QuestionCard` and reset on navigation. `sessionAnswerMap` only keeps `{ isCorrect }`.

Approach:
- Lift per-session answers into one map owned by the quiz page: `Record<questionId, { selected: string; isCorrect: boolean; timeSeconds: number; confidence?: number }>`.
- Pass the entry into `QuestionCard`. If it exists, render in the submitted state with the stored choice and feedback, and do not write a new attempt.
- Add a setting `reviewShowsPreviousAnswer` (default on) in the Settings page, stored via the existing settings pattern. This setting applies to practice mode. Exam mode always keeps answers locked (see item 14).
- Keep the map in memory for the session only. IndexedDB `attempts` already has the history.

Done when: answer Q1, go to Q2, go back to Q1, and Q1 shows your answer and the feedback without a duplicate attempt row.

---

## 6. Practice mode toggles (#3)

**Files:** `frontend/src/components/QuestionCard.tsx`, `frontend/src/store/useStore.ts`, `frontend/src/pages/Settings.tsx`

All toggles live in the existing session preferences in `useStore`, with a quick toggle in the quiz header.

1. **One-attempt limit (on/off).** When on, a question answered in this session is read-only (reuse the item 5 state). When off, show a "Try again" button that clears the session entry. A retry still writes a new attempt row.
2. **Shuffle choices.** Shuffle the display order of `options` with a seeded shuffle (seed = session id + question id), so the order stays stable when you navigate back. Relabel the shown letters a, b, c, d. Map the selection back to the original key before grading and storage. Hide this for questions whose choices are positional, such as "all of the above", "both a and b", or image-only choices. Detect them with a small regex list and skip shuffling.
3. **Flip warning.** Count changes of `selectedChoice` before submit. At 3 or more changes, show a non-blocking hint: "Switching a lot? Commit to your reasoning first, that's what builds recall." Store `choiceSwitches` on the attempt (optional field, no index, so no schema bump).
4. **Timer controls.** The timer is a `setInterval` in `QuestionCard` (line ~99). Add pause and stop:
   - Pause freezes the interval and blurs the question, so pausing cannot be used to read ahead.
   - Stop ends timing for this question and records the time up to that point.
   - Add a session-level timer in the quiz header that sums question times and supports pause.

Done when: each toggle works alone and together, and shuffled answers are graded and stored against the original key.

---

## 7. Custom builder redesign (#11)

**Files:** `frontend/src/pages/QuizCustom.tsx`

Findings:
- **"Show Answers"** (line ~320) toggles `hideAnswersInCustomQuiz`. It controls whether answers and explanations show during the custom quiz. The label reads like an action, not a state, which is why its purpose is unclear. Rename to "Reveal answers after each question: On / Off" and add a one-line description. Or move it into the shared practice toggles from item 6 and remove it here.
- **Pagination:** the question table renders `filteredQuestions.slice(0, 100)` (line ~484), and "select all" also only adds the first 100 (line ~97). Rows past 100 are not reachable.

Approach:
- Add pagination below the table: page size 25 / 50 / 100, page numbers, previous and next, and a "Showing 51–100 of 1,240" label.
- "Select all" must select every filtered result, not one page. Add a separate "Select page" action.
- UI: run the `impeccable` skill for a critique pass first. Expected direction: filters in a left column or top bar, a sticky summary bar ("42 selected · ~63 min · Start"), and a clearer empty state.
- Keep the selection in a `Set` so page changes keep selected rows.

Done when: all filtered questions are reachable and selectable, and the answer toggle explains itself.

---

## 8. Drawing: scribble over strokes to erase (#5, #13)

**Files:** `frontend/src/components/DrawOverlay.tsx`, plus a small helper (for example `frontend/src/components/drawGestures.ts`)

Approach:
- Detect a scribble after each finished stroke:
  - Count direction reversals along the main axis. Scribble = 4 or more reversals within a compact bounding box.
  - Check that the path length is much longer than the bounding box diagonal (ratio above ~3).
- When a stroke is a scribble, remove it and every existing stroke whose points fall inside, or whose segments cross, the scribble's bounding box. Use a hit test against the scribble polyline with a tolerance of about the stroke width.
- Push a history snapshot first, so Ctrl+Z and double-tap restore the erased strokes.
- Works for mouse, pen, and touch, which covers #13.
- Add a setting to turn scribble-erase off, for users who shade areas on purpose.
- Unit-test the detector in Vitest with fixed point arrays: a zigzag is a scribble, and a circle, a straight line, and handwriting like "abc" are not.

Done when: a zigzag over a stroke removes it on desktop and touch, undo restores it, and normal writing is never erased.

---

## 9. Progress by exam year (#10)

**Files:** `frontend/src/services/analyticsEngine.ts` (it already returns `byYear` around line 631), `frontend/src/pages/QuizByYear.tsx` or `Analytics.tsx`, new `frontend/src/components/YearStatsPanel.tsx`

Approach: each year card or row opens a panel (drawer on mobile) with these stats:
1. **Accuracy and coverage:** correct / attempted, attempted / total, split by paper (FE-A/AM vs FE-B/PM).
2. **Repeat traps:** questions answered wrong 2 or more times, listed and linked to `QuestionHistory`.
3. **Weakest topics in that year:** the bottom 3 topics by accuracy, with a minimum of 2 attempts.
4. **Average time per question** versus your overall average, so slow years stand out.
5. **Confidence calibration:** share of high-confidence wrong answers, which counts as "fooled" (reuse the calibration logic).
6. **Trend:** accuracy on first attempts vs latest attempts for that year's questions.

Add one engine method, `getYearDetail(year)`, that runs one Dexie query on `attempts` filtered by the year's question ids. Do not compute this in the component.

Done when: clicking a year shows the six stats, and the numbers match a manual count on a test profile.

---

## 10. Data integrity: FE-B options and parser vs PelNETS (#7)

**Files:** `backend/parsers/markdown_parser.py`, `backend/scripts/generate_index.py`, `backend/data/pelnets/` (read-only submodule), `frontend/src/components/QuestionCard.tsx`, `MarkdownRenderer.tsx`

This item is an investigation first. Do not change the parser before step 2 has a list of broken ids.

1. **Audit script** (`backend/scripts/audit_index.py`): load `questions_index.json` and report:
   - questions with fewer than 4 options, or with empty or very short option text
   - options that contain leftover Markdown, such as a table pipe `|`, a code fence, `![[`, or `$` without a closing `$`
   - `correct` keys missing from `options`
   - ids expected from the session map but missing from the index
   - vault files that produced no question
2. **Compare structures:** pick about 10 failing ids. Diff the raw vault Markdown against the parsed JSON, and against how PelNETS itself (Joryuoo/pelnets) reads the same file. Likely causes to check:
   - Multi-line FE-B options (code blocks, tables, or pseudocode inside a choice) cut at the first newline by the option regex.
   - Options written as a table (answer-group tables in FE-B) instead of a list.
   - Answer-group rows such as `a | b | c` mapped to one option.
   - Options that are images or WikiLinks.
   - Frontmatter keys that differ between older and newer vault files.
3. **Frontend display:** options may also be truncated by CSS (`line-clamp`, `truncate`, or `overflow-hidden`) or by rendering options as plain text instead of through `MarkdownRenderer`. Check both.
4. Fix the parser, add one regression test per failure pattern in `backend/tests/`, regenerate the index, and commit both.
5. Add the audit script to CI (item 1) as a warning, then as a failure once the count reaches zero.

Done when: the audit reports zero broken options, and the known failing ids render fully.

---

## 11. Question sets: Frequently tested, Recall only, Solving only (new)

**Files:** `backend/scripts/generate_index.py`, `backend/parsers/markdown_parser.py`, `backend/models/schemas.py`, `frontend/src/db/schema.ts` (`QuestionData`), `frontend/src/services/questionsService.ts`, `frontend/src/pages/QuizCustom.tsx`, `frontend/src/pages/Home.tsx`

Three ready-made sets, each available as a filter in the Custom builder and as a one-click card on Home:

| Set | What it contains |
|-----|------------------|
| **Frequently tested** | Questions whose concept appears in many exam years, ranked by how often it repeats |
| **Recall only** | Multiple-choice questions you answer from knowledge: no calculation, tracing, or code |
| **Solving only** | Questions that need working out: calculation, pseudocode or flowchart tracing, algorithms, logic |

### Step 1: classify each question at build time

Add a `kind: 'recall' | 'solving'` field in `generate_index.py`. The JSON is rebuilt offline, so the frontend reads the field and never computes it.

Mark a question `solving` when any of these hold:
- It is an FE-B / PM question. These are trace-and-debug by design.
- Its topics or tags include algorithm, pseudocode, flowchart, data structures, or calculation-type topics such as number systems, probability, or performance. Keep the list in one constant.
- Its stem contains code, a code fence, a pseudocode keyword (`for`, `while`, `if ... then`, `←`), or a formula in `$...$`.
- Its stem asks for a value: "how many", "calculate", "what is the value", "what is the output", "minimum", "maximum", or a number with a unit.
- All of its options are numbers or expressions.

Every other question is `recall`.

Accuracy check:
- Hand-label about 100 random questions and compare them with the classifier output.
- Tune the rules until agreement is at least 90%.
- Add a manual override file, `backend/data/kind_overrides.json` (question id to kind), for the cases rules get wrong.
- Write a pytest with labeled examples so rule changes cannot silently regress.

### Step 2: detect frequently appearing questions

Also in `generate_index.py`:
- Normalize each stem: lowercase, strip Markdown, numbers, and punctuation.
- Compare stems with TF-IDF cosine similarity. Use `scikit-learn` in the dev requirements only, or a small hand-written TF-IDF to avoid the dependency. About 3,600 questions is small enough for a full pairwise pass.
- Group questions above a similarity threshold (start at 0.6, then tune by reading samples) into clusters.
- Write `repeat_group` (cluster id) and `repeat_count` (number of distinct exam years in the cluster) on each question.
- Questions with `repeat_count >= 2` form the Frequently tested set. Sort it by `repeat_count` descending, then by the PelNETS order.
- Show a badge on the question card: "Appeared in 5 exams". The badge links to the other questions in the group.

Fallback if text similarity is too noisy: rank by topic frequency across years. This is weaker, because it finds common topics, not repeated questions.

### Step 3: UI

- `questionsService.ts`: add `filterByKind(kind)` and `getFrequentlyTested(minCount)`. Keep the filtering there, not in pages.
- Custom builder: add a "Question type" filter (All / Recall only / Solving only) and a "Frequently tested" toggle. Both combine with the existing year and topic filters.
- Home: add three set cards that start a session directly. Each card shows the question count.
- Bump the service worker data cache name (`slackr-data-v2` to `v3`) in `public/sw.js`, so installed apps fetch the new index fields.

Done when:
- Each set builds from the Custom builder and from Home.
- The classifier matches at least 90% of the hand-labeled sample.
- Frequently tested lists real repeats, verified by reading 20 clusters.
- Old cached clients pick up the new fields after the cache bump.

---

## 12. Scoring investigation, pseudo-weights, mock paper (#9)

**Files:** `frontend/src/pages/QuizByYear.tsx` (line ~338), `QuizCombined.tsx` (line ~223), new `frontend/src/services/scoring.ts`, `backend/scripts/generate_index.py`

### Finding

The score today is plain accuracy: `Math.round(correct / answered * 100)`. Two problems follow:
- It divides by **answered**, not by the **total** in the paper. Skipping hard questions raises the score. The real exam counts an unanswered question as 0.
- It weights every question the same. PhilNITS scores each paper out of 1000 with per-question weights, and 600 passes. The weights are **not published**.

Verify the current format on philnits.org / itpec.org before building. The newer FE uses Subject A and Subject B with question counts and durations that differ from the older AM (80 questions) / PM format. The scorer must take the paper format from the question data, not from fixed constants.

### Recommended feature: "Mock score (est.)"

Show a second score next to accuracy at the end of a full-paper session: **"Estimated 640 / 1000 · Pass line 600"**, with a tooltip that says the weights are estimates.

Pseudo-weights, computed offline in `generate_index.py` and stored as `weight_tier` on each question. They reuse the `kind` classifier from item 11:
- **Tier 3 (heavy):** FE-B / PM questions, and FE-A / AM `solving` questions that contain code, pseudocode, or a flowchart.
- **Tier 2:** other FE-A / AM `solving` questions, such as calculations.
- **Tier 1 (light):** `recall` questions.

Score = sum of the weights of correct answers / sum of the weights of all questions in the paper × 1000. Normalize per paper, so each paper is out of 1000.

Later, refine tiers with the user's own error rate per question. Keep the offline tier as the base so new users get the same score.

### Mock paper

Add a **Mock paper** set next to the item 11 sets. It is a full random paper that matches the real tier mix, scored with the mock score.

Done when: scores divide by the paper total, the mock score shows with its disclaimer, and the mock paper builds a valid set.

---

## 13. After-session report (#2)

Applies to exam mode and practice mode.

**Files:** new `frontend/src/components/SessionReport.tsx`, `frontend/src/db/schema.ts` and `db/index.ts` (add fields to `sessions`), the quiz pages, `QuestionCard.tsx`

### Data needed

Add a per-question session log, kept in memory during the session and saved on the `sessions` row at the end:

```ts
interface SessionQuestionLog {
  questionId: string;
  timeSeconds: number;
  finalChoice: string | null;   // null = skipped
  isCorrect: boolean | null;
  choiceSwitches: number;       // from item 6
  flagged: boolean;
  confidence?: number;
}
```

If the `sessions` table needs a new index, bump the Dexie version. Storing the log as a non-indexed array field needs no bump.

### Report sections

- **Score summary:** accuracy, mock score (item 12), total and average time.
- **Slowest 5** and **fastest 5** questions. Mark fast and wrong answers as "rushed".
- **Skipped / flagged** list.
- **Unsure:** questions with 2 or more choice switches, split into "switched to right" and "switched away from right".
- **Per question click:** opens `QuestionHistory` for that id with all attempts, accuracy, and a trend sparkline.
- **More stats:**
  - accuracy by topic within this session
  - confidence calibration (high-confidence wrong answers)
  - first-half vs second-half accuracy, to show fatigue
  - comparison with your last session on the same set
  - "time on wrong answers" share

Add a "Review mistakes" button that starts a practice session with the wrong and skipped questions.

Done when: the report appears after practice and exam sessions, every number matches the session log, and past reports reopen from the session history.

---

## 14. Exam mode (#1)

**Files:** new `frontend/src/pages/QuizExam.tsx` (route in `App.tsx`), `QuestionCard.tsx` (exam variant), `db/schema.ts` and `db/index.ts`, `useStore.ts`, `Settings.tsx`

### Behavior

- **Separate from practice.** Each session row gets `mode: 'practice' | 'exam'`. History, analytics filters, and the report show the mode.
- **"Take as timed quiz"** button on year, topic, and custom set screens.
- **Real exam rules:**
  - forward-only navigation
  - no changing an answer after moving on
  - no feedback until the end
  - Skipping counts as wrong in the score.
- **Time:**
  - A countdown for the whole set. Default to the official paper duration, or a per-question rate for custom sets.
  - Each question's time is still recorded for the report.
  - Auto-submit when time runs out.
- **Pause:**
  - Pause hides the question and stops the clock.
  - Add a setting for strict exams with pause disabled.
  - Store the pause count in the session, so the report can show it.
- **Stats:** exam answers write normal `attempts` rows (add `mode: 'exam'`), so they count fully in analytics and SRS.
- **One attempt per set:** this plan reads "one attempt per topic" as one exam attempt per set (topic, year/paper, or custom set id).
  - Store the attempts in a new table `examAttempts: '++id, &setKey, completedAt'`, which needs Dexie v7.
  - Starting a set that already has a row shows the previous result instead.
- **Reset exams:**
  - Settings gets "Reset exam attempts" (all sets, or one set from its result screen).
  - A reset removes `examAttempts` rows only.
  - A reset does not delete `attempts`, so stats history stays.
  - Confirm with a dialog first.
- **Resume after reload:** save the in-progress exam state (answers, remaining time, index) to IndexedDB every answer. An accidental refresh must not lose the exam.

### Steps

1. Schema v7: `examAttempts` table, plus `mode` on sessions and attempts.
2. Exam state machine in a small hook `useExamSession`: states `idle`, `running`, `paused`, `submitted`. Use a single timer source of truth based on `Date.now()` differences, not interval counts, so it stays correct when the tab is in the background.
3. `QuestionCard` exam variant: no feedback, no back button, and a flag button.
4. End screen shows the item 13 report.
5. Tests in Vitest:
   - Timer pause and resume.
   - Auto-submit at 0.
   - Second attempt is blocked.
   - Reset unblocks the set.
   - Exam attempts are counted in analytics.

Done when: a full-paper exam runs start to finish with pause, refresh, and auto-submit, and the set locks until it is reset.

---

## 15. Community references (#8)

**Files:** `frontend/src/services/learningResourcesService.ts`, `frontend/src/db/schema.ts` and `db/index.ts`, `backend/routers/` (new `references.py`), `backend/services/supabase_gateway.py`, Supabase migration, admin UI

This is the largest item. It is the only one that needs backend, database, and moderation work. Per the architecture, only the backend talks to Supabase.

### Part A: personal references (offline, smaller)

- New Dexie table `customReferences: '++id, topic, questionId, createdAt'` (schema v8, or fold it into v7 if it ships with exam mode).
- Fields: title, URL, topic and/or question id, and a note.
- Merge them into the topic and question resource lists with a "Mine" badge, plus edit and delete.
- Include them in `syncService` export and import and in the cloud JSON backup.
- Validate URLs: allow only `http:` and `https:`, and render links with `rel="noopener noreferrer"`.

### Part B: suggestions for admin review

- Backend:
  - `POST /api/references/suggest` requires sign-in and is rate limited per user.
  - `GET /api/references/approved` is public and cacheable.
  - Admin endpoints `GET /api/admin/references?status=pending` and `POST /api/admin/references/{id}/review` take approve or reject plus a reason.
- Supabase table `reference_suggestions`:
  - columns: id, user_id, topic, question_id, title, url, note, status, reviewed_by, reviewed_at, created_at
  - Turn on RLS: users insert their own rows and read their own rows, and only admins update.
- Admin role: a flag in user metadata or an `admins` table, checked on the server for every admin endpoint. Never trust a client flag.
- The frontend queues suggestions in an outbox while offline, the same pattern as `reports`.
- Approved references ship in one of two ways:
  - fetched and cached in the `slackr-data-v2` service worker bucket, or
  - merged into `learning_resources.json` at build time.
  - Pick one. Build-time merge keeps the offline-first rule simple.
- Moderation safety:
  - Strip HTML from the title and note.
  - Allow only `https` URLs.
  - Optionally check URLs against a domain blocklist.
- Admin UI: a protected route listing pending suggestions with approve and reject buttons.

Done when: a user can add a private reference offline, can submit a suggestion that an admin approves, and the approved reference appears for all users. A non-admin calling the admin endpoints gets 403.

---

## Open questions

1. **"One attempt per topic":** does this mean per exam set (this plan's reading), or literally per topic across all sets?
2. **Approved references:** should they ship at build time (simpler, offline) or be fetched live (faster to publish)?
3. **Exam format:** confirm which FE format (old AM/PM or current Subject A/B) the mock score and exam timer must match. Check philnits.org.
