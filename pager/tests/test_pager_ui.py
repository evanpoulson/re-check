"""Pager screens and report bodies, with no board and no real server.

    python -m unittest discover -s pager/tests        (from the repository root)
"""

import os
import sys
import threading
import unittest
from datetime import datetime, timedelta, timezone
from http.server import ThreadingHTTPServer

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, "..", "python"))
sys.path.insert(0, os.path.join(HERE, "..", "tools"))

import main as pager  # noqa: E402
from main import CONFIRM, LEFT, RIGHT, PagerUI  # noqa: E402

T0 = datetime(2026, 11, 8, 15, 0, tzinfo=timezone.utc)


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
        return {"submission_id": body["submission_id"], "patient_message": self.message, "duplicate": False}


class RecIo:
    def __init__(self):
        self.screens, self.leds_calls, self.acks = [], [], 0

    def show(self, *lines):
        self.screens.append(lines)

    def leds(self, red, green):
        self.leds_calls.append((red, green))

    def ack(self, n=1):
        self.acks += 1


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


class Checkin(unittest.TestCase):
    def start(self):
        ui, api, io, clock = make(state(checkin_open=True))
        press(ui, CONFIRM)       # start on the check-in page
        return ui, api, io, clock

    def test_two_questions_send_a_pager_wellness_checkin(self):
        ui, api, io, _ = self.start()
        self.assertIn(">OK", text(ui))                 # starts in the middle
        press(ui, RIGHT, RIGHT, CONFIRM)               # Very poor
        self.assertIn("2/2", text(ui))
        press(ui, RIGHT, RIGHT, CONFIRM)               # Much worse
        body = api.posts[-1]
        self.assertEqual(body["kind"], "checkin")
        self.assertEqual((body["channel"], body["reporter"]), ("pager", "patient"))
        self.assertEqual(body["feeling_now"], {"kind": "answered", "value": "very_poor"})
        self.assertEqual(body["feeling_change"], {"kind": "answered", "value": "much_worse"})
        for name in ("pain", "new_findings", "attention"):
            self.assertEqual(body[name], {"kind": "missing", "reason": "not_asked"})
        self.assertEqual(body["items"], {})
        self.assertEqual(body["questionnaire_version"], "2026-11-08.1")
        self.assertEqual(io.acks, 1)

    def test_not_sure_is_sent_as_unknown_never_as_an_answer(self):
        ui, api, *_ = self.start()
        press(ui, RIGHT, RIGHT, RIGHT, CONFIRM)        # Not sure
        press(ui, CONFIRM)                             # About the same
        body = api.posts[-1]
        self.assertEqual(body["feeling_now"], {"kind": "missing", "reason": "unsure"})
        self.assertEqual(body["feeling_change"], {"kind": "answered", "value": "same"})

    def test_left_moves_up_and_wraps(self):
        ui, *_ = self.start()
        press(ui, LEFT, LEFT, LEFT)
        self.assertIn(">Back", text(ui))

    def test_back_returns_to_the_first_question_then_the_pages(self):
        ui, api, *_ = self.start()
        press(ui, CONFIRM)                             # OK
        press(ui, LEFT, LEFT, LEFT, CONFIRM)           # q2 cursor 2 -> Back
        self.assertIn("1/2", text(ui))
        self.assertIn(">OK", text(ui))
        press(ui, LEFT, LEFT, LEFT, CONFIRM)           # q1: OK -> Back
        self.assertIn("CHECK-IN TIME", text(ui))
        self.assertEqual(api.posts, [])

    def test_the_server_message_is_shown_then_buttons_return_home(self):
        ui, api, *_ = self.start()
        api.message = "clinician_told"
        press(ui, CONFIRM, CONFIRM)
        self.assertIn("Care team told", text(ui))
        press(ui, RIGHT)
        self.assertNotIn("Care team told", text(ui))

    def test_the_result_clears_itself(self):
        ui, api, _, clock = self.start()
        press(ui, CONFIRM, CONFIRM)
        self.assertIn("Thank you", text(ui))
        clock.t += pager.RESULT_SECONDS + 1
        self.assertNotIn("Thank you", text(ui))

    def test_a_closed_checkin_says_so(self):
        ui, api, *_ = self.start()
        api.refuse = pager.ApiError(409, "the next check-in isn't open yet")
        press(ui, CONFIRM, CONFIRM)
        lines, red, _ = ui.screen()
        self.assertIn("Check-in closed", lines[0])
        self.assertEqual(red, 1)

    def test_network_retries_reuse_the_submission_id(self):
        ui, api, io, _ = self.start()
        api.fail_posts = 2
        press(ui, CONFIRM, CONFIRM)
        self.assertEqual(len(api.posts), 3)
        self.assertEqual(len({p["submission_id"] for p in api.posts}), 1)
        self.assertIn("Thank you", text(ui))

    def test_gives_up_after_three_tries_and_says_tell_the_desk(self):
        ui, api, *_ = self.start()
        api.fail_posts = 5
        press(ui, CONFIRM, CONFIRM)
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
        self.assertIn("[ ] Speech changed", text(ui))
        press(ui, CONFIRM)                             # tick speech
        press(ui, RIGHT, RIGHT, RIGHT, CONFIRM)        # tick trouble breathing
        press(ui, RIGHT, CONFIRM, CONFIRM)             # tick then untick fainting
        self.assertIn("Send (2)", "\n".join(s for i, (s, _) in enumerate(ui.items())))
        press(ui, LEFT, LEFT, LEFT, LEFT, LEFT, LEFT)  # wrap from Fainted up to Send (2)
        self.assertIn(">Send (2)", text(ui))
        press(ui, CONFIRM)
        self.assertEqual(api.posts[-1]["kind"], "finding")
        self.assertEqual(api.posts[-1]["findings"], ["speech_change", "trouble_breathing"])

    def test_send_with_nothing_ticked_does_nothing(self):
        ui, api, _ = self.open_menu()
        press(ui, RIGHT, RIGHT, CONFIRM, LEFT, LEFT, CONFIRM)   # wrap up to Send (0)
        self.assertEqual(api.posts, [])

    def test_the_long_symptom_list_scrolls(self):
        ui, *_ = self.open_menu()
        press(ui, RIGHT, RIGHT, CONFIRM)
        press(ui, *([RIGHT] * 12))                     # Heavy bleeding, the 13th
        self.assertIn(">[ ] Heavy bleeding", text(ui))
        self.assertNotIn("Speech changed", text(ui))


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
        for view in ("q1", "q2", "report", "symptoms"):
            ui.open_list(view, 0)
            ui.picked = [code for _, code in pager.SYMPTOMS]
            for i in range(len(ui.items())):
                ui.cursor = i
                screens.append(ui.screen()[0])
        for kind in pager.CONFIRM_TEXT:
            ui.view, ui.pending = "confirm", kind
            screens.append(ui.screen()[0])
        for lines in list(pager.MESSAGES.values()) + list(pager.AFTER_KIND.values()):
            ui.result(lines, ok=True)
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
            fake.visit.update(state="waiting", checkin_open=True, triaged_at=fake.now(), next_due=fake.now())
            ui = PagerUI(api, RecIo(), "42", sleep=lambda s: None)
            ui.poll()
            self.assertEqual(ui.page, "checkin")
            press(ui, CONFIRM, RIGHT, RIGHT, CONFIRM, RIGHT, RIGHT, CONFIRM)   # Very poor, Much worse
            self.assertIn("Care team told", text(ui))
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
