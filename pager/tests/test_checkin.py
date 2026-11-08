"""The check-in on the pager: wording, every screen, every answer and the report body.

    python -m unittest discover -s pager/tests        (from the repository root)
"""

import json
import os
import re
import sys
import unittest

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.join(HERE, "..", "..")
sys.path.insert(0, os.path.join(HERE, "..", "python"))
sys.path.insert(0, os.path.join(HERE, "..", "tools"))

import checkin  # noqa: E402
import fake_recheck as fake  # noqa: E402
from checkin import CONFIRM, LEFT, RIGHT, UNSURE, WIDTH, Flow  # noqa: E402

PROMPT = {"prompt_id": "p-1", "show_ms": 1000, "gap_ms": 500, "expires_at": "2026-11-08T15:15:00+00:00",
          "steps": [{"shape": "circle", "x": 0.0, "y": 0.0}, {"shape": "square", "x": 1.0, "y": 1.0},
                    {"shape": "circle", "x": 0.5, "y": 0.5}]}


def assert_fits(testcase, lines):
    testcase.assertLessEqual(len(lines), 8, lines)
    for line in lines:
        line = str(line)
        width = len(line) - 1 if line.startswith(">") else len(line)
        testcase.assertLessEqual(width, WIDTH, repr(line))
        testcase.assertTrue(all(32 <= ord(c) < 127 for c in line), repr(line))


def every_item():
    """Every follow-up question in the bank, as the server sends it."""
    return [fake.question_item(key) for key in fake.FOLLOW_UP]


def walk_screens(testcase, flow):
    """Draw the current question at every cursor position."""
    for i in range(len(flow.entries())):
        flow.cursor = i
        assert_fits(testcase, flow.lines())


class Wording(unittest.TestCase):
    """The fixed questions are written into checkin.py; they must say what the bank says."""

    def test_base_questions_match_the_bank(self):
        for key, text in checkin.BASE_TEXT.items():
            self.assertEqual(fake.ITEMS[key]["text"], text, key)

    def test_options_match_the_bank(self):
        for key, options in (("feeling_now", checkin.FEELING_NOW), ("feeling_change", checkin.FEELING_CHANGE),
                             ("new_findings", checkin.FINDINGS)):
            bank = [(o["valueCoding"]["code"], o["valueCoding"]["display"]) for o in fake.ITEMS[key]["answerOption"]]
            self.assertEqual(bank, options, key)
        self.assertEqual(fake._ext(fake.ITEMS["new_findings"], "none-option"), checkin.NONE_OF_THESE)

    def test_the_bank_order_is_the_pager_order(self):
        base = [i["linkId"] for i in fake.ITEMS["base"]["item"]]
        self.assertEqual(base, [q.key for q in checkin.base_questions(with_circle=True)])

    def test_urgent_signs_match_the_server_and_the_phone(self):
        with open(os.path.join(ROOT, "web", "src", "lib", "findings.ts"), encoding="utf-8") as f:
            web = f.read().split("export const URGENT_FINDINGS")[1].split("= [")[1].split("]")[0]
        with open(os.path.join(ROOT, "api", "src", "recheck", "rules.py"), encoding="utf-8") as f:
            api = f.read().split("URGENT_FINDINGS = frozenset({")[1].split("})")[0]
        self.assertEqual(set(re.findall(r"'([a-z_]+)'", web)), set(checkin.URGENT_FINDINGS))
        self.assertEqual({c.lower() for c in re.findall(r"FindingCode\.([A-Z_]+)", api)}, set(checkin.URGENT_FINDINGS))
        self.assertEqual(fake.URGENT, set(checkin.URGENT_FINDINGS))

    def test_the_bank_is_ascii_and_every_title_fits(self):
        for key in list(fake.FOLLOW_UP) + list(checkin.BASE_TEXT):
            self.assertIn(key, checkin.TITLES, f"{key} needs a short title")
        for title in checkin.TITLES.values():
            self.assertLessEqual(len(title), checkin.TITLE_MAX, title)

    def test_shape_size_matches_the_sketch(self):
        with open(os.path.join(HERE, "..", "sketch", "sketch.ino"), encoding="utf-8") as f:
            self.assertIn(f"const int SHAPE_R = {checkin.SHAPE_R};", f.read())


