"""A synthetic Calgary waiting room: 40 visits with their reports, vitals and tasks.

`build_cohort` is deterministic for a given seed and batch. Times are set
relative to `anchor` (the load time), so the board looks live whenever it is
loaded. Each visit is simulated minute by minute: patient prompts, check-ins,
staff reassessments, the demo task rules (the same ones the web mocks use),
acknowledgement, assessment, rooming and leaving. The rules here are demo
stand-ins until the real rules engine exists.

The cohort carries no names or health numbers. Age and arrival mode sit in
`Visit.profile` only. The database stores no demographics; they are there to
drive the leave model and to explain each visit in the JSON export.
"""

from __future__ import annotations

import heapq
import itertools
import math
import random
import uuid
import zlib
from collections.abc import Callable
from dataclasses import asdict, dataclass, field
from datetime import datetime, timedelta
from typing import Any
from zoneinfo import ZoneInfo

from .. import attention
from ..contract.codes import ComplaintGroup
from ..question_bank import QuestionBank, default_bank, ext_value, option_codes
from . import calibration as cal

SITE_ID = "foothills-demo"
LOCAL_TZ = ZoneInfo("America/Edmonton")
RULE_VERSION = "2026-11-07.demo"
NAMESPACE = uuid.UUID("6f1d3c52-6a53-4e0b-9a52-1b1f6c0d2a11")
COHORT_SIZE = 40

NURSE = ("demo|triage-nurse", "triage_nurse")
PHYSICIAN = ("demo|liaison-physician", "physician")
CHARGE = ("demo|charge-nurse", "charge_nurse")

INTERVAL_MINUTES = {2: 15, 3: 30, 4: 60, 5: 120}
"""Matches ctas_interval() in db/schema.sql."""

# CEDIS codes used for generated visits, with the group the bank maps them to.
# None is a general complaint entered without a code.
GENERAL_CEDIS: list[str | None] = [None]
GROUP_WEIGHTS = {
    ComplaintGroup.GENERAL: 0.45,
    ComplaintGroup.CHEST_BACK_PAIN: 0.22,
    ComplaintGroup.NEURO_CHANGE: 0.13,
    ComplaintGroup.HEAD_INJURY: 0.10,
    ComplaintGroup.CONFUSED_DROWSY: 0.10,
}
GROUP_FINDINGS = {
    ComplaintGroup.CHEST_BACK_PAIN: ["trouble_breathing", "fainting", "new_weakness_numbness"],
    ComplaintGroup.NEURO_CHANGE: ["speech_change", "new_weakness_numbness", "vision_change", "balance_change"],
    ComplaintGroup.HEAD_INJURY: ["vomiting", "drowsiness", "worst_headache"],
    ComplaintGroup.CONFUSED_DROWSY: ["drowsiness", "new_confusion"],
    ComplaintGroup.GENERAL: ["vomiting", "fainting", "trouble_breathing", "heavy_bleeding"],
}
PAIN_BASE = {
    ComplaintGroup.CHEST_BACK_PAIN: (4, 8),
    ComplaintGroup.GENERAL: (2, 7),
    ComplaintGroup.HEAD_INJURY: (3, 6),
    ComplaintGroup.NEURO_CHANGE: (1, 5),
    ComplaintGroup.CONFUSED_DROWSY: (0, 4),
}


# ---------------------------------------------------------------------------
# Records. Field names match db/schema.sql columns.
# ---------------------------------------------------------------------------


@dataclass
class Session:
    id: uuid.UUID
    role: str
    created_at: datetime
    revoked_at: datetime | None = None
    revoked_reason: str | None = None
    replaces: uuid.UUID | None = None


@dataclass
class Prompt:
    id: uuid.UUID
    questionnaire_version: str
    issued_at: datetime
    expires_at: datetime
    steps: list[dict[str, Any]]
    show_ms: int
    gap_ms: int
    expected_count: int


@dataclass
class Report:
    id: uuid.UUID
    kind: str
    reporter: str
    channel: str
    captured_at: datetime
    received_at: datetime
    session_id: uuid.UUID | None = None
    questionnaire_version: str | None = None
    feeling_now: str | None = None
    feeling_now_missing: str | None = None
    feeling_change: str | None = None
    feeling_change_missing: str | None = None
    pain: int | None = None
    pain_missing: str | None = None
    findings: list[str] | None = None
    findings_missing: str | None = None
    attention_prompt_id: uuid.UUID | None = None
    attention_count: int | None = None
    attention_missing: str | None = None
    items: dict[str, Any] = field(default_factory=dict)
    concern: str | None = None
    note: str | None = None
    entered_by: str | None = None


@dataclass
class Vitals:
    id: uuid.UUID
    measured_at: datetime
    received_at: datetime
    sbp: int
    dbp: int
    hr: int
    rr: int
    spo2: int
    temp_c: float
    entered_by: str
    entered_by_role: str


@dataclass
class Reason:
    id: uuid.UUID
    rule_id: str
    rule_version: str
    level: str
    reason_code: str
    evidence: list[dict[str, str]]
    fired_at: datetime


