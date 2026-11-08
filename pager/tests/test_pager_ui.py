"""Pager screens and report bodies, with no board and no real server.

    python -m unittest discover -s pager/tests        (from the repository root)
"""

import os
import queue
import sys
import threading
import unittest
from datetime import datetime, timedelta, timezone
from http.server import ThreadingHTTPServer

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, "..", "python"))
sys.path.insert(0, os.path.join(HERE, "..", "tools"))

import checkin  # noqa: E402
import main as pager  # noqa: E402
from main import CONFIRM, LEFT, RIGHT, PagerUI  # noqa: E402

T0 = datetime(2026, 11, 8, 15, 0, tzinfo=timezone.utc)
PROMPT_ID = "6f1c2e44-0000-4000-8000-000000000001"
OTHER_ID = "6f1c2e44-0000-4000-8000-000000000002"

# QuestionItems as the server sends them (api/src/recheck/routes/patient.py: question_item).
YES_NO = {"key": "pain_moved", "input_type": "yes_no", "text": "Has the pain moved or spread somewhere new?",
          "options": [], "allow_unsure": True}
LAST_WELL = {"key": "last_known_well", "input_type": "choice",
             "text": "When were you last speaking and moving as usual?", "allow_unsure": True,
             "options": [{"code": "under_1_hr", "text": "Less than 1 hour ago"},
                         {"code": "from_1_to_3_hr", "text": "1 to 3 hours ago"},
                         {"code": "from_3_to_6_hr", "text": "3 to 6 hours ago"},
                         {"code": "over_6_hr", "text": "More than 6 hours ago"}]}


def prompt(prompt_id=PROMPT_ID, expired=False):
    """An AttentionPrompt: 2 circles and 1 square."""
    expires = T0 + (timedelta(minutes=-1) if expired else timedelta(minutes=15))
    return {"prompt_id": prompt_id, "show_ms": 1000, "gap_ms": 500, "expires_at": expires.isoformat(),
            "steps": [{"shape": "circle", "x": 0.2, "y": 0.3}, {"shape": "square", "x": 0.8, "y": 0.7},
                      {"shape": "circle", "x": 0.5, "y": 0.1}]}


def state(kind="waiting", checkin_open=False, **extra):
    body = {
        "pager_no": "42", "state": kind, "server_time": T0.isoformat().replace("+00:00", "Z"),
        "checkin_open": checkin_open, "next_checkin_due_at": (T0 + timedelta(minutes=12)).isoformat(),
        "waited_minutes": 34, "questionnaire_version": "2026-11-08.1",
    }
    body.update(extra)
    return body


class FakeApi:
    def __init__(self, st=None):
        self.st = st or state()
        self.posts = []
        self.fail_posts = 0      # network failures before success
        self.refuse = None       # ApiError to raise
        self.down = False
        self.message = "none"
        self.follow_up = []      # follow_up_items for the next receipt

    def get_state(self):
        if self.down:
            raise OSError("no route")
        return self.st

    def post_report(self, body):
        self.posts.append(body)
        if self.refuse:
            raise self.refuse
        if self.fail_posts:
            self.fail_posts -= 1
            raise OSError("timeout")
        return {"submission_id": body["submission_id"], "patient_message": self.message, "duplicate": False,
                "follow_up_items": list(self.follow_up)}


class RecIo:
    def __init__(self):
        self.screens, self.leds_calls, self.acks, self.plays = [], [], 0, []

    def show(self, *lines):
        self.screens.append(lines)

    def leds(self, red, green):
        self.leds_calls.append((red, green))

    def ack(self, n=1):
        self.acks += 1

    def play(self, spec):
        self.plays.append(spec)

    def redraw(self):
        pass


class Clock:
    def __init__(self):
        self.t = 1_000_000.0

    def __call__(self):
        return self.t


def make(st=None):
    api, io, clock = FakeApi(st), RecIo(), Clock()
    ui = PagerUI(api, io, "42", clock=clock, sleep=lambda s: None)
    ui.poll()
    return ui, api, io, clock


def press(ui, *buttons):
    for b in buttons:
        ui.handle(b)
        ui.render()


def text(ui):
    lines, _, _ = ui.screen()
    return "\n".join(lines)


def assert_fits(testcase, lines):
    testcase.assertLessEqual(len(lines), 8, lines)
    for line in lines:
        width = len(line) - 1 if line.startswith(">") else len(line)
        testcase.assertLessEqual(width, pager.WIDTH, repr(line))