class Screens(unittest.TestCase):
    def test_every_question_in_the_bank_fits_at_every_cursor(self):
        state = {"items": every_item(), "attention_prompt": PROMPT}
        flow = Flow(checkin.checkin_questions(state), prompt=PROMPT)
        self.assertEqual(len(flow.questions), 5 + len(fake.FOLLOW_UP))
        for index, q in enumerate(flow.questions):
            flow.index = index
            flow._enter()
            if q.kind == "multi":
                flow.ticks = [code for code, _ in q.options]        # the longest "[x]" rows
            walk_screens(self, flow)
            if q.kind == "count":
                flow.start_playing()
                assert_fits(self, flow.lines())
                flow.played()
                walk_screens(self, flow)

    def test_a_long_option_is_shown_in_full_under_the_cursor(self):
        flow = Flow(checkin.base_questions(with_circle=False))
        flow.index = 3                                  # new symptoms
        flow._enter()
        flow.fresh = False                              # as after the first press
        for i, (code, label) in enumerate(checkin.FINDINGS):
            flow.cursor = i
            lines = flow.lines()
            shown = " ".join(l[1:].replace("[ ]", "").strip() for l in lines if l.startswith(">"))
            self.assertEqual(shown, label, code)

    def test_a_new_question_opens_on_its_first_line(self):
        flow = Flow(checkin.base_questions(with_circle=False))
        flow.index = 3                                  # a long question, a long first option
        flow._enter()
        self.assertEqual(flow.lines()[1], "Since you arrived,")
        self.assertTrue(flow.lines()[5].startswith(">[ ] Speech"))
        flow.handle(RIGHT)
        flow.handle(LEFT)                               # back on it: the option shows in full
        self.assertIn(">    understand", flow.lines())

    def test_the_question_shows_above_the_first_option(self):
        flow = Flow(checkin.base_questions(with_circle=False))
        lines = flow.lines()
        self.assertEqual(lines[1:4], ("How are you feeling", "right now?", " Very good"))
        flow.cursor = 0
        self.assertEqual(flow.lines()[1], "How are you feeling")

    def test_pain_is_a_0_to_10_scale_with_not_sure_after_10(self):
        flow = Flow(checkin.base_questions(with_circle=False))
        flow.index = 2
        flow._enter()
        self.assertIn(">       0 of 10", "\n".join(flow.lines()))
        flow.handle(LEFT)                               # can't go below 0
        self.assertIn("0 of 10", "\n".join(flow.lines()))
        for _ in range(10):
            flow.handle(RIGHT)
        self.assertIn("more > : Not sure", flow.lines())
        flow.handle(RIGHT)
        self.assertIn(">", flow.lines()[5])
        self.assertIn("Not sure", flow.lines()[5])
        for _ in range(9):
            flow.handle(RIGHT)                          # stops at the last choice
        self.assertIn("Back", flow.lines()[5])

    def test_the_bar_follows_the_number(self):
        flow = Flow(checkin.base_questions(with_circle=False))
        flow.index = 2
        flow._enter()
        for _ in range(4):
            flow.handle(RIGHT)
        self.assertIn("[####------]", "\n".join(flow.lines()))

    def test_next_with_nothing_ticked_says_what_to_do(self):
        flow = Flow(checkin.base_questions(with_circle=False))
        flow.index = 3
        flow._enter()
        flow.cursor = len(checkin.FINDINGS)             # Next (0 ticked)
        self.assertIsNone(flow.handle(CONFIRM))
        self.assertEqual(flow.lines()[-1], "Tick one, or None")
        self.assertEqual(flow.index, 3)

    def test_ten_questions_still_fit_the_title_bar(self):
        fake.visit["group"] = "head_injury"
        try:
            items = [fake.question_item(k) for k in fake.follow_ups({})]
        finally:
            fake.visit["group"] = "chest_back_pain"
        flow = Flow(checkin.checkin_questions({"items": items, "attention_prompt": PROMPT}), prompt=PROMPT)
        self.assertEqual(len(flow.questions), 10)
        for index in range(10):
            flow.index = index
            flow._enter()
            self.assertLessEqual(len(flow.header()), WIDTH)
            self.assertNotIn("..", flow.header())


