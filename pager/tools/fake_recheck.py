"""An in-memory stand-in for the Recheck pager API, for testing the pager with no database writes.

    python fake_recheck.py [--port 8765] [--key dev-pager-key-not-secret]

Point the pager's pager_config.json "api_base" at http://<this laptop's IP>:8765.
The laptop and the UNO Q must be on the same Wi-Fi (a phone hotspot works).

Type a command and press Enter:
    assign     a patient gets pager 42 (or the number the pager asks for)
    open       open a check-in now
    call       staff call the patient to the desk
    unassign   the pager is handed back
    status     show the fake visit
    quit

The patient messages here are a rough copy of the real rules, only so every screen can be
seen. The real server (api/src/recheck/rules.py) decides what really happens.
"""

import argparse
import json
import threading
from datetime import datetime, timedelta, timezone
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

VERSION = "fake"
lock = threading.Lock()
visit = {"state": "unassigned", "checkin_open": False, "triaged_at": None, "next_due": None}
seen = set()


def now() -> datetime:
    return datetime.now(timezone.utc)


def state_body(pager_no: str) -> dict:
    with lock:
        waiting = visit["state"] == "waiting"
        return {
            "pager_no": pager_no,
            "state": visit["state"],
            "server_time": now().isoformat(),
            "checkin_open": waiting and visit["checkin_open"],
            "next_checkin_due_at": visit["next_due"].isoformat() if waiting and visit["next_due"] else None,
            "waited_minutes": int((now() - visit["triaged_at"]).total_seconds() // 60) if waiting else None,
            "questionnaire_version": VERSION,
        }


def message_for(body: dict) -> str:
    kind = body.get("kind")
    if kind == "leaving":
        return "leaving_info"
    if kind == "finding":
        return "clinician_told"
    if kind == "concern":
        return {"help_now": "clinician_told", "worried": "clinician_will_check"}.get(body.get("concern"), "none")
    change = (body.get("feeling_change") or {}).get("value")
    feeling = (body.get("feeling_now") or {}).get("value")
    if change == "much_worse" or feeling == "very_poor":
        return "clinician_told"
    if change == "worse" or feeling == "poor":
        return "clinician_will_check"
    return "none"


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
            self.reply(200, state_body(number))

    def do_POST(self):
        number, rest = self.pager_no()
        if number is None or rest != ["reports"]:
            return self.reply(404, {"detail": "not found"})
        if not self.authorized():
            return
        body = json.loads(self.rfile.read(int(self.headers.get("Content-Length", 0))) or b"{}")
        if body.get("channel") != "pager" or body.get("reporter") != "patient":
            return self.reply(422, {"detail": "pager reports use channel: pager, reporter: patient"})
        with lock:
            if visit["state"] != "waiting":
                return self.reply(404, {"detail": "no waiting patient has this pager"})
            duplicate = body.get("submission_id") in seen
            if body.get("kind") == "checkin" and not duplicate:
                if not visit["checkin_open"]:
                    return self.reply(409, {"detail": "the next check-in isn't open yet"})
                visit["checkin_open"] = False
                visit["next_due"] = now() + timedelta(minutes=30)
            seen.add(body.get("submission_id"))
        print(f"\n<- report from pager {number}: {summary(body)}{'  (retry)' if duplicate else ''}")
        self.reply(200, {"submission_id": body.get("submission_id"), "received_at": now().isoformat(),
                         "duplicate": duplicate, "patient_message": message_for(body), "follow_up_items": []})


def summary(body: dict) -> str:
    kind = body.get("kind")
    if kind == "checkin":
        def v(name):
            a = body.get(name) or {}
            return a.get("value") or a.get("reason")
        return f"check-in: feeling now={v('feeling_now')}, change={v('feeling_change')}"
    if kind == "concern":
        return f"concern: {body.get('concern')}"
    if kind == "finding":
        return f"new symptoms: {', '.join(body.get('findings', []))}"
    return kind or "?"


def commands() -> None:
    while True:
        try:
            cmd = input("> ").strip().lower()
        except EOFError:
            return
        with lock:
            if cmd == "assign":
                visit.update(state="waiting", checkin_open=False, triaged_at=now(), next_due=now() + timedelta(minutes=30))
            elif cmd == "open":
                if visit["state"] == "waiting":
                    visit.update(checkin_open=True, next_due=now())
            elif cmd == "call":
                visit.update(state="called", checkin_open=False)
            elif cmd == "unassign":
                visit.update(state="unassigned", checkin_open=False, triaged_at=None, next_due=None)
            elif cmd == "quit":
                raise SystemExit
            elif cmd not in ("status", ""):
                print("commands: assign, open, call, unassign, status, quit")
                continue
            print("visit:", {k: (v.isoformat() if isinstance(v, datetime) else v) for k, v in visit.items()})


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
