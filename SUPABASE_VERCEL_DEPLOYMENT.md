# SLACKR — Supabase + Vercel Plan

> Status: **App deployed on Vercel. Online accounts, sync and bug reports are implemented in the FastAPI backend (Phase B).**
> To turn it on: run the SQL in `supabase/migrations/` and set `SUPABASE_URL` + `SUPABASE_ANON_KEY` for the backend (§5).
> The browser never talks to Supabase and the bundle contains no Supabase URL or key.
> Last updated: 2026-10-12

---

## 1. What the database is for

SLACKR stays offline-first. Supabase only adds three small things:

| Stored online | Why | Size per user |
| --- | --- | --- |
| **Account** (Supabase Auth + `profiles`) | Sign up / sign in from any device | < 1 KB |
| **Study data backup** (`user_data`, one JSON per user) | Same JSON the app already exports: attempts, SRS schedules, settings, bookmarks, deferred, sessions | typical 50–500 KB, heavy ~1–2 MB, hard cap 5 MB |
| **Bug reports** (`bug_reports`) | Question / explanation flags and general bug reports | < 2 KB each |

Not stored online: the question bank, diagrams, analytics (computed in the browser), drawings (session-only).

**Size check:** Supabase Free has 500 MB of database. Even at 1 MB per user that is several hundred active users; most users are far smaller, and `jsonb` is compressed on disk. Nothing else grows.

---

## 2. Two storages, both ways

```
Browser (always works)            FastAPI /api (uvicorn locally, Vercel when hosted)      Supabase
──────────────────────            ────────────────────────────────────────────────      ────────
IndexedDB (Dexie)                 /api/account/signup|signin|signout|me                auth.users + profiles
 ├─ attempts, schedules, ...  ⇄   /api/account/data   (GET / PUT, session cookie)  ⇄   user_data.data
 ├─ accounts (local username)     /api/reports        (POST)                        →   bug_reports
 └─ reports (outbox)
                                  Session = httpOnly cookies (slackr_at, slackr_rt; path /api)
```

| Situation | Accounts | Study data | Bug reports |
| --- | --- | --- | --- |
| **Offline** (or Supabase not configured) | Local account only (username + password checked on the device) | IndexedDB only | Saved on the device as **Queued** |
| **Online, guest** | Guest | IndexedDB only | Sent to `bug_reports` (anonymous) |
| **Online, signed in** | Supabase account; a local copy is kept so offline sign-in still works | IndexedDB ⇄ `user_data` (merge both ways) | Sent to `bug_reports` with the user's id |
| **Back online after offline use** | — | Local changes pushed, remote changes pulled | Queued reports sent automatically (already built) |

### Sync rule (merge, never overwrite blindly)
1. **Pull:** read `user_data.data` for the signed-in user.
2. **Merge into IndexedDB** with the existing `SyncService.importLocalData(json, 'merge')`. It already de-duplicates attempts and keeps the newest schedules, so merging the same JSON twice is a no-op.
3. **Push:** `SyncService.buildBackup()` → upsert into `user_data`.
4. **When:** on sign-in, when the device comes back online, and a few seconds after the user answers questions (debounced). Never while offline.

Result: each device keeps its full JSON locally, and the database holds the merged copy that every device converges on.

---

## 3. Decisions