class Pages(unittest.TestCase):
    def test_left_and_right_flip_between_status_and_report(self):
        ui, *_ = make()
        self.assertIn("checked in", text(ui))
        press(ui, RIGHT)
        self.assertIn("REPORT SOMETHING", text(ui))
        press(ui, RIGHT)
        self.assertIn("checked in", text(ui))
        press(ui, LEFT)
        self.assertIn("REPORT SOMETHING", text(ui))

    def test_status_shows_wait_and_next_checkin(self):
        ui, *_ = make()
        self.assertIn("Waited: 34 min", text(ui))
        self.assertIn("Next check-in: 12m", text(ui))

    def test_a_new_checkin_jumps_to_its_page_and_blinks_red(self):
        ui, api, *_ = make()
        api.st = state(checkin_open=True)
        ui.poll()
        lines, red, _ = ui.screen()
        self.assertIn("CHECK-IN TIME", lines[0])
        self.assertEqual(red, 2)
        self.assertIn("page 1/3", lines[-1])

    def test_unassigned_and_called_ignore_buttons(self):
        ui, api, *_ = make(state(kind="unassigned"))
        press(ui, CONFIRM, RIGHT)
        self.assertIn("Not in use", text(ui))
        api.st = state(kind="called")
        ui.poll()
        lines, red, _ = ui.screen()
        self.assertIn("TRIAGE DESK NOW", "\n".join(lines))
        self.assertEqual(red, 2)

    def test_offline_after_three_failed_polls(self):
        ui, api, *_ = make()
        api.down = True
        for _ in range(3):
            ui.poll()
        lines, red, green = ui.screen()
        self.assertIn("No connection", "\n".join(lines))
        self.assertEqual((red, green), (1, 0))
        api.down = False
        ui.poll()
        self.assertIn("checked in", text(ui))

    def test_discharge_clears_a_report_error_and_stops_beeping(self):
        ui, api, io, _ = make()
        ui.result(("Not sent",), ok=False)
        ui.render()
        self.assertEqual(io.leds_calls[-1][0], 1)
        api.st = state(kind="unassigned")
        ui.tick(queue.Queue())
        self.assertIn("Not in use", text(ui))
        self.assertEqual(io.leds_calls[-1][0], 0)

    def test_reset_silences_a_call_until_the_pager_is_reassigned(self):
        ui, api, io, clock = make(state(kind="called"))
        events = queue.Queue()
        events.put(4)
        ui.tick(events)
        self.assertIn("Connecting...", text(ui))
        self.assertEqual(io.leds_calls[-1][0], 0)
        ui.tick(events)
        self.assertIn("Not in use", text(ui))
        self.assertEqual(io.leds_calls[-1][0], 0)

        api.st = state(checkin_open=True)
        clock.t += pager.POLL_SECONDS
        ui.tick(events)
        self.assertIn("CHECK-IN TIME", text(ui))
        self.assertEqual(io.leds_calls[-1][0], 2)

        api.st = state(kind="called")
        clock.t += pager.POLL_SECONDS
        ui.tick(events)
        self.assertIn("TRIAGE DESK NOW", text(ui))
        self.assertEqual(io.leds_calls[-1][0], 2)

    def test_reset_ignores_an_active_visit_and_an_idle_pager(self):
        ui, api, _, _ = make(state(checkin_open=True))
        ui.start_checkin()
        flow = ui.flow
        ui.handle(pager.RESET)
        self.assertIs(ui.flow, flow)
        self.assertEqual(api.posts, [])

        ui, *_ = make(state(kind="unassigned"))
        ui.handle(pager.RESET)
        self.assertIn("Not in use", text(ui))

    def test_reset_is_available_once_after_discharge(self):
        ui, api, *_ = make()
        api.st = state(kind="unassigned")
        ui.poll()
        ui.handle(pager.RESET)
        self.assertIn("Connecting...", text(ui))
        ui.poll()
        ui.handle(pager.RESET)
        self.assertIn("Not in use", text(ui))

    def test_reset_rechecks_the_assignment_before_clearing_it(self):
        ui, api, *_ = make(state(kind="called"))
        api.st = state(checkin_open=True)
        ui.handle(pager.RESET)
        self.assertIn("CHECK-IN TIME", text(ui))


