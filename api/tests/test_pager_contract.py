"""Every report the hardware pager (pager/python) can send is a valid PatientReport,
and every answer its stub gives has the API's response shape."""

import sys
import uuid
from pathlib import Path

import pytest
from pydantic import TypeAdapter

from recheck.contract.codes import Channel, Reporter
from recheck.contract.patient import AttentionPrompt, QuestionItem
from recheck.contract.reports import PatientReport, ReportReceipt
from recheck.question_bank import default_bank
from recheck.routes.pager import PagerState
from recheck.routes.patient import question_item

sys.path.insert(0, str(Path(__file__).resolve().parents[2] / "pager" / "python"))
import checkin  # noqa: E402
import main as pager  # noqa: E402
import stub  # noqa: E402

ADAPTER = TypeAdapter(PatientReport)
PROMPT = {"prompt_id": str(uuid.uuid4()), "show_ms": 1000, "gap_ms": 500, "expires_at": "2026-11-08T15:15:00Z",
          "steps": [{"shape": "circle", "x": 0.5, "y": 0.5}]}
ITEMS = [entry["item"] for entry in stub.BANK["follow_up"]]


def wrap(body):
    return {"submission_id": str(uuid.uuid4()), "reporter": "patient", "channel": "pager",
            "captured_at": "2026-11-08T15:00:00+00:00", **body}


def flow(**answers):
    f = checkin.Flow(checkin.checkin_questions({"items": ITEMS, "attention_prompt": PROMPT}), prompt=PROMPT,
                     version=default_bank().version)
    f.answers.update(answers)
    return f


def every_answer():
    answers = dict(feeling_now="poor", feeling_change="worse", pain=7, new_findings=["vomiting", "drowsiness"],
                   circle_count={"shown": True, "count": 5})
    for q in checkin.checkin_questions({"items": ITEMS}):
        if not q.base:
            answers[q.key] = {"yes_no": True, "choice": q.options[0][0] if q.options else None,
                              "multi": [q.options[0][0]] if q.options else None, "scale": 4}[q.kind]
    return answers


def followup():
    f = checkin.Flow(checkin.followup_questions({"items": ITEMS}, ["last_known_well", "pain_new_location"]),
                     mode="followup", version=default_bank().version)
    f.answers.update(last_known_well="under_1_hr", pain_new_location=["arm", "leg"])
    return f.report()


CHECKINS = {
    "every question answered": lambda: flow(**every_answer()).report(),
    "everything unsure": lambda: flow(**{k: checkin.UNSURE for k in every_answer() if k != "circle_count"},
                                      circle_count={"shown": True, "skip": "unsure"}).report(),
    "urgent sign, sent at once": lambda: flow(feeling_now="ok", feeling_change="same", pain=0,
                                              new_findings=["speech_change"]).report(),
    "circle check: can't do": lambda: flow(circle_count={"shown": True, "skip": "unable_to_respond"}).report(),
    "nothing answered": lambda: flow().report(),
    "no circle prompt": lambda: checkin.Flow(checkin.checkin_questions({}), version=default_bank().version).report(),
    "follow-up": followup,
}
OTHERS = {
    "help_now": {"kind": "concern", "concern": "help_now"},
    "worried": {"kind": "concern", "concern": "worried"},
    "desk_question": {"kind": "concern", "concern": "desk_question"},
    "leaving": {"kind": "leaving"},
    "finding": {"kind": "finding", "findings": ["speech_change", "trouble_breathing"]},
}


@pytest.mark.parametrize("name", CHECKINS)
def test_pager_checkins_match_the_contract(name):
    report = ADAPTER.validate_python(wrap(CHECKINS[name]()))
    assert report.kind == "checkin"
    assert report.channel is Channel.PAGER and report.reporter is Reporter.PATIENT
    assert report.questionnaire_version == default_bank().version
    assert set(report.items) <= set(default_bank().section("follow_up"))


@pytest.mark.parametrize("name", OTHERS)
def test_pager_reports_match_the_contract(name):
    report = ADAPTER.validate_python(wrap(OTHERS[name]))
    assert report.channel is Channel.PAGER and report.reporter is Reporter.PATIENT


def test_the_pager_menu_sends_these_reports():
    """The report menu still produces the bodies above (the screens are tested in pager/tests)."""
    sent = []

    class Api:
        def get_state(self):
            return {"state": "waiting", "checkin_open": False, "server_time": "2026-11-08T15:00:00Z",
                    "next_checkin_due_at": None, "waited_minutes": 3, "questionnaire_version": default_bank().version}

        def post_report(self, body):
            sent.append(body)
            return {"patient_message": "none"}

    class Io:
        def show(self, *lines): ...
        def leds(self, red, green): ...
        def ack(self, n=1): ...
        def play(self, spec): ...
        def redraw(self): ...

    ui = pager.PagerUI(Api(), Io(), "42", sleep=lambda s: None)
    ui.poll()
    for step in (pager.RIGHT, pager.CONFIRM, pager.CONFIRM, pager.CONFIRM):    # Report > I need help now > yes
        ui.handle(step)
    assert {k: v for k, v in sent[-1].items() if k in ("kind", "concern")} == OTHERS["help_now"]
    ADAPTER.validate_python(sent[-1])


def test_the_stub_follow_ups_are_the_servers_question_items():
    bank = default_bank()
    assert stub.VERSION == bank.version
    for key, entry in stub.FOLLOW_UP.items():
        assert question_item(bank, key, Reporter.PATIENT).model_dump(mode="json") == entry["item"]


@pytest.mark.parametrize("group", stub.GROUPS)
def test_the_stub_answers_have_the_api_shapes(group):
    visit = stub.StubVisit("42", group=group)
    state = visit.state("42")
    PagerState.model_validate({k: state[k] for k in PagerState.model_fields})
    for item in state["items"]:
        QuestionItem.model_validate(item)
    AttentionPrompt.model_validate(state["attention_prompt"])
    code, receipt = visit.report("42", wrap(OTHERS["finding"]))
    assert code == 200
    ReportReceipt.model_validate(receipt)
