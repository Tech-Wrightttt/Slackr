import math
from datetime import datetime, timedelta, timezone
from typing import Dict, Any


class SM2Algorithm:
    """SuperMemo SM-2 Spaced Repetition Algorithm."""

    @staticmethod
    def get_initial_state() -> Dict[str, Any]:
        return {
            "algorithm": "SM-2",
            "repetition_number": 0,
            "easiness_factor": 2.5,
            "interval_days": 0,
            "next_review": datetime.now(timezone.utc).isoformat(),
            "last_review": None,
            "history": []
        }

    @staticmethod
    def calculate_next_review(state: Dict[str, Any], grade: int, review_time: datetime = None) -> Dict[str, Any]:
        """
        Grade: 0-5 (0=complete blackout, 3=pass with serious difficulty, 5=perfect recall)
        """
        if review_time is None:
            review_time = datetime.now(timezone.utc)

        grade = max(0, min(5, grade))
        n = state.get("repetition_number", 0)
        ef = state.get("easiness_factor", 2.5)
        interval = state.get("interval_days", 0)

        # Calculate new EF
        # EF' = EF + (0.1 - (5 - grade) * (0.08 + (5 - grade) * 0.02))
        new_ef = ef + (0.1 - (5 - grade) * (0.08 + (5 - grade) * 0.02))
        new_ef = max(1.3, round(new_ef, 2))

        if grade >= 3:
            if n == 0:
                new_interval = 1
            elif n == 1:
                new_interval = 6
            else:
                new_interval = max(1, round(interval * new_ef))
            new_n = n + 1
        else:
            new_n = 0
            new_interval = 1

        next_review_dt = review_time + timedelta(days=new_interval)

        return {
            "algorithm": "SM-2",
            "repetition_number": new_n,
            "easiness_factor": new_ef,
            "interval_days": new_interval,
            "next_review": next_review_dt.isoformat(),
            "last_review": review_time.isoformat()
        }