class Checkin(unittest.TestCase):
    """The pager's check-in, in the phone's order. Question-level behaviour is in test_checkin.py."""

    def start(self, **extra):
        ui, api, io, clock = make(state(checkin_open=True, **extra))
        press(ui, CONFIRM)       # start on the check-in page
        return ui, api, io, clock

    def answer_base(self, ui, findings=()):
        """Feeling now: OK. Since last check: About the same. Pain: 3. New symptoms: none, or these."""
        press(ui, CONFIRM, CONFIRM)
        press(ui, RIGHT, RIGHT, RIGHT, CONFIRM)
        if findings:
            for code in findings:
                ui.flow.cursor = [c for c, _ in checkin.FINDINGS].index(code)
                press(ui, CONFIRM)
            ui.flow.cursor = len(checkin.FINDINGS)          # Next / Send now
        else:
            ui.flow.cursor = len(checkin.FINDINGS) + 1      # None of these
        press(ui, CONFIRM)

    def test_without_server_items_it_asks_the_four_fixed_questions(self):
        ui, api, io, _ = self.start()
        self.assertIn("1/4 Feeling now", text(ui))
        self.assertIn(">OK", text(ui))                 # starts in the middle
        self.answer_base(ui)
        body = api.posts[-1]
        self.assertEqual((body["kind"], body["purpose"]), ("checkin", "scheduled"))
        self.assertEqual((body["channel"], body["reporter"]), ("pager", "patient"))
        self.assertEqual(body["feeling_now"], {"kind": "answered", "value": "ok"})
        self.assertEqual(body["feeling_change"], {"kind": "answered", "value": "same"})
        self.assertEqual(body["pain"], {"kind": "answered", "value": 3})
        self.assertEqual(body["new_findings"], {"kind": "answered", "value": []})
        self.assertEqual(body["attention"], {"kind": "missing", "reason": "not_asked"})   # no prompt issued
        self.assertEqual(body["items"], {})
        self.assertEqual(body["questionnaire_version"], "2026-11-08.1")
        self.assertEqual(io.acks, 1)

    def test_the_page_counts_the_questions(self):
        ui, *_ = make(state(checkin_open=True, items=[YES_NO], attention_prompt=prompt()))
        self.assertIn("6 quick questions", text(ui))

    def test_server_items_and_the_circle_check_follow_the_fixed_questions(self):
        ui, api, io, clock = self.start(items=[YES_NO], attention_prompt=prompt())
        self.answer_base(ui)
        self.assertIn("5/6 Circle check", text(ui))
        press(ui, CONFIRM)                             # Start
        self.assertEqual(io.plays, [checkin.play_spec(prompt())])
        self.assertTrue(ui.flow.playing)
        screens = len(io.screens)
        clock.t += 1
        ui.tick(queue.Queue())
        self.assertEqual(len(io.screens), screens)     # the MCU owns the screen while shapes play
        clock.t += checkin.play_ms(prompt()) / 1000
        ui.tick(queue.Queue())
        self.assertIn("0 circles", text(ui))
        press(ui, RIGHT, RIGHT, RIGHT, RIGHT, RIGHT, CONFIRM)      # 5
        self.assertIn("6/6 Pain moved?", text(ui))
        press(ui, CONFIRM)                             # Yes
        body = api.posts[-1]
        self.assertEqual(body["attention"], {"kind": "answered", "prompt_id": PROMPT_ID, "count": 5})
        self.assertEqual(body["items"], {"pain_moved": {"kind": "yes_no", "value": True}})

    def test_left_while_the_shapes_play_stops_and_says_so(self):
        ui, api, io, _ = self.start(attention_prompt=prompt())
        self.answer_base(ui)
        press(ui, CONFIRM)                             # Start
        press(ui, CONFIRM, RIGHT)                      # ignored while the shapes play
        self.assertTrue(ui.flow.playing)
        press(ui, LEFT)                                # stop
        body = api.posts[-1]
        self.assertEqual(body["attention"],
                         {"kind": "missing", "reason": "unable_to_respond", "prompt_id": PROMPT_ID})

    def test_an_expired_prompt_is_fetched_again(self):
        ui, api, io, _ = self.start(attention_prompt=prompt(expired=True))
        self.answer_base(ui)
        api.st = state(checkin_open=True, attention_prompt=prompt(prompt_id=OTHER_ID))
        press(ui, CONFIRM)                             # Start
        self.assertEqual(ui.flow.prompt["prompt_id"], OTHER_ID)
        self.assertEqual(len(io.plays), 1)

    def test_an_expired_prompt_with_no_new_one_skips_the_check(self):
        ui, api, io, _ = self.start(attention_prompt=prompt(expired=True))
        self.answer_base(ui)
        press(ui, CONFIRM)                             # Start: expired, and the server has no other
        self.assertEqual(io.plays, [])
        self.assertEqual(api.posts[-1]["attention"], {"kind": "missing", "reason": "not_asked"})

    def test_an_urgent_sign_sends_at_once_then_asks_the_follow_ups(self):
        ui, api, io, clock = self.start(items=[YES_NO], attention_prompt=prompt())
        api.follow_up = ["last_known_well"]
        self.answer_base(ui, findings=["speech_change"])
        body = api.posts[-1]
        self.assertEqual(body["new_findings"], {"kind": "answered", "value": ["speech_change"]})
        self.assertEqual(body["attention"], {"kind": "missing", "reason": "not_reached"})  # never shown
        self.assertEqual(body["items"], {"pain_moved": {"kind": "missing", "reason": "not_reached"}})
        self.assertIn(pager.MORE_QUESTIONS, text(ui))
        api.follow_up = []
        api.st = state(checkin_open=False, items=[YES_NO, LAST_WELL])
        press(ui, CONFIRM)                             # read: on to the follow-ups
        self.assertIn("1/1 Last normal", text(ui))
        press(ui, CONFIRM)                             # Less than 1 hour ago
        body = api.posts[-1]
        self.assertEqual(body["purpose"], "followup")
        self.assertEqual(body["items"], {"last_known_well": {"kind": "choice", "value": "under_1_hr"}})
        for name in ("feeling_now", "feeling_change", "pain", "new_findings", "attention"):
            self.assertEqual(body[name], {"kind": "missing", "reason": "not_asked"})

    def test_follow_ups_also_start_when_the_result_times_out(self):
        ui, api, _, clock = self.start()
        api.follow_up = ["last_known_well"]
        api.st = state(checkin_open=True, items=[LAST_WELL])
        self.answer_base(ui)
        clock.t += pager.RESULT_SECONDS + 1
        self.assertIn("Last normal", text(ui))

    def test_a_follow_up_is_not_asked_twice(self):
        ui, api, *_ = self.start(items=[YES_NO])
        api.follow_up = ["pain_moved"]                 # already asked in this check-in
        self.answer_base(ui)
        press(ui, CONFIRM)                             # Yes, then the result
        press(ui, CONFIRM)
        self.assertEqual(ui.view, "pages")

    def test_stop_and_send_sends_what_was_answered(self):
        ui, api, *_ = self.start()
        press(ui, CONFIRM)                             # Feeling now: OK
        labels = [label for label, _ in ui.flow.entries()]
        ui.flow.cursor = labels.index("Stop and send")
        press(ui, CONFIRM)
        body = api.posts[-1]
        self.assertEqual(body["feeling_now"], {"kind": "answered", "value": "ok"})
        for name in ("feeling_change", "pain", "new_findings"):
            self.assertEqual(body[name], {"kind": "missing", "reason": "not_reached"})

    def test_back_on_the_first_question_leaves_without_sending(self):
        ui, api, *_ = self.start()
        press(ui, LEFT, LEFT, LEFT, CONFIRM)           # OK -> wrap up to Back
        self.assertIn("CHECK-IN TIME", text(ui))
        self.assertEqual(api.posts, [])

    def test_the_server_message_is_shown_then_buttons_return_home(self):
        ui, api, *_ = self.start()
        api.message = "clinician_told"
        self.answer_base(ui)
        self.assertIn("Care team told", text(ui))
        press(ui, RIGHT)
        self.assertNotIn("Care team told", text(ui))

    def test_the_result_clears_itself(self):
        ui, api, _, clock = self.start()
        self.answer_base(ui)
        self.assertIn("Thank you", text(ui))
        clock.t += pager.RESULT_SECONDS + 1
        self.assertNotIn("Thank you", text(ui))

    def test_a_closed_checkin_says_so(self):
        ui, api, *_ = self.start()
        api.refuse = pager.ApiError(409, "the next check-in isn't open yet")
        self.answer_base(ui)
        lines, red, _ = ui.screen()
        self.assertIn("Check-in closed", lines[0])
        self.assertEqual(red, 1)

    def test_network_retries_reuse_the_submission_id(self):
        ui, api, io, _ = self.start()
        api.fail_posts = 2
        self.answer_base(ui)
        self.assertEqual(len(api.posts), 3)
        self.assertEqual(len({p["submission_id"] for p in api.posts}), 1)
        self.assertIn("Thank you", text(ui))

    def test_gives_up_after_three_tries_and_says_tell_the_desk(self):
        ui, api, *_ = self.start()
        api.fail_posts = 5
        self.answer_base(ui)
        self.assertEqual(len(api.posts), pager.SEND_TRIES)
        lines, red, _ = ui.screen()
        self.assertIn("Not sent", lines[0])
        self.assertEqual(red, 1)


