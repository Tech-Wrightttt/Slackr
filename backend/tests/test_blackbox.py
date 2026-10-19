"""
Black-box tests: written from the documented behaviour (docstrings, API contract, CLAUDE.md),
using equivalence partitioning (EP) and boundary value analysis (BVA).
"""

from datetime import datetime, timezone

import pytest

from algorithms.custom import CustomSRSAlgorithm
from algorithms.sm2 import SM2Algorithm
from parsers.markdown_parser import parse_answer, parse_filename
from routers.account import PASSWORD_MAX, PASSWORD_MIN, password_problem

pytestmark = pytest.mark.blackbox

T0 = datetime(2026, 1, 1, tzinfo=timezone.utc)


# ── Password policy ──────────────────────────────────────────────────────────

class TestPasswordPolicyEP:
    """Partitions: valid | too long | missing a character class | contains username | common word."""

    pytestmark = pytest.mark.ep

    def test_valid_partition(self):
        """A password meeting every rule is accepted."""
        assert password_problem("Tr0ub4dor&3x", "jairus") is None

    @pytest.mark.parametrize("pw, missing", [
        ("ALLUPPER1!", "lowercase letter"),
        ("alllower1!", "uppercase letter"),
        ("NoDigitsHere!", "number"),
        ("NoSymbols123", "symbol"),
    ])
    def test_missing_class_partition(self, pw, missing):
        """Each missing character class is named in the message."""
        assert missing in password_problem(pw)

    def test_username_partition(self):
        """A password containing the username is refused."""
        assert "username" in password_problem("Xjairus#9Q", "Jairus")

    def test_common_word_partition(self):
        """A password containing a common word is refused."""
        assert "too easy" in password_problem("MyQwerty#99")

    def test_too_long_partition(self):
        """A password above the maximum is refused before other checks."""
        assert "at most" in password_problem("Aa1!" * 40)


class TestPasswordPolicyBVA:
    pytestmark = pytest.mark.bva

    BASE = "Aa1!"

    @pytest.mark.parametrize("length, ok", [
        (PASSWORD_MIN - 1, False), (PASSWORD_MIN, True), (PASSWORD_MIN + 1, True),
        (PASSWORD_MAX - 1, True), (PASSWORD_MAX, True), (PASSWORD_MAX + 1, False),
    ])
    def test_length_boundaries(self, length, ok):
        """Length 7/8/9 and 127/128/129 around the 8..128 limits."""
        pw = (self.BASE + "x" * length)[:length]
        assert (password_problem(pw) is None) is ok

    @pytest.mark.parametrize("username, refused", [("ab", False), ("abc", True)])
    def test_username_length_boundary(self, username, refused):
        """Usernames shorter than 3 characters are not checked; 3+ are."""
        pw = "Zabc#77Kq"
        assert (password_problem(pw, username) is not None) is refused


# ── SM-2 ─────────────────────────────────────────────────────────────────────

class TestSM2EP:
    """Partitions on grade: failing (0..2) resets, passing (3..5) advances."""

    pytestmark = pytest.mark.ep

    def test_failing_grade_resets(self):
        """A failing grade resets repetitions and schedules for tomorrow."""
        state = {"repetition_number": 4, "easiness_factor": 2.5, "interval_days": 20}
        out = SM2Algorithm.calculate_next_review(state, 1, T0)
        assert out["repetition_number"] == 0 and out["interval_days"] == 1

    def test_passing_grade_advances(self):
        """A passing grade increments the repetition count."""
        out = SM2Algorithm.calculate_next_review(SM2Algorithm.get_initial_state(), 4, T0)
        assert out["repetition_number"] == 1

    def test_next_review_is_interval_after_review(self):
        """next_review equals review time plus interval days."""
        out = SM2Algorithm.calculate_next_review({"repetition_number": 1}, 5, T0)
        assert out["next_review"] == "2026-01-07T00:00:00+00:00"


