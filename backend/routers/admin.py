"""
Admin console: one built-in "admin" login that edits what every visitor sees.

The password is never stored in code. The backend keeps only a salted PBKDF2 hash in
SLACKR_ADMIN_PASSWORD_HASH (make one with `python backend/scripts/hash_admin_password.py`).
A successful sign-in sets an httpOnly, SameSite=Strict cookie signed with a key derived from that
hash, so changing the password signs every admin session out.

Supabase writes (playlists, public content) go through key-gated functions from
supabase/migrations/0004_playlists_presence_admin.sql; SUPABASE_ADMIN_KEY holds that key.

  POST   /api/admin/login              {username, password}
  POST   /api/admin/logout
  GET    /api/admin/me                 {admin, supabase}
  GET    /api/admin/online             who is online now (signed-in names + guests)
  GET    /api/admin/playlists          every shared playlist
  POST   /api/admin/playlists          create or update (official playlists have no owner)
  DELETE /api/admin/playlists/{code}
"""

import base64
import hashlib
import hmac
import os
import re
import threading
import time
from typing import Dict, List, Optional

from fastapi import APIRouter, Depends, HTTPException, Request, Response
from pydantic import BaseModel, Field

from routers.account import ACCESS_COOKIE, ADMIN_COOKIE, REFRESH_COOKIE, _is_https, same_origin_only
from services.supabase_gateway import SupabaseError, gateway

router = APIRouter()

ADMIN_USERNAME = "admin"
SESSION_SECONDS = 8 * 60 * 60
PBKDF2_ITERATIONS = 600_000
PLAYLIST_CODE_RE = r"^[A-Za-z0-9]{6}$"
QUESTION_ID_RE = r"^[A-Za-z0-9_.-]{3,48}$"  # e.g. 2026S_FE-A_1, 2020A_FE_PM_7.1

# Sign-in throttle per client address (per server instance; PBKDF2 already makes guesses slow)
MAX_FAILURES = 5
FAILURE_WINDOW = 15 * 60
_failures: Dict[str, List[float]] = {}
_failures_lock = threading.Lock()


def hash_password(password: str, salt: Optional[bytes] = None, iterations: int = PBKDF2_ITERATIONS) -> str:
    salt = salt or os.urandom(16)
    digest = hashlib.pbkdf2_hmac("sha256", password.encode("utf-8"), salt, iterations)
    b64 = lambda b: base64.b64encode(b).decode("ascii")
    return f"pbkdf2_sha256${iterations}${b64(salt)}${b64(digest)}"


def verify_password(password: str, stored: str) -> bool:
    try:
        scheme, iterations, salt, digest = stored.split("$")
        if scheme != "pbkdf2_sha256":
            return False
        expected = base64.b64decode(digest)
        actual = hashlib.pbkdf2_hmac("sha256", password.encode("utf-8"), base64.b64decode(salt), int(iterations))
    except (ValueError, TypeError):
        return False
    return hmac.compare_digest(actual, expected)


def _password_hash() -> str:
    return os.environ.get("SLACKR_ADMIN_PASSWORD_HASH", "").strip()


def _signing_key() -> bytes:
    return hashlib.sha256(b"slackr-admin-session:" + _password_hash().encode("utf-8")).digest()


def _sign(expires: int) -> str:
    return hmac.new(_signing_key(), f"{ADMIN_USERNAME}:{expires}".encode(), hashlib.sha256).hexdigest()


def admin_login_configured() -> bool:
    return bool(_password_hash())


def is_admin_session(request: Request) -> bool:
    """True when the request carries a valid, unexpired admin cookie."""
    if not admin_login_configured():
        return False
    value = request.cookies.get(ADMIN_COOKIE, "")
    expires_raw, _, sig = value.partition(".")
    if not expires_raw.isdigit() or int(expires_raw) < time.time():
        return False
    return hmac.compare_digest(sig, _sign(int(expires_raw)))


def require_admin_session(request: Request) -> None:
    if not is_admin_session(request):
        raise HTTPException(status_code=401, detail="Admin sign-in required.")


def _client_key(request: Request) -> str:
    forwarded = request.headers.get("x-forwarded-for", "").split(",")[0].strip()
    return forwarded or (request.client.host if request.client else "unknown")


def _recent_failures(key: str, now: float) -> List[float]:
    recent = [t for t in _failures.get(key, []) if now - t < FAILURE_WINDOW]
    _failures[key] = recent
    return recent


def _fail(err: SupabaseError):
    raise HTTPException(status_code=err.status, detail=err.message)


def _require_supabase() -> None:
    if not gateway.configured or not gateway.admin_key:
        raise HTTPException(
            status_code=503,
            detail="Shared playlists need Supabase: run migration 0004 and set SUPABASE_ADMIN_KEY.",
        )