| Area | Decision |
| --- | --- |
| Online sign-in | **Email + password** with Supabase Auth. Supabase requires an email (it's also how password reset works). The username lives in `profiles` and is what the app shows. |
| Local accounts | Kept. Signing up or in online also stores the local account on that device, so the same username + password works offline later. |
| Guests | Still allowed. Accounts stay optional. |
| Where Supabase is called | **Only from FastAPI** (`backend/routers/account.py` → `backend/services/supabase_gateway.py`). The browser calls `/api/account/*` and `/api/reports`; no Supabase URL, key or token reaches page scripts. |
| Session | Supabase access + refresh tokens live in **httpOnly, SameSite=Lax cookies** scoped to `/api` (Secure on HTTPS). FastAPI refreshes expired access tokens automatically. Cookie-authenticated writes also reject cross-site `Origin` headers (CSRF). |
| Keys | FastAPI uses the **publishable / anon** key; per-user rows are read and written with the user's own token, so row-level security still applies. **No service-role / secret key is used anywhere.** |
| Question bank, diagrams | Static files on Vercel, cached by the service worker. |
| Committed data | Only question/sort data (`questions_index.json`, `metadata_summary.json`, `image-list.json`, `manifest.json`). Never user data or `.env` files. |

---

## 4. Database (SQL in the repo, you run it)

| File | Creates |
| --- | --- |
| `supabase/migrations/0001_bug_reports.sql` | `bug_reports` — anyone can **insert**; nobody can read through the API (you read it in the dashboard) |
| `supabase/migrations/0002_accounts_and_user_data.sql` | `profiles` (auto-created on sign-up from the `username` metadata), `username_available()` check, `user_data` (own row only, 5 MB cap, server-set `updated_at`), `bug_reports.user_id` (filled from the caller's session, can't be spoofed) |

Run them **in order**, once.

---

## 5. Setup guide — Supabase + your existing Vercel deployment

### Step 1. Create the Supabase project
1. https://supabase.com → **New project**.
2. Name `slackr`, region **Southeast Asia (Singapore)** (closest to PhilNITS users).
3. Save the database password in a password manager. The app never needs it.

### Step 2. Run the SQL
1. Dashboard → **SQL Editor** → **New query**.
2. Paste `supabase/migrations/0001_bug_reports.sql` → **Run**.
3. New query → paste `supabase/migrations/0002_accounts_and_user_data.sql` → **Run**.
4. **Table Editor** should now list `bug_reports`, `profiles`, `user_data`, each with "RLS enabled".

### Step 3. Auth settings
1. **Authentication → Sign In / Providers → Email**: enabled.
2. **Confirm email**: turn **off** for launch. Supabase's built-in mailer only sends a few emails per hour, which would block sign-ups. Turn it back on once you add custom SMTP (Authentication → Emails → SMTP).
3. **Authentication → URL Configuration**:
   - **Site URL**: your Vercel production URL, e.g. `https://slackr.vercel.app`
   - **Redirect URLs**: add
     - `https://slackr.vercel.app/**`
     - `https://*-<your-vercel-team>.vercel.app/**` (preview deploys)
     - `http://localhost:5173/**` and `http://localhost:4173/**` (local dev / preview)

### Step 4. Copy the two values
**Project Settings → API Keys** (older dashboards: **Project Settings → API**):
- **Project URL** — `https://<project-ref>.supabase.co`
- **Publishable key** (`sb_publishable_…`) or the legacy **anon public** key. Either works.

Do **not** copy the secret / service_role key. SLACKR doesn't use it.

### Step 5. Add them to Vercel (backend variables)
Vercel → your project → **Settings → Environment Variables**:

| Name | Value | Environments |
| --- | --- | --- |
| `SUPABASE_URL` | Project URL | Production, Preview |
| `SUPABASE_ANON_KEY` | Publishable / anon key | Production, Preview |

Only the FastAPI service reads these (no `VITE_` prefix, so they never enter the frontend bundle).
Delete `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY` and `SUPABASE_SERVICE_ROLE_KEY` if you added them earlier.

### Step 6. Redeploy
Vercel → **Deployments** → latest production → **⋯ → Redeploy**, so the backend picks up the new variables.
Check `https://<domain>/api/account/status` → `{"enabled": true}`.

### Step 7. Local setup (uvicorn + Vite)
1. Create `backend/.env` (git-ignored; `main.py` loads it):
   ```
   SUPABASE_URL=https://<project-ref>.supabase.co
   SUPABASE_ANON_KEY=sb_publishable_...
   ```
2. Terminal 1, from the repo root, start the API:
   ```powershell
   backend\venv\Scripts\python.exe -m uvicorn main:app --app-dir backend --host 127.0.0.1 --port 8000 --reload
   ```
   http://127.0.0.1:8000/api/account/status should return `{"enabled": true}`.
3. Terminal 2, from `frontend/`: `bun run dev` → http://localhost:5173. Vite proxies `/api` to uvicorn, so the session cookies are same-origin.
   For the installed/offline build: `bun run build` then `bun run preview` → http://localhost:4173 (also proxied).
4. `frontend/.env.local` needs nothing for accounts. Without `backend/.env`, online accounts are off and the app runs device-only.

Tip: a second free "slackr-dev" Supabase project keeps test sign-ups out of real data.

### Step 8. Test sign-up / sign-in locally
1. Run both SQL files (Step 2) and set Auth settings (Step 3) in your Supabase project.
2. Start uvicorn and Vite as in Step 7 (restart uvicorn after editing `backend/.env`).
3. Check every endpoint against your real project (creates one throwaway account; delete it afterwards):
   ```powershell
   backend\venv\Scripts\python.exe backend/scripts/check_accounts.py
   ```
   Deployed: add the site URL, e.g. `... check_accounts.py https://<your-domain>`.
4. Walk through the app:
   - [ ] **Sign up** with username + email + password → you land on the dashboard. Supabase → Authentication → Users shows the user; Table Editor → `profiles` has the username; `user_data` has one row.
   - [ ] Answer a question, open **Profile** → *Online backup* shows "Synced …". `user_data.data.attempts` grows.
   - [ ] **New device:** open the app in a private window → Sign in with the **email** → your attempts appear (pulled from `user_data`).
   - [ ] **Offline sign-in:** sign out, DevTools → Network → *Offline*, sign in with the **username** + same password → works from the device copy.
   - [ ] **Device-only profile:** sign up with no email, then Profile → *Online backup* → enter email + current password → **Link account**.
   - [ ] **Errors:** a taken username, an already-used email and a wrong password each show a clear message.
   - [ ] **Bug report:** Profile → Report a bug → row in `bug_reports` (with `user_id` when signed in). Offline → shows *Queued*, sends when back online.
5. Then repeat the same on the deployed site after Steps 5–6.

## 6. Phase B — code (done)

### Backend
| File | What it does |
| --- | --- |
| `backend/services/supabase_gateway.py` | The only code that calls Supabase (Auth + PostgREST), using the standard library (no new dependency). Maps Supabase errors to clear messages. |
| `backend/routers/account.py` | `GET /api/account/status`, `GET /api/account/username-available` (live check on the sign-up form), `POST /api/account/signup`, `POST /api/account/signin`, `POST /api/account/signout`, `GET /api/account/me`, `GET`/`PUT /api/account/data` (5 MB cap), `POST /api/reports`. Sets, refreshes and clears the session cookies; rejects cross-site writes. |
| `backend/main.py` | Loads `backend/.env`, mounts the router. Hosted mode allows these routes (they're per-user via Supabase). |

### Frontend
| File | What it does |
| --- | --- |
| `services/accountApi.ts` | Thin `fetch` client for the routes above. Remembers whether the server offers accounts (`accountsEnabled`) for offline launches. |
| `services/authService.ts` | `signUp({ username, password, email? })`: with an email, the backend creates the online account and starts the session; the device copy is stored with `email` + `remoteId`. Without email: device-only profile. On an existing device-only profile it **links** it online (current password required). `signIn(usernameOrEmail, password)`: online + linked, the backend checks the password and the device copy is refreshed (a new device gets its local account here); server unreachable or offline, the device copy is checked. Refuses to sign a different person into a device that already has a profile. Sign-out ends the server session (retried later if offline). |
| `services/cloudSync.ts` | Pull `GET /api/account/data`, merge, push `PUT /api/account/data`. Runs on start, on reconnect, ~4 s after answers / schedule / setting changes, and when backgrounded. Only when the server session's user matches this profile. |
| `services/reportService.ts` | Queued reports go to `POST /api/reports` (attached to the user when signed in online). |
| `pages/Auth.tsx`, `components/OnlineAccountCard.tsx` | Email field, "Username or email" and the Online backup card appear when the server reports accounts are enabled. |
| Removed | `@supabase/supabase-js`, `services/supabaseClient.ts`, `VITE_SUPABASE_*`. |

Verified with uvicorn + `bun run preview` against a local mock of the Supabase endpoints (Chrome, phone viewport): sign-up with email, `user_data` push, fresh-device sign-in pulls attempts, wrong password, taken username, existing email, offline username sign-in, device-only profile linked online, bug report stored with the user id, session cookies httpOnly and invisible to `document.cookie`, expired access token refreshed from the refresh cookie, cross-site `Origin` refused (403), unauthenticated data read refused (401). `backend/tests/test_backend.py` still passes. Not yet verified against a real Supabase project.

Known limits: settings use last-pull-wins (a setting changed offline can be overwritten by the server copy on the next sync); password reset by email isn't in the app yet (use Supabase → Authentication → Users → *Send password recovery*); one profile per device.

---

## 7. Environment variables (current)

| Variable | Where | Browser-visible | Purpose |
| --- | --- | --- | --- |
| `SUPABASE_URL` | Vercel + `backend/.env` | No | Supabase project URL (backend only) |
| `SUPABASE_ANON_KEY` | Vercel + `backend/.env` | No | Publishable / anon key (backend only; RLS still applies) |
| `VITE_API_BASE_URL` | optional | Yes | FastAPI origin; keep it empty (same origin) so the session cookies work |
| `API_PROXY_TARGET` | local dev only | No | Where Vite proxies `/api` (default `http://127.0.0.1:8000`) |
| `SLACKR_ADMIN_TOKEN` | Vercel backend | No | Required to edit learning resources / breakdowns in hosted mode |
| `ALLOWED_ORIGINS` | Vercel backend | No | Cross-origin allowlist (same origin needs none) |
| `SLACKR_HOSTED`, `SLACKR_STATS_PATH` | local backend only | No | Force hosted mode / stats file path |

> **Security:** never add the Supabase secret / service_role key anywhere. SLACKR doesn't need it.

---

## 8. Reference — deployment layout (unchanged)

- `vercel.json` — services mode: `frontend` (Vite, `dist`, SPA fallback, no-cache `sw.js` / `manifest.json` / `index.html`, immutable `/assets/*`) and `backend` (FastAPI `main:app`, `FRONTEND_URL` binding). `/api/*` → backend, everything else → frontend.
- `.vercelignore` — keeps the PelNETS vault, venv and tests out of the backend function (size limit).
- FastAPI hosted mode: question reads open; personal stats routes return 503; content edits need `SLACKR_ADMIN_TOKEN`.
- After vault updates: `backend\venv\Scripts\python.exe backend/scripts/generate_index.py`, commit the regenerated JSON, push.