class Answers(unittest.TestCase):
    def flow(self, items=(), prompt=None):
        state = {"items": list(items), "attention_prompt": prompt}
        return Flow(checkin.checkin_questions(state), prompt=prompt, version="v1")

    def pick(self, flow, label):
        labels = [l for l, _ in flow.entries()]
        flow.cursor = labels.index(label)
        return flow.handle(CONFIRM)

    def test_a_full_checkin(self):
        f = self.flow(items=[fake.question_item("pain_moved"), fake.question_item("pain_new_location")],
                      prompt=PROMPT)
        self.pick(f, "Poor")
        self.pick(f, "Not sure")
        f.cursor = 7
        f.handle(CONFIRM)                               # pain 7
        self.pick(f, "[ ] Vomiting")
        self.pick(f, "[ ] Hard to stay awake")
        self.pick(f, "Next (2 ticked)")
        self.pick(f, "Start")
        f.start_playing()
        f.played()
        f.cursor = 2
        f.handle(CONFIRM)                               # 2 circles
        self.pick(f, "Yes")
        self.pick(f, "[ ] Arm")
        self.assertEqual(self.pick(f, "Next (1 ticked)"), "send")
        body = f.report()
        self.assertEqual(body["purpose"], "scheduled")
        self.assertEqual(body["questionnaire_version"], "v1")
        self.assertEqual(body["feeling_now"], {"kind": "answered", "value": "poor"})
        self.assertEqual(body["feeling_change"], {"kind": "missing", "reason": "unsure"})
        self.assertEqual(body["pain"], {"kind": "answered", "value": 7})
        # In the bank's order, whatever order they were ticked in.
        self.assertEqual(body["new_findings"], {"kind": "answered", "value": ["drowsiness", "vomiting"]})
        self.assertEqual(body["attention"], {"kind": "answered", "prompt_id": "p-1", "count": 2})
        self.assertEqual(body["items"], {"pain_moved": {"kind": "yes_no", "value": True},
                                         "pain_new_location": {"kind": "multi_choice", "value": ["arm"]}})

    def test_none_of_these_is_an_empty_list_not_a_missing_answer(self):
        f = self.flow()
        f.answers.update(feeling_now="ok", feeling_change="same", pain=0)
        f.index = 3
        f._enter()
        self.assertEqual(self.pick(f, "None of these"), "send")
        self.assertEqual(f.report()["new_findings"], {"kind": "answered", "value": []})

    def test_not_sure_is_never_an_answer(self):
        f = self.flow(items=[fake.question_item("pain_moved")])
        for _ in range(4):
            self.pick(f, "Not sure")
        f.index = 4
        f._enter()
        self.pick(f, "Not sure")
        body = f.report()
        for name in ("feeling_now", "feeling_change", "pain", "new_findings"):
            self.assertEqual(body[name], {"kind": "missing", "reason": "unsure"}, name)
        self.assertEqual(body["items"]["pain_moved"], {"kind": "missing", "reason": "unsure"})

    def test_unreached_questions_are_not_reached(self):
        f = self.flow(items=[fake.question_item("pain_moved")], prompt=PROMPT)
        self.pick(f, "Good")
        body = f.report()
        for name in ("feeling_change", "pain", "new_findings"):
            self.assertEqual(body[name], {"kind": "missing", "reason": "not_reached"}, name)
        self.assertEqual(body["attention"], {"kind": "missing", "reason": "not_reached"})   # never shown: no id
        self.assertEqual(body["items"], {"pain_moved": {"kind": "missing", "reason": "not_reached"}})

    def test_an_urgent_sign_sends_now(self):
        f = self.flow(items=[fake.question_item("pain_moved")], prompt=PROMPT)
        f.index = 3
        f._enter()
        self.pick(f, "[ ] Harder to breathe")
        self.assertIn("Send now (1 ticked)", [l for l, _ in f.entries()])
        self.assertEqual(self.pick(f, "Send now (1 ticked)"), "send")

    def test_a_sign_that_is_not_urgent_alone_goes_on(self):
        f = self.flow(prompt=PROMPT)
        f.index = 3
        f._enter()
        self.pick(f, "[ ] Vomiting")
        self.assertIsNone(self.pick(f, "Next (1 ticked)"))
        self.assertEqual(f.question.key, "circle_count")

    def test_the_circle_check_answers(self):
        cases = {
            "I can't do this": {"kind": "missing", "reason": "unable_to_respond", "prompt_id": "p-1"},
        }
        for label, expected in cases.items():
            f = self.flow(prompt=PROMPT)
            f.index = 4
            f._enter()
            self.pick(f, label)
            self.assertEqual(f.report()["attention"], expected)
        f = self.flow(prompt=PROMPT)
        f.index = 4
        f._enter()
        f.start_playing()
        f.played()
        self.pick(f, "Not sure")
        self.assertEqual(f.report()["attention"], {"kind": "missing", "reason": "unsure", "prompt_id": "p-1"})
        f = self.flow(prompt=PROMPT)
        f.index = 4
        f._enter()
        f.start_playing()
        f.handle(LEFT)                                  # stopped while the shapes played
        self.assertEqual(f.report()["attention"],
                         {"kind": "missing", "reason": "unable_to_respond", "prompt_id": "p-1"})

    def test_the_count_goes_to_20_then_the_other_choices(self):
        f = self.flow(prompt=PROMPT)
        f.index = 4
        f._enter()
        f.start_playing()
        f.played()
        for _ in range(25):
            f.handle(RIGHT)
        self.assertEqual([l for l, _ in f.entries()][f.cursor], "I can't do this")
        f.cursor = 20
        f.handle(CONFIRM)
        self.assertEqual(f.report()["attention"]["count"], 20)

    def test_back_steps_over_a_finished_circle_check(self):
        f = self.flow(items=[fake.question_item("pain_moved")], prompt=PROMPT)
        f.index = 4
        f._enter()
        self.pick(f, "I can't do this")
        self.assertEqual(f.question.key, "pain_moved")
        self.pick(f, "Back")
        self.assertEqual(f.question.key, "new_findings")

    def test_back_keeps_the_answer_under_the_cursor(self):
        f = self.flow()
        self.pick(f, "Very poor")
        self.pick(f, "Back")
        self.assertEqual(f.entries()[f.cursor][0], "Very poor")

    def test_stop_and_send_is_offered_once_something_is_answered(self):
        f = self.flow()
        self.assertNotIn("Stop and send", [l for l, _ in f.entries()])
        self.assertIn("Back", [l for l, _ in f.entries()])
        self.pick(f, "Good")
        self.pick(f, "Back")
        labels = [l for l, _ in f.entries()]
        self.assertIn("Stop and send", labels)
        self.assertNotIn("Back", labels)               # as on the phone: no leaving with answers unsent
        self.assertEqual(self.pick(f, "Stop and send"), "send")

    def test_a_followup_sends_only_its_answers(self):
        items = [fake.question_item("pain_new_location"), fake.question_item("change_started")]
        f = Flow(checkin.followup_questions({"items": items}, ["change_started", "pain_new_location"]),
                 mode="followup", version="v1")
        self.assertEqual([q.key for q in f.questions], ["change_started", "pain_new_location"])
        self.pick(f, "Less than 15 minutes ago")
        body = f.report()
        self.assertEqual(body["purpose"], "followup")
        self.assertEqual(body["items"], {"change_started": {"kind": "choice", "value": "under_15_min"}})
        for name in ("feeling_now", "feeling_change", "pain", "new_findings", "attention"):
            self.assertEqual(body[name], {"kind": "missing", "reason": "not_asked"}, name)

    def test_without_a_prompt_the_circle_check_is_not_asked(self):
        f = self.flow()
        self.assertNotIn("circle_count", [q.key for q in f.questions])
        self.assertEqual(f.report()["attention"], {"kind": "missing", "reason": "not_asked"})

    def test_an_unknown_input_type_is_left_out(self):
        qs = checkin.checkin_questions({"items": [{"key": "x", "input_type": "free_text", "text": "?"}]})
        self.assertEqual(len(qs), 4)


