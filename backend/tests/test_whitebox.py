"""
White-box tests: written against the source so every decision takes both outcomes (branch
coverage) and statements the black-box suite never reaches run at least once (statement coverage).
Coverage itself is measured by coverage.py with --branch in scripts/run_tests.py.
"""

import json
from datetime import datetime, timedelta, timezone

import pytest
from fastapi import HTTPException

import main
from algorithms import fsrs_algo
from algorithms.custom import CustomSRSAlgorithm
from algorithms.fsrs_algo import FSRSAlgorithm
from algorithms.sm2 import SM2Algorithm
from parsers.markdown_parser import (
    clean_explanation,
    extract_image_paths,
    files_url,
    normalize_image_links,
    parse_filename,
    parse_options_and_stem,
)
from services.analytics_service import AnalyticsService

pytestmark = pytest.mark.whitebox

T0 = datetime(2026, 1, 1, tzinfo=timezone.utc)


# ── SM-2 interval branches ───────────────────────────────────────────────────

class TestSM2Branches:
    pytestmark = pytest.mark.branch

    @pytest.mark.parametrize("n, interval, expected", [(0, 0, 1), (1, 1, 6), (2, 6, 16)])
    def test_interval_by_repetition(self, n, interval, expected):
        """n == 0, n == 1 and the n >= 2 else-branch (6 days x EF 2.6 = 15.6, rounded) each pick an interval."""
        state = {"repetition_number": n, "easiness_factor": 2.5, "interval_days": interval}
        assert SM2Algorithm.calculate_next_review(state, 5, T0)["interval_days"] == expected

    @pytest.mark.statement
    def test_default_review_time(self):
        """review_time=None falls back to now."""
        out = SM2Algorithm.calculate_next_review({}, 4)
        assert datetime.fromisoformat(out["last_review"]) <= datetime.now(timezone.utc)


# ── Custom SRS branches ──────────────────────────────────────────────────────

class TestCustomBranches:
    pytestmark = pytest.mark.branch

    @pytest.mark.parametrize("n, interval, expected", [(0, 0, 1), (1, 1, 5), (2, 5, 12)])
    def test_raw_interval_by_repetition(self, n, interval, expected):
        """Correct answers: n == 0 / n == 1 / else, with neutral topic and time factors."""
        state = {"repetition_number": n, "easiness_factor": 2.5, "interval_days": interval}
        out = CustomSRSAlgorithm.calculate_next_review(state, True, 3, 30, 0.2, T0)
        assert out["interval_days"] == expected

    def test_incorrect_resets(self):
        """Incorrect answers take the reset branch."""
        state = {"repetition_number": 5, "interval_days": 30}
        out = CustomSRSAlgorithm.calculate_next_review(state, False, 3, 30, 0.2, T0)
        assert (out["repetition_number"], out["interval_days"]) == (0, 1)

    def test_fast_but_wrong_is_not_fluent(self):
        """time < 25 with is_correct False takes the else branch (factor 1.0)."""
        out = CustomSRSAlgorithm.calculate_next_review({}, False, 3, 5, 0.3, T0)
        assert out["time_factor"] == 1.0

    @pytest.mark.statement
    def test_initial_state_and_default_time(self):
        """get_initial_state and the review_time=None path."""
        state = CustomSRSAlgorithm.get_initial_state()
        assert CustomSRSAlgorithm.calculate_next_review(state, True)["algorithm"] == "Custom"


# ── FSRS (fallback model, used when the fsrs package is absent) ──────────────

class TestFSRSFallbackBranches:
    pytestmark = pytest.mark.branch

    @pytest.fixture(autouse=True)
    def _no_fsrs(self, monkeypatch):
        monkeypatch.setattr(fsrs_algo, "HAS_FSRS", False)

    def test_pass_grows_stability(self):
        """grade >= 3 multiplies stability by 2.2."""
        out = FSRSAlgorithm().calculate_next_review({"stability": 10}, 3, T0)
        assert (out["stability"], out["interval_days"], out["lapses"]) == (22.0, 22, 0)

    def test_fail_resets_stability(self):
        """grade < 3 resets stability and counts a lapse."""
        out = FSRSAlgorithm().calculate_next_review({"stability": 10, "lapses": 1}, 2, T0)
        assert (out["stability"], out["interval_days"], out["lapses"]) == (1.0, 1, 2)

    def test_rating_none_without_package(self):
        """_map_grade_to_rating returns None when fsrs is missing."""
        assert FSRSAlgorithm()._map_grade_to_rating(5) is None

    @pytest.mark.statement
    def test_initial_state_default_time(self):
        """Initial state has zero stability; review_time=None path runs."""
        fsrs = FSRSAlgorithm()
        state = fsrs.get_initial_state()
        assert state["stability"] == 0.0 and fsrs.calculate_next_review(state, 4)["reps"] == 1


