import math
from datetime import datetime, timedelta, timezone
from collections import defaultdict
from typing import Dict, Any, List, Optional
from parsers.markdown_parser import REGISTERED_TOPICS


class AnalyticsService:
    def __init__(self, stats_service):
        self.stats = stats_service

    def _get_attempts(self) -> List[Dict[str, Any]]:
        return self.stats.data.get("attempts", [])

    def get_error_rates(self) -> List[Dict[str, Any]]:
        """Calculate error rates by topic."""
        topic_totals = defaultdict(lambda: {"total": 0, "correct": 0, "time_total": 0.0})
        for att in self._get_attempts():
            topic = att.get("topic", "software")
            topic_totals[topic]["total"] += 1
            if att.get("is_correct"):
                topic_totals[topic]["correct"] += 1
            topic_totals[topic]["time_total"] += att.get("time_seconds", 0)

        results = []
        for topic in REGISTERED_TOPICS:
            data = topic_totals[topic]
            total = data["total"]
            correct = data["correct"]
            incorrect = total - correct
            err_rate = round((incorrect / total * 100), 1) if total > 0 else 0.0
            avg_time = round(data["time_total"] / total, 1) if total > 0 else 0.0
            results.append({
                "topic": topic,
                "total_attempts": total,
                "correct_attempts": correct,
                "incorrect_attempts": incorrect,
                "error_rate": err_rate,
                "accuracy_rate": round(100 - err_rate, 1) if total > 0 else 0.0,
                "avg_time_seconds": avg_time
            })

        # Sort descending by error rate, then by total attempts
        results.sort(key=lambda x: (x["error_rate"], x["total_attempts"]), reverse=True)
        return results

    def get_priority_weak_spots(self) -> List[Dict[str, Any]]:
        """Rank topics needing attention based on error rate and attempt volume."""
        rates = self.get_error_rates()
        weak_spots = []
        now = datetime.now(timezone.utc)

        # Build recency lookup
        topic_last_time = {}
        for att in self._get_attempts():
            t = att.get("topic")
            ts = att.get("timestamp")
            if t and ts:
                try:
                    dt = datetime.fromisoformat(ts)
                    if t not in topic_last_time or dt > topic_last_time[t]:
                        topic_last_time[t] = dt
                except Exception:
                    pass

        for r in rates:
            if r["total_attempts"] == 0:
                continue

            err_rate = r["error_rate"] # 0-100
            # Recency factor: if attempted recently with errors, higher priority
            last_dt = topic_last_time.get(r["topic"])
            recency_factor = 1.0
            if last_dt:
                days_ago = (now - last_dt).total_seconds() / 86400.0
                if days_ago < 3:
                    recency_factor = 1.2
                elif days_ago > 14:
                    recency_factor = 0.9

            # Priority score (higher = needs more attention)
            # Factor in volume so 1 failure on 1 attempt isn't ranked above 15 failures on 20 attempts
            confidence_weight = min(1.0, r["total_attempts"] / 5.0)
            priority_score = round((err_rate * 0.7 + (r["incorrect_attempts"] * 3) * 0.3) * recency_factor * confidence_weight, 1)

            if err_rate >= 50:
                status = "critical"
            elif err_rate >= 25:
                status = "moderate"
            else:
                status = "strong"

            weak_spots.append({
                "topic": r["topic"],
                "error_rate": err_rate,
                "total_attempts": r["total_attempts"],
                "incorrect_attempts": r["incorrect_attempts"],
                "priority_score": priority_score,
                "status": status,
                "avg_time_seconds": r["avg_time_seconds"]
            })

        weak_spots.sort(key=lambda x: x["priority_score"], reverse=True)
        return weak_spots

    def get_consistency_score(self) -> Dict[str, Any]:
        """Calculates performance stability and variance over time."""
        attempts = self._get_attempts()
        if len(attempts) < 5:
            return {
                "overall_consistency": 100.0,
                "rolling_accuracy": [],
                "status": "insufficient_data",
                "trend": "stable"
            }

        # Divide into rolling windows of 5 attempts
        window_size = 5
        rolling = []
        for i in range(len(attempts) - window_size + 1):
            window = attempts[i:i + window_size]
            acc = sum(1 for a in window if a.get("is_correct")) / window_size * 100
            rolling.append(acc)

        mean_acc = sum(rolling) / len(rolling)
        variance = sum((x - mean_acc) ** 2 for x in rolling) / len(rolling)
        std_dev = math.sqrt(variance)

        # Consistency score: 100 - (standard deviation * 2), bounded 0-100
        consistency_pct = max(0.0, min(100.0, round(100.0 - std_dev * 2, 1)))

        # Determine trend
        if len(rolling) >= 3:
            recent = sum(rolling[-3:]) / 3
            earlier = sum(rolling[:3]) / 3
            if recent > earlier + 5:
                trend = "improving"
            elif recent < earlier - 5:
                trend = "declining"
            else:
                trend = "stable"
        else:
            trend = "stable"

        return {
            "overall_consistency": consistency_pct,
            "std_deviation": round(std_dev, 2),
            "mean_accuracy": round(mean_acc, 1),
            "trend": trend,
            "status": "active"
        }

    def get_learning_gain(self) -> Dict[str, Any]:
        """Compares historical performance across time periods."""
        attempts = self._get_attempts()
        if len(attempts) < 6:
            return {
                "baseline_error_rate": 0.0,
                "recent_error_rate": 0.0,
                "improvement_percentage": 0.0,
                "most_improved_topic": None,
                "least_improved_topic": None
            }

        half = len(attempts) // 2
        first_half = attempts[:half]
        second_half = attempts[half:]

        def calc_err(atts):
            tot = len(atts)
            inc = sum(1 for a in atts if not a.get("is_correct"))
            return (inc / tot * 100) if tot > 0 else 0.0

        baseline_err = round(calc_err(first_half), 1)
        recent_err = round(calc_err(second_half), 1)
        
        # Positive improvement means error rate decreased
        improvement = round(baseline_err - recent_err, 1)

        # Improvement by topic
        topic_first = defaultdict(lambda: {"total": 0, "correct": 0})
        topic_second = defaultdict(lambda: {"total": 0, "correct": 0})

        for a in first_half:
            topic_first[a.get("topic", "software")]["total"] += 1
            if a.get("is_correct"):
                topic_first[a.get("topic", "software")]["correct"] += 1

        for a in second_half:
            topic_second[a.get("topic", "software")]["total"] += 1
            if a.get("is_correct"):
                topic_second[a.get("topic", "software")]["correct"] += 1

        topic_gains = []
        for top, data1 in topic_first.items():
            if top in topic_second and data1["total"] >= 2 and topic_second[top]["total"] >= 2:
                err1 = (data1["total"] - data1["correct"]) / data1["total"] * 100
                data2 = topic_second[top]
                err2 = (data2["total"] - data2["correct"]) / data2["total"] * 100
                gain = round(err1 - err2, 1)
                topic_gains.append({"topic": top, "gain": gain, "before_err": round(err1, 1), "after_err": round(err2, 1)})

        topic_gains.sort(key=lambda x: x["gain"], reverse=True)
        most_imp = topic_gains[0] if topic_gains else None
        least_imp = topic_gains[-1] if topic_gains else None

        return {
            "baseline_error_rate": baseline_err,
            "recent_error_rate": recent_err,
            "improvement_percentage": improvement,
            "topic_gains": topic_gains,
            "most_improved_topic": most_imp,
            "least_improved_topic": least_imp
        }

    def get_time_stats(self) -> Dict[str, Any]:
        """Calculates time spent per topic and overall."""
        attempts = self._get_attempts()
        total_time = sum(a.get("time_seconds", 0) for a in attempts)
        total_attempts = len(attempts)
        avg_time = round(total_time / total_attempts, 1) if total_attempts > 0 else 0.0

        # Fast vs medium vs slow
        under_20 = sum(1 for a in attempts if a.get("time_seconds", 0) < 20)
        between_20_60 = sum(1 for a in attempts if 20 <= a.get("time_seconds", 0) <= 60)
        over_60 = sum(1 for a in attempts if a.get("time_seconds", 0) > 60)

        # By topic
        topic_time = defaultdict(lambda: {"total_sec": 0.0, "count": 0})
        for a in attempts:
            t = a.get("topic", "software")
            topic_time[t]["total_sec"] += a.get("time_seconds", 0)
            topic_time[t]["count"] += 1

        topic_list = []
        for t, v in topic_time.items():
            topic_list.append({
                "topic": t,
                "total_time_seconds": round(v["total_sec"], 1),
                "question_count": v["count"],
                "avg_time_seconds": round(v["total_sec"] / v["count"], 1) if v["count"] > 0 else 0.0
            })
        topic_list.sort(key=lambda x: x["avg_time_seconds"], reverse=True)

        return {
            "total_time_seconds": round(total_time, 1),
            "average_time_seconds": avg_time,
            "total_questions_timed": total_attempts,
            "distribution": {
                "fast_under_20s": under_20,
                "moderate_20_60s": between_20_60,
                "slow_over_60s": over_60
            },
            "topics": topic_list
        }

    def get_confidence_calibration(self) -> Dict[str, Any]:
        """Calculates pre-reveal confidence calibration curve, Brier score, and bias indices."""
        attempts = self._get_attempts()
        valid = [a for a in attempts if "confidence" in a and a["confidence"] is not None]

        if not valid:
            return {
                "has_data": False,
                "brier_score": 0.0,
                "calibration_accuracy": 100.0,
                "overconfidence_rate": 0.0,
                "underconfidence_rate": 0.0,
                "bins": []
            }

        # Confidence bins: 1 to 5
        bins = {1: {"expected": 0.20, "label": "Wild Guess (1)"},
                2: {"expected": 0.40, "label": "Low Confidence (2)"},
                3: {"expected": 0.60, "label": "Moderate (3)"},
                4: {"expected": 0.80, "label": "Confident (4)"},
                5: {"expected": 1.00, "label": "Certain (5)"}}

        counts = {i: {"total": 0, "correct": 0} for i in range(1, 6)}
        brier_sum = 0.0

        for a in valid:
            conf = max(1, min(5, int(a.get("confidence", 3))))
            counts[conf]["total"] += 1
            is_c = 1 if a.get("is_correct") else 0
            if is_c:
                counts[conf]["correct"] += 1
            expected_prob = bins[conf]["expected"]
            brier_sum += (expected_prob - is_c) ** 2

        brier_score = round(brier_sum / len(valid), 4)

        # Overconfidence: rated 4 or 5 but incorrect
        high_conf_attempts = [a for a in valid if int(a.get("confidence", 3)) >= 4]
        high_conf_wrong = sum(1 for a in high_conf_attempts if not a.get("is_correct"))
        overconf_rate = round(high_conf_wrong / len(high_conf_attempts) * 100, 1) if high_conf_attempts else 0.0

        # Underconfidence: rated 1 or 2 but correct
        low_conf_attempts = [a for a in valid if int(a.get("confidence", 3)) <= 2]
        low_conf_right = sum(1 for a in low_conf_attempts if a.get("is_correct"))
        underconf_rate = round(low_conf_right / len(low_conf_attempts) * 100, 1) if low_conf_attempts else 0.0

        bin_list = []
        for i in range(1, 6):
            tot = counts[i]["total"]
            corr = counts[i]["correct"]
            act_acc = round(corr / tot * 100, 1) if tot > 0 else 0.0
            exp_acc = round(bins[i]["expected"] * 100, 1)
            bin_list.append({
                "confidence_level": i,
                "label": bins[i]["label"],
                "total_attempts": tot,
                "correct_attempts": corr,
                "actual_accuracy": act_acc,
                "expected_accuracy": exp_acc,
                "gap": round(act_acc - exp_acc, 1)
            })

        # Overall calibration score: 100 - mean absolute error between actual and expected
        active_bins = [b for b in bin_list if b["total_attempts"] > 0]
        if active_bins:
            mean_gap = sum(abs(b["gap"]) for b in active_bins) / len(active_bins)
            cal_accuracy = max(0.0, round(100.0 - mean_gap, 1))
        else:
            cal_accuracy = 100.0

        return {
            "has_data": True,
            "total_evaluated": len(valid),
            "brier_score": brier_score,
            "calibration_accuracy": cal_accuracy,
            "overconfidence_rate": overconf_rate,
            "underconfidence_rate": underconf_rate,
            "bins": bin_list
        }

    def get_heatmap(self, interval: str = "week") -> Dict[str, Any]:
        """
        Generate 2D matrix of topic performance grouped by time intervals.
        interval: 'day', 'week', or 'month'
        """
        attempts = self._get_attempts()
        period_data = defaultdict(lambda: defaultdict(lambda: {"total": 0, "incorrect": 0, "time": 0.0}))
        all_periods = set()

        for a in attempts:
            ts_str = a.get("timestamp")
            if not ts_str:
                continue
            try:
                dt = datetime.fromisoformat(ts_str)
                if interval == "day":
                    p_key = dt.strftime("%Y-%m-%d")
                elif interval == "month":
                    p_key = dt.strftime("%Y-%m")
                else:  # week
                    p_key = f"{dt.year}-W{dt.isocalendar()[1]:02d}"

                topic = a.get("topic", "software")
                period_data[topic][p_key]["total"] += 1
                if not a.get("is_correct"):
                    period_data[topic][p_key]["incorrect"] += 1
                period_data[topic][p_key]["time"] += a.get("time_seconds", 0)
                all_periods.add(p_key)
            except Exception:
                pass

        sorted_periods = sorted(list(all_periods))
        # If no attempts yet, supply a default period so heatmap has a column
        if not sorted_periods:
            now = datetime.now(timezone.utc)
            if interval == "day":
                sorted_periods = [now.strftime("%Y-%m-%d")]
            elif interval == "month":
                sorted_periods = [now.strftime("%Y-%m")]
            else:
                sorted_periods = [f"{now.year}-W{now.isocalendar()[1]:02d}"]

        matrix = {}
        for topic in REGISTERED_TOPICS:
            matrix[topic] = []
            for p in sorted_periods:
                cell = period_data[topic].get(p, {"total": 0, "incorrect": 0, "time": 0.0})
                tot = cell["total"]
                inc = cell["incorrect"]
                err_rate = round(inc / tot * 100, 1) if tot > 0 else None
                avg_time = round(cell["time"] / tot, 1) if tot > 0 else 0.0
                matrix[topic].append({
                    "period": p,
                    "attempt_count": tot,
                    "error_rate": err_rate,
                    "avg_time_sec": avg_time
                })

        return {
            "interval": interval,
            "periods": sorted_periods,
            "matrix": matrix
        }
