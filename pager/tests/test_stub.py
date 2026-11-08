"""The pager's stub: in step with the question bank, and answering as the real API does.

    python -m unittest discover -s pager/tests        (from the repository root)
"""

import json
import os
import sys
import unittest
import uuid
from datetime import datetime, timedelta, timezone

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.join(HERE, "..", "..")
sys.path.insert(0, os.path.join(HERE, "..", "python"))
sys.path.insert(0, os.path.join(HERE, "..", "tools"))

import main as pager  # noqa: E402
import make_stub_bank  # noqa: E402
import stub  # noqa: E402
from main import CONFIRM, RIGHT, PagerUI  # noqa: E402

T0 = datetime(2026, 11, 8, 15, 0, tzinfo=timezone.utc)
PAGER = "42"


class Clock:
    def __init__(self):
        self.t = T0

    def __call__(self):
        return self.t


def visit(**kw):
    clock = Clock()
    return stub.StubVisit(PAGER, clock=clock, **kw), clock


def body(kind="checkin", **extra):
    b = {"submission_id": str(uuid.uuid4()), "reporter": "patient", "channel": "pager",
         "captured_at": T0.isoformat(), "kind": kind}
    if kind == "checkin":
        missing = {"kind": "missing", "reason": "not_reached"}
        b.update(purpose="scheduled", questionnaire_version=stub.VERSION, feeling_now=missing,
                 feeling_change=missing, pain=missing, new_findings=missing,
                 attention={"kind": "missing", "reason": "not_asked"}, items={})
    b.update(extra)
    return b


def answered(value):
    return {"kind": "answered", "value": value}


class InStepWithTheBank(unittest.TestCase):
    def test_stub_bank_json_is_made_from_the_current_bank(self):
        with open(make_stub_bank.BANK, encoding="utf-8") as f:
            expected = make_stub_bank.render(json.load(f))
        with open(make_stub_bank.OUT, encoding="utf-8") as f:
            self.assertEqual(f.read(), expected, "run: python pager/tools/make_stub_bank.py")

    def test_the_rules_copy_the_server(self):
        with open(os.path.join(ROOT, "api", "src", "recheck", "rules.py"), encoding="utf-8") as f:
            rules = f.read()
        self.assertIn("ComplaintGroup.CHEST_BACK_PAIN: frozenset({FindingCode.CHEST_PAIN})", rules)
        self.assertIn("ComplaintGroup.CONFUSED_DROWSY: frozenset({FindingCode.NEW_CONFUSION, FindingCode.DROWSINESS})",
                      rules)
        with open(os.path.join(ROOT, "db", "schema.sql"), encoding="utf-8") as f:
            schema = f.read()
        for ctas, minutes in stub.CTAS_MINUTES.items():
            self.assertIn(f"WHEN {ctas} THEN interval '{minutes} minutes'", schema)


class State(unittest.TestCase):
    def test_a_waiting_visit_has_the_pager_state_and_the_phone_data(self):
        v, _ = visit()
        st = v.state(PAGER)
        self.assertEqual(st["state"], "waiting")
        self.assertTrue(st["checkin_open"])
        self.assertEqual(st["waited_minutes"], 34)
        self.assertEqual(st["questionnaire_version"], stub.VERSION)
        self.assertEqual([i["key"] for i in st["items"]], ["pain_moved", "pain_sudden_worse"])
        self.assertEqual(set(st["attention_prompt"]), {"prompt_id", "steps", "show_ms", "gap_ms", "expires_at"})
        self.assertEqual(set(st), {"pager_no", "state", "server_time", "checkin_open", "next_checkin_due_at",
                                   "waited_minutes", "questionnaire_version", "items", "attention_prompt"})

    def test_the_same_prompt_until_it_expires(self):
        v, clock = visit()
        first = v.state(PAGER)["attention_prompt"]["prompt_id"]
        self.assertEqual(v.state(PAGER)["attention_prompt"]["prompt_id"], first)
        clock.t += timedelta(minutes=16)
        self.assertNotEqual(v.state(PAGER)["attention_prompt"]["prompt_id"], first)

    def test_called_for_15_minutes_then_unassigned(self):
        v, clock = visit()
        v.call()
        self.assertEqual(v.state(PAGER)["state"], "called")
        clock.t += timedelta(minutes=16)
        self.assertEqual(v.state(PAGER)["state"], "unassigned")

    def test_another_number_or_a_handed_back_pager_is_unassigned(self):
        v, _ = visit()
        self.assertEqual(v.state("7")["state"], "unassigned")
        v.unassign()
        st = v.state(PAGER)
        self.assertEqual((st["state"], st["checkin_open"], st["waited_minutes"]), ("unassigned", False, None))

    def test_follow_ups_come_from_the_complaint_group(self):
        v, _ = visit(group="head_injury")
        self.assertEqual([i["key"] for i in v.state(PAGER)["items"]],
                         ["harder_to_wake", "vomit_count", "headache_change", "seizure", "more_confused"])