# ── Parser branches ──────────────────────────────────────────────────────────

class TestParserBranches:
    pytestmark = pytest.mark.branch

    @pytest.mark.parametrize("name, season, paper", [
        ("2024A_FE-B_3.md", "A", "FE-B"),
        ("2024OCT_FE_X_3.md", "A", "FE-A"),
        ("2024_FE_PM_3.md", "S", "PM"),
        ("2024S_SQ_3.md", "S", "PM"),
        ("2018S_X-B_3.md", "S", "FE-B"),
        ("2018S_X-A_3.md", "S", "FE-A"),
        ("2018S_MISC_3.md", "S", "AM"),
        ("2024S_MISC_3.md", "S", "FE-A"),
        ("2024S_FE-A.md", "S", "FE-A"),
    ])
    def test_filename_paper_and_season(self, name, season, paper):
        """Every season and paper-type branch in parse_filename."""
        meta = parse_filename(name)
        assert (meta["season"], meta["paper"]) == (season, paper)

    def test_sort_index_composition(self):
        """sort_index = season*100000 + paper*10000 + number*100 + sub."""
        assert parse_filename("2010A_FE_PM_7.3.md")["sort_index"] == 100000 + 10000 + 700 + 3

    def test_options_with_continuation(self):
        """Option lines, wrapped continuations and the stem are separated; a wrapped choice keeps its line break."""
        stem, opts, image = parse_options_and_stem("Pick one:\na) first\n   wraps here\n(b) second\nc. third")
        assert stem == "Pick one:" and opts == {"a": "first\n   wraps here", "b": "second", "c": "third"}
        assert image is False

    def test_option_closed_by_heading(self):
        """A heading line ends the current option and returns to the stem."""
        _, opts, _ = parse_options_and_stem("Q\na) one\n# Note\nmore stem")
        assert opts == {"a": "one"}

    @pytest.mark.bva
    @pytest.mark.parametrize("text_len, image_based", [(59, True), (60, False)])
    def test_image_based_text_length_boundary(self, text_len, image_based):
        """With an image and options, under 60 characters of stem text means image-based."""
        stem = "x" * text_len + "\n![d](/files/d.png)\na) one\nb) two"
        assert parse_options_and_stem(stem)[2] is image_based

    def test_image_without_options(self):
        """An image with a long stem but no options is still image-based."""
        assert parse_options_and_stem("y" * 100 + "\n![d](/files/d.png)")[2] is True

    @pytest.mark.parametrize("line, expected", [("e) last", "e"), ("A b c", "a"), ("Twelve", "twelve")])
    def test_answer_fallbacks(self, line, expected):
        """Loose-letter and free-text fallbacks of parse_answer."""
        from parsers.markdown_parser import parse_answer
        assert parse_answer(["", "  ", line]) == (expected, line)


class TestParserStatements:
    pytestmark = pytest.mark.statement

    def test_normalize_all_link_kinds(self):
        """Wikilinks, relative links, /files/ links and http links."""
        src = "%%hidden%%![[Files/a b.png|300]] ![x](img/c.png) ![y](/files/d%20e.png) ![z](https://h/i.png)"
        out = normalize_image_links(src)
        assert "hidden" not in out
        assert "![a b.png](/files/a%20b.png)" in out
        assert "![x](/files/c.png)" in out
        assert "![y](/files/d%20e.png)" in out
        assert "![z](https://h/i.png)" in out

    def test_files_url_idempotent(self):
        """Encoding an already-encoded name changes nothing."""
        assert files_url(files_url("a b.png")[len("/files/"):]) == "/files/a%20b.png"

    def test_extract_dedupes_in_order(self):
        """Duplicate image paths are kept once, first-seen order."""
        text = "![a](/files/1.png) ![b](/files/2.png) ![c](/files/1.png)"
        assert extract_image_paths(text) == ["/files/1.png", "/files/2.png"]

    def test_clean_explanation(self):
        """Comments and a trailing --- are removed; References header kept."""
        out = clean_explanation("Body %%x%%\n## References\nlink\n---")
        assert out == "Body \n## References\nlink"


