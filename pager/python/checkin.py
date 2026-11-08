"""Recheck pager: the check-in, one question per screen. No hardware and no network.

Mirrors the phone (web/src/features/patient/CheckinFlow.tsx and web/src/lib/checkin.ts):

  1. the two wellness questions
  2. pain, 0 to 10
  3. new warning signs (tick all that apply)
  4. the circle-counting check, when the server issued a prompt
  5. the visit's follow-up questions, as the server lists them

A pager always reports as the patient, so pain and the circle check are always offered.
Every answer is a value or an explicit missing reason, so "no", "not sure", "never
reached" and "not asked" stay distinct. Ticking a warning sign that is urgent on its
own sends the check-in at once; the server then names the follow-up questions to ask.

The server data this reads is the phone's (PatientHome): `items` is a list of
QuestionItem ({key, input_type, text, options: [{code, text}], allow_unsure}) and
`attention_prompt` is an AttentionPrompt ({prompt_id, steps: [{shape, x, y}],
show_ms, gap_ms, expires_at}). Without them the pager asks the fixed questions only
and reports the circle check as not asked.

Screen: 128 x 64 OLED, 8 lines of 21 characters. The first line is an inverted title
bar, the last a button hint, so a list has 6 rows. A line starting with '>' is drawn
inverted: the cursor. A long option is cut when the cursor is elsewhere and shown in
full, over several inverted lines, when the cursor is on it.
"""

from __future__ import annotations

from dataclasses import dataclass, field

LEFT, CONFIRM, RIGHT = 1, 2, 3

WIDTH = 21                 # characters per OLED line
ROWS = 6                   # rows between the title bar and the button hint
LABEL = WIDTH - 1          # an option's text, after the cursor column
LIST_FOOTER = "< up   * ok   down >"
SCALE_FOOTER = "< less  * ok  more >"

UNSURE = "__unsure"        # "Not sure": sent as missing: unsure, never as an answer

# --- Wording: question-bank/questionnaire.json, patient wording, English -------------------------
# tests/test_checkin.py checks these against the bank, so a bank change fails the tests.

FEELING_NOW = [("very_good", "Very good"), ("good", "Good"), ("ok", "OK"),
               ("poor", "Poor"), ("very_poor", "Very poor")]
FEELING_CHANGE = [("much_better", "Much better"), ("better", "Better"), ("same", "About the same"),
                  ("worse", "Worse"), ("much_worse", "Much worse")]
FINDINGS = [
    ("speech_change", "Speech is different or hard to understand"),
    ("facial_droop", "Face looks droopy on one side"),
    ("new_weakness_numbness", "New weakness or numbness on one side"),
    ("trouble_breathing", "Harder to breathe"),
    ("fainting", "Fainted or nearly fainted"),
    ("new_confusion", "More confused"),
    ("drowsiness", "Hard to stay awake"),
    ("worst_headache", "Worst headache of my life"),
    ("vomiting", "Vomiting"),
    ("vision_change", "New problem seeing"),
    ("balance_change", "New problem with balance or walking"),
    ("chest_pain", "New or worse chest pain"),
    ("heavy_bleeding", "Heavy bleeding"),
]
NONE_OF_THESE = "None of these"

BASE_TEXT = {
    "feeling_now": "How are you feeling right now?",
    "feeling_change": "Compared with when staff last checked on you, how do you feel?",
    "pain": "How bad is your pain right now? 0 is no pain, 10 is the worst pain you can imagine.",
    "new_findings": "Since you arrived, has any of this started or got worse? Tick all that apply.",
    "circle_count": "Count the circles. Ignore the squares. How many circles did you see?",
}

# Signs that are urgent on their own. Mirrors URGENT_FINDINGS in api/src/recheck/rules.py
# and web/src/lib/findings.ts. Demo values for clinical review.
URGENT_FINDINGS = frozenset({
    "speech_change", "facial_droop", "new_weakness_numbness", "trouble_breathing",
    "fainting", "heavy_bleeding", "new_confusion", "chest_pain",
})

