"""An in-memory stand-in for the Recheck pager API, for testing the pager with no database writes.

    python fake_recheck.py [--port 8765] [--key dev-pager-key-not-secret]

Point the pager's pager_config.json "api_base" at http://<this laptop's IP>:8765.
The laptop and the UNO Q must be on the same Wi-Fi (a phone hotspot works).

Type a command and press Enter:
    assign          a patient gets pager 42 (or the number the pager asks for)
    open            open a check-in now (with a new circle check)
    call            staff call the patient to the desk
    unassign        the pager is handed back
    group <name>    the visit's complaint group: chest_back_pain, neuro_change,
                    head_injury, confused_drowsy or general (sets its follow-up questions)
    cedis <code>    the visit's CEDIS code, or "cedis none"
    status          show the fake visit
    quit

Besides the state the pager API sends today, this sends what the phone's PatientHome
sends, so the pager's full check-in can be seen: `items` (the visit's follow-up
questions, chosen from question-bank/questionnaire.json with the bank's branching) and,
while a check-in is open, `attention_prompt` (a circle check made like the server's
api/src/recheck/attention.py). A receipt names `follow_up_items` the way the server does.

The patient messages here are a rough copy of the real rules, only so every screen can be
seen. The real server (api/src/recheck/rules.py) decides what really happens.
"""

import argparse
import json
import math
import os
import random
import threading
import uuid
from datetime import datetime, timedelta, timezone
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

HERE = os.path.dirname(os.path.abspath(__file__))
BANK_PATH = os.path.join(HERE, "..", "..", "question-bank", "questionnaire.json")
GROUPS = ("chest_back_pain", "neuro_change", "head_injury", "confused_drowsy", "general")
URGENT = {"speech_change", "facial_droop", "new_weakness_numbness", "trouble_breathing",
          "fainting", "heavy_bleeding", "new_confusion", "chest_pain"}

lock = threading.Lock()
visit = {"state": "unassigned", "checkin_open": False, "triaged_at": None, "next_due": None,
         "group": "chest_back_pain", "cedis": None, "answers": {}, "findings": [], "prompt": None}
seen = set()


def now() -> datetime:
    return datetime.now(timezone.utc)


# --- The question bank ----------------------------------------------------------------------------

def _walk(items):
    for item in items:
        yield item
        yield from _walk(item.get("item", []))


def _ext(item: dict, name: str, default=None):
    for e in item.get("extension", []):
        if e["url"].endswith(name):
            for k, v in e.items():
                if k.startswith("value"):
                    return v
    return default


with open(BANK_PATH, encoding="utf-8") as f:
    BANK = json.load(f)
VERSION = BANK["version"]
ITEMS = {i["linkId"]: i for i in _walk(BANK["item"])}
FOLLOW_UP = [i["linkId"] for i in ITEMS["follow_up"].get("item", [])]


def question_item(key: str) -> dict:
    """The phone's QuestionItem for a bank item, patient wording, English (routes/patient.py)."""
    item = ITEMS[key]
    if item["type"] == "boolean":
        kind = "yes_no"
    elif item["type"] == "integer":
        kind = "scale"
    elif item.get("repeats"):
        kind = "multi_choice"
    else:
        kind = "choice"
    options = [{"code": o["valueCoding"]["code"], "text": o["valueCoding"]["display"]}
               for o in item.get("answerOption", [])]
    unsure = _ext(item, "allow-unsure")
    return {"key": key, "input_type": kind, "text": item["text"], "options": options,
            "allow_unsure": True if unsure is None else bool(unsure)}


def _met(condition: dict, answers: dict) -> bool:
    given = answers.get(condition["question"])
    if given is None:
        return False
    if "answerBoolean" in condition:
        return given == condition["answerBoolean"]
    if "answerCoding" in condition:
        code = condition["answerCoding"]["code"]
        return code in given if isinstance(given, list) else given == code
    if "answerString" in condition:
        return given == condition["answerString"]
    return False