# ── StatsService ─────────────────────────────────────────────────────────────

class TestStatsServiceBranches:
    pytestmark = pytest.mark.branch

    @pytest.mark.parametrize("correct, confidence, grade", [
        (True, 4, 5), (True, 3, 4), (True, 2, 3), (False, 4, 0), (False, 3, 1), (False, 2, 2),
    ])
    def test_grade_derivation(self, stats, correct, confidence, grade):
        """All six grade-derivation branches when grade is not given."""
        res = stats.record_attempt("Q1", "math", "a", correct, 10, confidence)
        assert res["attempt"]["grade"] == grade

    @pytest.mark.parametrize("algo", ["SM-2", "FSRS", "Custom"])
    def test_algorithm_dispatch(self, stats, algo, monkeypatch):
        """_initial_sr and _compute_sr_update pick the scheduler from settings."""
        monkeypatch.setattr(fsrs_algo, "HAS_FSRS", False)
        stats.update_settings({"spaced_repetition_algorithm": algo})
        res = stats.record_attempt("Q1", "math", "a", True, 10, 4)
        assert res["sr_data"]["algorithm"] == algo

    @pytest.mark.parametrize("algo", ["SM-2", "FSRS", "Custom"])
    def test_replay(self, stats, algo, monkeypatch):
        """replay_all_with_algorithm recomputes each question; empty histories are skipped."""
        monkeypatch.setattr(fsrs_algo, "HAS_FSRS", False)
        stats.record_attempt("Q1", "math", "a", True, 10)
        stats.data["question_history"]["EMPTY"] = {"attempts": [], "sr_data": None}
        stats.data["question_history"]["Q1"]["attempts"].append({"is_correct": False})
        assert stats.replay_all_with_algorithm(algo) == 1
        assert stats.data["question_history"]["Q1"]["sr_data"]["algorithm"] == algo

    def test_due_questions(self, stats):
        """Past reviews are due, future ones and missing/invalid schedules are not."""
        past = (datetime.now(timezone.utc) - timedelta(days=2)).isoformat()
        older = (datetime.now(timezone.utc) - timedelta(days=5)).isoformat()
        future = (datetime.now(timezone.utc) + timedelta(days=2)).isoformat()
        stats.data["question_history"] = {
            "A": {"sr_data": {"next_review": past}},
            "B": {"sr_data": {"next_review": future}},
            "C": {"sr_data": None},
            "D": {"sr_data": {"next_review": ""}},
            "E": {"sr_data": {"next_review": "not-a-date"}},
            "F": {"sr_data": {"next_review": older}},
        }
        due = stats.get_due_questions({"A": {"id": "A"}})
        assert [d["question_id"] for d in due] == ["F", "A"]
        assert due[1]["question"] == {"id": "A"}

    def test_question_stats_empty_and_filled(self, stats):
        """Zero-attempt and non-zero branches of get_question_stats."""
        assert stats.get_question_stats("none")["accuracy_rate"] == 0.0
        stats.record_attempt("Q", "math", "a", True, 10)
        stats.record_attempt("Q", "math", "b", False, 20)
        s = stats.get_question_stats("Q")
        assert (s["accuracy_rate"], s["average_time_seconds"]) == (0.5, 15.0)

    def test_sync_merges_without_duplicates(self, stats):
        """New attempts merge once; settings and schedules apply only when present."""
        attempt = {"question_id": "Q", "timestamp": "2026-01-01T00:00:00", "is_correct": True,
                   "topic": "math", "time_seconds": 5}
        payload = {"attempts": [attempt, dict(attempt)], "settings": {"show_timer": False},
                   "sr_schedules": {"Q": {"algorithm": "SM-2"}}}
        res = stats.sync_from_client(payload)
        assert res["new_attempts_saved"] == 1
        assert stats.data["settings"]["show_timer"] is False
        assert stats.data["question_history"]["Q"]["sr_data"] == {"algorithm": "SM-2"}
        assert stats.sync_from_client({"attempts": [attempt]})["new_attempts_saved"] == 0

    @pytest.mark.statement
    def test_corrupt_file_loads_defaults(self, tmp_path):
        """An unreadable stats file falls back to defaults."""
        from services.stats_service import StatsService
        path = tmp_path / "bad.json"
        path.write_text("{not json", encoding="utf-8")
        assert StatsService(path).get_settings()["spaced_repetition_algorithm"] == "SM-2"

    @pytest.mark.statement
    def test_existing_file_loads(self, tmp_path):
        """A valid stats file is read back."""
        from services.stats_service import StatsService
        path = tmp_path / "ok.json"
        path.write_text(json.dumps({"settings": {"spaced_repetition_algorithm": "FSRS"}}), encoding="utf-8")
        assert StatsService(path).get_settings()["spaced_repetition_algorithm"] == "FSRS"


