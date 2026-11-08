"""Recheck pager: Linux side of the Arduino UNO Q app.

Holds every screen and talks to the Recheck API over Wi-Fi. The MCU sketch
(sketch/sketch.ino) only draws text, reads the three buttons and drives the LEDs.

Buttons: LEFT (D2) = up / previous / back, CONFIRM (D3) = choose, RIGHT (D4) = down / next.

Lights:
  green flicker on every press   the pager felt the press (done on the MCU)
  green double flash             staff received the report
  green steady                   connected
  red blinking                   you are needed: check-in due, or called to the desk
  red steady                     no connection, or a report was not sent: tell the desk

Settings come from pager_config.json next to this file (copy pager_config.example.json).

On a laptop, without the board:
    python main.py      keys: a = LEFT, s = CONFIRM, d = RIGHT, then Enter
"""

from __future__ import annotations

import json
import os
import queue
import sys
import threading
import time
import urllib.error
import urllib.request
import uuid
from datetime import datetime, timezone

LEFT, CONFIRM, RIGHT = 1, 2, 3

WIDTH = 21          # characters per OLED line
ROWS = 6            # list rows between the title and the footer
POLL_SECONDS = 5
HTTP_TIMEOUT = 6
OFFLINE_AFTER_FAILURES = 3
RESULT_SECONDS = 8
SEND_TRIES = 3

HERE = os.path.dirname(os.path.abspath(__file__))
CONFIG_PATH = os.path.join(HERE, "pager_config.json")

BACK = "__back"
SEND = "__send"

# Wording follows question-bank/questionnaire.json, shortened to fit the screen.
FEELING_NOW = [("Very good", "very_good"), ("Good", "good"), ("OK", "ok"),
               ("Poor", "poor"), ("Very poor", "very_poor"), ("Not sure", None)]
FEELING_CHANGE = [("Much better", "much_better"), ("Better", "better"), ("About the same", "same"),
                  ("Worse", "worse"), ("Much worse", "much_worse"), ("Not sure", None)]
SYMPTOMS = [
    ("Speech changed", "speech_change"),
    ("Face droopy", "facial_droop"),
    ("Weak/numb 1 side", "new_weakness_numbness"),
    ("Hard to breathe", "trouble_breathing"),
    ("Fainted/nearly", "fainting"),
    ("More confused", "new_confusion"),
    ("Very drowsy", "drowsiness"),
    ("Worst headache", "worst_headache"),
    ("Vomiting", "vomiting"),
    ("Vision problem", "vision_change"),
    ("Balance/walking", "balance_change"),
    ("Chest pain worse", "chest_pain"),
    ("Heavy bleeding", "heavy_bleeding"),
]
# Mirrors the phone's always-available options.
REPORT_MENU = [("I need help now", "help_now"), ("I'm worried", "worried"), ("New symptom", "symptoms"),
               ("Question for desk", "desk_question"), ("I'm leaving", "leaving"), ("Back", BACK)]

LIST_TITLES = {"q1": "1/2 Feeling now?", "q2": "2/2 Since last check?",
               "report": "Report to staff", "symptoms": "New symptoms"}
LIST_FOOTER = "< up   * ok   down >"

CONFIRM_TEXT = {
    "help_now": ("Get help now?", "Staff will be told", "you need help now."),
    "worried": ("Tell staff?", "Staff will be told", "you are worried."),
    "desk_question": ("Ask the desk?", "The desk will come", "to you when free."),
    "leaving": ("Are you leaving?", "Staff will be told", "you are leaving."),
}
CONFIRM_FOOTER = "* yes          < no"

MESSAGES = {  # the server's patient_message
    "clinician_told": ("Care team told", "The care team has", "been told. Stay", "where staff can", "see you."),
    "clinician_will_check": ("Thank you", "A nurse or doctor", "will check on you", "soon."),
    "leaving_info": ("Before you go", "If you get worse,", "call 911 or go to", "the nearest ER.", "Advice: call 811."),
}
AFTER_KIND = {  # when patient_message is "none"
    "checkin": ("Thank you", "Answers sent.", "If you feel worse,", "go to Report >", "I need help now."),
    "help_now": ("Help is coming", "Staff have been", "told you need help", "now. Stay here."),
    "worried": ("Sent", "Staff know you", "are worried."),
    "desk_question": ("Sent", "The desk will come", "to you when free."),
    "leaving": ("Sent", "Staff know you", "are leaving."),
    "finding": ("Sent", "Staff know about", "your new symptom."),
}

