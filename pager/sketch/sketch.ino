// Recheck pager: MCU side (STM32 on the Arduino UNO Q).
//
// This side only draws text and the circle check's shapes, reads the three buttons and
// drives the two LEDs.
// All screens, logic and network calls live in python/main.py on the Linux side;
// the two sides talk over Bridge.
//
//   Python -> MCU   show(text)        Lines split by '\n'. The first line is an inverted header bar;
//                                     a later line starting with '>' is drawn highlighted (the cursor).
//   Python -> MCU   leds(red, green)  red: 0 off, 1 on, 2 blink (with buzzer chirps); green: 0 off, 1 on
//   Python -> MCU   ack(n)            Green double flash: "staff received it"
//   Python -> MCU   play(spec)        The circle check: "lead,show,gap;C,x,y;S,x,y;..." (ms, then each
//                                     shape's centre in pixels: C circle, S square). A blank screen for
//                                     `lead` ms, then each shape for `show` ms with `gap` ms blank after it.
//                                     The MCU keeps the time, so a busy Linux side can't stretch a shape.
//                                     The screen stays blank at the end; the next show() replaces it,
//                                     and a show() during the shapes stops them.
//   MCU -> Python   button(code)      1 = LEFT (up / previous / back), 2 = CONFIRM, 3 = RIGHT (down / next)
//
// Every press flips the green LED for 120 ms, straight from the MCU, so the patient
// sees the press was felt even while the Linux side is busy sending.
//
// Wiring (3.3 V logic, no soldering):
//   OLED (Adafruit 938)  -> Qwiic port with the 4210 JST-SH cable (Wire1)
//   LEFT     D2 -> button leg; diagonally opposite leg -> GND rail
//   CONFIRM  D3 -> button leg; diagonally opposite leg -> GND rail
//   RIGHT    D4 -> button leg; diagonally opposite leg -> GND rail   (internal pull-ups, no resistors)
//   Red LED  D5 -> 220-330 ohm -> LED long leg; short leg -> GND rail
//   Green    D6 -> 220-330 ohm -> LED long leg; short leg -> GND rail
//   Buzzer (optional 3.3 V active buzzer) D9 -> + ; - -> GND rail

#include <Arduino_RouterBridge.h>
#include <Wire.h>
#include <Adafruit_GFX.h>
#include <Adafruit_SSD1306.h>

const int PIN_LEFT = 2;
const int PIN_CONFIRM = 3;
const int PIN_RIGHT = 4;
const int PIN_RED = 5;
const int PIN_GREEN = 6;
const int PIN_BUZZ = 9;

const unsigned long DEBOUNCE_MS = 30;
const unsigned long PRESS_FLASH_MS = 120;
const unsigned long BLINK_MS = 400;
const unsigned long CHIRP_FOR_MS = 3000;
const unsigned long ACK_MS = 800;

Adafruit_SSD1306 oled(128, 64, &Wire1, -1);
bool oledOk = false;

// The circle check. Keep SHAPE_R in step with SHAPE_R in python/checkin.py.
const int SHAPE_R = 9;
const int MAX_SHAPES = 24;
struct Shape {
  char kind;  // 'C' circle, 'S' square
  int x;
  int y;
};
Shape shapes[MAX_SHAPES];
int shapeCount = 0;
bool playing = false;
unsigned long playStart = 0, playLead = 0, playShow = 0, playGap = 0;
int playDrawn = -2;  // the frame on screen: -1 blank, n shape n, -2 nothing drawn yet

int redMode = 0;
unsigned long redModeSince = 0;
int greenMode = 0;
unsigned long pressFlashUntil = 0;
unsigned long ackStart = 0;
bool acking = false;

struct Button {
  int pin;
  int code;
  bool stable;     // true = released (pull-up)
  bool lastRead;
  unsigned long changedAt;
};

Button buttons[] = {
  {PIN_LEFT, 1, true, true, 0},
  {PIN_CONFIRM, 2, true, true, 0},
  {PIN_RIGHT, 3, true, true, 0},
};

uint8_t findOled() {
  const uint8_t addrs[] = {0x3D, 0x3C};
  for (uint8_t a : addrs) {
    Wire1.beginTransmission(a);
    if (Wire1.endTransmission() == 0) return a;
  }
  return 0;
}

void drawLines(const String &text) {
  if (!oledOk) return;
  oled.clearDisplay();
  oled.setTextSize(1);
  int y = 0;
  int start = 0;
  bool first = true;
  while (start <= (int)text.length() && y < 64) {
    int nl = text.indexOf('\n', start);
    if (nl < 0) nl = text.length();
    String line = text.substring(start, nl);
    bool highlight = first || line.startsWith(">");
    if (!first && line.startsWith(">")) line = line.substring(1);
    if (highlight) {
      oled.fillRect(0, y, 128, 8, SSD1306_WHITE);
      oled.setTextColor(SSD1306_BLACK);
    } else {
      oled.setTextColor(SSD1306_WHITE);
    }
    oled.setCursor(first ? 1 : 0, y);
    oled.print(line.substring(0, 21));
    y += first ? 9 : 8;  // 1 px gap under the header bar
    first = false;
    start = nl + 1;
  }
  oled.display();
}

