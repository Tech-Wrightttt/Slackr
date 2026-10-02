from typing import Dict, List, Optional, Any
from pydantic import BaseModel, Field


class QuestionSummary(BaseModel):
    id: str
    year: str
    season: str
    paper: str
    number: int
    sub_number: Optional[str] = None
    topics: List[str]
    is_image_based: bool
    fallback_choices: List[str] = Field(default_factory=list)


class QuestionDetail(BaseModel):
    id: str
    year: str
    season: str
    paper: str
    number: int
    sub_number: Optional[str] = None
    tags: List[str]
    topics: List[str]
    question: str
    options: Dict[str, str] = Field(default_factory=dict)
    fallback_choices: List[str] = Field(default_factory=list)
    correct: str
    correct_display: str
    explanation: str
    image_paths: List[str] = Field(default_factory=list)
    all_images: List[str] = Field(default_factory=list)
    is_image_based: bool
    created: Optional[str] = ""


class CustomQuestionsRequest(BaseModel):
    question_ids: List[str]


class AttemptRecord(BaseModel):
    question_id: str
    topic: str
    selected_answer: str
    is_correct: bool
    time_seconds: float
    confidence: int = 3  # 1 to 5 scale
    timestamp: str  # ISO string


class SRGradeRequest(BaseModel):
    question_id: str
    grade: int  # 0-5 for SM2, 1-4 for FSRS, 0-5 for Custom
    time_seconds: Optional[float] = 0.0
    confidence: Optional[int] = 3


class AlgorithmSwitchRequest(BaseModel):
    algorithm: str  # "SM-2", "FSRS", "Custom"


class SyncStatsPayload(BaseModel):
    settings: Dict[str, Any] = Field(default_factory=dict)
    attempts: List[Dict[str, Any]] = Field(default_factory=list)
    sr_schedules: Dict[str, Any] = Field(default_factory=dict)
    topic_stats: Dict[str, Any] = Field(default_factory=dict)
