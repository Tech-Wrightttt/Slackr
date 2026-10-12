"""
Server-side access to Supabase (Auth + PostgREST) for SLACKR accounts, study-data backup and bug reports.

The browser never talks to Supabase: it calls FastAPI's /api/account/* and /api/reports, and FastAPI
calls Supabase here with the project's publishable (anon) key. Per-user rows are read and written
with the user's own access token, so Supabase row-level security still decides what each user can touch.

Configuration (backend environment only, e.g. backend/.env locally, Vercel env vars when hosted):
  SUPABASE_URL       https://<project-ref>.supabase.co
  SUPABASE_ANON_KEY  publishable / anon key (no service-role key is needed or used)
"""

import json
import os
from typing import Any, Dict, Optional, Tuple
from urllib.error import HTTPError, URLError
from urllib.parse import urlencode
from urllib.request import Request, urlopen

TIMEOUT_SECONDS = 15


class SupabaseError(Exception):
    def __init__(self, status: int, message: str, code: str = ""):
        super().__init__(message)
        self.status = status
        self.message = message
        self.code = code


def _friendly(status: int, body: Any) -> SupabaseError:
    body = body if isinstance(body, dict) else {}
    code = str(body.get("error_code") or body.get("code") or "")
    raw = str(body.get("msg") or body.get("message") or body.get("error_description") or body.get("error") or "")
    text = raw.lower()
    if code in ("user_already_exists", "email_exists") or "already registered" in text:
        return SupabaseError(409, "That email already has an account. Sign in instead.", code)
    if "database error saving new user" in text:
        # The profile insert failed: in practice the username was taken a moment earlier
        return SupabaseError(409, "That username is taken. Pick another one.", code)
    if code == "invalid_credentials" or "invalid login credentials" in text:
        return SupabaseError(401, "Incorrect email/username or password.", code)
    if code == "email_not_confirmed" or "email not confirmed" in text:
        return SupabaseError(403, "Confirm your email first: open the link we sent, then sign in.", code)
    if code == "over_request_rate_limit" or "rate limit" in text or status == 429:
        return SupabaseError(429, "Too many attempts. Wait a minute and try again.", code)
    if code in ("weak_password",) or "password" in text:
        return SupabaseError(422, raw or "Password is too weak.", code)
    if status in (401, 403):
        return SupabaseError(401, "Your session expired. Sign in again.", code)
    return SupabaseError(status if 400 <= status < 600 else 502, raw or "Account service error.", code)


class SupabaseGateway:
    @property
    def url(self) -> str:
        return os.environ.get("SUPABASE_URL", "").rstrip("/")

    @property
    def key(self) -> str:
        return os.environ.get("SUPABASE_ANON_KEY", "")

    @property
    def configured(self) -> bool:
        return bool(self.url and self.key)

    def _request(
        self,
        method: str,
        path: str,
        *,
        body: Any = None,
        token: Optional[str] = None,
        query: Optional[Dict[str, str]] = None,
        headers: Optional[Dict[str, str]] = None,
    ) -> Tuple[int, Any]:
        if not self.configured:
            raise SupabaseError(503, "Online accounts aren't set up on this server.")
        url = f"{self.url}{path}"
        if query:
            url += "?" + urlencode(query)
        req_headers = {
            "apikey": self.key,
            "Authorization": f"Bearer {token or self.key}",
            "Content-Type": "application/json",
            "Accept": "application/json",
            **(headers or {}),
        }
        data = json.dumps(body).encode("utf-8") if body is not None else None
        req = Request(url, data=data, method=method, headers=req_headers)
        try:
            with urlopen(req, timeout=TIMEOUT_SECONDS) as res:
                raw = res.read()
                return res.status, (json.loads(raw) if raw else None)
        except HTTPError as err:
            raw = err.read()
            try:
                payload = json.loads(raw) if raw else None
            except ValueError:
                payload = None
            raise _friendly(err.code, payload) from None
        except (URLError, TimeoutError, OSError):
            raise SupabaseError(502, "Couldn't reach the account server. Try again in a moment.") from None

    # ── Auth ──────────────────────────────────────────────────────────────

    def sign_up(self, email: str, password: str, username: str, redirect_to: str) -> Dict[str, Any]:
        _, res = self._request(
            "POST",
            "/auth/v1/signup",
            query={"redirect_to": redirect_to},
            body={"email": email, "password": password, "data": {"username": username}},
        )
        return res or {}

    def sign_in(self, email: str, password: str) -> Dict[str, Any]:
        _, res = self._request(
            "POST", "/auth/v1/token", query={"grant_type": "password"}, body={"email": email, "password": password}
        )
        return res or {}

    def refresh(self, refresh_token: str) -> Dict[str, Any]:
        _, res = self._request(
            "POST", "/auth/v1/token", query={"grant_type": "refresh_token"}, body={"refresh_token": refresh_token}
        )
        return res or {}

    def sign_out(self, access_token: str) -> None:
        self._request("POST", "/auth/v1/logout", query={"scope": "local"}, token=access_token)

    def get_user(self, access_token: str) -> Dict[str, Any]:
        _, res = self._request("GET", "/auth/v1/user", token=access_token)
        return res or {}

    def username_available(self, name: str) -> bool:
        _, res = self._request("POST", "/rest/v1/rpc/username_available", body={"name": name})
        return bool(res)

    def profile_username(self, access_token: str, user_id: str) -> Optional[str]:
        _, rows = self._request(
            "GET", "/rest/v1/profiles", token=access_token, query={"select": "username", "id": f"eq.{user_id}"}
        )
        return rows[0]["username"] if rows else None

    # ── Study-data backup (one JSON per user) ──────────────────────────────

    def get_user_data(self, access_token: str, user_id: str) -> Optional[Dict[str, Any]]:
        _, rows = self._request(
            "GET",
            "/rest/v1/user_data",
            token=access_token,
            query={"select": "data,updated_at", "user_id": f"eq.{user_id}"},
        )
        return rows[0] if rows else None

    def put_user_data(self, access_token: str, user_id: str, data: Dict[str, Any]) -> None:
        self._request(
            "POST",
            "/rest/v1/user_data",
            token=access_token,
            query={"on_conflict": "user_id"},
            headers={"Prefer": "resolution=merge-duplicates,return=minimal"},
            body={"user_id": user_id, "data": data},
        )

    # ── Bug reports (insert-only) ──────────────────────────────────────────

    def insert_report(self, report: Dict[str, Any], access_token: Optional[str] = None) -> None:
        try:
            self._request(
                "POST",
                "/rest/v1/bug_reports",
                token=access_token,
                headers={"Prefer": "return=minimal"},
                body=report,
            )
        except SupabaseError as err:
            # 23505: already stored by an earlier attempt whose response was lost
            if err.code != "23505":
                raise


gateway = SupabaseGateway()
