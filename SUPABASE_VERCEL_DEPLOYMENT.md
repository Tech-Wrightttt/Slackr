# SLACKR — Supabase + Vercel Deployment Plan

> Status: **Preparation phase.** Code is ready (Phase 2). Nothing has been deployed, pushed, or migrated.
> Last updated: 2026-10-12

---

## 1. Decisions

| Area | Decision |
| --- | --- |
| Modes | Two modes. **Local/offline** never calls Supabase and uses the local account (username + PBKDF2 password in IndexedDB). **Online** may use Supabase when configured and the device is online. |
| Auth | Local accounts stay the offline source of truth. Supabase Auth is reserved for online mode (not wired yet). Guest mode stays the default; accounts are optional. |
| Question bank | Stays static on Vercel (`frontend/public/data/*.json`). Not moved to a database. |
| Diagrams | Stay on Vercel (`frontend/public/files`). Same-origin keeps the service-worker cache simple. |
| FastAPI | Deployed on Vercel as a Python function (`api/index.py`). Still runs locally exactly as before. |
| Content edits | Learning resources and analytical breakdowns: **admin only** (you). |
| Personal data | Never committed. Per-user progress will live in Supabase with row-level security. |
| Committed data | Only what the app needs to show and sort questions: `questions_index.json`, `metadata_summary.json`, `image-list.json`, `manifest.json`. |

---

## 2. Architecture

```
Browser (React PWA, offline-first)
 ├─ IndexedDB (Dexie): attempts, SRS schedules, settings, sessions, local account   ← source of truth
 ├─ Static bundle on Vercel CDN: questions_index.json, metadata, diagrams, app shell
 ├─ /api/*  → Vercel Python function (FastAPI, hosted mode)
 └─ Supabase (online mode only, lazy-loaded, anon key + RLS)                         ← future sync

Local machine
 ├─ bun run dev  → Vite proxies /api to FastAPI at 127.0.0.1:8000
 └─ uvicorn main:app (local mode: single-user, writes JSON files)
```

### FastAPI modes

| | Local (default) | Hosted (`VERCEL` set, or `SLACKR_HOSTED=1`) |
| --- | --- | --- |
| Question + content reads | Open | Open |
| Personal stats routes (`/api/attempts`, `/api/spaced-repetition`, `/api/stats`, `/api/analytics`, `/api/data`) | Open | **503** — the stats store is one shared file with no per-user isolation |
| Content edits (`POST /api/learning-resources`, `/api/analytical-breakdowns`) | Open unless `SLACKR_ADMIN_TOKEN` is set | Require `Authorization: Bearer <SLACKR_ADMIN_TOKEN>`; 403 otherwise |
| CORS | `*` | Only `ALLOWED_ORIGINS` (same-origin needs none) |
| Filesystem writes | JSON files on disk | Read-only; writes return 503 |

### Trade-offs

| Choice | Gain | Cost |
| --- | --- | --- |
| Local-first sync (IndexedDB primary) | Offline keeps working; small code change | Needs merge logic; last write wins across offline devices |
| Diagrams on Vercel | Simple, already PWA-cached | ~290 MB deploys; Vercel file/size limits |
| FastAPI on Vercel | One deploy, same origin | Cold start loads 6.9 MB JSON; personal routes disabled until per-user storage exists |
| Commit generated question JSON | Vercel can build (the vault is an unclonable gitlink) | ~7 MB in git; regenerate + commit after vault edits |

---

## 3. Phase 2 — code changes (done)

### Frontend
- `frontend/src/config/env.ts` — single source of public config. `apiUrl()` prefixes every `/api` call with `VITE_API_BASE_URL` (empty = same origin).
- `frontend/src/services/supabaseClient.ts` — the only Supabase entry point. `getSupabase()` returns `null` when offline or unconfigured and never loads the SDK then; online it lazy-imports the SDK and returns one shared client using the **anon key only**.
- `frontend/src/vite-env.d.ts` — types for `VITE_*` variables.
- `questionsService`, `syncService`, `learningResourcesService`, `analyticalBreakdownService` — use `apiUrl()`.
- `frontend/vite.config.ts` — dev proxy target from `API_PROXY_TARGET` (default `http://127.0.0.1:8000`; not bundled).
- Dependency: `@supabase/supabase-js` (not in the bundle until something calls `getSupabase()`).
- PWA/offline unchanged; `sw.js` already passes cross-origin (Supabase) requests through uncached.