@dataclass
class Task:
    id: uuid.UUID
    level: str
    created_at: datetime
    ack_due_at: datetime
    delivered_at: datetime
    routed_to: list[str]
    status: str = "open"
    escalated: bool = False
    acknowledged_at: datetime | None = None
    acknowledged_by: str | None = None
    acknowledged_by_role: str | None = None
    assessed_at: datetime | None = None
    assessed_by: str | None = None
    assessed_by_role: str | None = None
    disposition: str | None = None
    reasons: list[Reason] = field(default_factory=list)


@dataclass
class Visit:
    id: uuid.UUID
    label: str
    scenario: str
    ctas: int
    complaint_group: str
    cedis_code: str | None
    language: str
    app_exclusion: str | None
    channel: str | None
    pager_no: str | None
    triaged_at: datetime
    status: str = "waiting"
    closed_at: datetime | None = None
    next_prompt_due_at: datetime | None = None
    staff_reassess_due_at: datetime | None = None
    last_staff_check_at: datetime | None = None
    profile: dict[str, Any] = field(default_factory=dict)
    sessions: list[Session] = field(default_factory=list)
    prompts: list[Prompt] = field(default_factory=list)
    reports: list[Report] = field(default_factory=list)
    vitals: list[Vitals] = field(default_factory=list)
    tasks: list[Task] = field(default_factory=list)

    @property
    def open_task(self) -> Task | None:
        return next((t for t in self.tasks if t.status != "completed"), None)


@dataclass
class Cohort:
    batch: str
    seed: int
    anchor: datetime
    questionnaire_version: str
    visits: list[Visit]

    def to_json(self) -> dict[str, Any]:
        def encode(value: Any) -> Any:
            if isinstance(value, datetime):
                return value.isoformat()
            if isinstance(value, uuid.UUID):
                return str(value)
            if isinstance(value, dict):
                return {k: encode(v) for k, v in value.items()}
            if isinstance(value, list):
                return [encode(v) for v in value]
            return value

        return encode(
            {
                "batch": self.batch,
                "seed": self.seed,
                "anchor": self.anchor,
                "site_id": SITE_ID,
                "questionnaire_version": self.questionnaire_version,
                "visits": [asdict(v) for v in self.visits],
            }
        )


# ---------------------------------------------------------------------------
# Leave model
# ---------------------------------------------------------------------------


def _age_rate(age: int) -> float:
    return next(rate for upper, rate in cal.AGE_RELATIVE_RATE if age <= upper)


def leave_odds_multiplier(ctas: int, age: int, local_hour: int, ambulance: bool, waiting: float, ref_waiting: float) -> float:
    """Relative odds of leaving without being seen, before scaling to the target rate."""
    hour = cal.EVENING_RELATIVE_RATE if local_hour >= 18 else cal.DAYTIME_RELATIVE_RATE
    arrival = cal.AMBULANCE_RELATIVE_RATE if ambulance else cal.WALK_IN_RELATIVE_RATE
    crowd = cal.CROWDING_OR_PER_5_WAITING ** ((waiting - ref_waiting) / 5)
    return cal.TRIAGE_RELATIVE_RATE[ctas] * _age_rate(age) * hour * arrival * crowd


def calibrate(multipliers: list[float], target: float) -> list[float]:
    """Scale base odds so the mean probability equals `target`. Returns probabilities."""
    lo, hi = 1e-6, 10.0
    for _ in range(100):
        mid = math.sqrt(lo * hi)
        mean = sum(mid * m / (1 + mid * m) for m in multipliers) / len(multipliers)
        lo, hi = (mid, hi) if mean < target else (lo, mid)
    base = math.sqrt(lo * hi)
    return [base * m / (1 + base * m) for m in multipliers]


def leave_delay_minutes(rng: random.Random) -> float:
    """Minutes from arrival to leaving, drawn from the NHAMCS quantiles."""
    u = rng.random()
    points = cal.LEAVE_DELAY_QUANTILES
    for (p0, m0), (p1, m1) in itertools.pairwise(points):
        if u <= p1:
            return m0 + (m1 - m0) * (u - p0) / (p1 - p0)
    return points[-1][1]


# ---------------------------------------------------------------------------
# Per-visit simulation
# ---------------------------------------------------------------------------


def _pick(rng: random.Random, weights: dict[Any, float]) -> Any:
    return rng.choices(list(weights), weights=list(weights.values()))[0]


class _Ids:
    def __init__(self, batch: str):
        self.batch = batch
        self.n = 0

    def __call__(self) -> uuid.UUID:
        self.n += 1
        return uuid.uuid5(NAMESPACE, f"{self.batch}:{self.n}")


@dataclass
class Plan:
    """What happens to one visit. Scripted visits set `events`; generated ones use the random chains."""

    visit: Visit
    trajectory: str = "stable"
    has_finding: bool = False
    leave_at: datetime | None = None
    announce_leaving: bool = False
    room_at: datetime | None = None
    device_role: str = "patient"
    random_prompts: bool = True
    red_disposition: str | None = None
    staff_late: list[float] | None = None
    events: list[tuple[float, Callable[[_Sim, datetime], None]]] = field(default_factory=list)


