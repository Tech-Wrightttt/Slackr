"""
Shared pytest setup for the automated suite (run through scripts/run_tests.py).

- Points the stats store at a throwaway file BEFORE main.py is imported, so tests never touch
  backend/data/user_stats.json.
- Records each test's outcome plus its technique markers (ep, bva, branch, statement, blackbox,
  whitebox) to the JSON file named by SLACKR_TEST_RESULTS, which the PDF report reads.
"""

import json
import os
import sys
import tempfile
from pathlib import Path

import pytest

_TMP = Path(tempfile.mkdtemp(prefix="slackr_tests_"))
os.environ["SLACKR_STATS_PATH"] = str(_TMP / "user_stats.json")
os.environ.pop("VERCEL", None)
os.environ.pop("SLACKR_HOSTED", None)
os.environ.pop("SLACKR_ADMIN_TOKEN", None)

BACKEND_DIR = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(BACKEND_DIR))

TECHNIQUES = ("blackbox", "whitebox", "ep", "bva", "branch", "statement")

SAMPLE_QUESTIONS = {
    "2024S_FE-A_1": {
        "id": "2024S_FE-A_1", "year": "2024", "season": "S", "paper": "FE-A", "number": 1,
        "session_id": "2024S_FE-A", "sort_index": 100, "topics": ["networking"],
        "question": "Which layer routes packets?", "explanation": "The network layer.",
        "options": {"a": "Physical", "b": "Network", "c": "Session", "d": "Transport"},
        "correct": "b", "image_paths": [],
    },
    "2024S_FE-A_2": {
        "id": "2024S_FE-A_2", "year": "2024", "season": "S", "paper": "FE-A", "number": 2,
        "session_id": "2024S_FE-A", "sort_index": 200, "topics": ["math"],
        "question": "What is 2 + 2?", "explanation": "Four.",
        "options": {"a": "3", "b": "4", "c": "5", "d": "6"},
        "correct": "b", "image_paths": ["/files/sum.png"],
    },
    "2024A_FE-B_1": {
        "id": "2024A_FE-B_1", "year": "2024", "season": "A", "paper": "FE-B", "number": 1,
        "session_id": "2024A_FE-B", "sort_index": 110100, "topics": ["algorithms"],
        "question": "Trace the program.", "explanation": "Loop runs three times.",
        "options": {"a": "1", "b": "2", "c": "3", "d": "4"},
        "correct": "c", "image_paths": [],
    },
    "2019A_FE_AM_5": {
        "id": "2019A_FE_AM_5", "year": "2019", "season": "A", "paper": "AM", "number": 5,
        "session_id": "2019A_AM", "sort_index": 100500, "topics": ["networking", "cybersecurity"],
        "question": "Which protocol encrypts web traffic?", "explanation": "HTTPS uses TLS.",
        "options": {"a": "FTP", "b": "HTTPS", "c": "SMTP", "d": "SNMP"},
        "correct": "b", "image_paths": [],
    },
}


@pytest.fixture()
def client():
    """TestClient over a small fixed question bank and a fresh stats store."""
    from fastapi.testclient import TestClient
    import main

    main.questions_db.clear()
    main.questions_db.update(json.loads(json.dumps(SAMPLE_QUESTIONS)))
    main.stats_service.data = main.stats_service._default_stats()
    with TestClient(main.app) as c:
        yield c
    main.questions_db.clear()


@pytest.fixture()
def stats(tmp_path):
    from services.stats_service import StatsService

    return StatsService(tmp_path / "stats.json")


# ── Result capture for the PDF report ────────────────────────────────────────

_results = []


@pytest.hookimpl(hookwrapper=True)
def pytest_runtest_makereport(item, call):
    outcome = yield
    rep = outcome.get_result()
    if rep.when == "call" or (rep.when == "setup" and rep.outcome != "passed"):
        doc = (item.function.__doc__ or "").strip().splitlines()
        _results.append({
            "suite": "backend",
            "file": item.location[0].replace("\\", "/"),
            "group": item.cls.__name__ if item.cls else Path(item.location[0]).stem,
            "name": item.name,
            "description": doc[0] if doc else "",
            "outcome": "xfailed" if hasattr(rep, "wasxfail") else rep.outcome,
            "duration_ms": round(rep.duration * 1000, 2),
            "techniques": sorted({m.name for m in item.iter_markers() if m.name in TECHNIQUES}),
            "message": (rep.wasxfail.removeprefix("reason: ") if hasattr(rep, "wasxfail")
                        else str(rep.longrepr).splitlines()[-1] if rep.failed and rep.longrepr else ""),
        })


def pytest_sessionfinish(session, exitstatus):
    target = os.environ.get("SLACKR_TEST_RESULTS")
    if target:
        Path(target).parent.mkdir(parents=True, exist_ok=True)
        Path(target).write_text(json.dumps(_results, indent=2), encoding="utf-8")