# Short names for the title bar, at most 14 characters so "10/10 " fits in front.
# Anything else is called "Question".
TITLES = {
    "feeling_now": "Feeling now", "feeling_change": "Since last chk", "pain": "Pain",
    "new_findings": "New symptoms", "circle_count": "Circle check",
    "pain_moved": "Pain moved?", "pain_new_location": "Pain moved to",
    "pain_sudden_worse": "Sudden worse?", "change_started": "Started when?",
    "symptoms_change": "Symptoms now", "headache_sudden_worse": "Headache worse",
    "last_known_well": "Last normal", "harder_to_wake": "Hard to wake?",
    "vomit_count": "Vomiting", "headache_change": "Headache now", "seizure": "Seizure?",
    "more_confused": "More confused?",
}
TITLE_MAX = 14

# The circle check, as the phone words it (web/src/i18n/en.json, "circle").
CIRCLE_INTRO = ("Shapes appear one at a time. Count the circles and ignore the squares. "
                "This is not a medical test.")
CIRCLE_LEAD_MS = 600       # blank screen before the first shape, as on the phone
COUNT_MAX = 20             # the contract's highest count

# Shapes are drawn on the whole 128 x 64 screen by the MCU, centred on (x, y) pixels.
SCREEN_W, SCREEN_H = 128, 64
SHAPE_R = 9                # keep in step with SHAPE_R in sketch/sketch.ino


# --- Text helpers ---------------------------------------------------------------------------------

# Curly quotes, dashes, the ellipsis and a no-break space, by code point to keep this file ASCII.
_ASCII = {chr(0x2018): "'", chr(0x2019): "'", chr(0x201C): '"', chr(0x201D): '"',
          chr(0x2013): "-", chr(0x2014): "-", chr(0x2026): "...", chr(0xA0): " "}


def ascii_text(text: str) -> str:
    """The OLED font is ASCII. Common typography becomes ASCII; anything else becomes '?'."""
    out = "".join(_ASCII.get(c, c) for c in str(text))
    return "".join(c if 32 <= ord(c) < 127 else "?" for c in out)


def wrap(text: str, width: int = WIDTH) -> list[str]:
    """Word-wrap to `width`. A word longer than a line is split."""
    lines: list[str] = []
    line = ""
    for word in ascii_text(text).split():
        while len(word) > width:
            if line:
                lines.append(line)
                line = ""
            lines.append(word[:width])
            word = word[width:]
        if not line:
            line = word
        elif len(line) + 1 + len(word) <= width:
            line += " " + word
        else:
            lines.append(line)
            line = word
    if line:
        lines.append(line)
    return lines or [""]


def cut(label: str, width: int = LABEL) -> str:
    label = ascii_text(label)
    return label if len(label) <= width else label[: width - 2] + ".."


def list_screen(title: str, intro: list[str], labels: list[str], cursor: int, top: int,
                footer: str = LIST_FOOTER, from_top: bool = False) -> tuple[tuple, int]:
    """A title bar, a scrolling body and a footer. Returns (lines, new top).

    The body is the intro lines (not selectable) then one row per label. The row under
    the cursor is shown in full over as many inverted lines as it needs; the others are
    cut to one line. When the cursor is on the first label the view scrolls back up, so
    the question shows again. `from_top` shows the question from its first line even if
    that cuts the row under the cursor: a new question is read before it is answered.
    """
    body: list[str] = list(intro)
    start = end = 0
    for i, label in enumerate(labels):
        if i == cursor:
            start = len(body)
            box = label[:4] if label[:4] in ("[ ] ", "[x] ") else ""
            parts = wrap(label[len(box):], LABEL - len(box))
            body += [">" + (box if j == 0 else " " * len(box)) + part for j, part in enumerate(parts)]
            end = len(body)
        else:
            body.append(" " + cut(label))
    if from_top or (cursor == 0 and end <= ROWS):
        top = 0
    elif start < top:
        top = start
    elif end > top + ROWS:
        top = end - ROWS
    shown = body[top:top + ROWS]
    return (cut(title, WIDTH), *shown, *([""] * (ROWS - len(shown))), footer), top


