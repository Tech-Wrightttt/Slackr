from datetime import datetime, timedelta, timezone
from typing import Dict, Any, Optional


class CustomSRSAlgorithm:
    """
    SLACKR Custom Spaced Repetition Algorithm.
    Incorporates topic error rate, confidence calibration, and response time.
    """

    @staticmethod
    def get_initial_state() -> Dict[str, Any]:
        return {
            "algorithm": "Custom",
            "repetition_number": 0,
            "easiness_factor": 2.5,
            "interval_days": 0,
            "next_review": datetime.now(timezone.utc).isoformat(),
            "last_review": None
        }

    @staticmethod
    def calculate_next_review(
        state: Dict[str, Any],
        is_correct: bool,
        confidence: int = 3,       # 1-5 pre-reveal confidence
        time_seconds: float = 30.0,
        topic_error_rate: float = 0.3, # 0.0 to 1.0 (higher = weaker topic)
        review_time: datetime = None
    ) -> Dict[str, Any]:
        if review_time is None:
            review_time = datetime.now(timezone.utc)

        n = state.get("repetition_number", 0)
        ef = state.get("easiness_factor", 2.5)
        interval = state.get("interval_days", 0)

        # 1. Base grade calculation
        if is_correct:
            if confidence >= 4:
                base_grade = 5
            elif confidence == 3:
                base_grade = 4
            else:
                base_grade = 3 # Lucky guess / low confidence
        else:
            if confidence >= 4:
                base_grade = 0 # Overconfident error - worst case
            elif confidence == 3:
                base_grade = 1
            else:
                base_grade = 2 # Known uncertainty

        # 2. Adjust EF
        delta_ef = 0.1 - (5 - base_grade) * (0.08 + (5 - base_grade) * 0.02)
        new_ef = max(1.3, ef + delta_ef)

        # 3. Topic weakness damping multiplier:
        # Weak topic (error_rate > 0.4) reduces interval by up to 40%
        # Strong topic (error_rate < 0.2) slightly increases interval
        topic_factor = max(0.6, min(1.2, 1.2 - topic_error_rate))

        # 4. Response time modifier:
        # If question took > 90 seconds, user hesitated -> scale factor down (0.85)
        # If question took < 20 seconds, fluent recall -> scale factor up (1.10)
        if time_seconds > 90:
            time_factor = 0.85
        elif time_seconds < 25 and is_correct:
            time_factor = 1.10
        else:
            time_factor = 1.0

        if is_correct:
            if n == 0:
                raw_interval = 1.0
            elif n == 1:
                raw_interval = 5.0
            else:
                raw_interval = max(1.0, interval * new_ef)
            new_n = n + 1
        else:
            new_n = 0
            raw_interval = 1.0

        # Apply modifiers
        final_interval = max(1, round(raw_interval * topic_factor * time_factor))
        next_review_dt = review_time + timedelta(days=final_interval)

        return {
            "algorithm": "Custom",
            "repetition_number": new_n,
            "easiness_factor": round(new_ef, 2),
            "interval_days": final_interval,
            "topic_factor": round(topic_factor, 2),
            "time_factor": round(time_factor, 2),
            "next_review": next_review_dt.isoformat(),
            "last_review": review_time.isoformat()
        }