# ── AnalyticsService (statement coverage over every report) ─────────────────

class TestAnalyticsStatements:
    pytestmark = pytest.mark.statement

    def test_reports_with_and_without_data(self, stats):
        """Each analytics report runs on an empty store and on a populated one."""
        analytics = AnalyticsService(stats)
        reports = ("get_error_rates", "get_priority_weak_spots", "get_consistency_score",
                   "get_learning_gain", "get_time_stats", "get_confidence_calibration")
        for name in reports:
            getattr(analytics, name)()
        for i in range(12):
            stats.record_attempt(f"Q{i % 4}", ["math", "networking"][i % 2], "a", i % 3 != 0, 10 + i, 1 + i % 5)
        for name in reports:
            assert getattr(analytics, name)() is not None
        for interval in ("day", "week", "month"):
            assert analytics.get_heatmap(interval) is not None


# ── HTTP layer: guards and endpoints ─────────────────────────────────────────

class TestApiBranches:
    pytestmark = pytest.mark.branch

    @pytest.mark.parametrize("headers, status", [
        ({}, 200),
        ({"origin": "http://testserver"}, 200),
        ({"origin": "https://app.example", "x-forwarded-host": "other, app.example"}, 200),
        ({"origin": "https://evil.example"}, 403),
    ])
    def test_same_origin_guard(self, client, headers, status):
        """No Origin, same host, forwarded host, and foreign origin (with '*' ignored)."""
        assert client.post("/api/account/signout", headers=headers).status_code == status

    def test_same_origin_allow_list(self, client, monkeypatch):
        """An origin listed in allowed_origins passes."""
        monkeypatch.setattr(main.app.state, "allowed_origins", ["https://ok.example"])
        assert client.post("/api/account/signout", headers={"origin": "https://ok.example"}).status_code == 200

    def test_require_admin_open_locally(self, monkeypatch):
        """A bare local setup (no admin login, token or Supabase admin key) allows edits."""
        monkeypatch.setattr(main, "ADMIN_TOKEN", "")
        monkeypatch.setattr(main, "IS_HOSTED", False)
        monkeypatch.setenv("SLACKR_ADMIN_PASSWORD_HASH", "")
        monkeypatch.setenv("SUPABASE_ADMIN_KEY", "")
        assert main.require_admin(_FakeRequest({})) is None

    def test_require_admin_closed_locally_once_admin_configured(self, monkeypatch):
        """With an admin login configured, local edits need the admin session too."""
        from routers import admin

        monkeypatch.setattr(main, "ADMIN_TOKEN", "")
        monkeypatch.setattr(main, "IS_HOSTED", False)
        monkeypatch.setenv("SLACKR_ADMIN_PASSWORD_HASH", admin.hash_password("pw", iterations=1000))
        with pytest.raises(HTTPException) as e:
            main.require_admin(_FakeRequest({}))
        assert e.value.status_code == 403

    def test_require_admin_hosted_without_token(self, monkeypatch):
        """Hosted mode without a token refuses edits."""
        monkeypatch.setattr(main, "ADMIN_TOKEN", "")
        monkeypatch.setattr(main, "IS_HOSTED", True)
        with pytest.raises(HTTPException) as e:
            main.require_admin(_FakeRequest({}))
        assert e.value.status_code == 403

    @pytest.mark.parametrize("supplied, allowed", [("Bearer s3cret", True), ("Bearer wrong", False)])
    def test_require_admin_token(self, monkeypatch, supplied, allowed):
        """A configured token must match exactly."""
        monkeypatch.setattr(main, "ADMIN_TOKEN", "s3cret")
        if allowed:
            assert main.require_admin(_FakeRequest({"authorization": supplied})) is None
        else:
            with pytest.raises(HTTPException):
                main.require_admin(_FakeRequest({"authorization": supplied}))

    def test_require_admin_accepts_admin_session(self, monkeypatch):
        """A signed admin console cookie allows edits even when hosted without a token."""
        from routers import admin

        monkeypatch.setenv("SLACKR_ADMIN_PASSWORD_HASH", admin.hash_password("pw", iterations=1000))
        monkeypatch.setattr(main, "ADMIN_TOKEN", "")
        monkeypatch.setattr(main, "IS_HOSTED", True)
        expires = int(datetime.now().timestamp()) + 60
        good = {admin.ADMIN_COOKIE: f"{expires}.{admin._sign(expires)}"}
        assert main.require_admin(_FakeRequest({}, good)) is None
        with pytest.raises(HTTPException):
            main.require_admin(_FakeRequest({}, {admin.ADMIN_COOKIE: f"{expires}.forged"}))

    def test_hosted_blocks_personal_data(self, client, monkeypatch):
        """The hosted-mode middleware returns 503 for personal-data routes only."""
        monkeypatch.setattr(main, "IS_HOSTED", True)
        assert client.get("/api/stats/settings").status_code == 503
        assert client.get("/api/health").status_code == 200

    @pytest.mark.parametrize("algo, status", [("FSRS", 200), ("Bogus", 400)])
    def test_switch_algorithm(self, client, algo, status, monkeypatch):
        """Valid algorithm names replay; others are rejected."""
        monkeypatch.setattr(fsrs_algo, "HAS_FSRS", False)
        assert client.post("/api/stats/algorithm", json={"algorithm": algo}).status_code == status

    @pytest.mark.parametrize("qid, topic", [("2019A_FE_AM_5", "networking"), ("unknown", "software")])
    def test_grade_topic_lookup(self, client, qid, topic):
        """Grading a known question uses its first topic; unknown falls back to 'software'."""
        body = client.post("/api/spaced-repetition/grade", json={"question_id": qid, "grade": 4}).json()
        assert body["attempt"]["topic"] == topic


