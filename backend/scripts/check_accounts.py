"""
Smoke test for SLACKR's online-account endpoints against a running API and your real Supabase project.

Creates one throwaway account, then exercises every route the app uses:
  status -> signup -> me -> data PUT/GET -> signout -> me (401) -> signin -> me -> report -> signout

Usage (API must be running):
  backend\\venv\\Scripts\\python.exe backend/scripts/check_accounts.py                      # local uvicorn
  backend\\venv\\Scripts\\python.exe backend/scripts/check_accounts.py https://<your-domain> # deployed

Afterwards delete the test user in Supabase -> Authentication -> Users (its profile and backup row
are removed with it) and the "smoke test" row in Table Editor -> bug_reports.
"""

import json
import sys
import uuid
from http.cookiejar import CookieJar
from urllib.error import HTTPError, URLError
from urllib.request import HTTPCookieProcessor, Request, build_opener

BASE = (sys.argv[1] if len(sys.argv) > 1 else "http://127.0.0.1:8000").rstrip("/")
opener = build_opener(HTTPCookieProcessor(CookieJar()))
failures = 0


def call(method, path, body=None):
    data = json.dumps(body).encode() if body is not None else None
    req = Request(f"{BASE}{path}", data=data, method=method, headers={"Content-Type": "application/json"})
    try:
        with opener.open(req, timeout=30) as res:
            raw = res.read()
            return res.status, (json.loads(raw) if raw else None)
    except HTTPError as err:
        raw = err.read()
        try:
            return err.code, json.loads(raw) if raw else None
        except ValueError:
            return err.code, raw.decode(errors="replace")[:200]
    except URLError as err:
        print(f"Cannot reach {BASE}: {err.reason}. Is the API running?")
        sys.exit(2)


def check(label, ok, detail=""):
    global failures
    print(f"  [{'PASS' if ok else 'FAIL'}] {label}" + (f"  -> {detail}" if not ok and detail else ""))
    if not ok:
        failures += 1
    return ok


tag = uuid.uuid4().hex[:8]
local, _, domain = (sys.argv[2] if len(sys.argv) > 2 else "smoke@example.com").partition("@")
username, email, password = f"smoke_{tag}", f"{local}+smoke{tag}@{domain}", f"Smoke-{tag}-pw"
print(f"API: {BASE}\nTest account: {username} / {email}\n")

status, body = call("GET", "/api/account/status")
if not check("GET /api/account/status -> enabled", status == 200 and body == {"enabled": True}, f"{status} {body}"):
    print("\nOnline accounts are off: set SUPABASE_URL and SUPABASE_ANON_KEY for the backend, then restart it.")
    sys.exit(1)

status, body = call("GET", f"/api/account/username-available?name={username}")
check("GET /api/account/username-available (new name) -> true", status == 200 and body == {"available": True}, f"{status} {body}")

status, body = call("POST", "/api/account/signup", {"username": username, "email": email, "password": password})
if not check("POST /api/account/signup", status == 200, f"{status} {body}"):
    print("\nSign-up failed. Check that both SQL migrations ran and Email sign-up is enabled.")
    sys.exit(1)
user_id = body["user"]["id"]
if body.get("needsConfirmation"):
    print("\n  'Confirm email' is ON in Supabase, so there is no session yet. Turn it off")
    print("  (Authentication -> Sign In / Providers -> Email) and run this again.")
    sys.exit(1)

status, body = call("GET", "/api/account/me")
check("GET /api/account/me (after sign-up)", status == 200 and body["user"]["id"] == user_id, f"{status} {body}")
check("profile username saved (profiles table + trigger)", body and body["user"].get("username") == username, str(body))

backup = {"format": "slackr-backup", "exportVersion": 2, "attempts": [{"questionId": "2024S_FE-A_1", "topic": "software",
          "selectedAnswer": "a", "isCorrect": True, "timeSeconds": 30, "confidence": 4,
          "timestamp": "2026-01-01T00:00:00.000Z"}], "settings": {}, "sr_schedules": {}, "deferred": [], "sessions": [],
          "bookmarks": []}
status, body = call("PUT", "/api/account/data", {"data": backup})
check("PUT /api/account/data (user_data insert, RLS)", status == 200, f"{status} {body}")

status, body = call("GET", "/api/account/data")
check("GET /api/account/data returns the backup", status == 200 and (body or {}).get("data", {}).get("attempts") == backup["attempts"], f"{status} {body}")

backup["bookmarks"] = ["2024S_FE-A_1"]
status, body = call("PUT", "/api/account/data", {"data": backup})
status2, body2 = call("GET", "/api/account/data")
check("PUT again updates the same row (upsert)", status == 200 and (body2 or {}).get("data", {}).get("bookmarks") == ["2024S_FE-A_1"], f"{status} {body} / {status2} {body2}")

status, body = call("POST", "/api/account/signout")
check("POST /api/account/signout", status == 200, f"{status} {body}")
status, body = call("GET", "/api/account/me")
check("GET /api/account/me after sign-out -> 401", status == 401, f"{status} {body}")
status, body = call("GET", "/api/account/data")
check("GET /api/account/data signed out -> 401", status == 401, f"{status} {body}")

status, body = call("POST", "/api/account/signin", {"email": email, "password": "wrong-password"})
check("POST /api/account/signin wrong password -> 401", status == 401, f"{status} {body}")
status, body = call("POST", "/api/account/signin", {"email": email, "password": password})
check("POST /api/account/signin", status == 200 and body["user"]["username"] == username, f"{status} {body}")
status, body = call("GET", "/api/account/data")
check("backup still there after signing back in", status == 200 and (body or {}).get("data") is not None, f"{status} {body}")

status, body = call("POST", "/api/account/signup", {"username": username, "email": f"{local}+other{tag}@{domain}", "password": password})
check("GET /api/account/username-available (taken) -> false", call("GET", f"/api/account/username-available?name={username}") == (200, {"available": False}))
check("sign-up with a taken username -> 409", status == 409, f"{status} {body}")
status, body = call("POST", "/api/account/signup", {"username": f"other_{tag}", "email": email.upper(), "password": password})
check("sign-up with a registered email -> 409", status == 409, f"{status} {body}")

status, body = call("POST", "/api/reports", {"client_id": str(uuid.uuid4()), "kind": "general", "category": "other",
                                              "message": f"smoke test {tag}", "context": {"source": "check_accounts.py"}})
check("POST /api/reports (bug_reports insert)", status == 200, f"{status} {body}")

call("POST", "/api/account/signout")
print(f"\n{'All checks passed.' if failures == 0 else f'{failures} check(s) failed.'}")
print(f"Clean up: delete user {email} (Authentication -> Users) and the 'smoke test {tag}' row in bug_reports.")
sys.exit(1 if failures else 0)