class Reports(unittest.TestCase):
    def test_a_scheduled_checkin_moves_the_patient_timer_by_the_ctas_interval(self):
        v, clock = visit(ctas=4)
        code, receipt = v.report(PAGER, body())
        self.assertEqual(code, 200)
        self.assertEqual(set(receipt), {"submission_id", "received_at", "duplicate", "patient_message",
                                        "follow_up_items"})
        self.assertEqual(v.next_prompt_due_at, T0 + timedelta(minutes=60))
        self.assertEqual(v.report(PAGER, body()), (409, {"detail": stub.CHECKIN_NOT_DUE}))

    def test_a_followup_is_taken_any_time_and_never_moves_the_timer(self):
        v, _ = visit(checkin_open=False)
        due = v.next_prompt_due_at
        not_asked = {"kind": "missing", "reason": "not_asked"}
        b = body(purpose="followup", feeling_now=not_asked, feeling_change=not_asked, pain=not_asked,
                 new_findings=not_asked, items={"pain_moved": {"kind": "yes_no", "value": True}})
        self.assertEqual(v.report(PAGER, b)[0], 200)
        self.assertEqual(v.next_prompt_due_at, due)

    def test_a_retry_gets_the_same_receipt_and_a_changed_body_is_refused(self):
        v, _ = visit()
        b = body(kind="concern", concern="worried")
        first = v.report(PAGER, b)[1]
        code, again = v.report(PAGER, dict(b))
        self.assertEqual(code, 200)
        self.assertEqual({**first, "duplicate": True}, again)
        self.assertEqual(v.report(PAGER, {**b, "concern": "help_now"})[0], 409)

    def test_no_waiting_patient_is_404_and_a_wrong_channel_is_422(self):
        v, _ = visit()
        self.assertEqual(v.report(PAGER, body(channel="phone"))[0], 422)
        self.assertEqual(v.report(PAGER, body(reporter="companion"))[0], 422)
        v.unassign()
        self.assertEqual(v.report(PAGER, body(kind="leaving"))[0], 404)

    def test_items_must_be_in_the_current_bank(self):
        v, _ = visit()
        self.assertEqual(v.report(PAGER, body(questionnaire_version="old"))[0], 422)
        self.assertEqual(v.report(PAGER, body(items={"nope": {"kind": "yes_no", "value": True}}))[0], 422)
        bad = {"pain_new_location": {"kind": "multi_choice", "value": ["moon"]}}
        self.assertEqual(v.report(PAGER, body(items=bad))[0], 422)

    def test_patient_messages_follow_the_server_rules(self):
        cases = [
            (body(kind="leaving"), "leaving_info"),
            (body(kind="concern", concern="help_now"), "clinician_will_check"),
            (body(kind="concern", concern="worried"), "clinician_will_check"),
            (body(kind="concern", concern="desk_question"), "none"),
            (body(kind="finding", findings=["vomiting"]), "clinician_will_check"),
            (body(feeling_now=answered("ok"), feeling_change=answered("worse")), "none"),
            (body(feeling_now=answered("poor"), feeling_change=answered("worse")), "clinician_will_check"),
            (body(feeling_now=answered("good"), feeling_change=answered("much_worse")), "clinician_will_check"),
            (body(feeling_now=answered("very_poor"), feeling_change=answered("same")), "none"),
            (body(new_findings=answered([])), "none"),
            (body(new_findings=answered(["drowsiness"])), "clinician_will_check"),
        ]
        for b, expected in cases:
            v, _ = visit()
            self.assertEqual(v.report(PAGER, b)[1]["patient_message"], expected, b)

    def test_follow_up_items_as_the_server_names_them(self):
        v, _ = visit()
        receipt = v.report(PAGER, body(items={"pain_moved": {"kind": "yes_no", "value": True},
                                              "pain_sudden_worse": {"kind": "yes_no", "value": False}}))[1]
        self.assertEqual(receipt["follow_up_items"], ["pain_new_location", "change_started"])
        v, _ = visit()
        receipt = v.report(PAGER, body(kind="finding", findings=["speech_change"]))[1]
        self.assertEqual(receipt["follow_up_items"], ["last_known_well"])
        self.assertIn("last_known_well", [i["key"] for i in v.state(PAGER)["items"]])

    def test_the_circle_check_is_scored_once(self):
        v, _ = visit()
        p = v.state(PAGER)["attention_prompt"]
        expected = v.prompts[p["prompt_id"]]["expected"]
        att = {"kind": "answered", "prompt_id": p["prompt_id"], "count": expected}
        self.assertEqual(v.report(PAGER, body(attention=att))[0], 200)
        self.assertEqual(v.log[-1]["attention"], "correct")
        v.open_checkin()
        self.assertEqual(v.report(PAGER, body(attention=att))[1]["detail"], "attention prompt was already answered")

    def test_a_wrong_count_an_unknown_prompt_and_an_expired_one(self):
        v, clock = visit()
        p = v.state(PAGER)["attention_prompt"]
        wrong = v.prompts[p["prompt_id"]]["expected"] + 1
        v.report(PAGER, body(attention={"kind": "answered", "prompt_id": p["prompt_id"], "count": wrong}))
        self.assertEqual(v.log[-1]["attention"], "incorrect")
        v.open_checkin()
        unknown = {"kind": "answered", "prompt_id": str(uuid.uuid4()), "count": 3}
        self.assertEqual(v.report(PAGER, body(attention=unknown))[0], 422)
        p = v.state(PAGER)["attention_prompt"]
        late = (clock.t + timedelta(minutes=20)).isoformat()
        att = {"kind": "missing", "reason": "unsure", "prompt_id": p["prompt_id"]}
        self.assertEqual(v.report(PAGER, body(attention=att, captured_at=late))[0], 422)


