# Recheck pager (Arduino UNO Q)

A three-button pager for patients without a usable phone (no phone, dead battery, no data).
It mirrors the phone's check-in and report options on a 1.3" OLED and talks to the Recheck API
over Wi-Fi. Reports go through the same storage, rules, tasks and staff dashboard as phone
reports, with channel `pager` and no session (see `api/src/recheck/routes/pager.py`).

This folder is the device only. The `/api/pager` routes and their tests (`api/tests/test_pager*.py`) come in a
separate change. Until then the pager isn't connected: it runs against its stub (below).

| Path | What it is |
|---|---|
| `sketch/sketch.ino` | MCU (STM32): draws text and the circle check's shapes, reads the buttons, drives the LEDs |
| `python/main.py` | Linux side: pages, reports, the API calls; also runs on a laptop as a simulator |
| `python/checkin.py` | The check-in: its questions, screens, answers and report body (no hardware, no network) |
| `python/stub.py` | The stub: the pager API's answers, made on the pager, not connected to anything |
| `python/stub_bank.json` | The question bank data the stub needs. Made by `tools/make_stub_bank.py`; don't edit by hand |
| `python/pager_config.example.json` | Copy to `pager_config.json` (git-ignored) and fill in |
| `tools/fake_recheck.py` | The stub served over HTTP, for testing a board against a laptop |
| `tools/make_stub_bank.py` | Writes `python/stub_bank.json` from `question-bank/questionnaire.json` |
| `tests/` | Screen and report tests (`python -m unittest discover -s pager/tests`) |
| `wiring-test/sketch.ino` | Checks the buttons, LEDs and OLED before loading the pager |

## Buttons and lights

| Button | Pin | Does |
|---|---|---|
| LEFT | D2 | Up, previous page, or "no" |
| CONFIRM | D3 | Choose, or "yes" |
| RIGHT | D4 | Down, next page |

| Light | Means |
|---|---|
| Green flicker on each press | The pager felt the press |
| Green double flash | Staff received the report |
| Green steady | Connected |
| Red blinking, with beeps | You're needed: a check-in is due, or you've been called to the desk |
| Red steady, with a steady tone | No connection, or a report wasn't sent: tell the desk |

## Screens

- **Pages** (LEFT and RIGHT flip, CONFIRM opens):
  - **Check-in** (only while one is due; the pager jumps to it and blinks red)
  - **Status** (minutes waited, next check-in)
  - **Report something**
- **Check-in**: the phone's check-in, one question per screen, in the phone's order
  (`web/src/features/patient/CheckinFlow.tsx`). The title bar shows the question number and a short name.
  1. How are you feeling right now?
  2. Compared with when staff last checked on you, how do you feel?
  3. Pain, 0 to 10
  4. New warning signs: the 13 signs, tick all that apply, or "None of these"
  5. The circle check, when the server issued a prompt
  6. The visit's follow-up questions, as the server lists them
- **Report** (mirrors the phone):
  - I need help now
  - I'm worried
  - New symptom (all 13 warning signs; tick several, then Send)
  - Question for desk
  - I'm leaving
  - Back

  Every option except symptoms asks "yes / no" first. Leaving shows the phone's 911 and 811 advice.
- **Called**: "PLEASE GO TO THE TRIAGE DESK NOW" when staff room the patient.

### How each kind of question shows

The screen has 8 lines of 21 characters: a title bar, 6 rows and a button hint.

| Kind | Questions | On the pager |
|---|---|---|
| One choice | feeling now, since last check, `change_started`, `symptoms_change`, `last_known_well`, `vomit_count`, `headache_change` | The question, then the options. LEFT and RIGHT move, CONFIRM chooses and goes on. |
| Yes or no | `pain_moved`, `pain_sudden_worse`, `headache_sudden_worse`, `harder_to_wake`, `seizure`, `more_confused` | Yes, No |
| Tick all that apply | new warning signs, `pain_new_location` | `[ ]` rows that CONFIRM ticks, then "Next (n ticked)". Warning signs also have "None of these". |
| 0 to 10 | pain | A number and a bar. LEFT is less, RIGHT is more. Past 10: Not sure, Back. |
| Circle check | `circle_count` | Start or "I can't do this". The shapes play, then the count: 0 to 20, then Not sure and "I can't do this". |