class _Sim:
    def __init__(self, plan: Plan, rng: random.Random, ids: _Ids, bank: QuestionBank, anchor: datetime):
        self.p, self.v, self.rng, self.ids, self.bank, self.anchor = plan, plan.visit, rng, ids, bank, anchor
        self.interval = timedelta(minutes=INTERVAL_MINUTES[self.v.ctas])
        self.queue: list[tuple[datetime, int, Callable[[datetime], None]]] = []
        self.seq = 0
        self.session: Session | None = None
        self.checkins = 0
        lo, hi = PAIN_BASE[ComplaintGroup(self.v.complaint_group)]
        self.pain = rng.randint(lo, hi)
        self.onset = rng.randint(1, 3)
        self.vitals_base = {
            "sbp": rng.randint(112, 152),
            "hr": rng.randint(66, 98),
            "rr": rng.randint(14, 20),
            "spo2": rng.randint(95, 99),
            "temp_c": round(rng.uniform(36.4, 37.6), 1),
        }

    # -- scheduling --------------------------------------------------------

    def at(self, when: datetime, fn: Callable[[datetime], None]) -> None:
        self.seq += 1
        heapq.heappush(self.queue, (when, self.seq, fn))

    def is_open(self, t: datetime) -> bool:
        """Still in the waiting room at `t`: not yet closed, and not past a planned leave or rooming."""
        if self.v.closed_at is not None:
            return t < self.v.closed_at
        return all(end is None or t < end for end in (self.p.leave_at, self.p.room_at))

    def run(self) -> None:
        v = self.v
        self.vitals(v.triaged_at - timedelta(minutes=2), *NURSE)
        if v.app_exclusion is None:
            if v.channel == "phone" or self.p.device_role == "companion":
                self.sign_in(v.triaged_at + timedelta(minutes=self.rng.uniform(1, 5)), self.p.device_role)
            v.next_prompt_due_at = v.triaged_at + self.interval
            if self.p.random_prompts:
                self.at(v.next_prompt_due_at, self.prompt_due)
        self.staff_due_n = 0
        v.staff_reassess_due_at = v.triaged_at + self.interval
        self.at(v.staff_reassess_due_at + self.staff_lateness(), self.staff_check)
        for minutes, fn in self.p.events:
            self.at(v.triaged_at + timedelta(minutes=minutes), lambda t, fn=fn: fn(self, t))
        if self.p.leave_at:
            if self.p.announce_leaving:
                self.at(self.p.leave_at - timedelta(minutes=self.rng.uniform(2, 10)), self.leaving)
            self.at(self.p.leave_at, self.leave)
        if self.p.room_at:
            self.at(self.p.room_at, self.room)
        while self.queue:
            when, _, fn = heapq.heappop(self.queue)
            if when > self.anchor:
                break
            fn(when)
        if v.status == "waiting" and v.app_exclusion is None and v.next_prompt_due_at is None:
            v.next_prompt_due_at = self.anchor + self.interval

    # -- patient side ------------------------------------------------------

    def sign_in(self, t: datetime, role: str, replaces: Session | None = None) -> None:
        if replaces is not None:
            replaces.revoked_at, replaces.revoked_reason = t, "takeover"
        self.session = Session(self.ids(), role, t, replaces=replaces.id if replaces else None)
        self.v.sessions.append(self.session)

    @property
    def device(self) -> tuple[str, str, uuid.UUID | None]:
        """(reporter, channel, session) for the next patient-side report."""
        if self.session is not None:
            return self.session.role, "phone", self.session.id
        return "patient", "pager", None

    def prompt_due(self, due: datetime) -> None:
        if not self.is_open(due):
            return
        rng = self.rng
        if rng.random() < cal.CHECKIN_ON_TIME:
            self.at(due + timedelta(minutes=rng.uniform(1, 4)), self.random_checkin)
            return
        self.at(due + timedelta(minutes=cal.SILENT_AFTER_MINUTES), self.missed_check)
        if rng.random() < cal.CHECKIN_LATE:
            self.at(due + timedelta(minutes=rng.uniform(15, 60)), self.random_checkin)

    def missed_check(self, t: datetime) -> None:
        due = self.v.next_prompt_due_at
        if self.is_open(t) and due is not None and t - due >= timedelta(minutes=cal.SILENT_AFTER_MINUTES):
            last = self.v.reports[-1].id if self.v.reports else None
            self.raise_task(t, "silent", "missed_checkin", [last] if last else [])

    def random_checkin(self, t: datetime) -> None:
        if not self.is_open(t):
            return
        rng, k = self.rng, self.checkins
        worse = self.p.trajectory == "worsening" and k >= self.onset
        if self.p.trajectory == "improving":
            change = _weighted(rng, {"better": 0.6, "much_better": 0.15, "same": 0.25})
            now = _weighted(rng, {"good": 0.5, "ok": 0.4, "very_good": 0.1})
            self.pain = max(0, self.pain - rng.choice([0, 1, 1]))
        elif worse:
            change = _weighted(rng, {"worse": 0.7, "much_worse": 0.3 if k > self.onset else 0.1})
            now = _weighted(rng, {"poor": 0.7, "very_poor": 0.3})
            self.pain = min(10, self.pain + rng.choice([1, 1, 2]))
        else:
            change = _weighted(rng, {"same": 0.75, "better": 0.2, "worse": 0.05})
            now = _weighted(rng, {"ok": 0.5, "good": 0.4, "poor": 0.1})
            self.pain = min(10, max(0, self.pain + rng.choice([-1, 0, 0, 0, 1])))
        findings: list[str] = []
        if worse and self.p.has_finding and k == self.onset:
            findings = [rng.choice(GROUP_FINDINGS[ComplaintGroup(self.v.complaint_group)])]
        unsure_now = rng.random() < 0.05
        self.checkin(
            t,
            feeling_now=None if unsure_now else now,
            feeling_change=change,
            pain=self.pain,
            findings=findings,
        )
        if self.p.random_prompts and self.is_open(t):
            self.at(self.v.next_prompt_due_at, self.prompt_due)
        if rng.random() < 0.04:
            self.at(t + timedelta(minutes=rng.uniform(5, 20)), lambda t2: self.concern(t2, "worried"))
        elif rng.random() < 0.06:
            self.at(t + timedelta(minutes=rng.uniform(5, 20)), lambda t2: self.concern(t2, "desk_question"))

    def checkin(
        self,
        t: datetime,
        *,
        feeling_now: str | None,
        feeling_change: str | None,
        pain: int | None,
        findings: list[str] | None,
        items: dict[str, Any] | None = None,
    ) -> Report:
        reporter, channel, session = self.device
        version = self.bank.version
        r = Report(self.ids(), "checkin", reporter, channel, t, t + timedelta(seconds=self.rng.uniform(0.4, 2.5)), session)
        r.questionnaire_version = version
        r.feeling_now, r.feeling_now_missing = feeling_now, None if feeling_now else "unsure"
        r.feeling_change, r.feeling_change_missing = feeling_change, None if feeling_change else "unsure"
        if channel == "pager":
            # A pager answers the wellness questions only.
            r.pain_missing = r.findings_missing = r.attention_missing = "not_asked"
        elif reporter == "companion":
            r.pain_missing = r.attention_missing = "not_asked"
            r.findings = findings or []
        else:
            r.pain = pain
            r.findings = findings or []
            self.attention(r)
        if channel != "pager":
            r.items = items if items is not None else self.follow_ups(r)
        self.v.reports.append(r)
        self.checkins += 1
        self.v.next_prompt_due_at = t + self.interval
        # Demo rules, as in the web mocks. A reassuring answer never cancels a task.
        if r.findings:
            self.raise_task(t, "red", f"finding_{r.findings[0]}", [r.id])
        elif feeling_change == "much_worse":
            self.raise_task(t, "red", "feeling_worse", [r.id])
        elif feeling_change == "worse":
            self.raise_task(t, "amber", "feeling_worse", [r.id])
        return r

    def attention(self, r: Report) -> None:
        params = self.bank.attention_params()
        seq = attention.generate(self.rng, params)
        issued = r.captured_at - timedelta(seconds=self.rng.uniform(25, 50))
        prompt = Prompt(
            self.ids(),
            self.bank.version,
            issued,
            issued + timedelta(minutes=params.expires_minutes),
            [{"shape": s.shape, "x": s.x, "y": s.y} for s in seq.steps],
            params.show_ms,
            params.gap_ms,
            seq.expected_count,
        )
        self.v.prompts.append(prompt)
        r.attention_prompt_id = prompt.id
        u = self.rng.random()
        if u < 0.90:
            r.attention_count = seq.expected_count
        elif u < 0.97:
            r.attention_count = max(0, seq.expected_count + self.rng.choice([-1, 1]))
        else:
            r.attention_missing = "unable_to_respond"

    def follow_ups(self, r: Report) -> dict[str, Any]:
        """Answer the follow-ups the bank asks now, consistent with how the visit is going."""
        group = ComplaintGroup(self.v.complaint_group)
        worse = r.feeling_change in ("worse", "much_worse")
        answers: dict[str, Any] = {"new_findings": list(r.findings or [])}
        out: dict[str, Any] = {}
        for _ in range(4):
            now, _later = self.bank.follow_ups(group, self.v.cedis_code, answers)
            pending = [k for k in now if k not in out]
            if not pending:
                break
            for key in pending:
                answer = self._answer(key, worse, r.reporter)
                out[key] = answer
                if answer["kind"] != "missing":
                    answers[key] = answer["value"]
        return out

    def _answer(self, key: str, worse: bool, reporter: str) -> dict[str, Any]:
        item, rng = self.bank.items[key], self.rng
        if rng.random() < 0.04:
            return {"kind": "missing", "reason": "unsure"}
        if item["type"] == "boolean":
            return {"kind": "yes_no", "value": worse and rng.random() < 0.5}
        if item["type"] == "integer":
            return {"kind": "scale", "value": self.pain}
        codes = option_codes(item)
        if ext_value(item, "multiple", False) or item.get("repeats"):
            return {"kind": "multi_choice", "value": [codes[0]]}
        if set(codes) >= {"better", "same", "worse"}:
            return {"kind": "choice", "value": "worse" if worse else rng.choice(["same", "same", "better"])}
        if codes and codes[0] == "zero":
            return {"kind": "choice", "value": "one" if worse else "zero"}
        return {"kind": "choice", "value": rng.choice(codes)}

    def concern(self, t: datetime, code: str) -> None:
        if not self.is_open(t) or self.v.app_exclusion is not None:
            return
        reporter, channel, session = self.device
        r = Report(self.ids(), "concern", reporter, channel, t, t + timedelta(seconds=1), session, concern=code)
        self.v.reports.append(r)
        if code == "desk_question":
            self.raise_task(t, "overdue", "concern_desk_question", [r.id], ["triage_nurse"])
        else:
            self.raise_task(t, "red" if code == "help_now" else "amber", f"concern_{code}", [r.id])

    def finding(self, t: datetime, codes: list[str]) -> Report:
        reporter, channel, session = self.device
        r = Report(self.ids(), "finding", reporter, channel, t, t + timedelta(seconds=1), session, findings=codes)
        self.v.reports.append(r)
        self.raise_task(t, "red", f"finding_{codes[0]}", [r.id])
        return r

    def leaving(self, t: datetime) -> None:
        if not self.is_open(t) or self.v.app_exclusion is not None:
            return
        reporter, channel, session = self.device
        r = Report(self.ids(), "leaving", reporter, channel, t, t + timedelta(seconds=1), session)
        self.v.reports.append(r)
        self.raise_task(t, "leave_risk", "leaving", [r.id])

    # -- staff side --------------------------------------------------------

    def staff_lateness(self) -> timedelta:
        if self.p.staff_late is not None and self.staff_due_n < len(self.p.staff_late):
            minutes = self.p.staff_late[self.staff_due_n]
        elif self.rng.random() < cal.STAFF_VERY_LATE_SHARE:
            minutes = self.rng.uniform(30, 60)
        else:
            minutes = self.rng.expovariate(1 / cal.STAFF_LATE_MEAN_MINUTES)
        self.staff_due_n += 1
        return timedelta(minutes=minutes)

    def vitals(self, t: datetime, by: str, role: str) -> Vitals:
        b, rng = self.vitals_base, self.rng
        strain = 1 if (self.p.trajectory == "worsening" and self.checkins > self.onset) else 0
        sbp = b["sbp"] + rng.randint(-8, 8)
        rec = Vitals(
            self.ids(),
            t,
            t + timedelta(minutes=rng.uniform(0.5, 3)),
            sbp=sbp,
            dbp=min(sbp - 25, int(sbp * rng.uniform(0.58, 0.68))),
            hr=b["hr"] + rng.randint(-5, 5) + 12 * strain,
            rr=b["rr"] + rng.randint(-1, 2) + 3 * strain,
            spo2=min(100, b["spo2"] + rng.randint(-1, 1) - strain),
            temp_c=round(b["temp_c"] + rng.uniform(-0.2, 0.2), 1),
            entered_by=by,
            entered_by_role=role,
        )
        self.v.vitals.append(rec)
        return rec

    def staff_check(self, t: datetime) -> None:
        """Triage nurse reassessment. Only staff move the staff timer."""
        if not self.is_open(t):
            return
        v = self.v
        self.vitals(t, *NURSE)
        v.last_staff_check_at = t
        v.staff_reassess_due_at = t + self.interval
        task = v.open_task
        if task is not None and task.level in ("silent", "leave_risk", "overdue"):
            self.acknowledge(task, t, NURSE)
            self.later(t + timedelta(minutes=self.rng.uniform(1, 4)), task, NURSE, "assessed_stable")
        self.at(v.staff_reassess_due_at + self.staff_lateness(), self.staff_check)

    def raise_task(
        self, t: datetime, level: str, reason_code: str, evidence: list[uuid.UUID], routed_to: list[str] | None = None
    ) -> Task:
        """Open a task or add a reason to the open one. Levels only go up; deadlines only move earlier."""
        order = ["overdue", "leave_risk", "silent", "amber", "red"]
        routed = routed_to or ["physician"]
        reason = Reason(
            self.ids(),
            f"demo-{reason_code.replace('_', '-')}-v1",
            RULE_VERSION,
            level,
            reason_code,
            [{"kind": "report", "id": str(e)} for e in evidence],
            t,
        )
        due = t + timedelta(minutes=cal.ACK_MINUTES[level])
        task = self.v.open_task
        if task is None:
            task = Task(self.ids(), level, t, due, t + timedelta(seconds=self.rng.uniform(0.8, 3)), list(routed))
            self.v.tasks.append(task)
            self._schedule_response(task, level, t)
        else:
            raised = order.index(level) > order.index(task.level)
            task.level = level if raised else task.level
            task.routed_to += [r for r in routed if r not in task.routed_to]
            if task.acknowledged_at is None:
                task.ack_due_at = min(task.ack_due_at, due)
            if raised and task.acknowledged_at is None:
                self._schedule_response(task, level, t)
        task.reasons.append(reason)
        return task

    def _schedule_response(self, task: Task, level: str, t: datetime) -> None:
        rng = self.rng
        if level in ("red", "amber"):
            delay = rng.uniform(0.5, 4) if level == "red" else rng.uniform(3, 25)
            ack_at = t + timedelta(minutes=delay)
            if level == "red":
                self.at(task.ack_due_at, lambda t2: self.escalate(task, t2))
            self.at(ack_at, lambda t2: self.physician_review(task, t2))
        elif level == "overdue":
            self.at(t + timedelta(minutes=rng.uniform(3, 9)), lambda t2: self.desk_answer(task, t2))

    def escalate(self, task: Task, t: datetime) -> None:
        if task.acknowledged_at is None and not task.escalated:
            task.escalated = True
            if "charge_nurse" not in task.routed_to:
                task.routed_to.append("charge_nurse")

    def physician_review(self, task: Task, t: datetime) -> None:
        if task.status != "open":
            return
        self.acknowledge(task, t, PHYSICIAN)
        assess_at = t + timedelta(minutes=self.rng.uniform(4, 15))
        self.at(assess_at, lambda t2: self.physician_assess(task, t2))

    def physician_assess(self, task: Task, t: datetime) -> None:
        if task.status != "acknowledged":
            return
        if task.level == "red" and self.p.red_disposition:
            disposition = self.p.red_disposition
        elif task.level == "red":
            disposition = _weighted(self.rng, {"roomed": 0.5, "re_triaged": 0.3, "tests_ordered": 0.2})
        else:
            disposition = _weighted(self.rng, {"assessed_stable": 0.6, "tests_ordered": 0.3, "re_triaged": 0.1})
        if not self.is_open(t):
            disposition = "left_before_assessment" if self.p.leave_at else "roomed"
        self.vitals(t - timedelta(minutes=1), *PHYSICIAN)
        self.assess(task, t, PHYSICIAN, disposition)
        if disposition == "roomed" and self.is_open(t):
            self.p.room_at = t
            self.room(t)

    def desk_answer(self, task: Task, t: datetime) -> None:
        if task.status == "open" and task.level == "overdue":
            self.acknowledge(task, t, NURSE)
            self.later(t + timedelta(minutes=1), task, NURSE, "assessed_stable")

    def later(self, t: datetime, task: Task, who: tuple[str, str], disposition: str) -> None:
        """Record an assessment at `t`, unless that is after load time (the task stays acknowledged)."""
        self.at(t, lambda t2: self.assess(task, t2, who, disposition))

    def acknowledge(self, task: Task, t: datetime, who: tuple[str, str]) -> None:
        if task.acknowledged_at is None:
            task.status = "acknowledged"
            task.acknowledged_at, (task.acknowledged_by, task.acknowledged_by_role) = t, who

    def assess(self, task: Task, t: datetime, who: tuple[str, str], disposition: str) -> None:
        if task.assessed_at is None:
            task.status = "completed"
            task.assessed_at, (task.assessed_by, task.assessed_by_role) = t, who
            task.disposition = disposition

    # -- leaving and rooming -----------------------------------------------

    def close(self, t: datetime, status: str) -> None:
        v = self.v
        if v.status != "waiting":
            return
        v.status, v.closed_at = status, t
        if self.session is not None and self.session.revoked_at is None:
            self.session.revoked_at, self.session.revoked_reason = t, "visit_closed"

    def leave(self, t: datetime) -> None:
        self.close(t, "left")
        task = self.v.open_task
        if task is not None:
            who = CHARGE
            done = t + timedelta(minutes=self.rng.uniform(5, 20))
            disposition = "left_before_assessment" if task.level == "leave_risk" else "not_located"
            self.at(done, lambda t2: (self.acknowledge(task, t2, who), self.assess(task, t2, who, disposition)))

    def room(self, t: datetime) -> None:
        self.close(t, "roomed")
        task = self.v.open_task
        if task is not None:
            self.acknowledge(task, t, PHYSICIAN)
            self.assess(task, t, PHYSICIAN, "roomed")


