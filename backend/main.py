import asyncio
import json
import os
from urllib.parse import urljoin
from urllib.request import urlopen
from pathlib import Path
from typing import Dict, Any, List, Optional

from fastapi import FastAPI, HTTPException, Query, UploadFile, File, Response, Request
from fastapi.responses import JSONResponse
import hmac
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
FRONTEND_DATA_DIR = BASE_DIR / "../frontend/public/data"
# The committed question bank lives in the frontend bundle; the backend copy is a local build artifact
QUESTIONS_INDEX_PATH = next(
    (p for p in (DATA_DIR / "questions_index.json", FRONTEND_DATA_DIR / "questions_index.json") if p.exists()),
    DATA_DIR / "questions_index.json",
)
FILES_DIR = DATA_DIR / "pelnets" / "Files"

# Two modes:
# - Local (default): single-user companion API, reads/writes JSON files, CORS open for the Vite dev server.
# - Hosted (Vercel, or SLACKR_HOSTED=1): multi-visitor and read-only filesystem. Personal stats
#   endpoints are disabled because the stats store is one shared file with no per-user isolation;
#   per-user progress belongs in Supabase. Content edits require the admin token.
IS_HOSTED = bool(os.environ.get("VERCEL")) or os.environ.get("SLACKR_HOSTED") == "1"
ADMIN_TOKEN = os.environ.get("SLACKR_ADMIN_TOKEN", "")
_origins = [o.strip() for o in os.environ.get("ALLOWED_ORIGINS", "").split(",") if o.strip()]
ALLOWED_ORIGINS = _origins or ([] if IS_HOSTED else ["*"])

PERSONAL_DATA_PREFIXES = (
    "/api/attempts",
    "/api/spaced-repetition",
    "/api/stats",
    "/api/analytics",
    "/api/data",
)

app = FastAPI(
    title="SLACKR - PHILNITS Exam Reviewer API",
    description="Offline-first exam reviewer and spaced repetition platform",
    version="1.0.0"
)

