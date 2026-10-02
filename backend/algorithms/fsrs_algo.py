from datetime import datetime, timezone
from typing import Dict, Any, List, Optional
try:
    from fsrs import Scheduler, Card, Rating, State
    HAS_FSRS = True
except ImportError:
    HAS_FSRS = False


class FSRSAlgorithm:
    """Free Spaced Repetition Scheduler (FSRS) wrapper."""

    def __init__(self, desired_retention: float = 0.90):
        self.desired_retention = desired_retention
        if HAS_FSRS:
            self.scheduler = Scheduler(desired_retention=desired_retention)
        else:
            self.scheduler = None

    def get_initial_state(self) -> Dict[str, Any]:
        return {
            "algorithm": "FSRS",
            "stability": 0.0,
            "difficulty": 0.0,
            "reps": 0,
            "lapses": 0,
            "state": "New",
            "interval_days": 0,
            "next_review": datetime.now(timezone.utc).isoformat(),
            "last_review": None
        }

    def _map_grade_to_rating(self, grade: int):
        """Map 1-4 or 0-5 integer grade to FSRS Rating."""
        if not HAS_FSRS:
            return None
        # If grade in 0-5 scale: 0-1 -> Again, 2 -> Hard, 3-4 -> Good, 5 -> Easy
        if grade <= 1:
            return Rating.Again
        elif grade == 2:
            return Rating.Hard
        elif grade in (3, 4):
            return Rating.Good
        else:
            return Rating.Easy

    def calculate_next_review(self, state: Dict[str, Any], grade: int, review_time: datetime = None) -> Dict[str, Any]:
        if review_time is None:
            review_time = datetime.now(timezone.utc)
            
        if not HAS_FSRS:
            # Fallback to simple stability model if fsrs not available
            stab = state.get("stability", 1.0) or 1.0
            if grade >= 3:
                stab = stab * 2.2
                interval = max(1, round(stab))
            else:
                stab = 1.0
                interval = 1
            next_dt = review_time
            from datetime import timedelta
            next_dt = next_dt + timedelta(days=interval)
            return {
                "algorithm": "FSRS",
                "stability": round(stab, 3),
                "difficulty": 5.0,
                "reps": state.get("reps", 0) + 1,
                "lapses": state.get("lapses", 0) + (1 if grade < 3 else 0),
                "state": "Review",
                "interval_days": interval,
                "next_review": next_dt.isoformat(),
                "last_review": review_time.isoformat()
            }

        # Build Card from state
        card = Card()
        if state.get("state") == "Review" and state.get("stability", 0) > 0:
            card.stability = float(state.get("stability", 0))
            card.difficulty = float(state.get("difficulty", 5.0))
            card.reps = int(state.get("reps", 0))
            card.lapses = int(state.get("lapses", 0))
            card.state = State.Review
            if state.get("last_review"):
                try:
                    card.last_review = datetime.fromisoformat(state["last_review"])
                except Exception:
                    card.last_review = review_time

        rating = self._map_grade_to_rating(grade)
        updated_card, review_log = self.scheduler.review_card(card, rating, review_time)

        # Calculate interval in days
        interval_days = max(1, round((updated_card.due - review_time).total_seconds() / 86400.0))
        reps = int(state.get("reps", 0)) + 1
        lapses = int(state.get("lapses", 0)) + (1 if rating == Rating.Again else 0)
        
        return {
            "algorithm": "FSRS",
            "stability": round(float(updated_card.stability), 4),
            "difficulty": round(float(updated_card.difficulty), 4),
            "reps": reps,
            "lapses": lapses,
            "state": updated_card.state.name if hasattr(updated_card.state, 'name') else str(updated_card.state),
            "interval_days": interval_days,
            "next_review": updated_card.due.isoformat(),
            "last_review": review_time.isoformat()
        }

    def replay_history(self, attempts: List[Dict[str, Any]]) -> Dict[str, Any]:
        """Recompute FSRS schedule by replaying all historical attempts."""
        curr_state = self.get_initial_state()
        for att in attempts:
            ts_str = att.get("timestamp")
            dt = datetime.fromisoformat(ts_str) if ts_str else datetime.now(timezone.utc)
            # determine grade
            is_correct = att.get("is_correct", True)
            conf = att.get("confidence", 3)
            # synthesize grade from correctness + confidence if raw grade not stored
            if "grade" in att:
                grade = att["grade"]
            elif is_correct:
                grade = 4 if conf >= 4 else 3
            else:
                grade = 1 if conf >= 4 else 2
            curr_state = self.calculate_next_review(curr_state, grade, dt)
        return curr_state