# ── Request bodies ───────────────────────────────────────────────────────────


class AdminLoginBody(BaseModel):
    username: str = Field(min_length=1, max_length=64)
    password: str = Field(min_length=1, max_length=256)


class AdminPlaylistBody(BaseModel):
    code: Optional[str] = Field(default=None, pattern=PLAYLIST_CODE_RE)
    title: str = Field(min_length=1, max_length=60)
    description: str = Field(default="", max_length=280)
    question_ids: List[str] = Field(min_length=1, max_length=500)
    visibility: str = Field(default="public", pattern=r"^(public|unlisted)$")
    featured: bool = True


def clean_question_ids(ids: List[str]) -> List[str]:
    """Drops blanks and duplicates (keeping order); rejects anything that isn't an item ID."""
    seen: Dict[str, None] = {}
    for raw in ids:
        qid = raw.strip()
        if not qid:
            continue
        if not re.match(QUESTION_ID_RE, qid):
            raise HTTPException(status_code=422, detail=f"Not a question ID: {qid[:48]}")
        seen.setdefault(qid, None)
    if not seen:
        raise HTTPException(status_code=422, detail="Add at least one question.")
    return list(seen)


# ── Routes ───────────────────────────────────────────────────────────────────


@router.post("/api/admin/login", dependencies=[Depends(same_origin_only)])
def admin_login(body: AdminLoginBody, request: Request, response: Response):
    if not admin_login_configured():
        raise HTTPException(status_code=503, detail="Admin sign-in isn't set up on this server.")
    key, now = _client_key(request), time.time()
    with _failures_lock:
        if len(_recent_failures(key, now)) >= MAX_FAILURES:
            raise HTTPException(status_code=429, detail="Too many attempts. Wait 15 minutes and try again.")
    # Always run the hash so a wrong username takes as long as a wrong password
    password_ok = verify_password(body.password, _password_hash())
    if not (hmac.compare_digest(body.username.strip().lower(), ADMIN_USERNAME) and password_ok):
        with _failures_lock:
            _failures.setdefault(key, []).append(now)
        raise HTTPException(status_code=401, detail="Incorrect username or password.")
    with _failures_lock:
        _failures.pop(key, None)
    expires = int(now) + SESSION_SECONDS
    # The admin is not an online account: signing in here signs this browser out of any account
    response.delete_cookie(ACCESS_COOKIE, path="/api")
    response.delete_cookie(REFRESH_COOKIE, path="/api")
    response.set_cookie(
        ADMIN_COOKIE,
        f"{expires}.{_sign(expires)}",
        max_age=SESSION_SECONDS,
        httponly=True,
        secure=_is_https(request),
        samesite="strict",
        path="/api",
    )
    return {"admin": True}


@router.post("/api/admin/logout", dependencies=[Depends(same_origin_only)])
def admin_logout(response: Response):
    response.delete_cookie(ADMIN_COOKIE, path="/api")
    return {"admin": False}


@router.get("/api/admin/me")
def admin_me(request: Request):
    return {
        "admin": is_admin_session(request),
        "configured": admin_login_configured(),
        "supabase": gateway.configured and bool(gateway.admin_key),
    }


@router.get("/api/admin/online", dependencies=[Depends(require_admin_session)])
def admin_online():
    _require_supabase()
    try:
        rows = gateway.admin_presence()
    except SupabaseError as err:
        _fail(err)
    named = [r for r in rows if r.get("username")]
    return {"total": len(rows), "guests": len(rows) - len(named), "users": named}


@router.get("/api/admin/playlists", dependencies=[Depends(require_admin_session)])
def admin_playlists():
    _require_supabase()
    try:
        return {"playlists": gateway.admin_list_playlists()}
    except SupabaseError as err:
        _fail(err)


@router.post("/api/admin/playlists", dependencies=[Depends(same_origin_only), Depends(require_admin_session)])
def admin_save_playlist(body: AdminPlaylistBody):
    _require_supabase()
    ids = clean_question_ids(body.question_ids)
    try:
        code = gateway.admin_save_playlist(
            body.code.upper() if body.code else None,
            body.title.strip(),
            body.description.strip(),
            ids,
            body.visibility,
            body.featured,
        )
    except SupabaseError as err:
        _fail(err)
    return {"code": code}


@router.delete(
    "/api/admin/playlists/{code}", dependencies=[Depends(same_origin_only), Depends(require_admin_session)]
)
def admin_delete_playlist(code: str):
    _require_supabase()
    try:
        deleted = gateway.admin_delete_playlist(code.upper())
    except SupabaseError as err:
        _fail(err)
    if not deleted:
        raise HTTPException(status_code=404, detail="No playlist with that code.")
    return {"ok": True}