# Same-origin on Vercel needs no CORS; set ALLOWED_ORIGINS to call the API from another host
app.add_middleware(
    CORSMiddleware,
    allow_origins=ALLOWED_ORIGINS,
    allow_credentials="*" not in ALLOWED_ORIGINS,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.middleware("http")
async def block_shared_personal_data(request: Request, call_next):
    if IS_HOSTED and request.url.path.startswith(PERSONAL_DATA_PREFIXES):
        return JSONResponse(
            status_code=503,
            content={"detail": "Personal stats are stored on your device in hosted mode. Cloud sync is not enabled yet."},
        )
    # Serverless platforms may skip ASGI startup events, so load the question bank on first use
    if not questions_db and request.url.path.startswith("/api/"):
        await asyncio.to_thread(load_questions)
    return await call_next(request)


def require_admin(request: Request) -> None:
    """Content edits: open in local mode unless a token is configured; hosted mode always needs the token."""
    if not ADMIN_TOKEN:
        if IS_HOSTED:
            raise HTTPException(status_code=403, detail="Editing is disabled on this deployment.")
        return
    supplied = request.headers.get("authorization", "").removeprefix("Bearer ").strip()
    if not hmac.compare_digest(supplied, ADMIN_TOKEN):
        raise HTTPException(status_code=403, detail="Admin token required.")


def write_json(path: Path, payload: Dict[str, Any]) -> None:
    try:
        path.parent.mkdir(parents=True, exist_ok=True)
        with open(path, "w", encoding="utf-8") as f:
            json.dump(payload, f, indent=2, ensure_ascii=False)
    except OSError:
        # Hosted filesystems are read-only; persistence for admin edits will move to Supabase
        raise HTTPException(status_code=503, detail="This deployment cannot save files.")


# Mount Static Files for diagram screenshots
if FILES_DIR.exists():
    app.mount("/files", StaticFiles(directory=str(FILES_DIR)), name="files")

# In-memory question database
questions_db: Dict[str, Any] = {}
stats_service: StatsService = StatsService()
analytics_service: AnalyticsService = AnalyticsService(stats_service)


@app.on_event("startup")
def startup_event():
    load_questions()


def load_questions() -> None:
    """Fill questions_db once.

    Local runs read the index file next to the backend (or the frontend copy). On Vercel the
    backend service is deployed from backend/ alone, so it fetches the frontend service's bundled
    copy over the FRONTEND_URL service binding (injected by Vercel at runtime, never set by hand).
    """
    if questions_db:
        return
    data: Optional[Dict[str, Any]] = None
    if QUESTIONS_INDEX_PATH.exists():
        with open(QUESTIONS_INDEX_PATH, "r", encoding="utf-8") as f:
            data = json.load(f)
    elif os.environ.get("FRONTEND_URL"):
        url = urljoin(os.environ["FRONTEND_URL"].rstrip("/") + "/", "data/questions_index.json")
        try:
            with urlopen(url, timeout=20) as res:
                data = json.load(res)
        except (OSError, ValueError) as exc:
            print(f"Warning: could not fetch the question bank from the frontend service: {exc}")
    if data:
        questions_db.update(data)
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


# ==========================================
# Learning Resources Endpoints
# ==========================================

LEARNING_RESOURCES_PATH = DATA_DIR / "learning_resources.json"
FRONTEND_LEARNING_RESOURCES_PATH = BASE_DIR / "../frontend/public/data/learning_resources.json"


@app.get("/api/learning-resources")
def get_learning_resources():
    if LEARNING_RESOURCES_PATH.exists():
        with open(LEARNING_RESOURCES_PATH, "r", encoding="utf-8") as f:
            return json.load(f)
    elif FRONTEND_LEARNING_RESOURCES_PATH.exists():
        with open(FRONTEND_LEARNING_RESOURCES_PATH, "r", encoding="utf-8") as f:
            return json.load(f)
    return {"topics": {}, "questions": {}}


@app.post("/api/learning-resources")
def save_learning_resources(payload: Dict[str, Any], request: Request):
    require_admin(request)
    write_json(LEARNING_RESOURCES_PATH, payload)

    if FRONTEND_LEARNING_RESOURCES_PATH.parent.exists():
        write_json(FRONTEND_LEARNING_RESOURCES_PATH, payload)

    return {"status": "success", "message": "Saved to learning_resources.json"}


# ==========================================
# Analytical Breakdowns Endpoints
# ==========================================

ANALYTICAL_BREAKDOWNS_PATH = DATA_DIR / "analytical_breakdowns.json"
FRONTEND_ANALYTICAL_BREAKDOWNS_PATH = BASE_DIR / "../frontend/public/data/analytical_breakdowns.json"


@app.get("/api/analytical-breakdowns")
def get_analytical_breakdowns():
    if ANALYTICAL_BREAKDOWNS_PATH.exists():
        with open(ANALYTICAL_BREAKDOWNS_PATH, "r", encoding="utf-8") as f:
            return json.load(f)
    elif FRONTEND_ANALYTICAL_BREAKDOWNS_PATH.exists():
        with open(FRONTEND_ANALYTICAL_BREAKDOWNS_PATH, "r", encoding="utf-8") as f:
            return json.load(f)
    return {"questions": {}}


@app.post("/api/analytical-breakdowns")
def save_analytical_breakdowns(payload: Dict[str, Any], request: Request):
    require_admin(request)
    write_json(ANALYTICAL_BREAKDOWNS_PATH, payload)

    if FRONTEND_ANALYTICAL_BREAKDOWNS_PATH.parent.exists():
        write_json(FRONTEND_ANALYTICAL_BREAKDOWNS_PATH, payload)

    return {"status": "success", "message": "Saved to analytical_breakdowns.json"}


