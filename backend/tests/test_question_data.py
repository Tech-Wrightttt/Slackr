"""
Regression tests for the question data pipeline: one test per option/answer shape the parser used to
break on (found by scripts/audit_index.py), plus the build-time kind, weight and repeat labels.
"""

import pytest

from parsers.markdown_parser import parse_answer_block, parse_options_and_stem
from parsers.question_classifier import classify_kind, repeat_groups, weight_tier
from scripts.audit_index import audit_question


def options_of(stem: str) -> dict:
    return parse_options_and_stem(stem)[1]


class TestOptionShapes:
    def test_bold_choice_lines(self):
        # 2022A_FE_AM_01: every choice wrapped in **...**
        opts = options_of("Pick one.\n\n**a) AND with 00000001.**\n**b) NAND with 11111110.**\n**c) OR.**\n**d) XOR.**")
        assert opts == {"a": "AND with 00000001.", "b": "NAND with 11111110.", "c": "OR.", "d": "XOR."}

    def test_bold_opening_on_first_choice_closing_on_last(self):
        # 2018S_FE_AM_43: ** opens on a) and closes after d)
        opts = options_of("Why?\n**a) one\nb) two\nc) three\nd) four.**")
        assert opts == {"a": "one", "b": "two", "c": "three", "d": "four."}

    def test_bold_label_only(self):
        # 2019S_FE_AM_18: **a)** text
        opts = options_of("Which?\n\n**a)** $L<R$\n\n**b)** $L>R$\n\n**c)** x\n\n**d)** y")
        assert opts["a"] == "$L<R$" and len(opts) == 4

    def test_choices_on_one_line(self):
        # 2025S_FE-A_60: "a) 12,000 b) 20,000 c) 21,000 d) 36,000"
        opts = options_of("Depreciation?\na) 12,000 b) 20,000 c) 21,000 d) 36,000")
        assert opts == {"a": "12,000", "b": "20,000", "c": "21,000", "d": "36,000"}

    def test_last_two_choices_merged(self):
        # 2024S_FE-A_11: c) and d) on one line
        opts = options_of("Foolproof?\na) one\nb) two\nc) three. d) four.")
        assert opts["c"] == "three." and opts["d"] == "four."

    def test_choice_text_on_following_lines_keeps_line_breaks(self):
        # 2016A_FE_28: "a)" alone, then two SQL lines
        opts = options_of("SQL?\n\na)\nALTER TABLE t\nDELETE COLUMN c\n\nb)\nALTER TABLE t\nDROP COLUMN c")
        assert opts["a"] == "ALTER TABLE t\nDELETE COLUMN c"
        assert opts["b"] == "ALTER TABLE t\nDROP COLUMN c"

    def test_bare_letters_under_an_image_mean_no_text_choices(self):
        # 2013S_FE_6: "a)" .. "d)" with nothing after them
        assert options_of("![q](/files/q.png)\n\na) \nb) \nc) \nd) ") == {}


class TestAnswerShapes:
    def test_single_choice(self):
        assert parse_answer_block(["c) 14.0", "", "### Explanation"])[:3] == ("c", "c) 14.0", [])

    def test_subject_b_letter_after_h(self):
        # FE-B answer groups run past h; "i)" used to be ungradable
        assert parse_answer_block(["i) 0.9"])[0] == "i"

    def test_bold_answer_label(self):
        # 2024S_FE-A_2: **Answer: C**
        assert parse_answer_block(["**Answer: C**"])[0] == "c"

    def test_comma_list_of_blanks(self):
        correct, _, blanks, used = parse_answer_block(["c, d, b, c", "", "### Explanation"])
        assert [b["correct"] for b in blanks] == ["c", "d", "b", "c"]
        assert correct == "1=c, 2=d, 3=b, 4=c" and used == 1

    def test_labelled_blanks(self):
        _, _, blanks, _ = parse_answer_block(["A=e, B=d, C=c"])
        assert blanks == [{"label": "A", "correct": "e"}, {"label": "B", "correct": "d"}, {"label": "C", "correct": "c"}]

    def test_blank_list_over_several_lines_with_subquestion_headers(self):
        # 2023A_FE-B_1
        lines = ["**Subquestion 1**", "- **A:** h) 8", "- **B:** f) 6", "", "**Subquestion 2**", "- **D:** e) 5",
                 "", "### Explanation", "text"]
        _, _, blanks, used = parse_answer_block(lines)
        assert [(b["label"], b["correct"]) for b in blanks] == [("A", "h"), ("B", "f"), ("D", "e")]
        assert lines[used:][1] == "### Explanation"

    def test_subquestion_lines(self):
        # 2022A_FE-B_1
        _, _, blanks, _ = parse_answer_block(["Subquestion 1: b) 1, 2, 3", "Subquestion 2: A: h) SQL injection, B: b) XSS"])
        assert [(b["label"], b["correct"]) for b in blanks] == [("SQ1", "b"), ("SQ2 A", "h"), ("SQ2 B", "b")]

    def test_combined_choice_text_is_one_answer(self):
        # 2024A_FE-B_11: one choice that fills two blanks
        correct, _, blanks, _ = parse_answer_block(["f) A: swap A[k] and A[k - 1], B: k ← k - 1"])
        assert correct == "f" and blanks == []

    def test_uppercase_letter_list(self):
        assert [b["correct"] for b in parse_answer_block(["B,D,D"])[2]] == ["b", "d", "d"]


