"""
Online accounts, study-data backup and bug reports.

The browser only calls these routes; Supabase is reached server-side (services/supabase_gateway.py).
The Supabase session lives in httpOnly cookies scoped to /api, so page scripts never see a token.

  GET  /api/account/status                 is online sign-up available on this server?
  GET  /api/account/username-available     ?name=  (live check on the sign-up form)
  POST /api/account/signup                 {username, email, password}
  POST /api/account/signin                 {email, password}
  POST /api/account/signout
  GET  /api/account/me                     signed-in online user, or 401
  GET  /api/account/data                   this user's backup JSON (or null)
  PUT  /api/account/data                   {data}: replace this user's backup JSON
  POST /api/reports                        bug report / content flag (signed in or anonymous)
"""

import base64
import json
import re
import time
from typing import Any, Dict, Optional, Tuple
from urllib.parse import urlparse

from fastapi import APIRouter, Depends, HTTPException, Query, Request, Response
from pydantic import BaseModel, Field

from services.supabase_gateway import SupabaseError, gateway

router = APIRouter()

ACCESS_COOKIE = "slackr_at"
REFRESH_COOKIE = "slackr_rt"
COOKIE_PATH = "/api"
REFRESH_MAX_AGE = 60 * 60 * 24 * 30  # refresh tokens are rotated on use; this only bounds an idle device
USERNAME_RE = r"^[A-Za-z0-9_.-]{3,24}$"
EMAIL_RE = r"^[^\s@]+@[^\s@]+\.[^\s@]+$"
MAX_BACKUP_BYTES = 5 * 1024 * 1024  # matches the user_data size check in 0002


# ── Request bodies ───────────────────────────────────────────────────────────


class SignUpBody(BaseModel):
    username: str = Field(pattern=USERNAME_RE)
    email: str = Field(max_length=254, pattern=EMAIL_RE)
    password: str = Field(min_length=6, max_length=128)


class SignInBody(BaseModel):
    email: str = Field(max_length=254, pattern=EMAIL_RE)
    password: str = Field(min_length=1, max_length=128)


class UserDataBody(BaseModel):
    data: Dict[str, Any]


class ReportBody(BaseModel):
    client_id: str = Field(pattern=r"^[0-9a-fA-F-]{36}$")
    kind: str = Field(pattern=r"^(question|explanation|general)$")
    question_id: Optional[str] = Field(default=None, max_length=64)
    category: str = Field(max_length=32)
    message: str = Field(default="", max_length=1000)
    context: Dict[str, Any] = Field(default_factory=dict)
    created_at: Optional[str] = Field(default=None, max_length=40)


# ── Helpers ──────────────────────────────────────────────────────────────────


def _fail(err: SupabaseError):
    raise HTTPException(status_code=err.status, detail=err.message)


def same_origin_only(request: Request) -> None:
    """Cookie-authenticated writes: refuse cross-site requests (CSRF), on top of SameSite=Lax cookies."""
    origin = request.headers.get("origin")
    if not origin:
        return  # same-origin fetches from older browsers, curl, tests
    # Behind a proxy (Vite dev server, Vercel) the page's host arrives as X-Forwarded-Host
    hosts = {request.headers.get("host", "")}
    hosts.update(h.strip() for h in request.headers.get("x-forwarded-host", "").split(",") if h.strip())
    if urlparse(origin).netloc in hosts:
        return
    allowed = {o.strip() for o in request.app.state.allowed_origins if o.strip() and o.strip() != "*"}
    if origin not in allowed:
        raise HTTPException(status_code=403, detail="Cross-site request refused.")


def _is_https(request: Request) -> bool:
    return request.headers.get("x-forwarded-proto", request.url.scheme) == "https"


def _set_session(request: Request, response: Response, session: Dict[str, Any]) -> None:
    secure = _is_https(request)
    response.set_cookie(
        ACCESS_COOKIE,
        session["access_token"],
        max_age=int(session.get("expires_in") or 3600),
        httponly=True,
        secure=secure,
        samesite="lax",
        path=COOKIE_PATH,
    )
    if session.get("refresh_token"):
        response.set_cookie(
            REFRESH_COOKIE,
            session["refresh_token"],
            max_age=REFRESH_MAX_AGE,
            httponly=True,
            secure=secure,
            samesite="lax",
            path=COOKIE_PATH,
        )


def _clear_session(response: Response) -> None:
    response.delete_cookie(ACCESS_COOKIE, path=COOKIE_PATH)
    response.delete_cookie(REFRESH_COOKIE, path=COOKIE_PATH)


def _claims(token: str) -> Dict[str, Any]:
    """Reads (does not verify) the JWT payload. Supabase verifies the token on every call made with it."""
    try:
        payload = token.split(".")[1]
        return json.loads(base64.urlsafe_b64decode(payload + "=" * (-len(payload) % 4)))
    except (IndexError, ValueError):
        return {}