def _weighted(rng: random.Random, weights: dict[str, float]) -> str:
    return _pick(rng, weights)


# ---------------------------------------------------------------------------
# Scripted demo visits (AGENTS.md demo scope and the research brief, section 6)
# ---------------------------------------------------------------------------


def _scripted(new_visit: Callable[..., Visit], anchor: datetime) -> list[Plan]:
    def ago(minutes: float) -> datetime:
        return anchor - timedelta(minutes=minutes)

    def chest_worsening(s: _Sim, t: datetime) -> None:
        s.checkin(t, feeling_now="poor", feeling_change="same", pain=7, findings=[],
                  items={"pain_moved": {"kind": "yes_no", "value": False},
                         "pain_sudden_worse": {"kind": "yes_no", "value": False}})

    def chest_red(s: _Sim, t: datetime) -> None:
        s.checkin(t, feeling_now="very_poor", feeling_change="much_worse", pain=9, findings=[],
                  items={"pain_moved": {"kind": "yes_no", "value": True},
                         "pain_new_location": {"kind": "choice", "value": "between_shoulders"},
                         "pain_sudden_worse": {"kind": "yes_no", "value": True}})

    def calm(pain: int | None = 3) -> Callable[[_Sim, datetime], None]:
        def run(s: _Sim, t: datetime) -> None:
            s.checkin(t, feeling_now="ok", feeling_change="same", pain=pain, findings=[])
        return run

    def speech_change(s: _Sim, t: datetime) -> None:
        s.finding(t, ["speech_change"])

    def head_checkin(s: _Sim, t: datetime) -> None:
        s.checkin(t, feeling_now="ok", feeling_change="same", pain=4, findings=[],
                  items={"harder_to_wake": {"kind": "yes_no", "value": False},
                         "vomit_count": {"kind": "choice", "value": "zero"},
                         "headache_change": {"kind": "choice", "value": "same"},
                         "seizure": {"kind": "yes_no", "value": False},
                         "more_confused": {"kind": "yes_no", "value": False}})

    def takeover(s: _Sim, t: datetime) -> None:
        s.sign_in(t, "companion", replaces=s.session)

    def companion_same(s: _Sim, t: datetime) -> None:
        s.checkin(t, feeling_now="ok", feeling_change="same", pain=None, findings=[],
                  items={"harder_to_wake": {"kind": "yes_no", "value": False},
                         "seizure": {"kind": "yes_no", "value": False},
                         "more_confused": {"kind": "yes_no", "value": False}})

    def leaving(s: _Sim, t: datetime) -> None:
        s.leaving(t)

    def desk(s: _Sim, t: datetime) -> None:
        s.concern(t, "desk_question")

    plans = [
        # Worsening chest pain: pain 6 -> 7 -> 9, red a minute before load, not yet acknowledged.
        Plan(new_visit("chest-worsening", "Worsening chest pain, now between the shoulders", 2, "003", ago(48)),
             random_prompts=False, staff_late=[3, 40],
             events=[(16, calm(6)), (31, chest_worsening), (47, chest_red)]),
        # Companion on a general visit, signed in and calm. The live demo reports the speech change.
        Plan(new_visit("companion-speech-live", "Companion signed in on a general visit (live speech-change demo)", 3, None, ago(42)),
             device_role="companion", random_prompts=False, events=[(31, calm(None))]),
        # Unanswered head-injury check: silent task open, staff reassessment overdue too.
        Plan(new_visit("head-injury-unanswered", "Head injury, check-in missed", 3, "407", ago(52)),
             random_prompts=False, staff_late=[45],
             events=[(30 + cal.SILENT_AFTER_MINUTES, lambda s, t: s.missed_check(t))]),
        # Earlier the same evening: companion reported new speech difficulty; physician acknowledged,
        # assessed and roomed. Shows the full loop in the timeline.
        Plan(new_visit("companion-speech-done", "Companion reported new speech difficulty; roomed", 3, None, ago(150)),
             device_role="companion", random_prompts=False, red_disposition="roomed",
             events=[(28, calm(None)), (61, speech_change)]),
        # Intent to leave six minutes ago.
        Plan(new_visit("leave-intent", "Said they are leaving after a long wait", 4, None, ago(165)),
             random_prompts=False, staff_late=[8, 50],
             events=[(62, calm(4)), (125, calm(4)), (159, leaving)]),
        # Pager patient who stopped answering.
        Plan(new_visit("pager-silent", "Pager visit, stopped answering", 3, None, ago(80), channel="pager"),
             random_prompts=False, staff_late=[6, 45],
             events=[(32, calm(None)), (62 + cal.SILENT_AFTER_MINUTES, lambda s, t: s.missed_check(t))]),
        # Patient handed over to a companion's phone (device takeover).
        Plan(new_visit("confused-takeover", "Confused visit; companion took over the device", 3, "402", ago(70)),
             random_prompts=False,
             events=[(26, calm(2)), (40, takeover), (56, companion_same)]),
        # Non-clinical question answered by the triage nurse.
        Plan(new_visit("desk-question", "Asked the desk a question about their wait", 4, None, ago(95)),
             random_prompts=False, events=[(64, calm(3)), (72, desk)]),
        # Staff-watched visits without the app.
        Plan(new_visit("excluded-self-harm", "Self-harm presentation; app not offered", 3, "351", ago(58),
                       exclusion="self_harm_or_violence")),
        Plan(new_visit("excluded-pregnancy", "Pregnancy over 20 weeks; app not offered; roomed", 3, "458", ago(120),
                       exclusion="pregnancy_over_20_weeks"), room_at=ago(55)),
        Plan(new_visit("excluded-trauma", "Major blunt trauma; app not offered; roomed", 2, "802", ago(200),
                       exclusion="major_trauma"), room_at=ago(186)),
    ]
    return plans