NOT_ASKED = {"kind": "missing", "reason": "not_asked"}


def load_config(path: str = CONFIG_PATH) -> dict:
    cfg = {"api_base": "", "pager_no": "42", "pager_key": ""}
    try:
        with open(path, encoding="utf-8") as f:
            cfg.update(json.load(f))
    except FileNotFoundError:
        print(f"{path} not found: copy pager_config.example.json to pager_config.json")
    cfg["api_base"] = str(cfg["api_base"]).rstrip("/")
    cfg["pager_no"] = str(cfg["pager_no"])
    return cfg


def parse_time(value: str | None) -> datetime | None:
    if not value:
        return None
    return datetime.fromisoformat(value.replace("Z", "+00:00"))


def fit(lines) -> str:
    """At most 8 lines; each cut to the OLED width (a leading '>' cursor mark doesn't count)."""
    out = []
    for line in list(lines)[:8]:
        line = str(line)
        out.append(line[: WIDTH + 1] if line.startswith(">") else line[:WIDTH])
    return "\n".join(out)


# ---------------------------------------------------------------------------
# Network
# ---------------------------------------------------------------------------
class ApiError(Exception):
    def __init__(self, status: int, detail: str):
        super().__init__(f"{status}: {detail}")
        self.status = status
        self.detail = detail


class Api:
    def __init__(self, base: str, pager_no: str, key: str):
        self.base, self.pager_no, self.key = base, pager_no, key

    def get_state(self) -> dict:
        return self._call("GET", f"/api/pager/{self.pager_no}")

    def post_report(self, body: dict) -> dict:
        return self._call("POST", f"/api/pager/{self.pager_no}/reports", body)

    def _call(self, method: str, path: str, body: dict | None = None) -> dict:
        req = urllib.request.Request(
            self.base + path,
            data=json.dumps(body).encode() if body is not None else None,
            method=method,
            headers={"X-Pager-Key": self.key, "Content-Type": "application/json", "Accept": "application/json"},
        )
        try:
            with urllib.request.urlopen(req, timeout=HTTP_TIMEOUT) as r:
                return json.loads(r.read().decode() or "{}")
        except urllib.error.HTTPError as e:
            try:
                detail = json.loads(e.read().decode()).get("detail", "")
            except Exception:
                detail = ""
            raise ApiError(e.code, str(detail)) from None


