"""Admin console sign-in: password hashing, the signed session cookie and the sign-in throttle."""

import pytest
from fastapi.testclient import TestClient

import main
from routers import admin


@pytest.fixture
def client(monkeypatch):
    monkeypatch.setenv("SLACKR_ADMIN_PASSWORD_HASH", admin.hash_password("Correct#Horse9", iterations=1000))
    admin._failures.clear()
    return TestClient(main.app)


def test_hash_round_trip():
    stored = admin.hash_password("abc", iterations=1000)
    assert admin.verify_password("abc", stored)
    assert not admin.verify_password("abd", stored)
    assert not admin.verify_password("abc", "garbage")


def test_login_sets_session_and_logout_clears_it(client):
    assert client.get("/api/admin/me").json()["admin"] is False
    res = client.post("/api/admin/login", json={"username": "admin", "password": "Correct#Horse9"})
    assert res.status_code == 200
    assert "httponly" in res.headers["set-cookie"].lower()
    assert client.get("/api/admin/me").json()["admin"] is True
    client.post("/api/admin/logout")
    assert client.get("/api/admin/me").json()["admin"] is False


def test_wrong_username_or_password_refused(client):
    assert client.post("/api/admin/login", json={"username": "root", "password": "Correct#Horse9"}).status_code == 401
    assert client.post("/api/admin/login", json={"username": "admin", "password": "nope"}).status_code == 401


def test_login_throttled_after_repeated_failures(client):
    for _ in range(admin.MAX_FAILURES):
        client.post("/api/admin/login", json={"username": "admin", "password": "nope"})
    res = client.post("/api/admin/login", json={"username": "admin", "password": "Correct#Horse9"})
    assert res.status_code == 429


def test_admin_routes_need_session(client):
    assert client.get("/api/admin/online").status_code == 401
    assert client.get("/api/admin/playlists").status_code == 401
    assert client.delete("/api/admin/playlists/ABCDEF").status_code == 401


def test_login_unavailable_without_hash(monkeypatch):
    monkeypatch.setenv("SLACKR_ADMIN_PASSWORD_HASH", "")
    res = TestClient(main.app).post("/api/admin/login", json={"username": "admin", "password": "x"})
    assert res.status_code == 503


def test_clean_question_ids_dedupes_and_validates():
    assert admin.clean_question_ids(["2024S_FE_AM_Q1", " 2024S_FE_AM_Q1 ", "", "2023A_FE_PM_Q2_SQ1"]) == [
        "2024S_FE_AM_Q1",
        "2023A_FE_PM_Q2_SQ1",
    ]
    with pytest.raises(Exception):
        admin.clean_question_ids(["bad id!"])


def test_clean_question_ids_accepts_every_bank_format():
    ids = ["2026S_FE-A_1", "2020A_FE_PM_7.1", "2023A_FE_AM_05", "2017A_FE_3"]
    assert admin.clean_question_ids(ids) == ids


def test_admin_session_ends_on_account_sign_out(client):
    client.post("/api/admin/login", json={"username": "admin", "password": "Correct#Horse9"})
    assert client.get("/api/admin/me").json()["admin"] is True
    client.post("/api/account/signout")
    assert client.get("/api/admin/me").json()["admin"] is False


def test_admin_login_drops_online_account_cookies(client):
    client.cookies.set("slackr_at", "x", path="/api")
    res = client.post("/api/admin/login", json={"username": "admin", "password": "Correct#Horse9"})
    cleared = [c for c in res.headers.get_list("set-cookie") if c.startswith("slackr_at=")]
    assert cleared and ("Max-Age=0" in cleared[0] or "expires=" in cleared[0].lower())


def test_content_edits_refused_without_admin_session(client, monkeypatch):
    monkeypatch.setattr(main, "ADMIN_TOKEN", "")
    assert client.post("/api/learning-resources", json={"topics": {}, "questions": {}}).status_code == 403
    assert client.post("/api/analytical-breakdowns", json={"questions": {}}).status_code == 403


@pytest.mark.parametrize(
    "rpc_result, expected",
    [
        ({"online": 3, "users": ["ana", "jai"]}, {"online": 3, "users": ["ana", "jai"]}),
        (2, {"online": 2, "users": []}),  # before migration 0006
    ],
)
def test_presence_ping_shapes(monkeypatch, rpc_result, expected):
    from services.supabase_gateway import gateway

    monkeypatch.setattr(type(gateway), "_rpc", lambda self, name, args, token=None: rpc_result)
    assert gateway.presence_ping("00000000-0000-0000-0000-000000000000") == expected