### Backend
- `backend/main.py` — local/hosted mode switch, personal-data guard, `require_admin()` (constant-time token compare), `write_json()` that returns 503 on read-only filesystems, env-driven CORS, question-bank fallback to `frontend/public/data/questions_index.json`.
- `backend/services/stats_service.py` — stats path from `SLACKR_STATS_PATH`; `/tmp` default on Vercel (the old import-time write crashed on read-only disks).
- `api/index.py` — Vercel entry point; loads the question bank at import (serverless may skip lifespan events).
- `backend/requirements.txt` — converted from UTF-16 to UTF-8 (pip on Vercel can't read UTF-16). Root `requirements.txt` includes it.

### Config
- `vercel.json` — bun install/build, `frontend/dist` output, `/api/*` → Python function, SPA fallback to `index.html`, no-cache for `sw.js` / `manifest.json` / `asset-manifest.json` / `index.html`, immutable `/assets/*`, `excludeFiles` keeps the vault, venv and diagrams out of the function bundle.
- `frontend/.env.example`, `backend/.env.example` — variable names only.
- `.gitignore` — ignores `.env` / `.env.*` (keeps `.env.example`); allowlists only the question/sort JSON + `vercel.json`; explicitly blocks `user_stats.json` and backup/export JSON.

### Verified
- `bun run build` passes; no service-role key in `dist/`.
- `backend/tests/test_backend.py` passes (local mode).
- Hosted-mode smoke test via `api/index.py`: health/years/questions/learning-resources 200 (3,609 questions); analytics/export/settings/attempts 503; edit without token 403.

### Environment variables

| Variable | Where | Browser-visible | Purpose |
| --- | --- | --- | --- |
| `VITE_SUPABASE_URL` | frontend | Yes | Supabase project URL |
| `VITE_SUPABASE_ANON_KEY` | frontend | Yes | Public anon key (RLS-protected) |
| `VITE_API_BASE_URL` | frontend | Yes | FastAPI origin; empty = same origin |
| `API_PROXY_TARGET` | frontend dev only | No | Vite `/api` proxy target |
| `SUPABASE_URL` | backend | No | Server-side Supabase URL (reserved) |
| `SUPABASE_SERVICE_ROLE_KEY` | backend | **Never** | Bypasses RLS — server only (reserved) |
| `SLACKR_ADMIN_TOKEN` | backend | No | Required for content edits |
| `ALLOWED_ORIGINS` | backend | No | Comma-separated cross-origin allowlist |
| `SLACKR_HOSTED` | backend | No | `1` forces hosted mode outside Vercel |
| `SLACKR_STATS_PATH` | backend | No | Local stats file override |

> **Security:** the Supabase service-role key bypasses all row-level security. Only ever set it in Vercel's backend environment variables. Never in a `VITE_*` variable, frontend code, or any committed file.

---

## 4. Phase 3 — your checklist (dashboards)

No database migrations exist yet. Phase 2 only added the client; tables, RLS policies and the admin role come in the next phase as SQL files for you to review and run.

### Before deploying (local git)
- [ ] Regenerate the question bank: `backend\venv\Scripts\python.exe backend/scripts/generate_index.py`
- [ ] `git status`: the only new JSON files are `frontend/public/data/questions_index.json`, `frontend/public/data/metadata_summary.json`, `frontend/public/image-list.json`, `frontend/public/manifest.json`, `vercel.json`
- [ ] Confirm **none** of these appear: `backend/data/user_stats.json`, `.env.local`, `.env`, `slackr_backup_*.json`
- [ ] Commit and push to GitHub yourself

### Supabase
- [ ] Create a project (region near users, e.g. Singapore)
- [ ] Store the database password in a password manager, not the repo
- [ ] Project Settings → API: note **Project URL**, **anon public** key, **service_role** key (service_role goes only into Vercel backend env)
- [ ] Authentication → URL Configuration: Site URL = Vercel production URL; redirect URLs = `http://localhost:5173`, `http://localhost:4173`, `https://*-<team>.vercel.app`
- [ ] Optional: a separate **dev** project for local testing so local runs never touch real data

### Vercel
- [ ] Add New → Project → import the repo
- [ ] Root Directory: **repo root** (not `frontend`); Framework preset: **Other**
- [ ] Settings → Environment Variables:

| Variable | Value | Environments |
| --- | --- | --- |
| `VITE_SUPABASE_URL` | Project URL | Production, Preview |
| `VITE_SUPABASE_ANON_KEY` | anon key | Production, Preview |
| `VITE_API_BASE_URL` | (empty) | Production, Preview |
| `SUPABASE_URL` | Project URL | Production |
| `SUPABASE_SERVICE_ROLE_KEY` | service_role key — mark **Sensitive** | Production only |
| `SLACKR_ADMIN_TOKEN` | long random string you generate — **Sensitive** | Production |
| `ALLOWED_ORIGINS` | empty unless another host calls the API | Production |

- [ ] Redeploy after changing any `VITE_*` value (they are baked in at build time)
- [ ] Deploy; in the build log confirm `api/index.py` stays under 250 MB and the bun install/build succeed

### Verify after the first deploy
- [ ] `https://<domain>/api/health` → 200 (the `/api` rewrite reaches Python)
- [ ] `/api/stats/settings` → 503 (personal routes blocked in hosted mode)
- [ ] Open `/profile` directly and reload → app loads (SPA fallback)
- [ ] DevTools → Application: service worker active, manifest loads
- [ ] DevTools offline + reload: questions, Daily Set and local sign-in still work
- [ ] `/files/2007A_FE_AM_Q10_full.png` loads from Vercel

---

## 5. Running locally after deployment

Local use is unaffected.

- **No `frontend/.env.local`**: fully local, as today. Supabase is never contacted.
- **`frontend/.env.local` with Supabase URL + anon key**: online mode when connected, local mode when offline. Sign-in stays local.
- **Backend** stays in local mode unless `VERCEL` or `SLACKR_HOSTED=1` is set. `main.py` does not auto-load `backend/.env`; set variables in your shell if needed.
- Once cloud sync exists, local runs with real keys write to the real project. Use a dev Supabase project or leave keys empty.

---

## 6. Next phases (not started)

1. **Supabase schema (SQL files for you to run):** `attempts`, `sr_schedules`, `settings`, `deferred`, `sessions` with `user_id uuid references auth.users`, RLS `user_id = auth.uid()`; `learning_resources` and `analytical_breakdowns` readable by all, writable by an admin role only.
2. **Online auth:** Supabase Auth (email + password or magic link) in online mode; local accounts remain for offline.
3. **Sync:** IndexedDB stays primary. When online and signed in, push local changes, pull newer remote rows, merge (last write wins). Replaces `/api/stats/sync`.
4. **Re-enable hosted personal routes** (optional) once FastAPI reads/writes per-user data from Supabase with the user's JWT.
5. **Admin edits in production:** persist learning resources / breakdowns to Supabase instead of files.
