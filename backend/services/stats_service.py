import json
import os
from pathlib import Path
from datetime import datetime, timezone
from typing import Dict, Any, List, Optional

from algorithms.sm2 import SM2Algorithm
from algorithms.fsrs_algo import FSRSAlgorithm
from algorithms.custom import CustomSRSAlgorithm

STATS_FILE = Path(__file__).resolve().parent.parent / "data" / "user_stats.json"


class StatsService:
    def __init__(self, stats_path: Path = STATS_FILE):
        self.stats_path = stats_path
        self._load()

    def _default_stats(self) -> Dict[str, Any]:
        return {
            "settings": {
                "spaced_repetition_algorithm": "SM-2",
                "confidence_tracking_enabled": True,
                "auto_advance": False,
                "show_timer": True,
                "default_session_length": 20
            },
            "attempts": [],
            "question_history": {},
            "topic_stats": {}
        }

    def _load(self):
        if self.stats_path.exists():
            try:
                with open(self.stats_path, "r", encoding="utf-8") as f:
                    self.data = json.load(f)
            except Exception:
                self.data = self._default_stats()
        else:
            self.data = self._default_stats()
            self._save()

    def _save(self):
        self.stats_path.parent.mkdir(parents=True, exist_ok=True)
        with open(self.stats_path, "w", encoding="utf-8") as f:
            json.dump(self.data, f, indent=2, ensure_ascii=False)

    def get_settings(self) -> Dict[str, Any]:
        return self.data.setdefault("settings", {
            "spaced_repetition_algorithm": "SM-2",
            "confidence_tracking_enabled": True
        })

    def update_settings(self, updates: Dict[str, Any]) -> Dict[str, Any]:
        self.data.setdefault("settings", {}).update(updates)
        self._save()
        return self.data["settings"]

    def record_attempt(
        self,
        question_id: str,
        topic: str,
        selected_answer: str,
        is_correct: bool,
        time_seconds: float,
        confidence: int = 3,
        grade: Optional[int] = None
    ) -> Dict[str, Any]:
        now_iso = datetime.now(timezone.utc).isoformat()
        
        # Determine grade if not explicitly passed
        if grade is None:
            if is_correct:
                grade = 5 if confidence >= 4 else (4 if confidence == 3 else 3)
            else:
                grade = 0 if confidence >= 4 else (1 if confidence == 3 else 2)

        attempt_entry = {
            "question_id": question_id,
            "topic": topic,
            "selected_answer": selected_answer,
            "is_correct": is_correct,
            "time_seconds": round(time_seconds, 1),
            "confidence": confidence,
            "grade": grade,
            "timestamp": now_iso
        }

        self.data.setdefault("attempts", []).append(attempt_entry)

        # Update topic stats
        t_stats = self.data.setdefault("topic_stats", {}).setdefault(topic, {
            "total_attempts": 0,
            "correct_attempts": 0,
            "total_time_seconds": 0.0,
            "last_attempt": now_iso
        })
        t_stats["total_attempts"] += 1
        if is_correct:
            t_stats["correct_attempts"] += 1
        t_stats["total_time_seconds"] += round(time_seconds, 1)
        t_stats["last_attempt"] = now_iso

        # Update Spaced Repetition for this question
        q_hist = self.data.setdefault("question_history", {}).setdefault(question_id, {
            "attempts": [],
            "sr_data": None
        })
        q_hist["attempts"].append(attempt_entry)

        algo = self.data.get("settings", {}).get("spaced_repetition_algorithm", "SM-2")
        curr_sr = q_hist.get("sr_data") or self._initial_sr(algo)

        # Calculate error rate of topic for custom algorithm
        topic_err = 0.3
        if t_stats["total_attempts"] > 0:
            topic_err = (t_stats["total_attempts"] - t_stats["correct_attempts"]) / t_stats["total_attempts"]

        updated_sr = self._compute_sr_update(
            algo, curr_sr, grade, is_correct, confidence, time_seconds, topic_err
        )
        q_hist["sr_data"] = updated_sr

        self._save()
        return {
            "attempt": attempt_entry,
            "sr_data": updated_sr,
            "topic_stats": t_stats
        }

    def _initial_sr(self, algo: str) -> Dict[str, Any]:
        if algo == "FSRS":
            return FSRSAlgorithm().get_initial_state()
        elif algo == "Custom":
            return CustomSRSAlgorithm.get_initial_state()
        return SM2Algorithm.get_initial_state()

    def _compute_sr_update(
        self,
        algo: str,
        state: Dict[str, Any],
        grade: int,
        is_correct: bool,
        confidence: int,
        time_seconds: float,
        topic_error_rate: float
    ) -> Dict[str, Any]:
        if algo == "FSRS":
            fsrs_inst = FSRSAlgorithm()
            return fsrs_inst.calculate_next_review(state, grade)
        elif algo == "Custom":
            return CustomSRSAlgorithm.calculate_next_review(
                state, is_correct, confidence, time_seconds, topic_error_rate
            )
        else: # SM-2
            return SM2Algorithm.calculate_next_review(state, grade)

    def replay_all_with_algorithm(self, target_algo: str) -> int:
        """Replay all historical attempts through the new scheduler."""
        self.data.setdefault("settings", {})["spaced_repetition_algorithm"] = target_algo
        q_hist = self.data.get("question_history", {})
        replayed_count = 0

        fsrs_inst = FSRSAlgorithm() if target_algo == "FSRS" else None

        for q_id, q_record in q_hist.items():
            attempts = q_record.get("attempts", [])
            if not attempts:
                continue

            # Start fresh state
            curr_sr = self._initial_sr(target_algo)
            for att in attempts:
                dt_str = att.get("timestamp")
                dt = datetime.fromisoformat(dt_str) if dt_str else datetime.now(timezone.utc)
                grade = att.get("grade", 4 if att.get("is_correct") else 1)
                is_correct = att.get("is_correct", True)
                conf = att.get("confidence", 3)
                time_sec = att.get("time_seconds", 30.0)
                
                if target_algo == "FSRS":
                    curr_sr = fsrs_inst.calculate_next_review(curr_sr, grade, dt)
                elif target_algo == "Custom":
                    curr_sr = CustomSRSAlgorithm.calculate_next_review(
                        curr_sr, is_correct, conf, time_sec, 0.3, dt
                    )
                else: # SM-2
                    curr_sr = SM2Algorithm.calculate_next_review(curr_sr, grade, dt)
            
            q_record["sr_data"] = curr_sr
            replayed_count += 1

        self._save()
        return replayed_count

    def get_due_questions(self, questions_index: Dict[str, Any]) -> List[Dict[str, Any]]:
        now_dt = datetime.now(timezone.utc)
        due_list = []
        q_hist = self.data.get("question_history", {})

        for q_id, q_record in q_hist.items():
            sr = q_record.get("sr_data")
            if not sr:
                continue
            next_rev_str = sr.get("next_review")
            if not next_rev_str:
                continue
            try:
                next_rev_dt = datetime.fromisoformat(next_rev_str)
                if next_rev_dt <= now_dt:
                    q_meta = questions_index.get(q_id)
                    due_list.append({
                        "question_id": q_id,
                        "sr_data": sr,
                        "question": q_meta
                    })
            except Exception:
                pass

        # Sort by urgency (earliest next_review first)
        due_list.sort(key=lambda x: x["sr_data"].get("next_review", ""))
        return due_list

    def get_question_stats(self, question_id: str) -> Dict[str, Any]:
        q_record = self.data.get("question_history", {}).get(question_id, {
            "attempts": [],
            "sr_data": None
        })
        attempts = q_record.get("attempts", [])
        total = len(attempts)
        correct = sum(1 for a in attempts if a.get("is_correct"))
        avg_time = sum(a.get("time_seconds", 0) for a in attempts) / total if total > 0 else 0
        return {
            "question_id": question_id,
            "total_attempts": total,
            "correct_attempts": correct,
            "accuracy_rate": round(correct / total, 3) if total > 0 else 0.0,
            "average_time_seconds": round(avg_time, 1),
            "attempts": attempts,
            "sr_data": q_record.get("sr_data")
        }

    def sync_from_client(self, payload: Dict[str, Any]) -> Dict[str, Any]:
        """Merge client data with server data."""
        client_attempts = payload.get("attempts", [])
        # Merge attempts based on timestamp + question_id
        existing_keys = {(a["question_id"], a.get("timestamp")) for a in self.data.get("attempts", [])}
        new_count = 0

        for a in client_attempts:
            key = (a.get("question_id"), a.get("timestamp"))
            if key not in existing_keys:
                self.data.setdefault("attempts", []).append(a)
                existing_keys.add(key)
                new_count += 1
                
                # Update question history
                q_id = a.get("question_id")
                q_record = self.data.setdefault("question_history", {}).setdefault(q_id, {
                    "attempts": [],
                    "sr_data": None
                })
                q_record["attempts"].append(a)

                # Update topic stats
                topic = a.get("topic", "software")
                t_stats = self.data.setdefault("topic_stats", {}).setdefault(topic, {
                    "total_attempts": 0,
                    "correct_attempts": 0,
                    "total_time_seconds": 0.0,
                    "last_attempt": a.get("timestamp")
                })
                t_stats["total_attempts"] += 1
                if a.get("is_correct"):
                    t_stats["correct_attempts"] += 1
                t_stats["total_time_seconds"] += a.get("time_seconds", 0)
                t_stats["last_attempt"] = max(t_stats.get("last_attempt", ""), a.get("timestamp", ""))

        if "settings" in payload and payload["settings"]:
            self.data.setdefault("settings", {}).update(payload["settings"])

        if "sr_schedules" in payload and payload["sr_schedules"]:
            for q_id, sr in payload["sr_schedules"].items():
                self.data.setdefault("question_history", {}).setdefault(q_id, {
                    "attempts": [],
                    "sr_data": None
                })["sr_data"] = sr

        self._save()
        return {"status": "synced", "new_attempts_saved": new_count, "total_attempts": len(self.data.get("attempts", []))}
