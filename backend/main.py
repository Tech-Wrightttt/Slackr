import json
import os
from pathlib import Path
from typing import Dict, Any, List, Optional

from fastapi import FastAPI, HTTPException, Query, UploadFile, File, Response
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

from models.schemas import (
    CustomQuestionsRequest,
    AttemptRecord,
    SRGradeRequest,
    AlgorithmSwitchRequest,
    SyncStatsPayload
)
from services.stats_service import StatsService
from services.analytics_service import AnalyticsService

BASE_DIR = Path(__file__).resolve().parent
DATA_DIR = BASE_DIR / "data"
QUESTIONS_INDEX_PATH = DATA_DIR / "questions_index.json"
FILES_DIR = DATA_DIR / "pelnets" / "Files"

app = FastAPI(
    title="SLACKR - PHILNITS Exam Reviewer API",
    description="Offline-first exam reviewer and spaced repetition platform",
    version="1.0.0"
)

# Enable CORS for local development
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Mount Static Files for diagram screenshots
if FILES_DIR.exists():
    app.mount("/files", StaticFiles(directory=str(FILES_DIR)), name="files")

# In-memory question database
questions_db: Dict[str, Any] = {}
stats_service: StatsService = StatsService()
analytics_service: AnalyticsService = AnalyticsService(stats_service)


@app.on_event("startup")
def startup_event():
    global questions_db
    if QUESTIONS_INDEX_PATH.exists():
        with open(QUESTIONS_INDEX_PATH, "r", encoding="utf-8") as f:
            questions_db = json.load(f)
        print(f"Loaded {len(questions_db)} questions into memory.")
    else:
        print(f"Warning: {QUESTIONS_INDEX_PATH} not found. Run generate_index.py first.")


@app.get("/api/health")
def health_check():
    return {
        "status": "healthy",
        "total_questions": len(questions_db),
        "files_mounted": FILES_DIR.exists(),
        "stats_loaded": len(stats_service.data.get("attempts", []))
    }


# ==========================================
# Question Query Endpoints
# ==========================================

@app.get("/api/questions")
def get_questions(
    year: Optional[str] = None,
    topic: Optional[str] = None,
    has_images: Optional[bool] = None,
    search: Optional[str] = None,
    page: int = Query(1, ge=1),
    page_size: int = Query(50, ge=1, le=500)
):
    filtered = list(questions_db.values())

    if year:
        filtered = [q for q in filtered if q.get("year") == year]
    if topic:
        topic_lower = topic.lower()
        filtered = [q for q in filtered if topic_lower in [t.lower() for t in q.get("topics", [])]]
    if has_images is not None:
        filtered = [q for q in filtered if bool(q.get("image_paths")) == has_images]
    if search:
        search_lower = search.lower()
        filtered = [
            q for q in filtered
            if search_lower in q.get("id", "").lower()
            or search_lower in q.get("question", "").lower()
            or search_lower in q.get("explanation", "").lower()
        ]

    total_count = len(filtered)
    start = (page - 1) * page_size
    end = start + page_size
    paginated = filtered[start:end]

    return {
        "total": total_count,
        "page": page,
        "page_size": page_size,
        "total_pages": (total_count + page_size - 1) // page_size,
        "items": paginated
    }


@app.get("/api/years")
def get_years():
    counts = {}
    for q in questions_db.values():
        y = q.get("year", "unknown")
        counts[y] = counts.get(y, 0) + 1
    sorted_years = sorted(list(counts.keys()), reverse=True)
    return {
        "years": sorted_years,
        "counts": counts
    }


@app.get("/api/topics")
def get_topics():
    counts = {}
    for q in questions_db.values():
        for t in q.get("topics", []):
            counts[t] = counts.get(t, 0) + 1
    sorted_topics = sorted(list(counts.keys()))
    return {
        "topics": sorted_topics,
        "counts": counts
    }


@app.get("/api/questions/by-year/{year}")
def get_questions_by_year(
    year: str,
    session: Optional[str] = None,
    season: Optional[str] = None,
    paper: Optional[str] = None
):
    matches = [q for q in questions_db.values() if q.get("year") == year]
    if session:
        matches = [q for q in matches if q.get("session_id") == session]
    if season:
        matches = [q for q in matches if q.get("season") == season]
    if paper:
        matches = [q for q in matches if q.get("paper") == paper]

    # Strictly sort by PelNETS sequential hierarchy: Season -> Paper -> Number -> Subnumber
    matches.sort(key=lambda x: x.get("sort_index", 0))
    return {
        "year": year,
        "total": len(matches),
        "items": matches
    }


@app.get("/api/questions/by-topic/{topic}")
def get_questions_by_topic(topic: str, year: Optional[str] = None):
    topic_lower = topic.lower()
    matches = [
        q for q in questions_db.values()
        if topic_lower in [t.lower() for t in q.get("topics", [])]
    ]
    if year:
        matches = [q for q in matches if q.get("year") == year]

    # Sort newest year first, then strictly by paper and question number
    matches.sort(key=lambda x: (-int(x.get("year", 0)) if str(x.get("year", "")).isdigit() else 0, x.get("sort_index", 0)))
    return {
        "topic": topic,
        "subdeck": f"{topic}/{year}" if year else topic,
        "total": len(matches),
        "items": matches
    }


