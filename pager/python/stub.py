"""The pager's stub server: what the Recheck pager API would answer, made on the pager itself.

Not connected to anything. Set "api_base": "stub" in pager_config.json (or leave it
empty) and the pager talks to this instead of the network. tools/fake_recheck.py
serves the same thing over HTTP for testing a board against a laptop.

Every answer has the real API's shape, and the visit behaves as the database row does:

  GET  /api/pager/{n}           PagerState (api/src/recheck/routes/pager.py), plus the
                                phone's `items` and `attention_prompt` (PatientHome) that
                                the pager check-in reads
  POST /api/pager/{n}/reports   ReportReceipt, or the route's 404, 409 and 422 errors

What it copies from the server:
  - The visit: `status` waiting, roomed or discharged; `triaged_at`; `next_prompt_due_at`,
    which a scheduled check-in moves to now + ctas_interval(ctas) (db/schema.sql)
  - "called": roomed in the last 15 minutes (CALLED_FOR_MINUTES)
  - The follow-up questions, the branching and the circle check: question-bank data in
    stub_bank.json (made by tools/make_stub_bank.py from question-bank/questionnaire.json)
  - Circle prompts: generated as in api/src/recheck/attention.py; one answer each,
    refused when expired or unknown
  - patient_message: api/src/recheck/rules.py (patient_message and weigh)
  - follow_up_items: api/src/recheck/routes/reports.py (follow_up_items)
  - A retry with the same submission_id gets the same receipt with duplicate: true

What it doesn't do: store anything, raise staff tasks or reach a dashboard.
"""

from __future__ import annotations

import json
import math
import os
import random
import threading
import uuid
from datetime import datetime, timedelta, timezone

HERE = os.path.dirname(os.path.abspath(__file__))
with open(os.path.join(HERE, "stub_bank.json"), encoding="utf-8") as _f:
    BANK = json.load(_f)
VERSION = BANK["version"]
FOLLOW_UP = {f["item"]["key"]: f for f in BANK["follow_up"]}

GROUPS = ("chest_back_pain", "neuro_change", "head_injury", "confused_drowsy", "general")
CTAS_MINUTES = {2: 15, 3: 30, 4: 60, 5: 120}      # db/schema.sql ctas_interval(), demo values
CALLED_FOR_MINUTES = 15                            # routes/pager.py
CHECKIN_NOT_DUE = "the next check-in isn't open yet"

# api/src/recheck/rules.py
URGENT_FINDINGS = frozenset({"speech_change", "facial_droop", "new_weakness_numbness", "trouble_breathing",
                             "fainting", "heavy_bleeding", "new_confusion", "chest_pain"})
KNOWN_AT_TRIAGE = {"chest_back_pain": {"chest_pain"}, "confused_drowsy": {"new_confusion", "drowsiness"}}
FEELING_OK = {"ok", "good", "very_good"}


def utcnow() -> datetime:
    return datetime.now(timezone.utc)


# --- The bank ---------------------------------------------------------------------------------------

def enabled(key: str, answers: dict) -> bool:
    entry = FOLLOW_UP[key]
    conditions = entry["enable_when"]
    if not conditions:
        return True
    results = []
    for c in conditions:
        given = answers.get(c["question"])
        if given is None:
            results.append(False)
        elif isinstance(given, list):
            results.append(c["answer"] in given)
        else:
            results.append(given == c["answer"])
    return any(results) if entry["behavior"] == "any" else all(results)


def follow_ups(group: str, cedis: str | None, answers: dict) -> list[str]:
    """Enabled follow-ups: ask-now first, then ask-after-routing (question_bank.follow_ups)."""
    merged = {**answers, "complaint_group": group}
    if cedis:
        merged["cedis_code"] = cedis
    now, later = [], []
    for key, entry in FOLLOW_UP.items():
        if enabled(key, merged):
            (later if entry["after_routing"] else now).append(key)
    return now + later