class Report(unittest.TestCase):
    def open_menu(self):
        ui, api, io, clock = make()
        press(ui, RIGHT, CONFIRM)                      # Report page -> list
        return ui, api, io

    def test_menu_mirrors_the_phone(self):
        ui, *_ = self.open_menu()
        screen = text(ui)
        for label in ("I need help now", "I'm worried", "New symptom", "Question for desk", "I'm leaving", "Back"):
            self.assertIn(label, screen)

    def test_help_now_needs_one_confirm(self):
        ui, api, io = self.open_menu()
        press(ui, CONFIRM)
        self.assertIn("Get help now?", text(ui))
        self.assertEqual(api.posts, [])
        press(ui, CONFIRM)
        self.assertEqual(api.posts[-1]["kind"], "concern")
        self.assertEqual(api.posts[-1]["concern"], "help_now")
        self.assertIn("Help is coming", text(ui))

    def test_left_on_the_confirm_screen_cancels(self):
        ui, api, _ = self.open_menu()
        press(ui, RIGHT, CONFIRM, LEFT)
        self.assertIn(">I'm worried", text(ui))
        self.assertEqual(api.posts, [])

    def test_worried_desk_question_and_leaving(self):
        for steps, expected in (((RIGHT,), {"kind": "concern", "concern": "worried"}),
                                ((RIGHT, RIGHT, RIGHT), {"kind": "concern", "concern": "desk_question"}),
                                ((LEFT, LEFT), {"kind": "leaving"})):
            ui, api, _ = self.open_menu()
            press(ui, *steps, CONFIRM, CONFIRM)
            sent = {k: v for k, v in api.posts[-1].items() if k in ("kind", "concern")}
            self.assertEqual(sent, expected)

    def test_leaving_shows_the_after_leaving_advice(self):
        ui, api, _ = self.open_menu()
        api.message = "leaving_info"
        press(ui, LEFT, LEFT, CONFIRM, CONFIRM)
        self.assertIn("911", text(ui))

    def test_symptoms_tick_several_then_send(self):
        ui, api, _ = self.open_menu()
        press(ui, RIGHT, RIGHT, CONFIRM)               # New symptom
        self.assertIn(">[ ] Speech is", text(ui))     # the bank's wording, in full under the cursor
        self.assertIn(">    different or", text(ui))
        press(ui, CONFIRM)                             # tick speech
        press(ui, RIGHT, RIGHT, RIGHT, CONFIRM)        # tick trouble breathing
        press(ui, RIGHT, CONFIRM, CONFIRM)             # tick then untick fainting
        self.assertIn("Send (2 ticked)", "\n".join(s for s, _ in ui.items()))
        press(ui, LEFT, LEFT, LEFT, LEFT, LEFT, LEFT)  # wrap from Fainted up to Send
        self.assertIn(">Send (2 ticked)", text(ui))
        press(ui, CONFIRM)
        self.assertEqual(api.posts[-1]["kind"], "finding")
        self.assertEqual(api.posts[-1]["findings"], ["speech_change", "trouble_breathing"])

    def test_send_with_nothing_ticked_does_nothing(self):
        ui, api, _ = self.open_menu()
        press(ui, RIGHT, RIGHT, CONFIRM, LEFT, LEFT, CONFIRM)   # wrap up to Send (0 ticked)
        self.assertEqual(api.posts, [])

    def test_a_finding_report_asks_its_follow_ups(self):
        ui, api, _ = self.open_menu()
        api.follow_up = ["last_known_well"]
        api.st = state(items=[LAST_WELL])
        press(ui, RIGHT, RIGHT, CONFIRM, CONFIRM)      # New symptom, tick speech
        press(ui, LEFT, LEFT, CONFIRM)                 # wrap up to Send
        press(ui, CONFIRM)                             # read the result
        self.assertIn("Last normal", text(ui))

    def test_the_long_symptom_list_scrolls(self):
        ui, *_ = self.open_menu()
        press(ui, RIGHT, RIGHT, CONFIRM)
        press(ui, *([RIGHT] * 12))                     # Heavy bleeding, the 13th
        self.assertIn(">[ ] Heavy bleeding", text(ui))
        self.assertNotIn("Speech", text(ui))


