"""Writes python/stub_bank.json: the question bank data the pager's stub needs.

    python pager/tools/make_stub_bank.py          (from the repository root)

The board has no copy of question-bank/, so the stub (python/stub.py) reads this file
instead. Each follow-up question is stored as the server sends it (a QuestionItem,
built as api/src/recheck/routes/patient.py builds one), with its branching and the
circle check's settings. tests/test_stub.py fails when this file is out of date with
the bank: run this again after any bank change.
"""

import json
import os

HERE = os.path.dirname(os.path.abspath(__file__))
BANK = os.path.join(HERE, "..", "..", "question-bank", "questionnaire.json")
OUT = os.path.join(HERE, "..", "python", "stub_bank.json")


def _walk(items):
    for item in items:
        yield item
        yield from _walk(item.get("item", []))


def _ext(item: dict, name: str, default=None):
    for e in item.get("extension", []):
        if e["url"].split(":")[-1].split("/")[-1] == name:
            for k, v in e.items():
                if k.startswith("value"):
                    return v
    return default


def question_item(item: dict) -> dict:
    """The server's QuestionItem: patient wording, English."""
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
    return {"key": item["linkId"], "input_type": kind, "text": item["text"], "options": options,
            "allow_unsure": True if unsure is None else bool(unsure)}


def condition(c: dict) -> dict:
    if "answerBoolean" in c:
        answer = c["answerBoolean"]
    elif "answerCoding" in c:
        answer = c["answerCoding"]["code"]
    else:
        answer = c["answerString"]
    return {"question": c["question"], "answer": answer}


def build(bank: dict) -> dict:
    items = {i["linkId"]: i for i in _walk(bank["item"])}
    circle = items["circle_count"]
    return {
        "_source": "question-bank/questionnaire.json, made by tools/make_stub_bank.py. Don't edit by hand.",
        "version": bank["version"],
        "attention": {
            "circles_min": _ext(circle, "attention-circles-min"),
            "circles_max": _ext(circle, "attention-circles-max"),
            "squares_min": _ext(circle, "attention-squares-min"),
            "squares_max": _ext(circle, "attention-squares-max"),
            "show_ms": _ext(circle, "attention-show-ms"),
            "gap_ms": _ext(circle, "attention-gap-ms"),
            "expires_minutes": _ext(circle, "attention-expires-minutes"),
        },
        "follow_up": [
            {
                "item": question_item(i),
                "enable_when": [condition(c) for c in i.get("enableWhen", [])],
                "behavior": i.get("enableBehavior"),
                "after_routing": bool(_ext(i, "ask-after-routing", False)),
            }
            for i in items["follow_up"].get("item", [])
        ],
    }


def render(bank: dict) -> str:
    return json.dumps(build(bank), indent=1, ensure_ascii=True) + "\n"


def main() -> None:
    with open(BANK, encoding="utf-8") as f:
        text = render(json.load(f))
    with open(OUT, "w", encoding="utf-8", newline="\n") as f:
        f.write(text)
    print(f"wrote {os.path.relpath(OUT)}")


if __name__ == "__main__":
    main()