# --- The rules --------------------------------------------------------------------------------------

def findings_of(body: dict) -> list[str]:
    if body.get("kind") == "finding":
        return list(body.get("findings") or [])
    nf = body.get("new_findings") or {}
    return list(nf.get("value") or []) if body.get("kind") == "checkin" and nf.get("kind") == "answered" else []


def _answered(body: dict, name: str):
    a = body.get(name) or {}
    return a.get("value") if a.get("kind") == "answered" else None


def patient_message(body: dict, group: str) -> str:
    """rules.patient_message: any clinical task gets "a clinician will check on you"; never clinician_told."""
    kind = body.get("kind")
    if kind == "leaving":
        return "leaving_info"
    if kind == "concern":
        # help_now is red, worried amber; desk_question only goes to the triage nurse.
        return "none" if body.get("concern") == "desk_question" else "clinician_will_check"
    findings = findings_of(body)
    now, change = (_answered(body, "feeling_now"), _answered(body, "feeling_change")) if kind == "checkin" else (None, None)
    clinical = bool(findings) or change == "much_worse" or (change == "worse" and now not in FEELING_OK)
    return "clinician_will_check" if clinical else "none"


def is_urgent(code: str, group: str) -> bool:
    return code in URGENT_FINDINGS and code not in KNOWN_AT_TRIAGE.get(group, set())


# --- The visit --------------------------------------------------------------------------------------