def q(**kw):
    base = {"paper": "AM", "topics": ["software"], "question": "", "options": {}}
    base.update(kw)
    return base


class TestKind:
    @pytest.mark.parametrize(
        "question",
        [
            q(paper="FE-B"),
            q(topics=["algorithms"]),
            q(question="What is the minimum number of comparisons?"),
            q(question="The program below runs.\n```\nx ← 1\n```"),
            q(question="Which is the response time when the line speed is 64 kbps?"),
            q(question="Which is right?", options={"a": "2.5", "b": "2.75", "c": "2.875", "d": "3"}),
        ],
    )
    def test_solving(self, question):
        assert classify_kind(question) == "solving"

    @pytest.mark.parametrize(
        "question",
        [
            q(question="Which of the following is an appropriate explanation of a divisional organization?",
              options={"a": "A share of profit", "b": "Business operations", "c": "The needs", "d": "The org"}),
            q(question="Which of the following is a back door?", options={"a": "A LAN port", "b": "A tool"}),
        ],
    )
    def test_recall(self, question):
        assert classify_kind(question) == "recall"

    def test_weight_tiers(self):
        assert weight_tier(q(paper="PM"), "solving") == 3
        assert weight_tier(q(question="The pseudocode below sorts."), "solving") == 3
        assert weight_tier(q(question="How many hosts?"), "solving") == 2
        assert weight_tier(q(), "recall") == 1


class TestRepeats:
    def test_similar_stems_from_different_years_group(self):
        stem = "Which of the following is subject to system audits that evaluate and verify internal controls related to IT?"
        qs = {
            "A": {"question": stem, "year": "2016", "session_id": "s1"},
            "B": {"question": stem.replace("controls", "control"), "year": "2022", "session_id": "s2"},
            "C": {"question": "Which protocol automatically configures host addresses on a network segment here?",
                  "year": "2018", "session_id": "s3"},
        }
        # Unrelated stems give the shared words a realistic weight (in a 3-stem corpus nothing is rare)
        fillers = ["page replacement method virtual memory LRU control explanation",
                   "decision table design technique system development description",
                   "module coupling weakened increase independence method",
                   "binary search minimum number comparisons series data",
                   "cost plus pricing description determines product price"]
        for i, text in enumerate(fillers):
            qs[f"F{i}"] = {"question": text, "year": "2010", "session_id": f"f{i}"}
        groups = repeat_groups(qs)
        assert groups["A"][0] == groups["B"][0] is not None
        assert groups["A"][1] == 2
        assert groups["C"] == (None, 1)

    def test_same_sitting_never_counts_as_a_repeat(self):
        stem = "Which of the following is the most appropriate description of the blank in the program shown?"
        qs = {"A": {"question": stem, "year": "2016", "session_id": "s1"},
              "B": {"question": stem, "year": "2016", "session_id": "s1"}}
        assert repeat_groups(qs)["A"] == (None, 1)


class TestAudit:
    def test_clean_question_passes(self):
        assert audit_question({"options": {"a": "1", "b": "2", "c": "3", "d": "$145"}, "correct": "b"}) == []

    def test_flags(self):
        assert "ungradable" in audit_question({"options": {}, "is_image_based": True, "correct": "![x](/files/x.png)"})
        assert "correct_missing" in audit_question({"options": {"a": "x", "b": "y", "c": "z", "d": "w"}, "correct": "e"})
        assert "leftover_markdown" in audit_question({"options": {"a": "$x", "b": "y", "c": "z", "d": "w"}, "correct": "a"})
        assert audit_question({"options": {}, "is_image_based": True, "correct": "", "fallback_choices": list("abcdefgh"),
                               "blanks": [{"label": "A", "correct": "h"}]}) == []