On every question:
- **Wording.** It is the bank's, in full. A new question opens on its first line. A long option is cut ("..")
  until the cursor is on it, then it shows in full over several highlighted lines.
- **Not sure** is on every question that allows it, and is sent as unknown, never as an answer.
- **Back** goes to the previous question with its answer selected. On the first question it leaves the check-in,
  but only while nothing is answered.
- **Stop and send** appears once something is answered. It sends the answers so far; the rest are sent as not reached.
- **Next** with nothing ticked says "Tick one, or None".

As on the phone:
- **Urgent signs.** Ticking a warning sign that is urgent on its own (speech, face, one-sided weakness, breathing,
  fainting, bleeding, confusion, chest pain) turns Next into "Send now". The check-in goes at once, and the unreached
  questions are sent as not reached.
- **Follow-ups.** When a receipt names follow-up questions, the result screen says "Next: a few more". The pager then
  asks them as a follow-up. A question already offered since the check-in started isn't asked again.
- **Report bodies.** They match `buildCheckinReport` in `web/src/lib/checkin.ts`.

### The circle check

The server's prompt (`AttentionPrompt`) sets the shapes, where they go, and how long each shows:
- **Order.** A blank screen for 0.6 s, then each shape for `show_ms` with `gap_ms` blank after it.
- **Shapes.** Circles and squares, drawn as thick outlines so they differ by shape, not colour.
- **Size and position.** About 19 pixels across. The positions (0 to 1) are spread over the whole 128 x 64 screen.
- **Timing.** The MCU times the shapes, so a busy Linux side can't stretch one. Python doesn't redraw or poll until
  they're done.
- **Stopping.** LEFT stops the shapes. That is sent as "unable to respond", with the prompt's ID, so staff can tell
  "shown but not answered" from "never shown". The check is shown once, and Back steps over it.
- **Expiry.** An expired prompt is fetched again. If there is no new one, the check is skipped and sent as not asked.

### What the pager reads from the server

The check-in uses the phone's data (`PatientHome`), as extra fields on the pager state:
- **`items`**: the visit's follow-up questions, as `QuestionItem`s.
- **`attention_prompt`**: the circle check, while a check-in is open.

`GET /api/pager/{n}` sends both, in English, the same as the stub. Without them (an older server), the pager asks the
four fixed questions and sends the circle check as not asked.

### The stub (not connected)

With `"api_base": "stub"` in `pager_config.json`, or no config at all, the pager answers itself with `python/stub.py`.
Nothing goes over the network. Every answer has the real API's shape, and the visit behaves as its database row does:
- **The visit.** Waiting, with `triaged_at`, and `next_prompt_due_at` that a scheduled check-in moves by the CTAS
  interval from `db/schema.sql` (15, 30, 60 or 120 minutes). "Called" lasts 15 minutes after rooming.
- **Questions.** The follow-ups are the server's own `QuestionItem`s, with the bank's branching, for the complaint group
  in `"stub_group"` (default `chest_back_pain`).
- **The circle check.** Prompts are made as `attention.py` makes them, and each can be answered once and only before it
  expires.
- **Receipts.** `patient_message` follows `rules.py` (it is never `clinician_told`), and `follow_up_items` follows
  `routes/reports.py`.
- **Errors.** The route's errors: 404 with no waiting patient, 409 for a check-in that isn't due or a reused
  `submission_id`, and 422 for an old bank version, an unknown item or a bad circle prompt.

It stores nothing and raises no staff tasks. `tests/test_stub.py` keeps it in step with the bank and the server's rules.
After a question bank change, run `python pager/tools/make_stub_bank.py`.