class TestSM2BVA:
    pytestmark = pytest.mark.bva

    @pytest.mark.parametrize("grade, passes", [(2, False), (3, True)])
    def test_pass_fail_boundary(self, grade, passes):
        """Grade 2 fails and grade 3 passes."""
        out = SM2Algorithm.calculate_next_review({"repetition_number": 2, "interval_days": 6}, grade, T0)
        assert (out["repetition_number"] == 3) is passes

    @pytest.mark.parametrize("grade, clamped", [(-1, 0), (0, 0), (5, 5), (6, 5)])
    def test_grade_range_boundaries(self, grade, clamped):
        """Grades outside 0..5 behave like the nearest bound."""
        a = SM2Algorithm.calculate_next_review({}, grade, T0)
        b = SM2Algorithm.calculate_next_review({}, clamped, T0)
        assert a == b

    def test_easiness_floor(self):
        """Easiness factor never drops below 1.3."""
        out = SM2Algorithm.calculate_next_review({"easiness_factor": 1.3}, 0, T0)
        assert out["easiness_factor"] == 1.3


# ── Custom SRS ───────────────────────────────────────────────────────────────

class TestCustomSRSBVA:
    pytestmark = pytest.mark.bva

    @pytest.mark.parametrize("seconds, factor", [
        (24.9, 1.10), (25, 1.0), (90, 1.0), (90.1, 0.85),
    ])
    def test_time_boundaries(self, seconds, factor):
        """Fluent below 25 s, hesitant above 90 s."""
        out = CustomSRSAlgorithm.calculate_next_review({}, True, 3, seconds, 0.3, T0)
        assert out["time_factor"] == factor

    @pytest.mark.parametrize("rate, factor", [
        (0.0, 1.2), (0.6, 0.6), (0.61, 0.6), (1.0, 0.6),
    ])
    def test_topic_factor_clamp(self, rate, factor):
        """Topic factor is clamped to the 0.6..1.2 range."""
        out = CustomSRSAlgorithm.calculate_next_review({}, True, 3, 30, rate, T0)
        assert out["topic_factor"] == factor


class TestCustomSRSEP:
    pytestmark = pytest.mark.ep

    @pytest.mark.parametrize("correct, confidence, expected_ef", [
        (True, 5, 2.6), (True, 3, 2.5), (True, 1, 2.36),
        (False, 5, 1.7), (False, 3, 1.96), (False, 1, 2.18),
    ])
    def test_correctness_confidence_partitions(self, correct, confidence, expected_ef):
        """Six partitions of (correct?, high/mid/low confidence) map to distinct easiness changes."""
        out = CustomSRSAlgorithm.calculate_next_review({}, correct, confidence, 30, 0.3, T0)
        assert out["easiness_factor"] == expected_ef


# ── Parsers ──────────────────────────────────────────────────────────────────

class TestParseFilenameEP:
    pytestmark = pytest.mark.ep

    def test_valid_filename(self):
        """A well-formed PelNETS filename yields year, season, paper and number."""
        meta = parse_filename("2024S_FE-A_15.md")
        assert (meta["year"], meta["season"], meta["paper"], meta["number"]) == ("2024", "S", "FE-A", 15)

    def test_invalid_filename(self):
        """A filename without a year falls into the 'unknown' partition."""
        meta = parse_filename("notes.md")
        assert meta["year"] == "unknown" and meta["sort_index"] == 999999

    def test_subquestion(self):
        """PM sub-questions keep their sub number."""
        meta = parse_filename("2008A_FE_PM_1.2.md")
        assert (meta["paper"], meta["number"], meta["sub_number"]) == ("PM", 1, "2")


