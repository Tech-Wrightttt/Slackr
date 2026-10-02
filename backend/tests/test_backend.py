import os
import sys
from pathlib import Path
from datetime import datetime, timezone

# Add backend directory to sys.path
backend_dir = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(backend_dir))

from parsers.markdown_parser import (
    parse_filename,
    normalize_image_links,
    extract_image_paths,
    parse_options_and_stem,
    parse_answer,
    REGISTERED_TOPICS
)
from algorithms.sm2 import SM2Algorithm
from algorithms.fsrs_algo import FSRSAlgorithm
from algorithms.custom import CustomSRSAlgorithm
from services.stats_service import StatsService
from services.analytics_service import AnalyticsService
from fastapi.testclient import TestClient
from main import app, startup_event


def run_tests():
    print("==================================================")
    print("Running SLACKR Backend Unit & Integration Tests")
    print("==================================================")

    # 1. Test Parser components
    print("\n--- 1. Testing Markdown Parser Components ---")
    fn = parse_filename("2024S_FE-A_1.md")
    assert fn["year"] == "2024"
    assert fn["paper"] == "FE-A"
    assert fn["number"] == 1
    assert fn["sub_number"] is None

    fn_pm = parse_filename("2008A_FE_PM_1.1.md")
    assert fn_pm["year"] == "2008"
    assert fn_pm["number"] == 1
    assert fn_pm["sub_number"] == "1"

    # Test Wikilink normalization
    raw_md = "Look at this diagram: ![[2024A_FE-A_Q12_full.png]] and ![[Files/other.png|300]]"
    normalized = normalize_image_links(raw_md)
    assert "![" in normalized and "/files/2024A_FE-A_Q12_full.png" in normalized
    assert "/files/other.png" in normalized
    imgs = extract_image_paths(normalized)
    assert len(imgs) == 2
    assert imgs[0] == "/files/2024A_FE-A_Q12_full.png"

    # Test Answer parser
    corr, disp = parse_answer(["c) 291.25"])
    assert corr == "c"
    assert disp == "c) 291.25"

    corr_pm, disp_pm = parse_answer(["c, b, c"])
    assert corr_pm == "c, b, c"

    print("[PASS] Parser components validated successfully.")

    # 2. Test SM-2 Algorithm
    print("\n--- 2. Testing SM-2 Algorithm ---")
    state = SM2Algorithm.get_initial_state()
    assert state["repetition_number"] == 0
    assert state["easiness_factor"] == 2.5

    # Grade 4 (good response)
    res1 = SM2Algorithm.calculate_next_review(state, grade=4)
    assert res1["repetition_number"] == 1
    assert res1["interval_days"] == 1

    # Grade 5 second time
    res2 = SM2Algorithm.calculate_next_review(res1, grade=5)
    assert res2["repetition_number"] == 2
    assert res2["interval_days"] == 6

    # Grade 1 (failure) -> reset
    res3 = SM2Algorithm.calculate_next_review(res2, grade=1)
    assert res3["repetition_number"] == 0
    assert res3["interval_days"] == 1
    print("[PASS] SM-2 algorithm verified.")

    # 3. Test FSRS Algorithm
    print("\n--- 3. Testing FSRS Algorithm ---")
    fsrs = FSRSAlgorithm(desired_retention=0.90)
    fsrs_state = fsrs.get_initial_state()
    f_res1 = fsrs.calculate_next_review(fsrs_state, grade=3) # Good
    assert f_res1["interval_days"] >= 1
    assert f_res1["stability"] > 0
    print(f"[PASS] FSRS updated: stability={f_res1['stability']}, interval={f_res1['interval_days']} days.")

    # 4. Test Custom Algorithm
    print("\n--- 4. Testing Custom Algorithm ---")
    custom_state = CustomSRSAlgorithm.get_initial_state()
    # High confidence, correct, weak topic (error_rate=0.6)
    c_res1 = CustomSRSAlgorithm.calculate_next_review(
        custom_state, is_correct=True, confidence=5, time_seconds=15.0, topic_error_rate=0.6
    )
    assert c_res1["repetition_number"] == 1
    assert c_res1["interval_days"] >= 1
    # Overconfident incorrect answer -> severe penalty
    c_res2 = CustomSRSAlgorithm.calculate_next_review(
        c_res1, is_correct=False, confidence=5, time_seconds=60.0, topic_error_rate=0.6
    )
    assert c_res2["repetition_number"] == 0
    assert c_res2["easiness_factor"] < c_res1["easiness_factor"]
    print("[PASS] Custom SRS algorithm verified.")

    # 5. Test Analytics Service
    print("\n--- 5. Testing Analytics Calculations ---")
    test_stats_path = backend_dir / "data" / "test_user_stats.json"
    stats_svc = StatsService(stats_path=test_stats_path)
    # Clear test file
    stats_svc.data = stats_svc._default_stats()
    stats_svc._save()

    # Seed 10 attempts
    # 5 networking (3 correct, 2 incorrect, varying confidence)
    # 5 hardware (5 correct)
    for i in range(3):
        stats_svc.record_attempt("Q_NET_1", "networking", "c", True, time_seconds=25.0, confidence=4)
    for i in range(2):
        stats_svc.record_attempt("Q_NET_2", "networking", "a", False, time_seconds=45.0, confidence=5) # Overconfident!
    for i in range(5):
        stats_svc.record_attempt("Q_HW_1", "hardware", "b", True, time_seconds=20.0, confidence=3)

    analytics = AnalyticsService(stats_svc)
    rates = analytics.get_error_rates()
    net_rate = next(r for r in rates if r["topic"] == "networking")
    hw_rate = next(r for r in rates if r["topic"] == "hardware")
    assert net_rate["total_attempts"] == 5
    assert net_rate["incorrect_attempts"] == 2
    assert net_rate["error_rate"] == 40.0
    assert hw_rate["total_attempts"] == 5
    assert hw_rate["error_rate"] == 0.0

    weak = analytics.get_priority_weak_spots()
    assert len(weak) > 0
    assert weak[0]["topic"] == "networking"

    consistency = analytics.get_consistency_score()
    assert "overall_consistency" in consistency

    calibration = analytics.get_confidence_calibration()
    assert calibration["has_data"] is True
    assert calibration["overconfidence_rate"] > 0 # We had 2 wrong with confidence=5!

    heatmap = analytics.get_heatmap(interval="week")
    assert "networking" in heatmap["matrix"]
    assert len(heatmap["periods"]) > 0

    print("[PASS] Analytics metrics (error rates, weak spots, consistency, calibration, heatmap) calculated accurately.")

    # 6. Test Algorithm Replay Migration
    print("\n--- 6. Testing Algorithm Historical Replay Migration ---")
    replayed = stats_svc.replay_all_with_algorithm("FSRS")
    assert replayed >= 2
    assert stats_svc.data["settings"]["spaced_repetition_algorithm"] == "FSRS"
    print(f"[PASS] Successfully migrated {replayed} cards to FSRS.")

    # Clean up test stats file
    if test_stats_path.exists():
        test_stats_path.unlink()

    # 7. Test FastAPI Endpoints
    print("\n--- 7. Testing FastAPI Endpoints ---")
    startup_event()
    client = TestClient(app)

    h_resp = client.get("/api/health")
    assert h_resp.status_code == 200
    assert h_resp.json()["status"] == "healthy"
    assert h_resp.json()["total_questions"] >= 3600

    y_resp = client.get("/api/years")
    assert y_resp.status_code == 200
    assert "2024" in y_resp.json()["years"]

    t_resp = client.get("/api/topics")
    assert t_resp.status_code == 200
    assert "networking" in t_resp.json()["topics"]

    q_resp = client.get("/api/questions?year=2024&page_size=5")
    assert q_resp.status_code == 200
    assert len(q_resp.json()["items"]) == 5

    first_q_id = q_resp.json()["items"][0]["id"]
    det_resp = client.get(f"/api/questions/{first_q_id}")
    assert det_resp.status_code == 200
    assert det_resp.json()["id"] == first_q_id

    # Test static files mount
    first_img = det_resp.json().get("image_paths")
    if first_img:
        img_url = first_img[0]
        img_resp = client.get(img_url)
        assert img_resp.status_code in (200, 304)

    # Test Custom Quiz endpoint
    c_resp = client.post("/api/questions/custom", json={"question_ids": [first_q_id]})
    assert c_resp.status_code == 200
    assert len(c_resp.json()["items"]) == 1

    print("[PASS] All FastAPI endpoints responding with status 200.")
    print("\n==================================================")
    print("ALL BACKEND TESTS PASSED SUCCESSFULLY!")
    print("==================================================")


if __name__ == "__main__":
    run_tests()