class TestApiStatements:
    pytestmark = pytest.mark.statement

    def test_listing_endpoints(self, client):
        """years, topics, by-year (all filters), by-topic (with year), due list, settings."""
        assert client.get("/api/years").json()["years"] == ["2024", "2019"]
        assert "networking" in client.get("/api/topics").json()["topics"]
        by_year = client.get("/api/questions/by-year/2024?session=2024S_FE-A&season=S&paper=FE-A").json()
        assert [q["id"] for q in by_year["items"]] == ["2024S_FE-A_1", "2024S_FE-A_2"]
        by_topic = client.get("/api/questions/by-topic/networking").json()
        assert [q["id"] for q in by_topic["items"]] == ["2024S_FE-A_1", "2019A_FE_AM_5"]
        assert client.get("/api/questions/by-topic/networking?year=2019").json()["subdeck"] == "networking/2019"
        assert client.get("/api/spaced-repetition/due").json()["total_due"] == 0
        assert client.post("/api/stats/settings", json={"show_timer": False}).json()["show_timer"] is False
        assert client.get("/api/stats/settings").status_code == 200

    def test_account_status(self, client):
        """Status reports whether Supabase is configured."""
        assert "enabled" in client.get("/api/account/status").json()


class _FakeRequest:
    def __init__(self, headers, cookies=None):
        self.headers = headers
        self.cookies = cookies or {}