def enabled(key: str, answers: dict) -> bool:
    conditions = ITEMS[key].get("enableWhen", [])
    if not conditions:
        return True
    results = [_met(c, answers) for c in conditions]
    return any(results) if ITEMS[key].get("enableBehavior") == "any" else all(results)


def follow_ups(answers: dict) -> list[str]:
    """Enabled follow-ups, ask-now first then ask-after-routing (question_bank.follow_ups)."""
    merged = {**answers, "complaint_group": visit["group"]}
    if visit["cedis"]:
        merged["cedis_code"] = visit["cedis"]
    now_, later = [], []
    for key in FOLLOW_UP:
        if enabled(key, merged):
            (later if _ext(ITEMS[key], "ask-after-routing", False) else now_).append(key)
    return now_ + later


def answers_so_far() -> dict:
    return {**visit["answers"], "new_findings": list(visit["findings"])}


# --- The circle check (api/src/recheck/attention.py) ----------------------------------------------

def new_prompt() -> dict:
    item = ITEMS["circle_count"]
    rng = random.Random()
    circles = rng.randint(_ext(item, "attention-circles-min"), _ext(item, "attention-circles-max"))
    squares = rng.randint(_ext(item, "attention-squares-min"), _ext(item, "attention-squares-max"))
    shapes = ["circle"] * circles + ["square"] * squares
    rng.shuffle(shapes)
    steps, previous = [], None
    for shape in shapes:
        while True:
            point = (rng.uniform(0.1, 0.9), rng.uniform(0.1, 0.9))
            if previous is None or math.dist(point, previous) >= 0.25:
                break
        previous = point
        steps.append({"shape": shape, "x": round(point[0], 3), "y": round(point[1], 3)})
    expires = now() + timedelta(minutes=_ext(item, "attention-expires-minutes"))
    return {"prompt_id": str(uuid.uuid4()), "steps": steps, "show_ms": _ext(item, "attention-show-ms"),
            "gap_ms": _ext(item, "attention-gap-ms"), "expires_at": expires.isoformat(), "expected": circles}


def current_prompt() -> dict:
    p = visit["prompt"]
    if p is None or datetime.fromisoformat(p["expires_at"]) <= now():
        p = visit["prompt"] = new_prompt()
    return {k: v for k, v in p.items() if k != "expected"}


# --- State and reports ----------------------------------------------------------------------------