# ---------------------------------------------------------------------------
# Cohort
# ---------------------------------------------------------------------------


def build_cohort(
    anchor: datetime, *, seed: int = 20261108, batch: str = "demo-1", bank: QuestionBank | None = None
) -> Cohort:
    if anchor.tzinfo is None:
        raise ValueError("anchor must be timezone-aware")
    bank = bank or default_bank()
    rng = random.Random(seed)
    ids = _Ids(batch)
    # Pager numbers differ per batch, so a second batch can load while the first is still waiting.
    first_pager = 1000 + (zlib.crc32(batch.encode()) % 900) * 1000
    pagers = iter(range(first_pager, first_pager + 999))
    cedis_by_group: dict[ComplaintGroup, list[str]] = {}
    for code, group in sorted(bank.group_by_cedis.items()):
        cedis_by_group.setdefault(group, []).append(code)

    def new_visit(
        scenario: str, label: str, ctas: int, cedis: str | None, triaged_at: datetime,
        *, channel: str | None = None, exclusion: str | None = None, language: str | None = None,
    ) -> Visit:
        group = bank.complaint_group(cedis)
        if exclusion is None and channel is None:
            channel = "pager" if rng.random() < cal.PAGER_SHARE else "phone"
        return Visit(
            id=ids(),
            label=label,
            scenario=scenario,
            ctas=ctas,
            complaint_group=group.value,
            cedis_code=cedis,
            language=language or _pick(rng, cal.LANGUAGE_MIX),
            app_exclusion=exclusion,
            channel=None if exclusion else channel,
            pager_no=str(next(pagers)) if channel == "pager" and not exclusion else None,
            triaged_at=triaged_at,
        )

    def scripted_visit(*args: Any, **kwargs: Any) -> Visit:
        kwargs.setdefault("channel", None if kwargs.get("exclusion") else "phone")
        kwargs.setdefault("language", "en")
        return new_visit(*args, **kwargs)

    plans = _scripted(scripted_visit, anchor)
    for plan in plans:
        plan.visit.profile = _profile(rng, plan.visit)

    generated: list[Plan] = []
    while len(plans) + len(generated) < COHORT_SIZE:
        group = _pick(rng, GROUP_WEIGHTS)
        cedis = rng.choice(cedis_by_group.get(group, GENERAL_CEDIS)) if group is not ComplaintGroup.GENERAL else None
        ctas = _pick(rng, cal.CTAS_MIX)
        triaged = anchor - timedelta(minutes=rng.uniform(8, 330))
        v = new_visit(f"generated-{len(generated) + 1:02d}", "", ctas, cedis, triaged)
        v.profile = _profile(rng, v)
        role = "companion" if (group is ComplaintGroup.CONFUSED_DROWSY and rng.random() < 0.6) or (
            rng.random() < cal.COMPANION_DEVICE_SHARE) else "patient"
        trajectory = _pick(rng, cal.TRAJECTORY_MIX)
        generated.append(
            Plan(v, trajectory=trajectory, device_role=role if v.channel == "phone" else "patient",
                 has_finding=trajectory == "worsening" and rng.random() < cal.WORSENING_FINDING_SHARE)
        )

    _assign_outcomes(rng, plans + generated, generated, anchor)

    for plan in plans + generated:
        _Sim(plan, rng, ids, bank, anchor).run()
        if not plan.visit.label:
            plan.visit.label = _describe(plan)

    visits = sorted((p.visit for p in plans + generated), key=lambda v: v.triaged_at)
    return Cohort(batch, seed, anchor, bank.version, visits)


