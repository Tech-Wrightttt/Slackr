"""
Online account routes (routers/account.py) against a fake Supabase gateway, plus the Markdown
question-file parser against temporary vault files. No network access.
"""

import base64
import json
import time

import pytest

from parsers.markdown_parser import parse_markdown_file
from routers import account
from routers.account import MAX_BACKUP_BYTES
from services.supabase_gateway import SupabaseError


def jwt(**claims) -> str:
    body = base64.urlsafe_b64encode(json.dumps(claims).encode()).decode().rstrip("=")
    return f"header.{body}.sig"


GOOD_TOKEN = jwt(sub="user-1", exp=time.time() + 3600)
EXPIRED_TOKEN = jwt(sub="user-1", exp=time.time() - 10)
STRONG = "Str0ng#Pass"


class FakeGateway:
    """Stand-in for services.supabase_gateway.gateway. Set `fail[method] = SupabaseError(...)` to raise."""

    def __init__(self):
        self.configured = True
        self.login_lookup_configured = True
        self.fail = {}
        self.calls = []
        self.taken = {"taken"}
        self.emails = {"jairus": "jairus@example.com"}
        self.signup_result = {"user": {"id": "user-1", "identities": [{}]}, "access_token": GOOD_TOKEN, "refresh_token": "r1"}
        self.row = None
        self.user = {"id": "user-1", "email": "jairus@example.com", "user_metadata": {"username": "jairus"}}

    def _call(self, name, result=None):
        self.calls.append(name)
        if name in self.fail:
            raise self.fail[name]
        return result

    def username_available(self, name):
        return self._call("username_available", name not in self.taken)

    def sign_up(self, email, password, username, redirect_to):
        return self._call("sign_up", self.signup_result)

    def sign_in(self, email, password):
        return self._call("sign_in", {"access_token": GOOD_TOKEN, "refresh_token": "r1", "user": {"id": "user-1"}})

    def profile_username(self, token, user_id):
        return self._call("profile_username", "jairus")

    def email_for_username(self, name):
        return self._call("email_for_username", self.emails.get(name.lower()))

    def recover(self, email, redirect_to):
        return self._call("recover")

    def get_user(self, token):
        return self._call("get_user", self.user)

    def update_password(self, token, password):
        return self._call("update_password", self.user)

    def refresh(self, refresh_token):
        return self._call("refresh", {"access_token": GOOD_TOKEN, "refresh_token": "r2", "expires_in": 3600})

    def sign_out(self, token):
        return self._call("sign_out")

    def get_user_data(self, token, user_id):
        return self._call("get_user_data", self.row)

    def put_user_data(self, token, user_id, data):
        return self._call("put_user_data")

    def insert_report(self, report, token=None):
        self.last_report_token = token
        return self._call("insert_report")


@pytest.fixture()
def gw(monkeypatch):
    fake = FakeGateway()
    monkeypatch.setattr(account, "gateway", fake)
    return fake


def signup(client, **over):
    body = {"username": "newuser", "email": "New@Example.com", "password": STRONG, **over}
    return client.post("/api/account/signup", json=body)


def signed_in(client, token=GOOD_TOKEN, refresh=None):
    client.cookies.set(account.ACCESS_COOKIE, token)
    if refresh:
        client.cookies.set(account.REFRESH_COOKIE, refresh)


# ── Black-box ────────────────────────────────────────────────────────────────

@pytest.mark.blackbox
class TestSignUpEP:
    pytestmark = pytest.mark.ep

    def test_success_sets_session(self, client, gw):
        """Valid sign-up with an immediate session sets the auth cookie."""
        res = signup(client)
        assert res.status_code == 200 and res.json()["needsConfirmation"] is False
        assert account.ACCESS_COOKIE in res.cookies

    def test_needs_email_confirmation(self, client, gw):
        """Without an access token in the reply, the user must confirm by email."""
        gw.signup_result = {"id": "user-1", "identities": [{}]}
        assert signup(client).json()["needsConfirmation"] is True

    def test_weak_password(self, client, gw):
        """A weak password is rejected before Supabase is called."""
        assert signup(client, password="weakpass").status_code == 422 and gw.calls == []

    def test_username_taken(self, client, gw):
        """A taken username is a conflict."""
        assert signup(client, username="taken").status_code == 409

    def test_email_already_registered(self, client, gw):
        """Supabase's empty-identities reply means the email has an account."""
        gw.signup_result = {"user": {"id": "user-1", "identities": []}}
        assert signup(client).status_code == 409

    def test_invalid_email(self, client, gw):
        """An email without a dot-domain fails validation."""
        assert signup(client, email="a@b").status_code == 422

    def test_supabase_error_passthrough(self, client, gw):
        """Gateway errors keep their status."""
        gw.fail["sign_up"] = SupabaseError(429, "Too many requests")
        assert signup(client).status_code == 429


