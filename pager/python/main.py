"""Recheck pager: Linux side of the Arduino UNO Q app.

Holds every screen and talks to the Recheck API over Wi-Fi. The check-in's questions,
answers and report body are in checkin.py, next to this file. The MCU sketch
(sketch/sketch.ino) only draws text and the circle check's shapes, reads the three
buttons and drives the LEDs.

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

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)  # checkin.py sits next to this file

from checkin import (  # noqa: E402
    CONFIRM, FINDINGS, LEFT, LIST_FOOTER, RIGHT, ROWS, WIDTH, Flow, checkin_questions, followup_questions,
    list_screen, play_ms, play_spec,
)

POLL_SECONDS = 5
HTTP_TIMEOUT = 6
OFFLINE_AFTER_FAILURES = 3
RESULT_SECONDS = 8
SEND_TRIES = 3
PLAY_SLACK_MS = 300  # Bridge delay before the MCU starts the shapes

CONFIG_PATH = os.path.join(HERE, "pager_config.json")

BACK = "__back"
SEND = "__send"

# Mirrors the phone's always-available options.
REPORT_MENU = [("I need help now", "help_now"), ("I'm worried", "worried"), ("New symptom", "symptoms"),
               ("Question for desk", "desk_question"), ("I'm leaving", "leaving"), ("Back", BACK)]

LIST_TITLES = {"report": "Report to staff", "symptoms": "New symptoms"}

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
    "followup": ("Thank you", "Answers sent."),
}
MORE_QUESTIONS = "Next: a few more"   # the result screen when the server asked for follow-ups


def load_config(path: str = CONFIG_PATH) -> dict:
    cfg = {"api_base": "stub", "pager_no": "42", "pager_key": "", "stub_group": "chest_back_pain"}
    try:
        with open(path, encoding="utf-8") as f:
            cfg.update(json.load(f))
    except FileNotFoundError:
        print(f"{path} not found: using the stub (copy pager_config.example.json to connect)")
    cfg["api_base"] = str(cfg["api_base"]).rstrip("/") or "stub"
    cfg["pager_no"] = str(cfg["pager_no"])
    return cfg


def make_api(cfg: dict):
    """The real API, or with "api_base": "stub" the stub on the pager itself (not connected to anything)."""
    if cfg["api_base"] == "stub":
        from stub import StubApi, StubVisit

        print(f"Not connected: answers come from the stub (complaint group {cfg['stub_group']}).")
        return StubApi(StubVisit(cfg["pager_no"], group=cfg["stub_group"]), cfg["pager_no"], error=ApiError)
    return Api(cfg["api_base"], cfg["pager_no"], cfg["pager_key"])


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
        self.view = "pages"             # pages | flow | report | symptoms | confirm | result
        self.page = "status"            # checkin | status | report
        self.cursor = 0
        self.top = 0
        self.flow: Flow | None = None
        self.play_until = 0.0
        self.followups: list[str] = []  # follow-up items the last receipt asked for
        self.asked: set[str] = set()    # questions offered since the check-in started
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
        return datetime.fromtimestamp(self.server_now(), timezone.utc).isoformat()

    def server_now(self) -> float:
        return self.clock() + self.offset

    def pages(self) -> list[str]:
        st = self.state or {}
        return (["checkin"] if st.get("checkin_open") else []) + ["status", "report"]

    # -- buttons ------------------------------------------------------------
    def handle(self, button: int) -> None:
        if self.view == "result":
            self.end_result()
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
                self.start_checkin()
            elif self.page == "report":
                self.open_list("report", 0)
            return
        if self.view == "flow":
            self.flow_button(button)
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
        if self.view == "report":
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
                    self.asked = set()      # a new report: its follow-ups are all new
                    findings = [code for code, _ in FINDINGS if code in self.picked]
                    self.send({"kind": "finding", "findings": findings}, "finding")
            elif value in self.picked:
                self.picked.remove(value)
            else:
                self.picked.append(value)

    def items(self) -> list[tuple[str, object]]:
        if self.view == "report":
            return REPORT_MENU
        if self.view == "symptoms":
            rows = [(("[x] " if code in self.picked else "[ ] ") + label, code) for code, label in FINDINGS]
            return rows + [(f"Send ({len(self.picked)} ticked)", SEND), ("Back", BACK)]
        return []

    def open_list(self, view: str, cursor: int) -> None:
        self.view, self.cursor, self.top = view, cursor, 0

    def to_pages(self, page: str | None = None) -> None:
        self.view = "pages"
        self.flow = None
        if page:
            self.page = page

    # -- the check-in -------------------------------------------------------
    def start_checkin(self) -> None:
        st = self.state or {}
        questions = checkin_questions(st)
        self.asked = {q.key for q in questions}
        self.flow = Flow(questions, prompt=st.get("attention_prompt"), version=st.get("questionnaire_version"))
        self.view = "flow"

    def start_followups(self, keys: list[str]) -> None:
        """Ask the follow-ups a receipt named. The server lists them in the state's items.

        A question already offered since the check-in started isn't asked again, so
        skipping one can't bring it back over and over.
        """
        self.poll()
        st = self.state or {}
        questions = [q for q in followup_questions(st, keys) if q.key not in self.asked]
        if not questions or st.get("state") != "waiting":
            return
        self.asked |= {q.key for q in questions}
        self.flow = Flow(questions, mode="followup", version=st.get("questionnaire_version"))
        self.view = "flow"

    def flow_button(self, button: int) -> None:
        flow = self.flow
        was_playing = flow.playing
        action = flow.handle(button)
        if was_playing and not flow.playing:
            self.io.redraw()            # stopped: the MCU was drawing shapes
        if action == "exit":
            self.to_pages("checkin" if flow.mode == "full" else "status")
        elif action == "send":
            self.send_flow()
        elif action == "play":
            self.play_circles()

    def send_flow(self) -> None:
        flow = self.flow
        if flow.mode != "full" and not flow.any_answered():
            self.to_pages("status")     # a follow-up with no answers sends nothing
            return
        self.send(flow.report(), "checkin" if flow.mode == "full" else "followup")

    def play_circles(self) -> None:
        """Start the circle check. An expired prompt is fetched again first, as on the phone."""
        flow = self.flow
        prompt = flow.prompt
        expires = parse_time((prompt or {}).get("expires_at"))
        if prompt and expires and expires.timestamp() <= self.server_now():
            self.poll()
            fresh = (self.state or {}).get("attention_prompt")
            if fresh and fresh.get("prompt_id") != prompt.get("prompt_id"):
                flow.prompt = prompt = fresh
            else:
                prompt = None
        if not prompt:
            if flow.skip_circle() == "send":
                self.send_flow()
            return
        flow.start_playing()
        self.io.play(play_spec(prompt))
        self.play_until = self.clock() + (play_ms(prompt) + PLAY_SLACK_MS) / 1000

    # -- reports ------------------------------------------------------------
    def send(self, body: dict, kind: str) -> None:
        """POST a report. Retries reuse the same submission_id, so a retry is never counted twice."""
        body = {"submission_id": str(uuid.uuid4()), "reporter": "patient", "channel": "pager",
                "captured_at": self.now_iso(), **body}
        self.flow = None
        self.followups = []
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
            lines = MESSAGES.get(message) or AFTER_KIND.get(kind, ("Sent",))
            self.followups = [str(k) for k in receipt.get("follow_up_items") or []]
            if self.followups:
                lines = (*lines[:5], "", MORE_QUESTIONS)
            self.result(lines, ok=True)
            self.next_poll = 0          # refresh the state right away
            return
        self.result(("Not sent", "No connection.", "Please tell the", "triage desk."), ok=False)

    def result(self, lines: tuple, ok: bool) -> None:
        self.view = "result"
        self.result_lines, self.result_ok = lines, ok
        self.result_until = self.clock() + RESULT_SECONDS

    def end_result(self) -> None:
        """The result was read or timed out: go home, or on to the follow-up questions."""
        keys, self.followups = self.followups, []
        self.to_pages()
        if keys:
            self.start_followups(keys)

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
            self.to_pages()
            return (header, "", "PLEASE GO TO THE", "TRIAGE DESK NOW", "", "Staff are ready", "for you."), 2, 1
        if self.view == "result":
            if self.clock() < self.result_until:
                return (self.result_lines[0], "", *self.result_lines[1:]), 0 if self.result_ok else 1, 1
            self.end_result()
        if st.get("state") != "waiting":
            self.to_pages()
            return (header, "", "Not in use.", "", "Staff give this", "pager out at triage."), 0, 1
        if self.view == "flow":
            return self.flow.lines(), 0, 1
        if self.view == "confirm":
            title, *body = CONFIRM_TEXT[self.pending]
            return (title, "", *body, "", "", CONFIRM_FOOTER), 0, 1
        if self.view in LIST_TITLES:
            return self.list_screen(), 0, 1
        return self.page_screen(), (2 if st.get("checkin_open") else 0), 1

    def list_screen(self) -> tuple:
        lines, self.top = list_screen(LIST_TITLES[self.view], [], [label for label, _ in self.items()],
                                      self.cursor, self.top)
        return lines

    def page_screen(self) -> tuple:
        st = self.state or {}
        pages = self.pages()
        if self.page not in pages:
            self.page = "status"
        nav = "<" + f"page {pages.index(self.page) + 1}/{len(pages)}".center(WIDTH - 2) + ">"
        if self.page == "checkin":
            n = len(checkin_questions(st))
            return ("CHECK-IN TIME", "", f"{n} quick questions", "about how you feel.", "", "Press * to start", nav)
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
        # While the MCU draws the circle check, leave the screen to it.
        if not (self.view == "flow" and self.flow and self.flow.playing):
            self.io.show(*lines)
        self.io.leds(red, green)

    def tick(self, events: "queue.Queue[int]") -> None:
        if self.view == "flow" and self.flow and self.flow.playing:
            if self.clock() >= self.play_until:
                self.flow.played()
                self.io.redraw()
        elif self.clock() >= self.next_poll:   # never poll mid-shapes: a slow call would stretch them
            self.poll()
            self.next_poll = self.clock() + POLL_SECONDS
        try:
            self.handle(events.get(timeout=0.05))
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

    def play(self, spec: str) -> None:
        """The MCU shows the circle check's shapes with its own timer, so Linux delays can't stretch them."""
        self._screen = None
        self._call("play", spec)

    def redraw(self) -> None:
        """The MCU drew something else: send the next screen even if it hasn't changed."""
        self._screen = None


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

    def play(self, spec: str) -> None:
        """Print each shape as a small picture, on the same timing as the board (O circle, # square)."""
        self._screen = None
        lead, show_ms, gap_ms = (int(v) for v in spec.split(";")[0].split(","))
        shapes = [s.split(",") for s in spec.split(";")[1:]]

        def run() -> None:
            time.sleep(lead / 1000)
            for kind, x, y in shapes:
                col, row = int(x) * 31 // 127, int(y) * 7 // 63
                grid = [[" "] * 32 for _ in range(8)]
                grid[row][col] = "O" if kind == "C" else "#"
                print("\n" * 3 + "\n".join("|" + "".join(r) + "|" for r in grid))
                time.sleep(show_ms / 1000)
                print("\n" * 12)
                time.sleep(gap_ms / 1000)

        threading.Thread(target=run, daemon=True).start()

    def redraw(self) -> None:
        self._screen = None


def run_board() -> None:
    from arduino.app_utils import App, Bridge

    cfg = load_config()
    events: "queue.Queue[int]" = queue.Queue()
    ui = PagerUI(make_api(cfg), BoardIo(Bridge), cfg["pager_no"])
    Bridge.provide("button", lambda code: events.put(int(code)))
    App.run(user_loop=lambda: ui.tick(events))


def run_console() -> None:
    cfg = load_config()
    events: "queue.Queue[int]" = queue.Queue()
    ui = PagerUI(make_api(cfg), ConsoleIo(), cfg["pager_no"])
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