# --- Questions ------------------------------------------------------------------------------------

@dataclass
class Question:
    key: str
    kind: str                       # choice | multi | yes_no | scale | count
    text: str
    options: list[tuple[str, str]] = field(default_factory=list)
    allow_unsure: bool = True
    none_label: str | None = None   # a "None of these" row (answers an empty list)
    base: bool = False              # a fixed check-in question, not a bank item

    @property
    def title(self) -> str:
        return TITLES.get(self.key, "Question")


def base_questions(with_circle: bool) -> list[Question]:
    qs = [
        Question("feeling_now", "choice", BASE_TEXT["feeling_now"], FEELING_NOW, base=True),
        Question("feeling_change", "choice", BASE_TEXT["feeling_change"], FEELING_CHANGE, base=True),
        Question("pain", "scale", BASE_TEXT["pain"], base=True),
        Question("new_findings", "multi", BASE_TEXT["new_findings"], FINDINGS, none_label=NONE_OF_THESE, base=True),
    ]
    if with_circle:
        qs.append(Question("circle_count", "count", BASE_TEXT["circle_count"], base=True))
    return qs


_KINDS = {"yes_no": "yes_no", "choice": "choice", "multi_choice": "multi", "scale": "scale"}


def from_item(item: dict) -> Question | None:
    """A server QuestionItem as a pager question. None for an input type the pager doesn't know."""
    kind = _KINDS.get(item.get("input_type", ""))
    if kind is None or not item.get("key"):
        return None
    options = [(str(o["code"]), ascii_text(o.get("text", o["code"]))) for o in item.get("options") or []]
    if kind in ("choice", "multi") and not options:
        return None
    return Question(str(item["key"]), kind, ascii_text(item.get("text", "")), options,
                    allow_unsure=item.get("allow_unsure", True) is not False)


def checkin_questions(state: dict) -> list[Question]:
    """Every step of a scheduled check-in, in the phone's order."""
    prompt = state.get("attention_prompt")
    items = [q for q in (from_item(i) for i in state.get("items") or []) if q]
    return base_questions(with_circle=bool(prompt and prompt.get("steps"))) + items


def followup_questions(state: dict, keys: list[str]) -> list[Question]:
    """The follow-ups a receipt named, in its order, from the items the server lists."""
    by_key = {q.key: q for q in (from_item(i) for i in state.get("items") or []) if q}
    return [by_key[k] for k in keys if k in by_key]


# --- The circle check -----------------------------------------------------------------------------

def shape_pixels(x: float, y: float) -> tuple[int, int]:
    """A step's position (fractions of the play area) as the shape's centre in pixels, fully on screen."""
    px = SHAPE_R + round(min(max(x, 0.0), 1.0) * (SCREEN_W - 1 - 2 * SHAPE_R))
    py = SHAPE_R + round(min(max(y, 0.0), 1.0) * (SCREEN_H - 1 - 2 * SHAPE_R))
    return px, py


def play_spec(prompt: dict) -> str:
    """What the MCU plays: "lead,show,gap;C,x,y;S,x,y;..." (C circle, S square, pixels)."""
    parts = [f"{CIRCLE_LEAD_MS},{int(prompt['show_ms'])},{int(prompt['gap_ms'])}"]
    for step in prompt["steps"]:
        px, py = shape_pixels(float(step["x"]), float(step["y"]))
        parts.append(f"{'C' if step['shape'] == 'circle' else 'S'},{px},{py}")
    return ";".join(parts)


def play_ms(prompt: dict) -> int:
    """How long the shapes take, from the start of the lead to the end of the last gap."""
    return CIRCLE_LEAD_MS + len(prompt["steps"]) * (int(prompt["show_ms"]) + int(prompt["gap_ms"]))