# ---------------------------------------------------------------------------
# Screen logic (no hardware, no network: both are passed in)
# ---------------------------------------------------------------------------
class PagerUI:
    def __init__(self, api, io, pager_no: str, clock=time.time, sleep=time.sleep):
        self.api, self.io, self.pager_no = api, io, pager_no
        self.clock, self.sleep = clock, sleep
        self.state: dict | None = None
        self.failures = 0
        self.offset = 0.0               # server time minus local time, seconds
        self.next_poll = 0.0
        self.view = "pages"             # pages | q1 | q2 | report | symptoms | confirm | result
        self.page = "status"            # checkin | status | report
        self.cursor = 0
        self.top = 0
        self.answer_now: str | None = None
        self.picked: list[str] = []
        self.pending: str | None = None
        self.result_lines: tuple = ()
        self.result_ok = True
        self.result_until = 0.0
        self._was_open = False

    # -- server state -------------------------------------------------------
    def poll(self) -> None:
        try:
            st = self.api.get_state()
        except Exception as e:
            self.failures += 1
            print("poll failed:", e)
            return
        self.failures = 0
        server = parse_time(st.get("server_time"))
        if server is not None:
            self.offset = server.timestamp() - self.clock()
        is_open = st.get("state") == "waiting" and bool(st.get("checkin_open"))
        if is_open and not self._was_open and self.view == "pages":
            self.page = "checkin"       # a new check-in: jump to it
        self._was_open = is_open
        self.state = st

    def now_iso(self) -> str:
        return datetime.fromtimestamp(self.clock() + self.offset, timezone.utc).isoformat()

    def pages(self) -> list[str]:
        st = self.state or {}
        return (["checkin"] if st.get("checkin_open") else []) + ["status", "report"]

    # -- buttons ------------------------------------------------------------
    def handle(self, button: int) -> None:
        if self.view == "result":
            self.to_pages()
            return
        if (self.state or {}).get("state") != "waiting" or self.failures >= OFFLINE_AFTER_FAILURES:
            return
        if self.view == "pages":
            pages = self.pages()
            if self.page not in pages:
                self.page = "status"
            i = pages.index(self.page)
            if button == LEFT:
                self.page = pages[(i - 1) % len(pages)]
            elif button == RIGHT:
                self.page = pages[(i + 1) % len(pages)]
            elif self.page == "checkin":
                self.open_list("q1", 2)
            elif self.page == "report":
                self.open_list("report", 0)
            return
        if self.view == "confirm":
            if button == CONFIRM:
                kind = self.pending
                body = {"kind": "leaving"} if kind == "leaving" else {"kind": "concern", "concern": kind}
                self.send(body, kind)
            elif button == LEFT:
                self.open_list("report", [v for _, v in REPORT_MENU].index(self.pending))
            return
        items = self.items()
        if button == LEFT:
            self.cursor = (self.cursor - 1) % len(items)
        elif button == RIGHT:
            self.cursor = (self.cursor + 1) % len(items)
        else:
            self.choose(items[self.cursor][1])

    def choose(self, value) -> None:
        if self.view == "q1":
            if value == BACK:
                self.to_pages("checkin")
            else:
                self.answer_now = value
                self.open_list("q2", 2)
        elif self.view == "q2":
            if value == BACK:
                self.open_list("q1", [v for _, v in FEELING_NOW].index(self.answer_now))
            else:
                self.submit_checkin(self.answer_now, value)
        elif self.view == "report":
            if value == BACK:
                self.to_pages("report")
            elif value == "symptoms":
                self.picked = []
                self.open_list("symptoms", 0)
            else:
                self.pending = value
                self.view = "confirm"
        elif self.view == "symptoms":
            if value == BACK:
                self.open_list("report", 2)
            elif value == SEND:
                if self.picked:
                    findings = [code for _, code in SYMPTOMS if code in self.picked]
                    self.send({"kind": "finding", "findings": findings}, "finding")
            elif value in self.picked:
                self.picked.remove(value)
            else:
                self.picked.append(value)

    def items(self) -> list[tuple[str, object]]:
        if self.view == "q1":
            return FEELING_NOW + [("Back", BACK)]
        if self.view == "q2":
            return FEELING_CHANGE + [("Back", BACK)]
        if self.view == "report":
            return REPORT_MENU
        if self.view == "symptoms":
            rows = [(("[x] " if code in self.picked else "[ ] ") + label, code) for label, code in SYMPTOMS]
            return rows + [(f"Send ({len(self.picked)})", SEND), ("Back", BACK)]
        return []

    def open_list(self, view: str, cursor: int) -> None:
        self.view, self.cursor, self.top = view, cursor, 0

    def to_pages(self, page: str | None = None) -> None:
        self.view = "pages"
        if page:
            self.page = page

    # -- reports ------------------------------------------------------------
    def submit_checkin(self, now_value, change_value) -> None:
        def answer(v):
            return {"kind": "answered", "value": v} if v else {"kind": "missing", "reason": "unsure"}

        body = {
            "kind": "checkin",
            "questionnaire_version": (self.state or {}).get("questionnaire_version"),
            "feeling_now": answer(now_value),
            "feeling_change": answer(change_value),
            # The pager asks the two wellness questions only; the rest stays on the phone and with staff.
            "pain": NOT_ASKED, "new_findings": NOT_ASKED, "attention": NOT_ASKED, "items": {},
        }
        self.send(body, "checkin")

    def send(self, body: dict, kind: str) -> None:
        """POST a report. Retries reuse the same submission_id, so a retry is never counted twice."""
        body = {"submission_id": str(uuid.uuid4()), "reporter": "patient", "channel": "pager",
                "captured_at": self.now_iso(), **body}
        self.io.show(f"RECHECK PAGER {self.pager_no}", "", "Sending...")
        self.io.leds(0, 1)
        for attempt in range(SEND_TRIES):
            try:
                receipt = self.api.post_report(body)
            except ApiError as e:
                print("report refused:", e)
                if e.status == 409 and "check-in" in e.detail:
                    self.result(("Check-in closed", "This check-in is", "no longer open."), ok=False)
                elif e.status == 404:
                    self.result(("Not linked", "This pager is not", "linked to a patient.", "Please see the desk."),
                                ok=False)
                else:
                    self.result(("Not sent", "Please tell the", "triage desk."), ok=False)
                return
            except Exception as e:  # network: try again with the same submission
                print(f"report failed (try {attempt + 1}):", e)
                if attempt + 1 < SEND_TRIES:
                    self.sleep(2)
                continue
            self.io.ack(1)
            message = receipt.get("patient_message", "none")
            self.result(MESSAGES.get(message) or AFTER_KIND.get(kind, ("Sent",)), ok=True)
            self.next_poll = 0          # refresh the state right away
            return
        self.result(("Not sent", "No connection.", "Please tell the", "triage desk."), ok=False)

    def result(self, lines: tuple, ok: bool) -> None:
        self.view = "result"
        self.result_lines, self.result_ok = lines, ok
        self.result_until = self.clock() + RESULT_SECONDS

    # -- drawing ------------------------------------------------------------
    def screen(self) -> tuple[tuple, int, int]:
        """(lines, red, green) for the current state."""
        st = self.state
        header = f"RECHECK PAGER {self.pager_no}"
        if self.failures >= OFFLINE_AFTER_FAILURES:
            return (header, "", "No connection.", "", "Please tell the", "triage desk."), 1, 0
        if st is None:
            return (header, "", "Connecting..."), 0, 0
        if st.get("state") == "called":
            self.view = "pages"
            return (header, "", "PLEASE GO TO THE", "TRIAGE DESK NOW", "", "Staff are ready", "for you."), 2, 1
        if self.view == "result":
            if self.clock() < self.result_until:
                return (self.result_lines[0], "", *self.result_lines[1:]), 0 if self.result_ok else 1, 1
            self.to_pages()
        if st.get("state") != "waiting":
            self.view = "pages"
            return (header, "", "Not in use.", "", "Staff give this", "pager out at triage."), 0, 1
        if self.view == "confirm":
            title, *body = CONFIRM_TEXT[self.pending]
            return (title, "", *body, "", "", CONFIRM_FOOTER), 0, 1
        if self.view in LIST_TITLES:
            return self.list_screen(), 0, 1
        return self.page_screen(), (2 if st.get("checkin_open") else 0), 1

    def list_screen(self) -> tuple:
        items = self.items()
        if self.cursor < self.top:
            self.top = self.cursor
        elif self.cursor >= self.top + ROWS:
            self.top = self.cursor - ROWS + 1
        rows = [(">" if i == self.cursor else " ") + label
                for i, (label, _) in enumerate(items[self.top:self.top + ROWS], start=self.top)]
        return (LIST_TITLES[self.view], *rows, *([""] * (ROWS - len(rows))), LIST_FOOTER)

    def page_screen(self) -> tuple:
        st = self.state or {}
        pages = self.pages()
        if self.page not in pages:
            self.page = "status"
        nav = "<" + f"page {pages.index(self.page) + 1}/{len(pages)}".center(WIDTH - 2) + ">"
        if self.page == "checkin":
            return ("CHECK-IN TIME", "", "2 quick questions", "about how you feel.", "", "Press * to start", nav)
        if self.page == "report":
            return ("REPORT SOMETHING", "Need help? Worried?", "New symptom? Desk", "question? Leaving?",
                    "", "Press * to choose", nav)
        due = parse_time(st.get("next_checkin_due_at"))
        server = parse_time(st.get("server_time"))
        if st.get("checkin_open"):
            nxt = "Check-in: open now"
        elif due and server:
            nxt = f"Next check-in: {max(0, int((due - server).total_seconds() // 60))}m"
        else:
            nxt = ""
        return (f"RECHECK PAGER {self.pager_no}", "You are checked in.", f"Waited: {st.get('waited_minutes') or 0} min",
                nxt, "", "Press > to report", nav)

    def render(self) -> None:
        lines, red, green = self.screen()
        self.io.show(*lines)
        self.io.leds(red, green)

    def tick(self, events: "queue.Queue[int]") -> None:
        if self.clock() >= self.next_poll:
            self.poll()
            self.next_poll = self.clock() + POLL_SECONDS
        try:
            self.handle(events.get(timeout=0.1))
        except queue.Empty:
            pass
        self.render()