class CircleShapes(unittest.TestCase):
    def test_every_shape_is_fully_on_screen(self):
        spec = checkin.play_spec(PROMPT)
        head, *shapes = spec.split(";")
        self.assertEqual(head, "600,1000,500")
        self.assertEqual([s[0] for s in shapes], ["C", "S", "C"])
        for s in shapes:
            _, x, y = s.split(",")
            x, y = int(x), int(y)
            self.assertTrue(checkin.SHAPE_R <= x <= 127 - checkin.SHAPE_R, x)
            self.assertTrue(checkin.SHAPE_R <= y <= 63 - checkin.SHAPE_R, y)

    def test_play_time_is_the_lead_plus_each_shape_and_gap(self):
        self.assertEqual(checkin.play_ms(PROMPT), 600 + 3 * 1500)

    def test_the_fake_server_prompt_is_like_the_real_one(self):
        p = fake.new_prompt()
        circles = sum(s["shape"] == "circle" for s in p["steps"])
        self.assertEqual(circles, p["expected"])
        self.assertTrue(4 <= circles <= 8)
        self.assertEqual((p["show_ms"], p["gap_ms"]), (1000, 500))


class Text(unittest.TestCase):
    def test_wrap_and_cut(self):
        self.assertEqual(checkin.wrap("How are you feeling right now?"), ["How are you feeling", "right now?"])
        self.assertEqual(checkin.wrap("x" * 25), ["x" * 21, "xxxx"])
        self.assertEqual(checkin.cut("Speech is different or hard"), "Speech is differen..")

    def test_non_ascii_becomes_ascii(self):
        s = "".join(map(chr, [0x2019, 0x2014, 0xE9]))
        self.assertEqual(checkin.ascii_text(s), "'-?")


if __name__ == "__main__":
    unittest.main()