def current_session(request: Request, response: Response) -> Tuple[str, str]:
    """(access_token, user_id) for the signed-in user, refreshing an expired token. 401 if signed out."""
    token = request.cookies.get(ACCESS_COOKIE)
    claims = _claims(token) if token else {}
    if not token or claims.get("exp", 0) < time.time() + 30:
        refresh_token = request.cookies.get(REFRESH_COOKIE)
        if not refresh_token:
            raise HTTPException(status_code=401, detail="Not signed in online.")
        try:
            session = gateway.refresh(refresh_token)
        except SupabaseError as err:
            if err.status in (400, 401, 403):
                _clear_session(response)
                raise HTTPException(status_code=401, detail="Your session expired. Sign in again.")
            _fail(err)
        _set_session(request, response, session)
        token = session["access_token"]
        claims = _claims(token)
    user_id = claims.get("sub")
    if not user_id:
        raise HTTPException(status_code=401, detail="Not signed in online.")
    return token, user_id


def _public_user(user: Dict[str, Any], username: Optional[str] = None) -> Dict[str, Any]:
    meta = user.get("user_metadata") or {}
    return {"id": user.get("id"), "email": user.get("email"), "username": username or meta.get("username")}


def _redirect_url(request: Request) -> str:
    origin = request.headers.get("origin") or str(request.base_url).rstrip("/")
    return f"{origin}/signin"


# ── Routes ───────────────────────────────────────────────────────────────────


@router.get("/api/account/status")
def account_status():
    return {"enabled": gateway.configured}


@router.get("/api/account/username-available")
def username_available(name: str = Query(pattern=USERNAME_RE)):
    try:
        return {"available": gateway.username_available(name)}
    except SupabaseError as err:
        _fail(err)


@router.post("/api/account/signup", dependencies=[Depends(same_origin_only)])
def sign_up(body: SignUpBody, request: Request, response: Response):
    try:
        if not gateway.username_available(body.username):
            raise HTTPException(status_code=409, detail="That username is taken. Pick another one.")
        res = gateway.sign_up(body.email.lower(), body.password, body.username, _redirect_url(request))
    except SupabaseError as err:
        _fail(err)
    user = res.get("user") or res
    # Supabase hides "email already registered" behind a user with no identities
    if not user.get("id") or user.get("identities") == []:
        raise HTTPException(status_code=409, detail="That email already has an account. Sign in instead.")
    needs_confirmation = "access_token" not in res
    if not needs_confirmation:
        _set_session(request, response, res)
    return {"user": _public_user(user, body.username), "needsConfirmation": needs_confirmation}


@router.post("/api/account/signin", dependencies=[Depends(same_origin_only)])
def sign_in(body: SignInBody, request: Request, response: Response):
    try:
        session = gateway.sign_in(body.email.lower(), body.password)
        user = session.get("user") or {}
        username = (user.get("user_metadata") or {}).get("username") or gateway.profile_username(
            session["access_token"], user.get("id", "")
        )
    except SupabaseError as err:
        _fail(err)
    _set_session(request, response, session)
    return {"user": _public_user(user, username)}


@router.post("/api/account/signout", dependencies=[Depends(same_origin_only)])
def sign_out(request: Request, response: Response):
    token = request.cookies.get(ACCESS_COOKIE)
    if token:
        try:
            gateway.sign_out(token)
        except SupabaseError:
            pass  # cookies are cleared either way
    _clear_session(response)
    return {"ok": True}


@router.get("/api/account/me")
def me(request: Request, response: Response):
    token, _ = current_session(request, response)
    try:
        user = gateway.get_user(token)
    except SupabaseError as err:
        if err.status == 401:
            _clear_session(response)
        _fail(err)
    return {"user": _public_user(user)}


@router.get("/api/account/data")
def get_data(request: Request, response: Response):
    token, user_id = current_session(request, response)
    try:
        row = gateway.get_user_data(token, user_id)
    except SupabaseError as err:
        _fail(err)
    return {"data": row["data"] if row else None, "updatedAt": row["updated_at"] if row else None}


@router.put("/api/account/data", dependencies=[Depends(same_origin_only)])
def put_data(body: UserDataBody, request: Request, response: Response):
    if len(json.dumps(body.data)) > MAX_BACKUP_BYTES:
        raise HTTPException(status_code=413, detail="Backup is larger than 5 MB.")
    token, user_id = current_session(request, response)
    try:
        gateway.put_user_data(token, user_id, body.data)
    except SupabaseError as err:
        _fail(err)
    return {"ok": True}


@router.post("/api/reports", dependencies=[Depends(same_origin_only)])
def submit_report(body: ReportBody, request: Request, response: Response):
    if len(json.dumps(body.context)) > 2048:
        raise HTTPException(status_code=413, detail="Report context is too large.")
    # Attach the reporter when signed in online; anonymous otherwise
    token: Optional[str] = None
    if request.cookies.get(ACCESS_COOKIE) or request.cookies.get(REFRESH_COOKIE):
        try:
            token, _ = current_session(request, response)
        except HTTPException:
            token = None
    report = body.model_dump(exclude_none=True)
    try:
        gateway.insert_report(report, token)
    except SupabaseError as err:
        _fail(err)
    return {"ok": True}