# --- The report -----------------------------------------------------------------------------------

def _missing(reason: str) -> dict:
    return {"kind": "missing", "reason": reason}


def _item_answer(q: Question, value) -> dict:
    if value == UNSURE:
        return _missing("unsure")
    if q.kind == "yes_no":
        return {"kind": "yes_no", "value": bool(value)}
    if q.kind == "multi":
        return {"kind": "multi_choice", "value": list(value)}
    if q.kind == "scale":
        return {"kind": "scale", "value": int(value)}
    return {"kind": "choice", "value": value}


def build_checkin(questions: list[Question], answers: dict, *, version: str | None,
                  prompt: dict | None, mode: str = "full") -> dict:
    """The CheckinReport body, without submission_id, reporter, channel and captured_at.

    Same rules as buildCheckinReport on the phone: an unanswered question is
    `not_reached` in a full check-in and `not_asked` in a follow-up.
    """
    unanswered = "not_reached" if mode == "full" else "not_asked"

    def base(key: str) -> dict:
        if key not in answers:
            return _missing(unanswered)
        value = answers[key]
        return _missing("unsure") if value == UNSURE else {"kind": "answered", "value": value}

    pain = _missing("not_asked") if mode != "full" else base("pain")
    findings = base("new_findings")
    if findings.get("kind") == "answered":
        findings["value"] = [code for code, _ in FINDINGS if code in findings["value"]]

    item_qs = [q for q in questions if not q.base]
    keys = [q.key for q in item_qs] if mode == "full" else [q.key for q in item_qs if q.key in answers]
    items = {q.key: _item_answer(q, answers[q.key]) if q.key in answers else _missing("not_reached")
             for q in item_qs if q.key in keys}

    return {
        "kind": "checkin",
        "purpose": "scheduled" if mode == "full" else "followup",
        "questionnaire_version": version,
        "feeling_now": base("feeling_now"),
        "feeling_change": base("feeling_change"),
        "pain": pain,
        "new_findings": findings,
        "attention": attention_answer(answers.get("circle_count"), prompt, mode),
        "items": items,
    }


def attention_answer(result: dict | None, prompt: dict | None, mode: str) -> dict:
    """The circle check. Only a check that was shown names the prompt, so "shown but not
    answered" stays distinct from "never shown"."""
    if mode != "full" or not prompt:
        return _missing("not_asked")
    prompt_id = prompt["prompt_id"]
    if not result or not result.get("shown"):
        return _missing("not_reached")
    if result.get("count") is not None:
        return {"kind": "answered", "prompt_id": prompt_id, "count": int(result["count"])}
    return {"kind": "missing", "reason": result.get("skip") or "not_reached", "prompt_id": prompt_id}


# --- The flow -------------------------------------------------------------------------------------