@pytest.mark.blackbox
class TestSignUpBVA:
    pytestmark = pytest.mark.bva

    @pytest.mark.parametrize("length, status", [(2, 422), (3, 200), (24, 200), (25, 422)])
    def test_username_length(self, client, gw, length, status):
        """Usernames must be 3..24 characters."""
        assert signup(client, username="u" * length).status_code == status


@pytest.mark.blackbox
class TestSignInEP:
    pytestmark = pytest.mark.ep

    def test_email_login(self, client, gw):
        """Signing in with an email returns the profile username."""
        res = client.post("/api/account/signin", json={"login": "Jairus@Example.com", "password": "x"})
        assert res.status_code == 200 and res.json()["user"]["username"] == "jairus"

    def test_username_login(self, client, gw):
        """Signing in with a username looks up its email."""
        res = client.post("/api/account/signin", json={"login": "jairus", "password": "x"})
        assert res.status_code == 200 and "email_for_username" in gw.calls

    def test_unknown_username(self, client, gw):
        """An unknown username gets the same reply as a wrong password."""
        res = client.post("/api/account/signin", json={"login": "nobody", "password": "x"})
        assert res.status_code == 401

    def test_malformed_email(self, client, gw):
        """A login containing @ must be a valid email."""
        assert client.post("/api/account/signin", json={"login": "a@b", "password": "x"}).status_code == 422

    def test_wrong_password(self, client, gw):
        """A rejected password keeps the gateway's 400."""
        gw.fail["sign_in"] = SupabaseError(400, "Incorrect username/email or password.")
        assert client.post("/api/account/signin", json={"login": "a@b.co", "password": "x"}).status_code == 400


@pytest.mark.blackbox
class TestPasswordRecoveryEP:
    pytestmark = pytest.mark.ep

    @pytest.mark.parametrize("error, status", [(None, 200), (SupabaseError(404, "no user"), 200),
                                               (SupabaseError(429, "slow down"), 429)])
    def test_forgot_hides_account_existence(self, client, gw, error, status):
        """Forgot-password only surfaces errors the user can act on (rate limit, outage)."""
        if error:
            gw.fail["recover"] = error
        assert client.post("/api/account/password/forgot", json={"email": "a@b.co"}).status_code == status

    def test_reset_success(self, client, gw):
        """A valid link token and strong password sign the user in."""
        res = client.post("/api/account/password/reset", json={"access_token": GOOD_TOKEN, "password": STRONG})
        assert res.status_code == 200 and account.ACCESS_COOKIE in res.cookies

    def test_reset_expired_link(self, client, gw):
        """An expired link is reported as such."""
        gw.fail["get_user"] = SupabaseError(401, "expired")
        res = client.post("/api/account/password/reset", json={"access_token": GOOD_TOKEN, "password": STRONG})
        assert res.status_code == 401 and "expired" in res.json()["detail"]

    def test_reset_weak_password(self, client, gw):
        """The new password must not contain the account's username."""
        res = client.post("/api/account/password/reset", json={"access_token": GOOD_TOKEN, "password": "Jairus#2026x"})
        assert res.status_code == 422