# ---------------------------------------------------------------------------
# Screen + LEDs: the board, or a terminal
# ---------------------------------------------------------------------------
class BoardIo:
    def __init__(self, bridge):
        self.bridge = bridge
        self._screen = None
        self._leds = None

    def _call(self, name: str, *args) -> None:
        try:
            self.bridge.call(name, *args)
        except Exception as e:  # one failed draw must not stop the pager
            print(f"{name} failed:", e)

    def show(self, *lines) -> None:
        text = fit(lines)
        if text != self._screen:
            self._screen = text
            self._call("show", text)

    def leds(self, red: int, green: int) -> None:
        if (red, green) != self._leds:
            self._leds = (red, green)
            self._call("leds", red, green)

    def ack(self, n: int = 1) -> None:
        self._call("ack", n)


class ConsoleIo:
    def __init__(self):
        self._screen = None
        self._leds = None

    def show(self, *lines) -> None:
        text = fit(lines)
        if text == self._screen:
            return
        self._screen = text
        print("\n+" + "-" * (WIDTH + 1) + "+")
        for line in text.split("\n"):
            print("|" + line.ljust(WIDTH + 1) + "|")
        print("+" + "-" * (WIDTH + 1) + "+")

    def leds(self, red: int, green: int) -> None:
        if (red, green) != self._leds:
            self._leds = (red, green)
            print(f"[red {('off', 'on', 'blink')[red]} | green {('off', 'on')[green]}]")

    def ack(self, n: int = 1) -> None:
        print("[green double flash: staff received it]")


