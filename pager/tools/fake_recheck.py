"""The pager's stub (python/stub.py) served over HTTP, for testing a board against a laptop.

    python fake_recheck.py [--port 8765] [--key dev-pager-key-not-secret]

Point the pager's pager_config.json "api_base" at http://<this laptop's IP>:8765.
The laptop and the UNO Q must be on the same Wi-Fi (a phone hotspot works). Nothing
is stored and no database is touched. The answers are the stub's, which copies the
real API's shapes and rules (see python/stub.py).

Type a command and press Enter:
    assign          a patient gets pager 42 (or the number the pager asks for)
    open            open a check-in now (with a new circle check)
    call            staff call the patient to the desk
    unassign        the pager is handed back
    group <name>    give the pager to a new patient in this complaint group: chest_back_pain,
                    neuro_change, head_injury, confused_drowsy or general (sets the follow-ups)
    cedis <code>    the visit's CEDIS code, or "cedis none"
    status          show the fake visit
    quit
"""

import argparse
import json
import os
import sys
import threading
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "python"))

from stub import GROUPS, StubVisit  # noqa: E402

visit = StubVisit("42", checkin_open=False)
visit.unassign()
visit.status = None                 # starts with no patient: type "assign"


class Handler(BaseHTTPRequestHandler):
    key = ""

    def log_message(self, *args):
        pass

    def reply(self, code: int, body: dict) -> None:
        data = json.dumps(body).encode()
        self.send_response(code)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(data)))
        self.end_headers()
        self.wfile.write(data)

    def pager_no(self):
        parts = self.path.strip("/").split("/")
        if len(parts) >= 3 and parts[:2] == ["api", "pager"]:
            return parts[2], parts[3:]
        return None, None

    def authorized(self) -> bool:
        if self.headers.get("X-Pager-Key") != self.key:
            self.reply(401, {"detail": "not one of this site's pagers"})
            return False
        return True

    def do_GET(self):
        number, rest = self.pager_no()
        if number is None or rest:
            return self.reply(404, {"detail": "not found"})
        if self.authorized():
            self.reply(200, visit.state(number))

    def do_POST(self):
        number, rest = self.pager_no()
        if number is None or rest != ["reports"]:
            return self.reply(404, {"detail": "not found"})
        if not self.authorized():
            return
        body = json.loads(self.rfile.read(int(self.headers.get("Content-Length", 0))) or b"{}")
        code, reply = visit.report(number, body)
        print(f"\n<- report from pager {number}: {summary(body)}  -> {code} {describe(reply)}")
        self.reply(code, reply)


def summary(body: dict) -> str:
    kind = body.get("kind")
    if kind == "checkin":
        def v(name):
            a = body.get(name) or {}
            return a.get("value") if a.get("kind") == "answered" else a.get("reason")
        items = ", ".join(f"{k}={a.get('value', a.get('reason'))}" for k, a in (body.get("items") or {}).items())
        return (f"{body.get('purpose', 'scheduled')} check-in: feeling now={v('feeling_now')}, "
                f"change={v('feeling_change')}, pain={v('pain')}, findings={v('new_findings')}"
                + (f", {items}" if items else ""))
    if kind == "concern":
        return f"concern: {body.get('concern')}"
    if kind == "finding":
        return f"new symptoms: {', '.join(body.get('findings', []))}"
    return kind or "?"


def describe(reply: dict) -> str:
    if "detail" in reply:
        return reply["detail"]
    last = visit.log[-1] if visit.log else {}
    parts = [reply.get("patient_message", "")]
    if reply.get("duplicate"):
        parts.append("(retry)")
    if last.get("attention"):
        parts.append(f"circle check {last['attention']}")
    if reply.get("follow_up_items"):
        parts.append("follow-ups: " + ", ".join(reply["follow_up_items"]))
    return "; ".join(p for p in parts if p)


def commands() -> None:
    while True:
        try:
            cmd = input("> ").strip().lower()
        except EOFError:
            return
        word, _, arg = cmd.partition(" ")
        with visit.lock:
            if cmd == "assign":
                visit.assign(group=visit.group, cedis=visit.cedis)
            elif cmd == "open":
                visit.open_checkin()
            elif cmd == "call":
                visit.call()
            elif cmd == "unassign":
                visit.unassign()
            elif word == "group" and arg in GROUPS:
                visit.assign(group=arg, cedis=visit.cedis)
            elif word == "cedis" and (arg == "none" or (arg.isdigit() and len(arg) == 3)):
                visit.cedis = None if arg == "none" else arg
            elif cmd == "quit":
                raise SystemExit
            elif cmd not in ("status", ""):
                print(f"commands: assign, open, call, unassign, group <{'|'.join(GROUPS)}>, cedis <code|none>, "
                      "status, quit")
                continue
            print("visit:", {"status": visit.status, "group": visit.group, "cedis": visit.cedis,
                             "next_prompt_due_at": visit.next_prompt_due_at.isoformat(),
                             "answers": visit.answers, "findings": visit.findings})


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("--port", type=int, default=8765)
    parser.add_argument("--key", default="dev-pager-key-not-secret")
    args = parser.parse_args()
    Handler.key = args.key
    server = ThreadingHTTPServer(("0.0.0.0", args.port), Handler)
    threading.Thread(target=server.serve_forever, daemon=True).start()
    print(f"Fake Recheck pager API on port {args.port}. Type 'assign' to give the pager to a patient.")
    try:
        commands()
    finally:
        server.shutdown()


if __name__ == "__main__":
    main()