class Flow:
    """One check-in on the pager: which question, its cursor, and the answers so far.

    `handle(button)` returns what the pager must do next:
      None    redraw
      "exit"  leave without sending (nothing was answered)
      "send"  send `report()` now (the last question, an urgent sign, or "Stop and send")
      "play"  start the circle check: the caller checks the prompt, plays it, then calls `played()`
    """

    def __init__(self, questions: list[Question], *, mode: str = "full", prompt: dict | None = None,
                 version: str | None = None):
        self.questions, self.mode, self.prompt, self.version = questions, mode, prompt, version
        self.index = 0
        self.answers: dict = {}
        self.cursor = 0
        self.top = 0
        self.fresh = True           # just arrived: show the question from its first line
        self.ticks: list[str] = []
        self.phase = "intro"        # circle check: intro | playing | count
        self.hint = ""
        self._enter()

    # -- state ---------------------------------------------------------------------------------
    @property
    def question(self) -> Question:
        return self.questions[self.index]

    @property
    def playing(self) -> bool:
        return self.question.kind == "count" and self.phase == "playing"

    def any_answered(self) -> bool:
        return bool(self.answers)

    def report(self) -> dict:
        return build_checkin(self.questions, self.answers, version=self.version, prompt=self.prompt, mode=self.mode)

    def _enter(self) -> None:
        """Put the cursor on the current answer, if any."""
        q = self.question
        self.top, self.hint, self.phase, self.fresh = 0, "", "intro", True
        value = self.answers.get(q.key)
        self.ticks = list(value) if q.kind == "multi" and isinstance(value, list) else []
        entries = self.entries()
        # The wellness questions start in the middle ("OK", "About the same"), as the pager always has.
        self.cursor = len(q.options) // 2 if q.base and q.kind == "choice" else 0
        for i, (_, action) in enumerate(entries):
            if (q.kind in ("choice", "yes_no") and action == ("pick", value)) or \
               (q.kind == "scale" and action == ("pick", value)) or \
               (value == UNSURE and action == ("unsure",)):
                self.cursor = i
                break

    def _advance(self) -> str | None:
        if self.index >= len(self.questions) - 1:
            return "send"
        self.index += 1
        self._enter()
        return None

    def _back(self) -> str | None:
        if self.index == 0:
            return "exit"
        self.index -= 1
        # The circle check is shown once: Back steps over a finished one.
        if self.question.kind == "count" and self.question.key in self.answers and self.index > 0:
            self.index -= 1
        self._enter()
        return None

    # -- entries -------------------------------------------------------------------------------
    def _tail(self) -> list[tuple[str, tuple]]:
        """Back and Stop. Back on the first question only while nothing is answered, as on the phone."""
        rows = []
        if self.index > 0 or not self.any_answered():
            rows.append(("Back", ("back",)))
        if self.any_answered():
            rows.append(("Stop and send", ("stop",)))
        return rows

    def entries(self) -> list[tuple[str, tuple]]:
        """The selectable rows of the current screen: (label, action)."""
        q = self.question
        unsure = [("Not sure", ("unsure",))] if q.allow_unsure else []
        if q.kind == "yes_no":
            return [("Yes", ("pick", True)), ("No", ("pick", False)), *unsure, *self._tail()]
        if q.kind == "choice":
            return [(label, ("pick", code)) for code, label in q.options] + unsure + self._tail()
        if q.kind == "multi":
            rows = [(("[x] " if code in self.ticks else "[ ] ") + label, ("tick", code)) for code, label in q.options]
            urgent = q.key == "new_findings" and self.mode == "full" and any(c in URGENT_FINDINGS for c in self.ticks)
            done = f"{'Send now' if urgent else 'Next'} ({len(self.ticks)} ticked)"
            rows.append((done, ("next",)))
            if q.none_label:
                rows.append((q.none_label, ("none",)))
            return rows + unsure + self._tail()
        if q.kind == "scale":
            return [(str(n), ("pick", n)) for n in range(0, 11)] + unsure + self._tail()
        # count
        if self.phase == "intro":
            back = [("Back", ("back",))] if self.index > 0 else []
            return [("Start", ("start",)), ("I can't do this", ("cant",)), *back]
        return [(str(n), ("count", n)) for n in range(0, COUNT_MAX + 1)] + \
               [("Not sure", ("unsure",)), ("I can't do this", ("cant",))]

    # -- buttons -------------------------------------------------------------------------------
    def handle(self, button: int) -> str | None:
        if self.playing:
            if button == LEFT:                      # stop: shown, but not answered
                self.answers["circle_count"] = {"shown": True, "skip": "unable_to_respond"}
                return self._advance()
            return None
        entries = self.entries()
        stepped = self.question.kind == "scale" or (self.question.kind == "count" and self.phase == "count")
        self.fresh = False
        if button == LEFT:
            self.cursor = max(0, self.cursor - 1) if stepped else (self.cursor - 1) % len(entries)
            self.hint = ""
            return None
        if button == RIGHT:
            self.cursor = min(len(entries) - 1, self.cursor + 1) if stepped else (self.cursor + 1) % len(entries)
            self.hint = ""
            return None
        return self._choose(entries[self.cursor][1])

    def _choose(self, action: tuple) -> str | None:
        q = self.question
        name = action[0]
        if name == "back":
            return self._back()
        if name == "stop":
            return "send"
        if name == "unsure":
            if q.kind == "count":
                self.answers[q.key] = {"shown": True, "skip": "unsure"}
            else:
                self.answers[q.key] = UNSURE
            return self._advance()
        if name == "pick":
            self.answers[q.key] = action[1]
            return self._advance()
        if name == "tick":
            code = action[1]
            self.ticks = [c for c in self.ticks if c != code] if code in self.ticks else self.ticks + [code]
            self.hint = ""
            return None
        if name == "none":
            self.ticks = []
            self.answers[q.key] = []
            return self._advance()
        if name == "next":
            if not self.ticks:
                self.hint = "Tick one, or None" if q.none_label else "Tick one, or Not sure"
                return None
            self.answers[q.key] = list(self.ticks)
            if q.key == "new_findings" and self.mode == "full" and any(c in URGENT_FINDINGS for c in self.ticks):
                return "send"                       # urgent: send now, follow-ups come after
            return self._advance()
        if name == "start":
            return "play"
        if name == "cant":
            self.answers[q.key] = {"shown": True, "skip": "unable_to_respond"}
            return self._advance()
        if name == "count":
            self.answers[q.key] = {"shown": True, "count": action[1]}
            return self._advance()
        return None

    # -- the circle check ----------------------------------------------------------------------
    def start_playing(self) -> None:
        self.phase = "playing"

    def played(self) -> None:
        """The shapes are done: ask for the count, starting at 0."""
        if self.playing:
            self.phase, self.cursor, self.top = "count", 0, 0

    def skip_circle(self) -> str | None:
        """No usable prompt (it expired and no new one came): the check was never shown."""
        self.answers.pop("circle_count", None)
        self.prompt = None
        return self._advance()

    # -- drawing -------------------------------------------------------------------------------
    def header(self) -> str:
        return cut(f"{self.index + 1}/{len(self.questions)} {self.question.title}", WIDTH)

    def lines(self) -> tuple:
        q = self.question
        if q.kind == "scale":
            return self._scale_lines(("How bad is your pain", "right now?") if q.key == "pain" else wrap(q.text)[:2],
                                     "0 none     10 worst" if q.key == "pain" else "0 to 10", top=10)
        if q.kind == "count":
            if self.phase == "playing":
                return (self.header(), "", "Watch the screen", "and count the", "circles.", "", "", "< stop")
            if self.phase == "count":
                return self._scale_lines(("How many circles", "did you see?"), "", top=COUNT_MAX)
            lines, self.top = list_screen(self.header(), wrap(CIRCLE_INTRO), [l for l, _ in self.entries()],
                                          self.cursor, self.top)
            return lines
        labels = [label for label, _ in self.entries()]
        lines, self.top = list_screen(self.header(), wrap(q.text), labels, self.cursor, self.top,
                                      footer=self.hint or LIST_FOOTER, from_top=self.fresh)
        return lines

    def _scale_lines(self, question, anchor: str, top: int) -> tuple:
        label, action = self.entries()[self.cursor]
        if action[0] in ("pick", "count"):
            n = action[1]
            value = ">" + (f"{n} of {top}" if action[0] == "pick" else f"{n} circles").center(WIDTH)
            if n == top:
                extra = "more > : Not sure"         # the choices past the top number
            elif top <= 10:
                extra = ("[" + "#" * n + "-" * (top - n) + "]").center(WIDTH)
            else:
                extra = ""
        else:
            value = ">" + label.center(WIDTH)
            extra = "* to choose"
        return (self.header(), *question, anchor, "", value, extra, SCALE_FOOTER)