@pytest.mark.blackbox
class TestBackupBVA:
    pytestmark = pytest.mark.bva

    @pytest.mark.parametrize("extra, status", [(0, 200), (1, 413)])
    def test_backup_size_limit(self, client, gw, extra, status):
        """A backup of exactly 5 MB is accepted; one byte more is refused."""
        signed_in(client)
        filler = "a" * (MAX_BACKUP_BYTES - len('{"x": ""}') + extra)
        assert client.put("/api/account/data", json={"data": {"x": filler}}).status_code == status

    @pytest.mark.parametrize("extra, status", [(0, 200), (1, 413)])
    def test_report_context_limit(self, client, gw, extra, status):
        """Report context may be at most 2048 bytes of JSON."""
        context = {"x": "a" * (2048 - len('{"x": ""}') + extra)}
        body = {"client_id": "0" * 36, "kind": "general", "category": "bug", "context": context}
        assert client.post("/api/reports", json=body).status_code == status


# ── White-box ────────────────────────────────────────────────────────────────

@pytest.mark.whitebox
class TestSessionBranches:
    pytestmark = pytest.mark.branch

    def test_signed_out(self, client, gw):
        """No cookies: 401 without calling Supabase."""
        assert client.get("/api/account/me").status_code == 401 and gw.calls == []

    def test_valid_token(self, client, gw):
        """A fresh token is used as-is."""
        signed_in(client)
        assert client.get("/api/account/me").json()["user"]["username"] == "jairus"
        assert "refresh" not in gw.calls

    def test_expired_token_refreshes(self, client, gw):
        """An expired token with a refresh token is renewed."""
        signed_in(client, EXPIRED_TOKEN, "r1")
        assert client.get("/api/account/me").status_code == 200 and "refresh" in gw.calls

    def test_expired_without_refresh(self, client, gw):
        """An expired token and no refresh token is signed out."""
        signed_in(client, EXPIRED_TOKEN)
        assert client.get("/api/account/me").status_code == 401

    @pytest.mark.parametrize("status, expected", [(401, 401), (500, 500)])
    def test_refresh_failure(self, client, gw, status, expected):
        """Auth failures on refresh sign out (401); other failures pass through."""
        signed_in(client, EXPIRED_TOKEN, "r1")
        gw.fail["refresh"] = SupabaseError(status, "nope")
        assert client.get("/api/account/me").status_code == expected

    def test_token_without_subject(self, client, gw):
        """A token without a user id is not a session."""
        signed_in(client, jwt(exp=time.time() + 3600))
        assert client.get("/api/account/me").status_code == 401

    def test_garbage_token(self, client, gw):
        """An unreadable token is treated as expired."""
        signed_in(client, "not-a-jwt")
        assert client.get("/api/account/me").status_code == 401

    def test_me_rejected_by_supabase(self, client, gw):
        """A token Supabase rejects clears the session."""
        signed_in(client)
        gw.fail["get_user"] = SupabaseError(401, "bad")
        assert client.get("/api/account/me").status_code == 401

    @pytest.mark.parametrize("row, data", [(None, None), ({"data": {"k": 1}, "updated_at": "t"}, {"k": 1})])
    def test_get_backup(self, client, gw, row, data):
        """No backup returns null; a stored one is returned."""
        signed_in(client)
        gw.row = row
        assert client.get("/api/account/data").json()["data"] == data

    @pytest.mark.parametrize("cookies, token", [
        ({}, None),
        ({"slackr_at": GOOD_TOKEN}, GOOD_TOKEN),
        ({"slackr_at": EXPIRED_TOKEN}, None),
    ])
    def test_report_reporter(self, client, gw, cookies, token):
        """Reports carry the user's token when signed in, and fall back to anonymous."""
        for k, v in cookies.items():
            client.cookies.set(k, v)
        body = {"client_id": "0" * 36, "kind": "question", "question_id": "Q1", "category": "typo"}
        assert client.post("/api/reports", json=body).status_code == 200
        assert gw.last_report_token == token

    def test_username_lookup_disabled(self, client, gw):
        """Username sign-in needs the lookup key on the server."""
        gw.login_lookup_configured = False
        assert client.post("/api/account/signin", json={"login": "jairus", "password": "x"}).status_code == 400

    def test_username_with_bad_characters(self, client, gw):
        """A login that is neither an email nor a valid username is a plain 401."""
        assert client.post("/api/account/signin", json={"login": "bad name!", "password": "x"}).status_code == 401

    def test_https_cookies_are_secure(self, client, gw):
        """Behind HTTPS the session cookies are marked Secure."""
        res = client.post("/api/account/signin", json={"login": "a@b.co", "password": "x"},
                          headers={"x-forwarded-proto": "https"})
        assert "secure" in res.headers["set-cookie"].lower()

    def test_signout_ignores_gateway_errors(self, client, gw):
        """Sign-out clears cookies even if Supabase fails."""
        signed_in(client)
        gw.fail["sign_out"] = SupabaseError(500, "down")
        assert client.post("/api/account/signout").json() == {"ok": True}


