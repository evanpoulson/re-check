// Recheck pager WIRING TEST. Paste into a new App Lab app's sketch.ino and Run.
// Needs the same 3 libraries as the pager: Adafruit SSD1306, Adafruit GFX Library, Adafruit BusIO.
//
// On boot: red LED blinks 3x, then green blinks 3x (LED check).
// Then hold LEFT -> red on, hold RIGHT -> green on, hold CONFIRM -> both on.
// The OLED shows each button live. A blank OLED means the Qwiic cable or the libraries.

#include <Wire.h>
#include <Adafruit_GFX.h>
#include <Adafruit_SSD1306.h>

const int PIN_LEFT = 2, PIN_CONFIRM = 3, PIN_RIGHT = 4, PIN_RED = 5, PIN_GREEN = 6;

Adafruit_SSD1306 oled(128, 64, &Wire1, -1);
bool oledOk = false;
uint8_t oledAddr = 0;

void blink(int pin) {
  for (int i = 0; i < 3; i++) {
    digitalWrite(pin, HIGH); delay(250);
    digitalWrite(pin, LOW);  delay(250);
  }
}

void setup() {
  pinMode(PIN_LEFT, INPUT_PULLUP);
  pinMode(PIN_CONFIRM, INPUT_PULLUP);
  pinMode(PIN_RIGHT, INPUT_PULLUP);
  pinMode(PIN_RED, OUTPUT);
  pinMode(PIN_GREEN, OUTPUT);

  Wire1.begin();
  const uint8_t addrs[] = {0x3D, 0x3C};
  for (uint8_t a : addrs) {
    Wire1.beginTransmission(a);
    if (Wire1.endTransmission() == 0) { oledAddr = a; break; }
  }
  if (oledAddr) oledOk = oled.begin(SSD1306_SWITCHCAPVCC, oledAddr);

  blink(PIN_RED);
  blink(PIN_GREEN);
}

void loop() {
  bool left = digitalRead(PIN_LEFT) == LOW;
  bool confirm = digitalRead(PIN_CONFIRM) == LOW;
  bool right = digitalRead(PIN_RIGHT) == LOW;

  digitalWrite(PIN_RED, (left || confirm) ? HIGH : LOW);
  digitalWrite(PIN_GREEN, (right || confirm) ? HIGH : LOW);

  if (oledOk) {
    oled.clearDisplay();
    oled.setTextSize(1);
    oled.setTextColor(SSD1306_WHITE);
    oled.setCursor(0, 0);
    oled.print("WIRING TEST  OLED 0x");
    oled.println(oledAddr, HEX);
    oled.println();
    oled.print("LEFT    D2: "); oled.println(left ? "PRESSED" : "-");
    oled.print("CONFIRM D3: "); oled.println(confirm ? "PRESSED" : "-");
    oled.print("RIGHT   D4: "); oled.println(right ? "PRESSED" : "-");
    oled.println();
    oled.println("L=red R=green C=both");
    oled.display();
  }
  delay(30);
}