void show(String text) {
  playing = false;  // a new screen ends the circle check
  drawLines(text);
}

// The next number in `s` from `from`, which moves past it and one separator.
long nextNumber(const String &s, int &from) {
  int end = from;
  while (end < (int)s.length() && s[end] != ',' && s[end] != ';') end++;
  long value = s.substring(from, end).toInt();
  from = end + 1;
  return value;
}

void play(String spec) {
  int at = 0;
  playLead = nextNumber(spec, at);
  playShow = nextNumber(spec, at);
  playGap = nextNumber(spec, at);
  shapeCount = 0;
  while (at < (int)spec.length() && shapeCount < MAX_SHAPES) {
    char kind = spec[at];
    at += 2;  // the letter and its comma
    int x = nextNumber(spec, at);
    int y = nextNumber(spec, at);
    shapes[shapeCount++] = {kind, constrain(x, SHAPE_R, 127 - SHAPE_R), constrain(y, SHAPE_R, 63 - SHAPE_R)};
  }
  playing = shapeCount > 0;
  playStart = millis();
  playDrawn = -2;
}

void drawShape(int frame) {
  if (!oledOk) return;
  oled.clearDisplay();
  if (frame >= 0) {
    const Shape &s = shapes[frame];
    // Thick outlines, so a circle and a square differ by shape, not by colour.
    for (int t = 0; t < 3; t++) {
      if (s.kind == 'C') {
        oled.drawCircle(s.x, s.y, SHAPE_R - t, SSD1306_WHITE);
      } else {
        int side = 2 * (SHAPE_R - t) + 1;
        oled.drawRect(s.x - SHAPE_R + t, s.y - SHAPE_R + t, side, side, SSD1306_WHITE);
      }
    }
  }
  oled.display();
}

void updatePlay() {
  if (!playing) return;
  unsigned long t = millis() - playStart;
  int frame = -1;
  if (t >= playLead) {
    unsigned long into = t - playLead;
    unsigned long slot = playShow + playGap;
    int i = slot ? into / slot : shapeCount;
    if (i >= shapeCount) {
      drawShape(-1);
      playing = false;
      return;
    }
    if (into % slot < playShow) frame = i;
  }
  if (frame != playDrawn) {
    drawShape(frame);
    playDrawn = frame;
  }
}

void leds(int red, int green) {
  if (red != redMode) {
    redMode = red;
    redModeSince = millis();
  }
  greenMode = green;
}

void ack(int n) {
  (void)n;
  acking = true;
  ackStart = millis();
}

void pollButton(Button &b) {
  bool r = digitalRead(b.pin);
  unsigned long now = millis();
  if (r != b.lastRead) {
    b.lastRead = r;
    b.changedAt = now;
  }
  if (now - b.changedAt >= DEBOUNCE_MS && r != b.stable) {
    b.stable = r;
    if (!r) {  // pressed
      pressFlashUntil = now + PRESS_FLASH_MS;
      Bridge.notify("button", b.code);
    }
  }
}

void updateLeds() {
  unsigned long now = millis();

  bool red = redMode == 1;
  bool buzz = false;
  if (redMode == 2) {
    red = ((now / BLINK_MS) % 2) == 0;
    buzz = red && (now - redModeSince < CHIRP_FOR_MS);
  }
  digitalWrite(PIN_RED, red ? HIGH : LOW);
  digitalWrite(PIN_BUZZ, buzz ? HIGH : LOW);

  bool green = greenMode == 1;
  if (acking) {
    unsigned long t = now - ackStart;
    if (t < ACK_MS) green = ((t / 200) % 2) == 1;  // off-on-off-on
    else acking = false;
  }
  if (now < pressFlashUntil) green = !green;
  digitalWrite(PIN_GREEN, green ? HIGH : LOW);
}

void setup() {
  for (Button &b : buttons) pinMode(b.pin, INPUT_PULLUP);
  pinMode(PIN_RED, OUTPUT);
  pinMode(PIN_GREEN, OUTPUT);
  pinMode(PIN_BUZZ, OUTPUT);
  digitalWrite(PIN_RED, LOW);
  digitalWrite(PIN_GREEN, LOW);
  digitalWrite(PIN_BUZZ, LOW);

  Wire1.begin();
  uint8_t addr = findOled();
  if (addr != 0) oledOk = oled.begin(SSD1306_SWITCHCAPVCC, addr);
  if (!oledOk) redMode = 2;  // no screen: blink red so the team checks the Qwiic cable
  drawLines("RECHECK PAGER\nStarting...");

  Bridge.begin();
  // provide_safe runs the handler in this loop's context, so I2C is never used from two threads.
  Bridge.provide_safe("show", show);
  Bridge.provide_safe("leds", leds);
  Bridge.provide_safe("ack", ack);
  Bridge.provide_safe("play", play);
}

void loop() {
  for (Button &b : buttons) pollButton(b);
  updateLeds();
  updatePlay();
}