class TestParseFilenameBVA:
    pytestmark = pytest.mark.bva

    @pytest.mark.parametrize("year, paper", [("2022", "AM"), ("2023", "FE-A")])
    def test_paper_rename_year_boundary(self, year, paper):
        """Morning papers are called FE-A from 2023 onward."""
        assert parse_filename(f"{year}S_AM_1.md")["paper"] == paper

    @pytest.mark.xfail(reason="Known defect: 'FE-A' in 'FE-AM' matches first, so pre-2023 FE_AM files are labelled FE-A")
    def test_fe_am_filename_before_2023(self):
        """A 2022 FE_AM file should keep the AM paper label."""
        assert parse_filename("2022S_FE_AM_1.md")["paper"] == "AM"


class TestParseAnswerEP:
    pytestmark = pytest.mark.ep

    @pytest.mark.parametrize("line, expected", [
        ("c) 291.25", "c"),
        ("B. text", "b"),
        ("c, b, C", "c, b, c"),
        ("A=e, B=d", "A=e, B=d"),
        ("d", "d"),
        ("", ""),
    ])
    def test_answer_formats(self, line, expected):
        """Each documented answer format normalises as specified."""
        assert parse_answer([line])[0] == expected


# ── HTTP API ─────────────────────────────────────────────────────────────────

class TestApiEP:
    pytestmark = pytest.mark.ep

    def test_health(self, client):
        """Health reports the loaded question count."""
        body = client.get("/api/health").json()
        assert body["status"] == "healthy" and body["total_questions"] == 4

    def test_existing_question(self, client):
        """A known id returns that question."""
        assert client.get("/api/questions/2024S_FE-A_1").json()["correct"] == "b"

    def test_unknown_question(self, client):
        """An unknown id returns 404."""
        assert client.get("/api/questions/1999S_FE_AM_1").status_code == 404

    @pytest.mark.parametrize("query, total", [
        ("year=2024", 3), ("topic=NETWORKING", 2), ("has_images=true", 1),
        ("has_images=false", 3), ("search=tls", 1), ("search=zzz", 0),
    ])
    def test_question_filters(self, client, query, total):
        """Each filter class narrows the result set."""
        assert client.get(f"/api/questions?{query}").json()["total"] == total

    @pytest.mark.parametrize("interval, status", [("day", 200), ("week", 200), ("month", 200), ("year", 422)])
    def test_heatmap_interval(self, client, interval, status):
        """Only day/week/month are valid heatmap intervals."""
        assert client.get(f"/api/analytics/heatmap?interval={interval}").status_code == status

    def test_custom_questions_skips_unknown(self, client):
        """Unknown ids in a custom set are dropped."""
        body = client.post("/api/questions/custom", json={"question_ids": ["2024S_FE-A_1", "nope"]}).json()
        assert body["total"] == 1

    def test_record_attempt_then_stats(self, client):
        """A recorded attempt shows up in the question's stats."""
        client.post("/api/attempts", json={
            "question_id": "2024S_FE-A_1", "topic": "networking", "selected_answer": "b",
            "is_correct": True, "time_seconds": 12, "confidence": 4, "timestamp": T0.isoformat(),
        })
        stats = client.get("/api/stats/question/2024S_FE-A_1").json()
        assert stats["total_attempts"] == 1


class TestApiBVA:
    pytestmark = pytest.mark.bva

    @pytest.mark.parametrize("page, status", [(0, 422), (1, 200), (2, 200)])
    def test_page_boundary(self, client, page, status):
        """page must be >= 1."""
        assert client.get(f"/api/questions?page={page}").status_code == status

    @pytest.mark.parametrize("size, status", [(0, 422), (1, 200), (500, 200), (501, 422)])
    def test_page_size_boundary(self, client, size, status):
        """page_size must be within 1..500."""
        assert client.get(f"/api/questions?page_size={size}").status_code == status

    def test_last_page_partial(self, client):
        """With 4 questions and page_size 3, page 2 holds 1 item and total_pages is 2."""
        body = client.get("/api/questions?page=2&page_size=3").json()
        assert (len(body["items"]), body["total_pages"]) == (1, 2)

    def test_page_past_end_empty(self, client):
        """A page beyond the last returns no items."""
        assert client.get("/api/questions?page=3&page_size=3").json()["items"] == []