class OnThePager(unittest.TestCase):
    def test_no_config_means_the_stub(self):
        cfg = pager.load_config(os.path.join(HERE, "no-such-config.json"))
        self.assertEqual(cfg["api_base"], "stub")
        self.assertIsInstance(pager.make_api(cfg), stub.StubApi)

    def test_a_full_checkin_against_the_stub(self):
        v, clock = visit()
        api = stub.StubApi(v, PAGER, error=pager.ApiError)
        ui = PagerUI(api, _Io(), PAGER, clock=lambda: clock.t.timestamp(), sleep=lambda s: None)
        ui.poll()
        self.assertEqual(ui.page, "checkin")
        ui.handle(CONFIRM)                                   # start
        ui.handle(CONFIRM)                                   # OK
        ui.handle(CONFIRM)                                   # About the same
        for _ in range(4):
            ui.handle(RIGHT)
        ui.handle(CONFIRM)                                   # pain 4
        ui.flow.cursor = len(pager.FINDINGS) + 1
        ui.handle(CONFIRM)                                   # None of these
        ui.handle(CONFIRM)                                   # circle check: Start
        ui.flow.played()
        for _ in range(v.prompts[v.open_prompt]["expected"]):
            ui.handle(RIGHT)
        ui.handle(CONFIRM)
        ui.handle(CONFIRM)                                   # pain moved: Yes
        ui.flow.cursor = 1
        ui.handle(CONFIRM)                                   # suddenly worse: No -> send
        self.assertEqual(v.log[-1]["attention"], "correct")
        self.assertEqual(v.log[-1]["receipt"]["follow_up_items"], ["pain_new_location", "change_started"])
        self.assertEqual(v.log[-1]["report"]["pain"], {"kind": "answered", "value": 4})
        lines, _, _ = ui.screen()
        self.assertIn(pager.MORE_QUESTIONS, lines)

    def test_a_refusal_from_the_stub_is_an_api_error(self):
        v, _ = visit(checkin_open=False, waited_minutes=0)   # first check-in due in 30 minutes
        api = stub.StubApi(v, PAGER, error=pager.ApiError)
        with self.assertRaises(pager.ApiError) as e:
            api.post_report(body())
        self.assertEqual((e.exception.status, e.exception.detail), (409, stub.CHECKIN_NOT_DUE))


class _Io:
    def show(self, *lines): ...
    def leds(self, red, green): ...
    def ack(self, n=1): ...
    def play(self, spec): ...
    def redraw(self): ...


if __name__ == "__main__":
    unittest.main()