def _profile(rng: random.Random, v: Visit) -> dict[str, Any]:
    (lo, hi), = rng.choices([b for b, _ in cal.AGE_BANDS], weights=[w for _, w in cal.AGE_BANDS])
    return {
        "age": rng.randint(lo, hi),
        "ambulance": rng.random() < cal.AMBULANCE_SHARE,
        "arrival_local": v.triaged_at.astimezone(LOCAL_TZ).strftime("%H:%M"),
    }


def _assign_outcomes(rng: random.Random, everyone: list[Plan], generated: list[Plan], anchor: datetime) -> None:
    """Score every visit's leave probability, then pick who left and who was roomed among generated visits."""
    arrivals = sorted(p.visit.triaged_at for p in everyone)

    def waiting_at(t: datetime) -> int:
        # Proxy for the waiting count: arrivals in the previous three hours.
        return sum(1 for a in arrivals if t - timedelta(hours=3) <= a < t)

    crowd = [waiting_at(p.visit.triaged_at) for p in everyone]
    ref = sum(crowd) / len(crowd)
    mult = [
        leave_odds_multiplier(
            p.visit.ctas, p.visit.profile["age"], p.visit.triaged_at.astimezone(LOCAL_TZ).hour,
            p.visit.profile["ambulance"], c, ref,
        )
        for p, c in zip(everyone, crowd)
    ]
    probs = calibrate(mult, cal.LEAVE_RATE_TARGET)
    for p, c, prob in zip(everyone, crowd, probs):
        p.visit.profile.update(arrivals_prev_3h=c, leave_probability=round(prob, 4))

    expected = sum(probs)
    n_leave = round(expected)
    eligible = [p for p in generated if anchor - p.visit.triaged_at >= timedelta(minutes=45)]
    leavers: list[Plan] = []
    pool = list(eligible)
    while len(leavers) < n_leave and pool:
        weights = [p.visit.profile["leave_probability"] for p in pool]
        choice = rng.choices(pool, weights=weights)[0]
        pool.remove(choice)
        leavers.append(choice)
    for p in leavers:
        waited = (anchor - p.visit.triaged_at).total_seconds() / 60
        delay = min(leave_delay_minutes(rng), waited - 5)
        p.leave_at = p.visit.triaged_at + timedelta(minutes=max(20, delay))
        p.announce_leaving = rng.random() < 0.5 and p.visit.app_exclusion is None

    n_room = round(cal.ROOMED_SHARE * len(generated))
    candidates = sorted(
        (p for p in pool if anchor - p.visit.triaged_at >= timedelta(minutes=60)),
        key=lambda p: (p.visit.ctas, p.visit.triaged_at),
    )
    for p in candidates[:n_room]:
        waited = (anchor - p.visit.triaged_at).total_seconds() / 60
        p.room_at = p.visit.triaged_at + timedelta(minutes=rng.uniform(30, waited - 5))


def _describe(plan: Plan) -> str:
    v = plan.visit
    parts = [f"CTAS {v.ctas}", v.complaint_group.replace("_", " ")]
    if plan.leave_at:
        parts.append("left without being seen" + (" after saying so" if plan.announce_leaving else ""))
    elif plan.room_at or v.status == "roomed":
        parts.append("roomed")
    else:
        parts.append(f"{plan.trajectory}")
    if v.channel == "pager":
        parts.append("pager")
    if plan.device_role == "companion":
        parts.append("companion device")
    return ", ".join(parts)