class ScreenSize(unittest.TestCase):
    def test_every_screen_fits_the_oled(self):
        screens = []
        for st in (state(), state(checkin_open=True), state(kind="called"), state(kind="unassigned"),
                   state(waited_minutes=999, pager_no="999999")):
            ui, *_ = make(st)
            ui.pager_no = "999999"
            screens.append(ui.screen()[0])
            for page in ui.pages():
                ui.page = page
                screens.append(ui.screen()[0])
        ui, *_ = make()
        for view in ("report", "symptoms"):
            ui.open_list(view, 0)
            ui.picked = [code for code, _ in checkin.FINDINGS]
            for i in range(len(ui.items())):
                ui.cursor = i
                screens.append(ui.screen()[0])
        # Every check-in screen is in test_checkin.py; the page that starts one:
        ui, *_ = make(state(checkin_open=True, items=[YES_NO, LAST_WELL], attention_prompt=prompt()))
        screens.append(ui.screen()[0])
        for kind in pager.CONFIRM_TEXT:
            ui.view, ui.pending = "confirm", kind
            screens.append(ui.screen()[0])
        for lines in list(pager.MESSAGES.values()) + list(pager.AFTER_KIND.values()):
            ui.result(lines, ok=True)
            screens.append(ui.screen()[0])
            ui.result((*lines[:5], "", pager.MORE_QUESTIONS), ok=True)    # with follow-ups to come
            screens.append(ui.screen()[0])
        for lines in screens:
            assert_fits(self, lines)