@pytest.mark.whitebox
class TestAccountStatements:
    pytestmark = pytest.mark.statement

    @pytest.mark.parametrize("error, status", [(None, 200), (SupabaseError(503, "down"), 503)])
    def test_username_available(self, client, gw, error, status):
        """Live username check, and its error path."""
        if error:
            gw.fail["username_available"] = error
        assert client.get("/api/account/username-available?name=freshname").status_code == status

    @pytest.mark.parametrize("method", ["put_user_data", "insert_report", "update_password", "email_for_username"])
    def test_gateway_errors_surface(self, client, gw, method):
        """Each route turns a gateway error into an HTTP error with the same status."""
        gw.fail[method] = SupabaseError(502, "bad gateway")
        signed_in(client)
        calls = {
            "put_user_data": lambda: client.put("/api/account/data", json={"data": {}}),
            "insert_report": lambda: client.post("/api/reports", json={"client_id": "0" * 36, "kind": "general", "category": "x"}),
            "update_password": lambda: client.post("/api/account/password/reset", json={"access_token": GOOD_TOKEN, "password": STRONG}),
            "email_for_username": lambda: client.post("/api/account/signin", json={"login": "jairus", "password": "x"}),
        }
        assert calls[method]().status_code == 502


# ── Markdown question files ──────────────────────────────────────────────────

QUESTION_MD = """---
tags:
  - "#year/2024"
  - "#networking/2024"
  - "#security"
  - "#unregistered"
---
# 2024S_FE-A_7
Which protocol is used?
![[diagram.png]]
a) HTTP
b) HTTPS
c) FTP
d) SMTP

?
b) HTTPS
HTTPS encrypts traffic. ![e](Files/expl.png)
%% note %%
---
"""


@pytest.mark.whitebox
class TestMarkdownFileBranches:
    pytestmark = pytest.mark.branch

    def test_full_file(self, tmp_path):
        """Tags map to topics (direct and alias), the header is dropped, answer and images are parsed."""
        path = tmp_path / "2024S_FE-A_7.md"
        path.write_text(QUESTION_MD, encoding="utf-8")
        q = parse_markdown_file(path)
        assert q["topics"] == ["networking", "cybersecurity"]
        assert (q["year"], q["correct"], q["fallback_choices"]) == ("2024", "b", ["a", "b", "c", "d"])
        assert q["question"].startswith("Which protocol")
        assert q["image_paths"] == ["/files/diagram.png"]
        assert q["all_images"] == ["/files/diagram.png", "/files/expl.png"]
        assert "note" not in q["explanation"]

    def test_no_answer_delimiter(self, tmp_path):
        """A file without the '?' line is skipped."""
        path = tmp_path / "2024S_FE-A_8.md"
        path.write_text("Question only", encoding="utf-8")
        assert parse_markdown_file(path) is None

    def test_missing_file(self, tmp_path):
        """An unreadable file is skipped."""
        assert parse_markdown_file(tmp_path / "missing.md") is None

    def test_image_only_question_fallback_choices(self, tmp_path):
        """No text options: PM choices run a..max(h, answer); string tags and no topics default to software."""
        path = tmp_path / "2012A_FE_PM_3.md"
        path.write_text("---\ntags: misc\n---\n# 2012 PM\n![[q.png]]\n?\nf\n", encoding="utf-8")
        q = parse_markdown_file(path)
        assert q["fallback_choices"] == ["a", "b", "c", "d", "e", "f", "g", "h"]
        assert q["topics"] == ["software"] and q["is_image_based"] is True