class StubVisit:
    """One visit holding this pager, as the `visit` row and its reports would hold it."""

    def __init__(self, pager_no: str = "42", *, group: str = "chest_back_pain", cedis: str | None = None,
                 ctas: int = 3, waited_minutes: int = 34, checkin_open: bool = True, clock=utcnow, rng=None):
        self.lock = threading.Lock()
        self.clock = clock
        self.rng = rng or random.Random()
        self.pager_no = str(pager_no)
        self.assign(group=group, cedis=cedis, ctas=ctas, waited_minutes=waited_minutes, checkin_open=checkin_open)

    # -- what staff do (the triage desk and the board) ------------------------------------------------
    def assign(self, *, group: str = "chest_back_pain", cedis: str | None = None, ctas: int = 3,
               waited_minutes: int = 0, checkin_open: bool = False) -> None:
        """Enrolment: a waiting visit with this pager."""
        if group not in GROUPS:
            raise ValueError(f"group must be one of {GROUPS}")
        now = self.clock()
        self.status = "waiting"
        self.group, self.cedis, self.ctas = group, cedis, int(ctas)
        self.triaged_at = now - timedelta(minutes=waited_minutes)
        self.closed_at = None
        self.next_prompt_due_at = now if checkin_open else self.triaged_at + self.interval()
        self.answers: dict = {}
        self.findings: list[str] = []
        self.prompts: dict[str, dict] = {}
        self.open_prompt: str | None = None
        self.receipts: dict[str, tuple[str, dict]] = {}
        self.log: list[dict] = []

    def interval(self) -> timedelta:
        return timedelta(minutes=CTAS_MINUTES[self.ctas])

    def open_checkin(self) -> None:
        if self.status == "waiting":
            self.next_prompt_due_at = self.clock()
            self.open_prompt = None

    def call(self) -> None:
        """Staff room the patient: the pager says "go to the triage desk" for 15 minutes."""
        if self.status == "waiting":
            self.status, self.closed_at = "roomed", self.clock()

    def unassign(self) -> None:
        """The pager is handed back (the visit ends)."""
        if self.status == "waiting":
            self.status, self.closed_at = "discharged", self.clock()
        else:
            self.status = None

    # -- GET /api/pager/{n} ------------------------------------------------------------------------
    def state(self, pager_no: str) -> dict:
        with self.lock:
            now = self.clock()
            body = {"pager_no": str(pager_no), "server_time": now.isoformat(), "checkin_open": False,
                    "next_checkin_due_at": None, "waited_minutes": None, "questionnaire_version": VERSION}
            if str(pager_no) != self.pager_no or self.status is None:
                return {**body, "state": "unassigned"}
            if self.status == "roomed" and self.closed_at > now - timedelta(minutes=CALLED_FOR_MINUTES):
                return {**body, "state": "called"}
            if self.status != "waiting":
                return {**body, "state": "unassigned"}
            is_open = self.next_prompt_due_at <= now
            return {
                **body,
                "state": "waiting",
                "checkin_open": is_open,
                "next_checkin_due_at": self.next_prompt_due_at.isoformat(),
                "waited_minutes": max(0, int((now - self.triaged_at).total_seconds() // 60)),
                "items": [FOLLOW_UP[k]["item"] for k in follow_ups(self.group, self.cedis, self._so_far())],
                "attention_prompt": self._prompt(now) if is_open else None,
            }

    def _so_far(self) -> dict:
        return {**self.answers, "new_findings": list(self.findings)}

    def _prompt(self, now: datetime) -> dict:
        """The open check-in's circle prompt; a new one once it has expired or been answered."""
        p = self.prompts.get(self.open_prompt or "")
        if p is None or p["answered"] or datetime.fromisoformat(p["expires_at"]) <= now:
            p = self._new_prompt(now)
            self.prompts[p["prompt_id"]] = p
            self.open_prompt = p["prompt_id"]
        return {k: p[k] for k in ("prompt_id", "steps", "show_ms", "gap_ms", "expires_at")}

    def _new_prompt(self, now: datetime) -> dict:
        """attention.generate: shuffled circles and squares, 0.1 from the edges, 0.25 between shapes."""
        a, rng = BANK["attention"], self.rng
        circles = rng.randint(a["circles_min"], a["circles_max"])
        squares = rng.randint(a["squares_min"], a["squares_max"])
        shapes = ["circle"] * circles + ["square"] * squares
        rng.shuffle(shapes)
        steps, previous = [], None
        for shape in shapes:
            while True:
                point = (rng.uniform(0.1, 0.9), rng.uniform(0.1, 0.9))
                if previous is None or math.dist(point, previous) >= 0.25:
                    break
            x, y = round(point[0], 3), round(point[1], 3)
            steps.append({"shape": shape, "x": x, "y": y})
            previous = (x, y)
        return {"prompt_id": str(uuid.uuid4()), "steps": steps, "show_ms": a["show_ms"], "gap_ms": a["gap_ms"],
                "expires_at": (now + timedelta(minutes=a["expires_minutes"])).isoformat(),
                "expected": circles, "answered": False}

    # -- POST /api/pager/{n}/reports ---------------------------------------------------------------
    def report(self, pager_no: str, body: dict) -> tuple[int, dict]:
        """(HTTP status, response body), as the pager report route answers."""
        if body.get("channel") != "pager":
            return 422, {"detail": "pager reports use channel: pager"}
        if body.get("reporter") != "patient":
            return 422, {"detail": "a pager reports as the patient"}
        with self.lock:
            now = self.clock()
            if str(pager_no) != self.pager_no or self.status != "waiting":
                return 404, {"detail": "no waiting patient has this pager"}
            sid = str(body.get("submission_id"))
            fingerprint = json.dumps({k: v for k, v in body.items() if k != "submission_id"}, sort_keys=True)
            if sid in self.receipts:
                previous, receipt = self.receipts[sid]
                if previous != fingerprint:
                    return 409, {"detail": "this submission_id was already used for a different report"}
                return 200, {**receipt, "duplicate": True}
            kind = body.get("kind")
            scheduled = kind == "checkin" and body.get("purpose", "scheduled") == "scheduled"
            if kind == "checkin":
                problem = self._check_items(body)
                if problem:
                    return 422, {"detail": problem}
            if scheduled and self.next_prompt_due_at > now:
                return 409, {"detail": CHECKIN_NOT_DUE}
            attention = None
            if kind == "checkin":
                attention, problem = self._score(body.get("attention") or {}, now, body.get("captured_at"))
                if problem:
                    return 422, {"detail": problem}
            receipt = {
                "submission_id": sid,
                "received_at": now.isoformat(),
                "duplicate": False,
                "patient_message": patient_message(body, self.group),
                "follow_up_items": self._follow_up_items(body),
            }
            for key, a in (body.get("items") or {}).items():
                if a.get("kind") != "missing":
                    self.answers[key] = a.get("value")
            for code in findings_of(body):
                if code not in self.findings:
                    self.findings.append(code)
            if scheduled:
                self.next_prompt_due_at = now + self.interval()
                self.open_prompt = None
            self.receipts[sid] = (fingerprint, receipt)
            self.log.append({"report": body, "receipt": receipt, "attention": attention,
                             "urgent": [c for c in findings_of(body) if is_urgent(c, self.group)]})
            return 200, receipt

    def _check_items(self, body: dict) -> str | None:
        """reports.check_items: the bank version and every item key must be the current bank's."""
        if body.get("questionnaire_version") != VERSION:
            return f"questionnaire_version {body.get('questionnaire_version')} is not the current {VERSION}"
        for key, answer in (body.get("items") or {}).items():
            if key not in FOLLOW_UP:
                return f"{key} is not a follow-up question in questionnaire {VERSION}"
            if answer.get("kind") in ("choice", "multi_choice"):
                values = answer["value"] if answer["kind"] == "multi_choice" else [answer["value"]]
                codes = {o["code"] for o in FOLLOW_UP[key]["item"]["options"]}
                unknown = set(values) - codes
                if unknown:
                    return f"{key} has no option {sorted(unknown)[0]}"
        return None

    def _score(self, attention: dict, now: datetime, captured_at) -> tuple[str | None, str | None]:
        """reports.score_attention: (correct | incorrect | missing | None, problem)."""
        prompt_id = attention.get("prompt_id")
        if not prompt_id:
            return None, None                      # never shown: not a missed check
        p = self.prompts.get(str(prompt_id))
        if p is None:
            return None, "attention prompt not found for this visit"
        captured = datetime.fromisoformat(str(captured_at).replace("Z", "+00:00")) if captured_at else now
        if captured > datetime.fromisoformat(p["expires_at"]):
            return None, "attention prompt expired before it was answered"
        if p["answered"]:
            return None, "attention prompt was already answered"
        p["answered"] = True
        if attention.get("kind") == "answered":
            return ("correct" if attention.get("count") == p["expected"] else "incorrect"), None
        return "missing", None

    def _follow_up_items(self, body: dict) -> list[str]:
        """reports.follow_up_items: reads this report only."""
        findings = findings_of(body)
        if body.get("kind") == "checkin":
            items = body.get("items") or {}
            raw = {k: a.get("value") for k, a in items.items() if a.get("kind") != "missing"}
            return [k for k in follow_ups(self.group, self.cedis, {**raw, "new_findings": findings}) if k not in items]
        if body.get("kind") == "finding":
            before = follow_ups(self.group, self.cedis, {"new_findings": []})
            return [k for k in follow_ups(self.group, self.cedis, {"new_findings": findings}) if k not in before]
        return []


class StubApi:
    """The pager's Api, answered by a StubVisit instead of the network."""

    def __init__(self, visit: StubVisit, pager_no: str, error=None):
        self.visit, self.pager_no = visit, str(pager_no)
        self.error = error or (lambda status, detail: RuntimeError(f"{status}: {detail}"))

    def get_state(self) -> dict:
        return self.visit.state(self.pager_no)

    def post_report(self, body: dict) -> dict:
        status, reply = self.visit.report(self.pager_no, json.loads(json.dumps(body)))
        if status != 200:
            raise self.error(status, str(reply.get("detail", "")))
        return reply