def run_board() -> None:
    from arduino.app_utils import App, Bridge

    cfg = load_config()
    events: "queue.Queue[int]" = queue.Queue()
    ui = PagerUI(Api(cfg["api_base"], cfg["pager_no"], cfg["pager_key"]), BoardIo(Bridge), cfg["pager_no"])
    Bridge.provide("button", lambda code: events.put(int(code)))
    App.run(user_loop=lambda: ui.tick(events))


def run_console() -> None:
    cfg = load_config()
    events: "queue.Queue[int]" = queue.Queue()
    ui = PagerUI(Api(cfg["api_base"], cfg["pager_no"], cfg["pager_key"]), ConsoleIo(), cfg["pager_no"])
    keys = {"a": LEFT, "s": CONFIRM, "d": RIGHT}

    def read_keys() -> None:
        for line in sys.stdin:
            for ch in line.strip().lower():
                if ch in keys:
                    events.put(keys[ch])

    print("Pager simulator: a = LEFT, s = CONFIRM, d = RIGHT (then Enter). Ctrl+C to quit.")
    threading.Thread(target=read_keys, daemon=True).start()
    while True:
        ui.tick(events)


try:
    import arduino.app_utils  # noqa: F401  (present only on the UNO Q)
    ON_BOARD = True
except ImportError:
    ON_BOARD = False

if ON_BOARD:
    run_board()
elif __name__ == "__main__":
    run_console()