def state_body(pager_no: str) -> dict:
    with lock:
        waiting = visit["state"] == "waiting"
        is_open = waiting and visit["checkin_open"]
        body = {
            "pager_no": pager_no,
            "state": visit["state"],
            "server_time": now().isoformat(),
            "checkin_open": is_open,
            "next_checkin_due_at": visit["next_due"].isoformat() if waiting and visit["next_due"] else None,
            "waited_minutes": int((now() - visit["triaged_at"]).total_seconds() // 60) if waiting else None,
            "questionnaire_version": VERSION,
        }
        if waiting:
            body["items"] = [question_item(k) for k in follow_ups(answers_so_far())]
            body["attention_prompt"] = current_prompt() if is_open else None
        return body


def findings_of(body: dict) -> list[str]:
    if body.get("kind") == "finding":
        return list(body.get("findings", []))
    nf = body.get("new_findings") or {}
    return list(nf.get("value", [])) if nf.get("kind") == "answered" else []


def message_for(body: dict) -> str:
    kind = body.get("kind")
    if kind == "leaving":
        return "leaving_info"
    if kind == "finding":
        return "clinician_told"
    if kind == "concern":
        return {"help_now": "clinician_told", "worried": "clinician_will_check"}.get(body.get("concern"), "none")
    if any(f in URGENT for f in findings_of(body)):
        return "clinician_told"
    change = (body.get("feeling_change") or {}).get("value")
    feeling = (body.get("feeling_now") or {}).get("value")
    if change == "much_worse" or feeling == "very_poor":
        return "clinician_told"
    if change == "worse" or feeling == "poor" or findings_of(body):
        return "clinician_will_check"
    return "none"


def follow_up_items(body: dict) -> list[str]:
    """As routes/reports.follow_up_items: for a check-in, enabled items not yet answered;
    for a finding, the items the finding enables. Like the server, it reads this report only."""
    findings = findings_of(body)
    if body.get("kind") == "checkin":
        raw = {k: a.get("value") for k, a in (body.get("items") or {}).items() if a.get("kind") != "missing"}
        answers = {**raw, "new_findings": findings}
        return [k for k in follow_ups(answers) if k not in (body.get("items") or {})]
    if body.get("kind") == "finding":
        before = follow_ups({"new_findings": []})
        return [k for k in follow_ups({"new_findings": findings}) if k not in before]
    return []


def record(body: dict) -> str:
    """Keep the answers for branching; score the circle check. Returns a line for the console."""
    for key, a in (body.get("items") or {}).items():
        if a.get("kind") != "missing":
            visit["answers"][key] = a.get("value")
    for f in findings_of(body):
        if f not in visit["findings"]:
            visit["findings"].append(f)
    att = body.get("attention") or {}
    p = visit["prompt"]
    if body.get("kind") != "checkin" or att.get("reason") == "not_asked":
        return ""
    if att.get("prompt_id") and (p is None or att["prompt_id"] != p["prompt_id"]):
        return "  circle check: WRONG PROMPT"
    if att.get("kind") == "answered":
        ok = att["count"] == p["expected"]
        return f"  circle check: {att['count']} of {p['expected']} ({'correct' if ok else 'INCORRECT: staff check'})"
    shown = "shown, " if att.get("prompt_id") else ""
    return f"  circle check: {shown}{att.get('reason')}"


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
            scheduled = body.get("kind") == "checkin" and body.get("purpose", "scheduled") == "scheduled"
            if scheduled and not duplicate and not visit["checkin_open"]:
                return self.reply(409, {"detail": "the next check-in isn't open yet"})
            follow = [] if duplicate else follow_up_items(body)
            scored = "" if duplicate else record(body)
            if scheduled and not duplicate:
                visit.update(checkin_open=False, next_due=now() + timedelta(minutes=30), prompt=None)
            seen.add(body.get("submission_id"))
        print(f"\n<- report from pager {number}: {summary(body)}{'  (retry)' if duplicate else ''}{scored}")
        if follow:
            print(f"   follow-up questions: {', '.join(follow)}")
        self.reply(200, {"submission_id": body.get("submission_id"), "received_at": now().isoformat(),
                         "duplicate": duplicate, "patient_message": message_for(body), "follow_up_items": follow})


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


def commands() -> None:
    while True:
        try:
            cmd = input("> ").strip().lower()
        except EOFError:
            return
        word, _, arg = cmd.partition(" ")
        with lock:
            if cmd == "assign":
                visit.update(state="waiting", checkin_open=False, triaged_at=now(),
                             next_due=now() + timedelta(minutes=30), answers={}, findings=[], prompt=None)
            elif cmd == "open":
                if visit["state"] == "waiting":
                    visit.update(checkin_open=True, next_due=now(), prompt=None)
            elif cmd == "call":
                visit.update(state="called", checkin_open=False)
            elif cmd == "unassign":
                visit.update(state="unassigned", checkin_open=False, triaged_at=None, next_due=None)
            elif word == "group" and arg in GROUPS:
                visit["group"] = arg
            elif word == "cedis" and (arg == "none" or (arg.isdigit() and len(arg) == 3)):
                visit["cedis"] = None if arg == "none" else arg
            elif cmd == "quit":
                raise SystemExit
            elif cmd not in ("status", ""):
                print(f"commands: assign, open, call, unassign, group <{'|'.join(GROUPS)}>, cedis <code|none>, "
                      "status, quit")
                continue
            shown = {k: (v.isoformat() if isinstance(v, datetime) else v) for k, v in visit.items() if k != "prompt"}
            print("visit:", shown)


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