@app.get("/api/questions/{question_id}")
def get_question_detail(question_id: str):
    if question_id not in questions_db:
        raise HTTPException(status_code=404, detail="Question not found")
    return questions_db[question_id]


@app.post("/api/questions/custom")
def get_custom_questions(payload: CustomQuestionsRequest):
    items = []
    for q_id in payload.question_ids:
        if q_id in questions_db:
            items.append(questions_db[q_id])
    return {
        "total": len(items),
        "items": items
    }


# ==========================================
# Attempt & Spaced Repetition Endpoints
# ==========================================

@app.post("/api/attempts")
def record_attempt(record: AttemptRecord):
    res = stats_service.record_attempt(
        question_id=record.question_id,
        topic=record.topic,
        selected_answer=record.selected_answer,
        is_correct=record.is_correct,
        time_seconds=record.time_seconds,
        confidence=record.confidence
    )
    return res


@app.get("/api/spaced-repetition/due")
def get_due_reviews():
    due = stats_service.get_due_questions(questions_db)
    return {
        "total_due": len(due),
        "algorithm": stats_service.get_settings().get("spaced_repetition_algorithm", "SM-2"),
        "items": due
    }


@app.post("/api/spaced-repetition/grade")
def submit_sr_grade(req: SRGradeRequest):
    q_meta = questions_db.get(req.question_id)
    topic = q_meta.get("topics", ["software"])[0] if q_meta else "software"
    is_correct = req.grade >= 3
    res = stats_service.record_attempt(
        question_id=req.question_id,
        topic=topic,
        selected_answer="grade_submit",
        is_correct=is_correct,
        time_seconds=req.time_seconds or 30.0,
        confidence=req.confidence or 3,
        grade=req.grade
    )
    return res


@app.post("/api/stats/algorithm")
def switch_algorithm(req: AlgorithmSwitchRequest):
    if req.algorithm not in ("SM-2", "FSRS", "Custom"):
        raise HTTPException(status_code=400, detail="Invalid algorithm. Choose SM-2, FSRS, or Custom.")
    count = stats_service.replay_all_with_algorithm(req.algorithm)
    return {
        "algorithm": req.algorithm,
        "replayed_cards": count,
        "message": f"Successfully switched to {req.algorithm} and recomputed {count} review schedules."
    }


@app.get("/api/stats/settings")
def get_settings():
    return stats_service.get_settings()


@app.post("/api/stats/settings")
def update_settings(payload: Dict[str, Any]):
    return stats_service.update_settings(payload)


@app.get("/api/stats/question/{question_id}")
def get_question_stats(question_id: str):
    return stats_service.get_question_stats(question_id)


@app.post("/api/stats/sync")
def sync_stats(payload: SyncStatsPayload):
    return stats_service.sync_from_client(payload.dict())


# ==========================================
# Analytics Endpoints
# ==========================================

@app.get("/api/analytics/error-rates")
def get_error_rates():
    return analytics_service.get_error_rates()


@app.get("/api/analytics/weak-spots")
def get_weak_spots():
    return analytics_service.get_priority_weak_spots()


@app.get("/api/analytics/consistency")
def get_consistency():
    return analytics_service.get_consistency_score()


@app.get("/api/analytics/learning-gain")
def get_learning_gain():
    return analytics_service.get_learning_gain()


@app.get("/api/analytics/time-stats")
def get_time_stats():
    return analytics_service.get_time_stats()


@app.get("/api/analytics/confidence-calibration")
def get_confidence_calibration():
    return analytics_service.get_confidence_calibration()


@app.get("/api/analytics/heatmap")
def get_heatmap(interval: str = Query("week", pattern="^(day|week|month)$")):
    return analytics_service.get_heatmap(interval)


# ==========================================
# Data Export and Import Endpoints (Task 23)
# ==========================================

@app.get("/api/data/export")
def export_user_data():
    content = json.dumps(stats_service.data, indent=2, ensure_ascii=False)
    filename = f"slackr_stats_{os.environ.get('USER', 'backup')}.json"
    return Response(
        content=content,
        media_type="application/json",
        headers={"Content-Disposition": f"attachment; filename={filename}"}
    )


@app.post("/api/data/import")
async def import_user_data(
    file: UploadFile = File(...),
    strategy: str = Query("merge", pattern="^(merge|replace)$")
):
    try:
        content = await file.read()
        parsed = json.loads(content.decode("utf-8"))
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Invalid JSON file: {str(e)}")

    if strategy == "replace":
        stats_service.data = parsed
        stats_service._save()
        return {"status": "success", "message": "All statistics replaced from backup file."}
    else:
        res = stats_service.sync_from_client(parsed)
        return {"status": "success", "message": "Statistics merged successfully.", "details": res}
