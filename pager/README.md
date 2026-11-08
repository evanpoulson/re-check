# Recheck pager (Arduino UNO Q)

A three-button pager for patients without a usable phone (no phone, dead battery, no data).
It mirrors the phone's check-in and report options on a 1.3" OLED and talks to the Recheck API
over Wi-Fi. Reports go through the same storage, rules, tasks and staff dashboard as phone
reports, with channel `pager` and no session (see `api/src/recheck/routes/pager.py`).

This folder is the device only. The `/api/pager` routes and their tests (`api/tests/test_pager*.py`) come in a
separate change. Until then, test against `tools/fake_recheck.py` (steps 1 to 4 below).

| Path | What it is |
|---|---|
| `sketch/sketch.ino` | MCU (STM32): draws text, reads the buttons, drives the LEDs |
| `python/main.py` | Linux side: every screen, the API calls; also runs on a laptop as a simulator |
| `python/pager_config.example.json` | Copy to `pager_config.json` (git-ignored) and fill in |
| `tools/fake_recheck.py` | In-memory stand-in for the pager API, for testing with no database writes |
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
| Red blinking | You're needed: a check-in is due, or you've been called to the desk |
| Red steady | No connection, or a report wasn't sent: tell the desk |

## Screens

- **Pages** (LEFT and RIGHT flip, CONFIRM opens):
  - **Check-in** (only while one is due; the pager jumps to it and blinks red)
  - **Status** (minutes waited, next check-in)
  - **Report something**
- **Check-in**: "Feeling now?" and "Since last check?", worded as in the phone's question set, each with "Not sure".
  "Not sure" is sent as unknown, never as an answer.
- **Report** (mirrors the phone):
  - I need help now
  - I'm worried
  - New symptom (all 13 warning signs; tick several, then Send)
  - Question for desk
  - I'm leaving
  - Back

  Every option except symptoms asks "yes / no" first. Leaving shows the phone's 911 and 811 advice.
- **Called**: "PLEASE GO TO THE TRIAGE DESK NOW" when staff room the patient.

MVP limits:
- English only (the OLED font is ASCII).
- Wellness questions only: pain, the attention check and follow-up questions stay on the phone and with staff.
- The visit's QR stays as the phone fallback.

## Wiring (3.3 V logic, no soldering)

| Part | UNO Q |
|---|---|
| OLED (Adafruit 938) | Qwiic port, using the 4210 JST-SH cable |
| LEFT / CONFIRM / RIGHT buttons | D2 / D3 / D4 to one leg; the diagonally opposite leg to the GND rail |
| Red LED | D5 to 220-330 ohm resistor to LED long leg; short leg to GND rail |
| Green LED | D6 to 220-330 ohm resistor to LED long leg; short leg to GND rail |
| Buzzer (optional, 3.3 V active) | D9 to +; - to GND rail |
| GND rail | A GND pin on the power header |

The buttons use internal pull-ups. Nothing connects to 3.3 V or 5 V.

## Testing, in order

1. **Screens (no hardware).** Run `python -m unittest discover -s pager/tests`. It covers every screen,
   every report body and the 21-character OLED width. `api/tests/test_pager_contract.py` checks every
   body the pager can send against the real Pydantic contract.
2. **Wiring.** Run `wiring-test/sketch.ino` on the board. Expect red x3, green x3, then each button lights its LED.
3. **Real board, fake server (no database writes).**
   - On a laptop on the same Wi-Fi as the board (a phone hotspot works):
     `python pager/tools/fake_recheck.py`, then type `assign` and `open`.
   - Set `api_base` in `pager_config.json` to `http://<laptop IP>:8765` and `pager_key` to `dev-pager-key-not-secret`.
   - Load the app (below). `call` and `unassign` show the other screens.
4. **Simulator against any server.** `cd pager/python && python main.py`. Keys: `a` LEFT, `s` CONFIRM, `d` RIGHT, then Enter.
5. **Backend.** In `api/`, run `uv run pytest tests/test_pager.py tests/test_pager_contract.py` (offline) and
   `uv run pytest tests/test_pager_live.py tests/test_reports_live.py` (live, always rolled back).
6. **End to end on the deployed server.**
   - Set `RECHECK_PAGER_KEY` (16+ characters) as a GitHub secret and deploy.
   - Point `pager_config.json` at the deployed URL with that key.
   - Enrol a visit with channel Pager and the pager's number.
   - This step writes real demo data.

## Loading the app in Arduino App Lab

1. Open the **Blink LED** example and choose **Copy**. The copy already has the Bridge libraries.
2. Replace `sketch/sketch.ino` and `python/main.py`, and add `python/pager_config.json`.
3. **Add sketch libraries**: `Adafruit SSD1306`, `Adafruit GFX Library` and `Adafruit BusIO`.
   App Lab doesn't add dependencies on its own.
4. **Run.** Expect "RECHECK PAGER Starting..." then "Connecting...". A blinking red LED with a blank screen means the OLED
   wasn't found: reseat the Qwiic cable.