class AgainstTheFakeServer(unittest.TestCase):
    """The real HTTP client against tools/fake_recheck.py."""

    def test_full_flow_over_http(self):
        import fake_recheck as fake

        fake.Handler.key = "test-key-test-key"
        server = ThreadingHTTPServer(("127.0.0.1", 0), fake.Handler)
        threading.Thread(target=server.serve_forever, daemon=True).start()
        try:
            base = f"http://127.0.0.1:{server.server_address[1]}"
            api = pager.Api(base, "42", "test-key-test-key")
            fake.visit.assign(group="chest_back_pain", checkin_open=True)
            io = RecIo()
            ui = PagerUI(api, io, "42", sleep=lambda s: None)
            ui.poll()
            self.assertEqual(ui.page, "checkin")
            self.assertEqual([i["key"] for i in ui.state["items"]], ["pain_moved", "pain_sudden_worse"])
            press(ui, CONFIRM, RIGHT, RIGHT, CONFIRM, RIGHT, RIGHT, CONFIRM)   # Very poor, Much worse
            press(ui, RIGHT, RIGHT, CONFIRM)                                  # pain 2

            def pick(label):
                ui.flow.cursor = [l for l, _ in ui.flow.entries()].index(label)
                press(ui, CONFIRM)

            pick("None of these")
            press(ui, CONFIRM)                                                # circle check: Start
            self.assertEqual(len(io.plays), 1)
            ui.flow.played()
            expected = fake.visit.prompts[fake.visit.open_prompt]["expected"]
            press(ui, *([RIGHT] * expected), CONFIRM)
            pick("Yes")                                                       # the pain moved
            pick("No")                                                        # not suddenly worse: send
            self.assertIn("A nurse or doctor", text(ui))                      # the server never says "told"
            self.assertIn(pager.MORE_QUESTIONS, text(ui))
            self.assertEqual(fake.visit.log[-1]["attention"], "correct")
            press(ui, CONFIRM)                                                # on to the follow-ups
            self.assertIn("1/2 Pain moved to", text(ui))
            pick("[ ] Chest")
            pick("Next (1 ticked)")
            pick("Less than 15 minutes ago")
            self.assertEqual(fake.visit.answers, {"pain_moved": True, "pain_sudden_worse": False,
                                                     "pain_new_location": ["chest"], "change_started": "under_15_min"})
            self.assertIn("Answers sent", text(ui))
            ui.poll()
            self.assertFalse(ui.state["checkin_open"])
            bad = pager.Api(base, "42", "wrong")
            with self.assertRaises(pager.ApiError) as e:
                bad.get_state()
            self.assertEqual(e.exception.status, 401)
        finally:
            server.shutdown()


if __name__ == "__main__":
    unittest.main()