MVP limits:
- English only (the OLED font is ASCII; server text is turned into ASCII).
- The visit's QR stays as the phone fallback.

## Wiring (3.3 V logic, no soldering)

| Part | UNO Q |
|---|---|
| OLED (Adafruit 938) | Qwiic port, using the 4210 JST-SH cable |
| LEFT / CONFIRM / RIGHT buttons | D2 / D3 / D4 to one leg; the diagonally opposite leg to the GND rail |
| Red LED | D5 to 220-330 ohm resistor to LED long leg; short leg to GND rail |
| Green LED | D6 to 220-330 ohm resistor to LED long leg; short leg to GND rail |
| Buzzer (passive or active) | D9 to +; - to GND rail. A 2 kHz tone whenever the red light is on. |

After a visit ends and the pager is handed back, press all three buttons together. The pager clears
its local screen and dismisses the current call, then checks for an assignment. It ignores the
gesture during an active visit or when it is already idle. Enrol the next patient with the same pager
number.
| GND rail | A GND pin on the power header |

The buttons use internal pull-ups. Nothing connects to 3.3 V or 5 V.

## Testing, in order

1. **Screens and the stub (no hardware).** Run `python -m unittest discover -s pager/tests`. It draws every question in
   `question-bank/questionnaire.json` at every cursor position against the OLED's 8 x 21 characters. It also covers
   every answer and report body, and checks the pager's copy of the fixed wording and the urgent signs against the
   bank, the phone and the server. `api/tests/test_pager_contract.py` (in the API change) checks the bodies against
   the real Pydantic contract.
2. **Wiring.** Run `wiring-test/sketch.ino` on the board. Expect red x3, green x3, then each button lights its LED.
3. **Real board, fake server (no database writes).**
   - On a laptop on the same Wi-Fi as the board (a phone hotspot works):
     `python pager/tools/fake_recheck.py`, then type `assign` and `open`.
   - Set `api_base` in `pager_config.json` to `http://<laptop IP>:8765` and `pager_key` to `dev-pager-key-not-secret`.
   - Load the app (below). `call` and `unassign` show the other screens.
   - `group head_injury` (or `chest_back_pain`, `neuro_change`, `confused_drowsy`, `general`) and `cedis 404` choose the
     visit's follow-up questions. The console prints each report and scores each circle check.
4. **Simulator.** `cd pager/python && python main.py`. Keys: `a` LEFT, `s` CONFIRM, `d` RIGHT, then Enter.
   With no config it uses the stub. The circle check prints each shape as a small picture (`O` circle, `#` square)
   on the board's timing.
5. **Backend.** In `api/`, run `uv run pytest tests/test_pager.py tests/test_pager_contract.py` (offline) and
   `uv run pytest tests/test_pager_live.py tests/test_reports_live.py` (live, always rolled back).
6. **End to end on the deployed server.**
   - Set `RECHECK_PAGER_KEY` (16+ characters) as a GitHub secret and deploy.
   - Point `pager_config.json` at the deployed URL with that key.
   - Enrol a visit with channel Pager and the pager's number.
   - This step writes real demo data.

## Loading the app in Arduino App Lab

1. Open the **Blink LED** example and choose **Copy**. The copy already has the Bridge libraries.
2. Replace `sketch/sketch.ino` and `python/main.py`. Add `python/checkin.py`, `python/stub.py`, `python/stub_bank.json`
   and `python/pager_config.json` (`"api_base": "stub"` until the pager is connected).
3. **Add sketch libraries**: `Adafruit SSD1306`, `Adafruit GFX Library` and `Adafruit BusIO`.
   App Lab doesn't add dependencies on its own.
4. **Run.** Expect "RECHECK PAGER Starting..." then "Connecting...". A blinking red LED with a blank screen means the OLED
   wasn't found: reseat the Qwiic cable.
