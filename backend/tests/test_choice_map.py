"""
Exact choice letters for image-only questions, read from exam PDF text (scripts/build_choice_map.py).
The segments below copy real PDF layouts.
"""

from scripts.build_choice_map import Q_HEADING, answer_groups, heading_labels, map_card, split_numbered
from scripts.generate_index import apply_choice_map


def letters(groups):
    return [(g["labels"], "".join(g["letters"])) for g in groups]


class TestHeadings:
    def test_labels(self):
        assert heading_labels("C") == ["C"]
        assert heading_labels("D and E") == ["D", "E"]
        assert heading_labels("A, B, D and E") == ["A", "B", "D", "E"]
        assert heading_labels("B through D") == ["B", "C", "D"]

    def test_question_headings_skip_cover_lists(self):
        text = "Q1 – Q6\nQ7 ,  Q8\nQ2  2020\nQ1. Read the following.\nbody\nQ2  Read more.\nQ3.\n(1) x"
        segs = split_numbered(text, Q_HEADING, sequential=False)
        assert sorted(segs) == [1, 2, 3]
        assert segs[1].startswith("Q1. Read")


class TestGroups:
    def test_one_group_per_heading(self):
        # 2019S PM Q2 Subquestion 2
        seg = "Answer group for C\na) X\nb) Y\nc) Z\nAnswer group for D and E\na) 5\nb) 6\nc) 7\nd) 8\ne) 9\nf) 10\n"
        assert letters(answer_groups(seg)) == [(["C"], "abc"), (["D", "E"], "abcdef")]

    def test_two_columns_and_grids(self):
        # 2015May PM: one line; 2010A AM: a) c) / b) d)
        assert letters(answer_groups("Answer group for C\na)  3      b)  4      c)  5      d)  8      e)  9\n")) == [(["C"], "abcde")]
        assert letters(answer_groups("Which?\n\na)\nc)\nb)\nd)\n")) == [(None, "abcd")]

    def test_table_repeating_a_per_column(self):
        # 2022A FE-B Q2: the group for E and F prints "a)" in each table column
        seg = "Answer group for E and F\na) I\nb) II\na)\nb)\nc) III\n"
        assert letters(answer_groups(seg)) == [(["E", "F"], "abc")]

    def test_mark_missing_its_parenthesis(self):
        # 2025A FE-A Q9: "c" printed without ")"
        assert letters(answer_groups("Q9. time?\na) 20.1\nb) 25.725\nc\n30.725\nd) 74.1\n")) == [(None, "abcd")]

    def test_picture_choices_have_no_letters(self):
        assert letters(answer_groups("Answer group for A\n\nAnswer group for B\na) x\nb) y\n")) == [(["A"], ""), (["B"], "ab")]

    def test_prose_is_not_a_choice(self):
        assert answer_groups("Here f(x) is used and in case a) the value b) changes.\n") == []


def card(**kw):
    base = {"id": "X", "correct": "", "blanks": []}
    base.update(kw)
    return base


class TestCards:
    def test_single_answer_uses_last_run(self):
        entry, problems = map_card(card(correct="e"), {0: "a) 1\nb) 2\nAnswer group\na) x\nb) y\nc) z\nd) w\ne) v\nf) u\n"})
        assert entry == {"choices": list("abcdef")} and problems == []

    def test_positional_blanks_follow_label_order(self):
        # 2021S PM Q2 SQ2: groups for "B and D" and "C and E"; answers "d, b, a, d"
        seg = "Answer group for B and D\na)\nb)\nc)\nd)\ne)\nAnswer group for C and E\na)\nb)\nc)\nd)\n"
        blanks = [{"label": str(i), "correct": c} for i, c in enumerate("dbad", 1)]
        entry, _ = map_card(card(blanks=blanks), {0: seg})
        assert {k: len(v) for k, v in entry["blanks"].items()} == {"1": 5, "2": 4, "3": 5, "4": 4}

    def test_shared_unlabelled_group(self):
        # 2023A FE-B Q1: blanks A-C share "Answer group", D and E have their own
        seg = "Answer group\na) 1\nb) 2\nc) 3\nd) 4\nAnswer group for D\na) x\nb) y\nAnswer group for E\na) p\nb) q\nc) r\n"
        blanks = [{"label": lbl, "correct": "a"} for lbl in "ABCDE"]
        entry, problems = map_card(card(blanks=blanks), {0: seg})
        assert [len(entry["blanks"][x]) for x in "ABCDE"] == [4, 4, 4, 2, 3] and problems == []

    def test_subquestion_prefixed_blanks(self):
        blanks = [{"label": "SQ1", "correct": "b"}, {"label": "SQ2 A", "correct": "c"}]
        segs = {0: "", 1: "Answer group\na)\nb)\nc)\n", 2: "Answer group for A\na)\nb)\nc)\nd)\ne)\n"}
        entry, _ = map_card(card(blanks=blanks), segs)
        assert entry["blanks"] == {"SQ1": list("abc"), "SQ2 A": list("abcde")}

    def test_answer_outside_the_group_is_reported_not_mapped(self):
        entry, problems = map_card(card(blanks=[{"label": "A", "correct": "f"}]), {0: "Answer group for A\na)\nb)\nc)\n"})
        assert entry is None and "outside a-c" in problems[0]


class TestIndexMerge:
    def test_exact_letters_land_on_the_question(self, monkeypatch):
        import scripts.generate_index as gi

        monkeypatch.setattr(gi, "load_choice_map", lambda: {
            "img": {"choices": list("abcdef")},
            "pm": {"blanks": {"A": list("abc")}},
        })
        qs = {
            "img": {"options": {}, "fallback_choices": list("abcdefgh"), "blanks": []},
            "pm": {"options": {}, "fallback_choices": list("abcdefgh"), "blanks": [{"label": "A", "correct": "b"}, {"label": "B", "correct": "a"}]},
            "text": {"options": {"a": "x", "b": "y"}, "fallback_choices": ["a", "b"], "blanks": []},
        }
        assert apply_choice_map(qs) == 1
        assert qs["img"]["fallback_choices"] == list("abcdef") and qs["img"]["choices_exact"] is True
        assert qs["pm"]["blanks"][0]["choices"] == list("abc") and qs["pm"]["choices_exact"] is False
        assert qs["text"]["choices_exact"] is True
