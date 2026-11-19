/*
  Catherine's Bagasbas Lighthouse Resort - ESP32 #1
  USER-MODIFIED V4 DERIVATIVE: independently calibrated manual gates.
  RIGHT=GPIO14, LEFT=GPIO27. IR and car motor remain unused.
  Original V4 is archived separately. Copy your existing tested private
  bench-secrets.h and UidFormatter.h beside this file before Arduino Verify.
  No output attaches at startup. PREPARE then CONFIRM_ATTACH can cause motion.
  Permanently attached gates require operator-known safe pulse values.
  Never guess an initial pulse or run a sweep. Read README before enabling PWM.
  Channel/attached/LEDC reports describe software configuration, not movement.
  While any servo is attached or attachment awaits confirmation, network/RFID
  polling is deferred so Serial STOP and manual button monitoring stay responsive.
  DISARM_GATE / STOP detaches outputs and resumes existing RFID/Wi-Fi servicing.
  Existing V4 authenticated protocol, guest-name LCD and pathway logic retained.
*/

#include <SPI.h>
#include <MFRC522.h>
#include <WiFi.h>
#include <HTTPClient.h>
#include <mbedtls/md.h>
#include <esp_system.h>
#include <inttypes.h>
#include <Wire.h>
#include <LiquidCrystal_I2C.h>
#include <ESP32Servo.h>
#include <freertos/FreeRTOS.h>
#include <freertos/task.h>
#include "bench-secrets.h"
#include "UidFormatter.h"
// Default disabled until unique sync credentials and trusted LAN backend are ready.
#ifndef CBLR_RESERVATION_SYNC_ENABLED
#define CBLR_RESERVATION_SYNC_ENABLED 0
#endif
#if CBLR_RESERVATION_SYNC_ENABLED
#include "device-sync-secrets.h"
#include "ReservationDeviceSync.h"
#endif

#ifndef BENCH_DIAGNOSTICS_ONLY
#define BENCH_DIAGNOSTICS_ONLY 0
#endif
#ifndef BENCH_DIAGNOSTIC_SERVER
#define BENCH_DIAGNOSTIC_SERVER BENCH_SERVER
#endif

// ---------- Confirmed RFID / LCD connections ----------
constexpr uint8_t READER_SS = 5, READER_RST = 22;
constexpr uint8_t READER_SCK = 18, READER_MISO = 19, READER_MOSI = 23;
constexpr uint8_t LCD_SDA = 16, LCD_SCL = 17;
MFRC522 reader(READER_SS, READER_RST);
LiquidCrystal_I2C lcd(0x27, 16, 2);

// ---------- New manual controls ----------
constexpr uint8_t PIN_SERVO_1 = 14, PIN_SERVO_2 = 27;
constexpr uint8_t PIN_OPEN_BUTTON = 25, PIN_CLOSE_BUTTON = 32;
constexpr uint8_t PIN_PATHWAY_RELAY = 33;
constexpr bool RELAY_ACTIVE_LOW = true; // Change ONLY if tested relay is active HIGH.
// No automatic arming or positional assumptions at reset.
constexpr unsigned long GATE_STEP_MS = 60;
constexpr unsigned long BUTTON_DEBOUNCE_MS = 35;
constexpr int SERVO_MIN_US = 1000, SERVO_MAX_US = 2000;
constexpr int SERVO_STEP_US = 2, CAL_WINDOW_MAX_US = 80;
// Supplied calibration references. Never used as an automatic initial target.
constexpr int LEFT_REFERENCE_CLOSED_DEG = 40, LEFT_REFERENCE_OPEN_DEG = 160;
constexpr int RIGHT_REFERENCE_LOW_DEG = 0, RIGHT_REFERENCE_HIGH_DEG = 110;
#ifndef CBLR_LEFT_PROFILE_VERIFIED
#define CBLR_LEFT_PROFILE_VERIFIED 0
#endif
constexpr unsigned long ATTACH_CONFIRM_MS = 30000;

Servo gate1, gate2;
bool gateArmed = false, servosAttached = false;
unsigned long lastGateStepAt = 0, lastCalibrationNudgeAt = 0;
struct GateAxis {
  const char *name;
  uint8_t pin;
  Servo *servo;
  int commandUs = -1;
  int openUs = -1, closedUs = -1;
  int seedUs = -1, windowLowUs = -1, windowHighUs = -1;
};
GateAxis rightAxis{"RIGHT", PIN_SERVO_1, &gate1};
GateAxis leftAxis{"LEFT", PIN_SERVO_2, &gate2};
GateAxis *selectedAxis = nullptr;
enum AttachRequest { ATTACH_NONE, ATTACH_SINGLE, ATTACH_PAIR };
AttachRequest pendingAttach = ATTACH_NONE;
unsigned long attachPreparedAt = 0;
enum GateStatus { GATE_ASSUMED_CLOSED, GATE_MOVING_OPEN, GATE_MOVING_CLOSE,
                  GATE_OPEN, GATE_CLOSED, GATE_PARTIAL };
GateStatus gateStatus = GATE_ASSUMED_CLOSED;

// Only the button-sampler task calls update(). The main loop reads the
// one-byte stable state and monotonic counters. This is not an ISR.
struct DebouncedButton {
  uint8_t pin;
  uint8_t raw = HIGH;
  volatile uint8_t stable = HIGH;
  unsigned long rawChangedAt = 0;
  volatile uint32_t pressCount = 0;
  volatile uint32_t releaseCount = 0;
  void begin(uint8_t p) {
    pin = p;
    pinMode(pin, INPUT_PULLUP);
    raw = stable = digitalRead(pin);
    rawChangedAt = millis();
    pressCount = 0;
    releaseCount = 0;
  }
  void update() {
    uint8_t now = digitalRead(pin);
    if (now != raw) { raw = now; rawChangedAt = millis(); }
    if (now != stable && (unsigned long)(millis() - rawChangedAt) >= BUTTON_DEBOUNCE_MS) {
      stable = now;
      if (now == LOW) ++pressCount;
      else ++releaseCount;
    }
  }
  bool pressed() const { return stable == LOW; }
};
DebouncedButton openButton, closeButton;
TaskHandle_t buttonSamplerHandle = nullptr;
uint32_t seenOpenPress = 0, seenOpenRelease = 0;
uint32_t seenClosePress = 0, seenCloseRelease = 0;

void buttonSamplerTask(void *parameter) {
  (void)parameter;
  for (;;) {
    openButton.update();
    closeButton.update();
    vTaskDelay(pdMS_TO_TICKS(10));
  }
}

// ---------- Local display/status ----------
volatile bool pathwayOn = false;
bool localCheckedIn = false;
String checkedInGuest = "";
bool backendReachable = false;
bool lcdReady = false;
unsigned long lastLCDProbeAt = 0;
constexpr unsigned long LCD_PROBE_INTERVAL_MS = 10000;
String lcdLast1 = "", lcdLast2 = "";
String tempLine1 = "", tempLine2 = "";
bool temporaryActive = false;
unsigned long temporaryStarted = 0, temporaryDuration = 0;
uint8_t lcdPage = 0;
unsigned long lcdPageStarted = 0;
constexpr unsigned long LCD_PAGE_MS = 3200;

// Two-screen welcome sequence: 16x2 LCD cannot show the full resort name
// and a long guest name simultaneously. No blocking delay is used.
bool welcomeSequenceActive = false;
unsigned long welcomeSequenceStarted = 0;
constexpr unsigned long WELCOME_RESORT_MS = 2600;
constexpr unsigned long WELCOME_NAME_MS = 8500;

String fit16(String s) {
  if (s.length() > 16) s = s.substring(0, 16);
  while (s.length() < 16) s += ' ';
  return s;
}

// Scroll long names without clearing/flickering the whole 16x2 screen.
String scroll16(const String &s, unsigned long elapsed) {
  if (s.length() <= 16) return s;
  const unsigned long cycle = s.length() + 3;
  unsigned long offset = (elapsed / 400UL) % cycle;
  String repeated = s + "   " + s + "   ";
  return repeated.substring(offset, offset + 16);
}

void lcdWrite(const String &line1, const String &line2) {
  if (!lcdReady) return; // Never write to an unpowered/unresponsive LCD.
  String a = fit16(line1), b = fit16(line2);
  if (a != lcdLast1) { lcd.setCursor(0, 0); lcd.print(a); lcdLast1 = a; }
  if (b != lcdLast2) { lcd.setCursor(0, 1); lcd.print(b); lcdLast2 = b; }
}

void showLCDTemporary(const String &a, const String &b, unsigned long durationMs = 3000) {
  tempLine1 = a;
  tempLine2 = b;
  temporaryStarted = millis();
  temporaryDuration = durationMs;
  temporaryActive = true;
  lcdWrite(a, scroll16(b, 0));
}

void startWelcomeSequence() {
  welcomeSequenceActive = true;
  welcomeSequenceStarted = millis();
  lcdWrite("WELCOME TO", "CATHERINE'S");
}

String gateStatusText() {
  switch (gateStatus) {
    case GATE_ASSUMED_CLOSED: return "UNCHECKED";
    case GATE_MOVING_OPEN: return "OPENING";
    case GATE_MOVING_CLOSE: return "CLOSING";
    case GATE_OPEN: return "OPEN TARGET";
    case GATE_CLOSED: return "CLOSE TARGET";
    default: return "PARTIAL";
  }
}

void serviceLCD() {
  unsigned long now = millis();
  if (!lcdReady && (unsigned long)(now - lastLCDProbeAt) >= LCD_PROBE_INTERVAL_MS) {
    lastLCDProbeAt = now;
    Wire.beginTransmission(0x27);
    if (Wire.endTransmission() == 0) {
      lcd.init();
      lcd.backlight();
      lcdLast1 = "";
      lcdLast2 = "";
      lcdReady = true;
      Serial.println("LCD: detected at 0x27; display enabled.");
    }
  }
  if (!lcdReady) return;
  if (welcomeSequenceActive) {
    unsigned long elapsed = now - welcomeSequenceStarted;
    if (elapsed < WELCOME_RESORT_MS) {
      lcdWrite("WELCOME TO", "CATHERINE'S");
      return;
    }
    if (elapsed < WELCOME_RESORT_MS + WELCOME_NAME_MS) {
      String name = checkedInGuest.length() ? checkedInGuest : "NAME NOT SENT";
      lcdWrite("WELCOME GUEST", scroll16(name, elapsed - WELCOME_RESORT_MS));
      return;
    }
    welcomeSequenceActive = false;
    temporaryActive = false; // Do not resurrect an old RFID notice.
    lcdPageStarted = now;
  }
  if (temporaryActive) {
    if (now - temporaryStarted < temporaryDuration) {
      lcdWrite(tempLine1, scroll16(tempLine2, now - temporaryStarted));
      return;
    }
    temporaryActive = false;
    lcdPageStarted = now;
  }
  if (now - lcdPageStarted >= LCD_PAGE_MS) {
    lcdPage = (lcdPage + 1) % (localCheckedIn ? 7 : 6);
    lcdPageStarted = now;
  }
  String a, b;
  switch (lcdPage) {
    case 0:
      a = "CATHERINE'S"; b = "LIGHTHOUSE RESORT"; break;
    case 1:
      a = WiFi.status() == WL_CONNECTED ? "WIFI: CONNECTED" : "WIFI: OFFLINE";
      b = backendReachable ? "SERVER: ONLINE" : "SERVER: NOT READY";
      break;
    case 2:
      a = "GATE: " + gateStatusText();
      b = gateArmed ? "MANUAL: ENABLED" : "MANUAL: LOCKED";
      break;
    case 3:
      a = "RFID: READY";
      b = localCheckedIn ? "CHECK-IN: YES" : "CHECK-IN: NO";
      break;
    case 4:
      a = pathwayOn ? "PATHWAY: ON" : "PATHWAY: OFF";
      b = "IR: DISABLED";
      break;
    case 5:
      if (localCheckedIn) {
        a = "WELCOME TO";
        b = "CATHERINE'S";
      } else {
        a = "RESERVATIONS";
        b = "CHECK WEBSITE";
      }
      break;
    default: // Guest name page, after confirmed check-in only.
      a = "GUEST NAME";
      b = scroll16(checkedInGuest.length() ? checkedInGuest : "NAME NOT SENT", now - lcdPageStarted);
      break;
  }
  lcdWrite(a, b);
}

void setPathway(bool on) {
  digitalWrite(PIN_PATHWAY_RELAY,
               (on == RELAY_ACTIVE_LOW) ? LOW : HIGH);
  pathwayOn = on;
  Serial.print("PATHWAY RELAY: "); Serial.println(on ? "ON" : "OFF");
}

// ---------- Independently calibrated manual gates ----------
GateAxis *axisNamed(const String &name) {
  if (name == "RIGHT") return &rightAxis;
  if (name == "LEFT") return &leftAxis;
  return nullptr;
}

bool buttonsReleased() {
  return !openButton.pressed() && !closeButton.pressed() &&
         digitalRead(PIN_OPEN_BUTTON) == HIGH && digitalRead(PIN_CLOSE_BUTTON) == HIGH;
}

void refreshAttachedFlag() {
  servosAttached = gate1.attached() || gate2.attached();
}

void stopGateCommands() {
  if (gateStatus == GATE_MOVING_OPEN || gateStatus == GATE_MOVING_CLOSE)
    gateStatus = GATE_PARTIAL;
}

void detachGateOutputs() {
  gateArmed = false;
  pendingAttach = ATTACH_NONE;
  stopGateCommands();
  if (gate1.attached()) gate1.detach();
  if (gate2.attached()) gate2.detach();
  refreshAttachedFlag();
  Serial.println("STOP: both servo pulse outputs detached. Physical position/holding is unverified.");
}

constexpr bool validPulse(int pulse) { return pulse >= SERVO_MIN_US && pulse <= SERVO_MAX_US; }

constexpr bool validCalibrationWindow(int seed, int low, int high) {
  return validPulse(low) && validPulse(high) && low < high &&
         high - low <= CAL_WINDOW_MAX_US && seed >= low && seed <= high;
}

constexpr int nextCommandPulse(int current, int target) {
  if (target - current > SERVO_STEP_US) return current + SERVO_STEP_US;
  if (current - target > SERVO_STEP_US) return current - SERVO_STEP_US;
  return target;
}

bool limitsReady(const GateAxis &axis) {
  return validPulse(axis.openUs) && validPulse(axis.closedUs) &&
         abs(axis.openUs - axis.closedUs) >= SERVO_STEP_US;
}

void printAxis(const GateAxis &axis) {
  Serial.printf("%s GPIO%u: library-attached=%s, last-command=%d us, OPEN=%d, CLOSED=%d\n",
                axis.name, axis.pin, axis.servo->attached() ? "YES" : "NO",
                axis.commandUs, axis.openUs, axis.closedUs);
  Serial.println("  Last command is software state; observe the gate and measure signal/power separately.");
}

bool attachAxis(GateAxis &axis) {
  axis.servo->setPeriodHertz(50);
  const int channel = axis.servo->attach(axis.pin, SERVO_MIN_US, SERVO_MAX_US);
  if (!axis.servo->attached()) {
    Serial.printf("%s GPIO%u: library attachment FAILED (return=%d).\n", axis.name, axis.pin, channel);
    return false;
  }
  // Attachment can produce a transient before this write. No positional feedback.
  axis.servo->writeMicroseconds(axis.seedUs);
  axis.commandUs = axis.seedUs;
  lastCalibrationNudgeAt = millis();
  Serial.printf("%s GPIO%u: library attached, return/channel=%d, commanded=%d us at 50 Hz.\n",
                axis.name, axis.pin, channel, axis.commandUs);
#if defined(CONFIG_IDF_TARGET_ESP32) && ESP_ARDUINO_VERSION_MAJOR >= 3
  const uint32_t frequency = ledcReadFreq(axis.pin);
  const uint32_t duty = ledcRead(axis.pin);
  Serial.printf("  LEDC configured frequency=%lu Hz, duty-count=%lu (internal configuration).\n",
                (unsigned long)frequency, (unsigned long)duty);
  if (frequency < 49 || frequency > 51 || duty == 0) {
    axis.servo->detach();
    Serial.println("  PWM configuration check failed; this output was detached.");
    return false;
  }
#endif
  Serial.println("  Mechanical result UNKNOWN. Attachment does not prove a signal reaches the servo.");
  return true;
}

void nudgeSelected(int direction) {
  if (!selectedAxis || !selectedAxis->servo->attached() || gateArmed || !buttonsReleased()) {
    Serial.println("NUDGE requires one attached calibration servo, disarmed buttons, and both buttons released.");
    return;
  }
  if (millis() - lastCalibrationNudgeAt < 200UL) {
    Serial.println("Wait 200 ms between individual nudges.");
    return;
  }
  const int next = selectedAxis->commandUs + direction * SERVO_STEP_US;
  if (next < selectedAxis->windowLowUs || next > selectedAxis->windowHighUs) {
    Serial.println("Calibration window boundary reached. STOP and review a new narrow window before continuing.");
    return;
  }
  selectedAxis->servo->writeMicroseconds(next);
  selectedAxis->commandUs = next;
  lastCalibrationNudgeAt = millis();
  Serial.printf("%s GPIO%u: one %s nudge; commanded=%d us. Observe direction and stop on strain.\n",
                selectedAxis->name, selectedAxis->pin, direction > 0 ? "+2 us" : "-2 us", next);
}

void markSelected(bool open) {
  if (!selectedAxis || !selectedAxis->servo->attached() || gateArmed || !buttonsReleased()) {
    Serial.println("MARK requires one attached calibration servo and released buttons.");
    return;
  }
  if (open) selectedAxis->openUs = selectedAxis->commandUs;
  else selectedAxis->closedUs = selectedAxis->commandUs;
  Serial.printf("Operator marked %s %s at %d us. Confirm clearance and keep a written record.\n",
                selectedAxis->name, open ? "OPEN" : "CLOSED", selectedAxis->commandUs);
}

bool handleGateCalibration(const String &cmd) {
  char name[12] = {0};
  int seed = 0, low = 0, high = 0, used = 0;
  if (cmd.startsWith("PREPARE ")) {
    pendingAttach = ATTACH_NONE;
    if (sscanf(cmd.c_str(), "PREPARE %11s %4d %4d %4d %n", name, &seed, &low, &high, &used) != 4 ||
        used != (int)cmd.length()) {
      Serial.println("Usage: PREPARE RIGHT|LEFT seed_us low_us high_us");
      return true;
    }
    GateAxis *axis = axisNamed(String(name));
    if (!axis || servosAttached || gateArmed || !buttonsReleased() ||
        !validCalibrationWindow(seed, low, high)) {
      Serial.println("Rejected: STOP first, release buttons, select RIGHT/LEFT, and supply a valid <=80 us window within 1000..2000.");
      return true;
    }
    selectedAxis = axis;
    axis->seedUs = seed;
    axis->windowLowUs = low;
    axis->windowHighUs = high;
    pendingAttach = ATTACH_SINGLE;
    attachPreparedAt = millis();
    Serial.printf("PREPARED %s GPIO%u, seed=%d us, window=%d..%d. PWM is still detached.\n",
                  axis->name, axis->pin, seed, low, high);
    Serial.println("INITIAL ATTACH MAY MOVE THE GATE. Verify seed, clearance, power and emergency cutoff.");
    Serial.println("Only if safe, type CONFIRM_ATTACH within 30 seconds. No seed can be inferred from an unknown gate position.");
    return true;
  }
  if (cmd.startsWith("LIMITS ")) {
    if (sscanf(cmd.c_str(), "LIMITS %11s %4d %4d %n", name, &low, &high, &used) != 3 ||
        used != (int)cmd.length()) {
      Serial.println("Usage: LIMITS RIGHT|LEFT known_closed_us known_open_us");
      return true;
    }
    GateAxis *axis = axisNamed(String(name));
    if (!axis || servosAttached || gateArmed || pendingAttach != ATTACH_NONE ||
        !buttonsReleased() || !validPulse(low) || !validPulse(high) || abs(high - low) < SERVO_STEP_US) {
      Serial.println("LIMITS rejected. Use only previously measured endpoints with all outputs detached.");
      return true;
    }
    axis->closedUs = low;
    axis->openUs = high;
    printAxis(*axis);
    return true;
  }
  if (cmd.startsWith("PREPARE_PAIR ")) {
    pendingAttach = ATTACH_NONE;
    if (sscanf(cmd.c_str(), "PREPARE_PAIR %4d %4d %n", &low, &high, &used) != 2 ||
        used != (int)cmd.length() || servosAttached || gateArmed || !buttonsReleased() ||
        !limitsReady(rightAxis) || !limitsReady(leftAxis) ||
        low < min(rightAxis.closedUs, rightAxis.openUs) || low > max(rightAxis.closedUs, rightAxis.openUs) ||
        high < min(leftAxis.closedUs, leftAxis.openUs) || high > max(leftAxis.closedUs, leftAxis.openUs)) {
      Serial.println("PREPARE_PAIR requires independently calibrated limits and operator-known current RIGHT/LEFT seed pulses.");
      return true;
    }
    rightAxis.seedUs = low;
    leftAxis.seedUs = high;
    pendingAttach = ATTACH_PAIR;
    attachPreparedAt = millis();
    Serial.printf("PAIR PREPARED: RIGHT=%d us, LEFT=%d us. Initial attachment may move either gate.\n", low, high);
    Serial.println("Confirm safe physical conditions, then type CONFIRM_ATTACH within 30 seconds.");
    return true;
  }
  if (cmd == "CONFIRM_ATTACH") {
    if (pendingAttach == ATTACH_NONE || millis() - attachPreparedAt >= ATTACH_CONFIRM_MS || !buttonsReleased()) {
      pendingAttach = ATTACH_NONE;
      Serial.println("No fresh attachment request, or a button is pressed. PREPARE again.");
      return true;
    }
    const AttachRequest request = pendingAttach;
    pendingAttach = ATTACH_NONE;
    bool ok = false;
    if (request == ATTACH_SINGLE && selectedAxis) ok = attachAxis(*selectedAxis);
    if (request == ATTACH_PAIR) {
      selectedAxis = nullptr;
      ok = attachAxis(rightAxis);
      if (ok) ok = attachAxis(leftAxis);
    }
    refreshAttachedFlag();
    if (!ok) detachGateOutputs();
    Serial.println(ok ? "Attachment request completed. Buttons remain DISARMED. Physical test pending." : "Attachment failed; outputs detached.");
    return true;
  }
  if (cmd == "NUDGE +") { nudgeSelected(1); return true; }
  if (cmd == "NUDGE -") { nudgeSelected(-1); return true; }
  if (cmd == "MARK_OPEN") { markSelected(true); return true; }
  if (cmd == "MARK_CLOSED") { markSelected(false); return true; }
  if (cmd == "STOP") { detachGateOutputs(); return true; }
  return false;
}

// Opt-in only after receiver voltage, polarity and response are physically verified.
#ifndef CBLR_IR_VERIFIED
#define CBLR_IR_VERIFIED 0
#endif
#ifndef CBLR_IR_BLOCKED_LEVEL
#define CBLR_IR_BLOCKED_LEVEL LOW
#endif
constexpr uint8_t PIN_IR_RECEIVER = 34;
bool irEnabled = false, irOpenRequest = false;
int irRaw = HIGH, irStable = HIGH;
unsigned long irChangedAt = 0, irClearSince = 0;
void serviceVerifiedIr() {
#if CBLR_IR_VERIFIED
  const unsigned long time = millis();
  const int raw = digitalRead(PIN_IR_RECEIVER);
  if (raw != irRaw) { irRaw = raw; irChangedAt = time; }
  if (irStable != raw && time - irChangedAt >= 80UL) {
    irStable = raw;
    Serial.println(irStable == CBLR_IR_BLOCKED_LEVEL ? "IR: BLOCKED" : "IR: CLEAR");
    irClearSince = irStable == CBLR_IR_BLOCKED_LEVEL ? 0 : time;
    if (irEnabled && irStable == CBLR_IR_BLOCKED_LEVEL) irOpenRequest = true;
  }
#endif
}

void serviceGate() {
  if (pendingAttach != ATTACH_NONE && millis() - attachPreparedAt >= ATTACH_CONFIRM_MS) {
    pendingAttach = ATTACH_NONE;
    Serial.println("Attachment confirmation expired. Outputs remain detached.");
  }
  serviceVerifiedIr();
  const bool manualOpen = openButton.pressed();
  const bool manualClose = closeButton.pressed();
  if (manualClose && irStable != CBLR_IR_BLOCKED_LEVEL) irOpenRequest = false;
  const bool openPressed = manualOpen || (irEnabled && irOpenRequest && !manualOpen);
  const bool closePressed = manualClose && !openPressed;
  const uint32_t op = openButton.pressCount, orl = openButton.releaseCount;
  const uint32_t cp = closeButton.pressCount, cr = closeButton.releaseCount;
  if (op != seenOpenPress) { Serial.println("BUTTON: OPEN PRESSED GPIO25"); seenOpenPress = op; }
  if (orl != seenOpenRelease) { Serial.println("BUTTON: OPEN RELEASED GPIO25"); seenOpenRelease = orl; }
  if (cp != seenClosePress) { Serial.println("BUTTON: CLOSE PRESSED GPIO32"); seenClosePress = cp; }
  if (cr != seenCloseRelease) { Serial.println("BUTTON: CLOSE RELEASED GPIO32"); seenCloseRelease = cr; }

  const bool rawOpen = digitalRead(PIN_OPEN_BUTTON) == LOW;
  const bool rawClose = digitalRead(PIN_CLOSE_BUTTON) == LOW;
  if (!gateArmed || !gate1.attached() || !gate2.attached() ||
      (rawOpen && rawClose) || (manualOpen && manualClose) ||
      (!openPressed && !closePressed) || (manualOpen && !rawOpen) || (manualClose && !rawClose)) {
    stopGateCommands();
    return;
  }
  const unsigned long now = millis();
  if (now - lastGateStepAt < GATE_STEP_MS) return;
  lastGateStepAt = now;
  const int rightTarget = openPressed ? rightAxis.openUs : rightAxis.closedUs;
  const int leftTarget = openPressed ? leftAxis.openUs : leftAxis.closedUs;
  if (rightAxis.commandUs == rightTarget && leftAxis.commandUs == leftTarget) {
    gateStatus = openPressed ? GATE_OPEN : GATE_CLOSED;
    return;
  }
  gateStatus = openPressed ? GATE_MOVING_OPEN : GATE_MOVING_CLOSE;
  rightAxis.commandUs = nextCommandPulse(rightAxis.commandUs, rightTarget);
  leftAxis.commandUs = nextCommandPulse(leftAxis.commandUs, leftTarget);
  gate1.writeMicroseconds(rightAxis.commandUs);
  gate2.writeMicroseconds(leftAxis.commandUs);
}


// ---------- Existing guest-name extraction (unchanged logic) ----------
String guestNameFromScanResponse(const String &json) {
  int key = json.indexOf("\"guestName\"");
  if (key < 0) return "";
  int colon = json.indexOf(':', key + 11);
  if (colon < 0) return "";
  int pos = colon + 1;
  while (pos < json.length() &&
         (json[pos] == ' ' || json[pos] == '\t' || json[pos] == '\n')) ++pos;
  if (pos >= json.length() || json[pos] != '"') return "";
  ++pos;
  String name;
  bool escaped = false;
  for (; pos < json.length(); ++pos) {
    char c = json[pos];
    if (escaped) {
      if (c == '"' || c == '\\' || c == '/') name += c;
      else if (c == 'n' || c == 'r' || c == 't') name += ' ';
      else return "";
      escaped = false;
    } else if (c == '\\') escaped = true;
    else if (c == '"') { name.trim(); return name; }
    else name += c;
  }
  return "";
}

// ---------- Existing authenticated bench protocol ----------
bool fetchTimeAt(const char *server, uint64_t &serverTime) {
  WiFiClient client;
  HTTPClient http;
  http.setTimeout(3000);
  if (!http.begin(client, String(server) + "/health")) return false;
  int status = http.GET();
  String body = http.getString();
  http.end();
  int start = body.indexOf("\"serverTime\":");
  if (status != 200 || start < 0) return false;
  serverTime = strtoull(body.c_str() + start + 13, nullptr, 10);
  return serverTime > 0;
}

bool fetchServerTime(uint64_t &serverTime) {
  return fetchTimeAt(BENCH_SERVER, serverTime);
}

bool sendDiagnostic(const char *kind, const char *uid, uint8_t byteCount) {
  uint64_t observedAt;
  if (WiFi.status() != WL_CONNECTED ||
      !fetchTimeAt(BENCH_DIAGNOSTIC_SERVER, observedAt)) {
    Serial.println("Backend unreachable: diagnostic not delivered; no booking changed.");
    return false;
  }
  char eventId[48], timestamp[24], signature[65];
  snprintf(eventId, sizeof(eventId), "diag_%08lx%08lx%08lx%08lx",
           (unsigned long)esp_random(), (unsigned long)esp_random(),
           (unsigned long)esp_random(), (unsigned long)esp_random());
  snprintf(timestamp, sizeof(timestamp), "%" PRIu64, observedAt);
  String fields = String("[\"rfid-bench-diagnostic-v1\",\"") + BENCH_READER_ID +
      "\",\"" + eventId + "\",\"" + kind + "\",\"" + uid + "\"," +
      byteCount + "," + timestamp + "]";
  unsigned char digest[32];
  if (mbedtls_md_hmac(mbedtls_md_info_from_type(MBEDTLS_MD_SHA256),
      (const unsigned char *)BENCH_READER_KEY, strlen(BENCH_READER_KEY),
      (const unsigned char *)fields.c_str(), fields.length(), digest) != 0) {
    Serial.println("Diagnostic rejected: could not sign event.");
    return false;
  }
  for (size_t i = 0; i < 32; i++)
    snprintf(signature + i * 2, 3, "%02x", digest[i]);
  String payload = String("{\"readerId\":\"") + BENCH_READER_ID +
      "\",\"eventId\":\"" + eventId + "\",\"kind\":\"" + kind +
      "\",\"uid\":\"" + uid + "\",\"byteCount\":" + byteCount +
      ",\"observedAt\":" + timestamp + "}";
  for (int attempt = 0; attempt < 2; attempt++) {
    WiFiClient client;
    HTTPClient http;
    http.setTimeout(4000);
    if (!http.begin(client, String(BENCH_DIAGNOSTIC_SERVER) + "/diagnostic")) return false;
    http.addHeader("Content-Type", "application/json");
    http.addHeader("X-Reader-Signature", signature);
    int status = http.POST(payload);
    String body = http.getString();
    http.end();
    if (status == 200 && body.indexOf("\"diagnosticReceived\":true") >= 0) {
      Serial.print("Diagnostic delivered: "); Serial.print(kind);
      Serial.println("; no booking changed.");
      return true;
    }
    if (attempt == 0 && (status <= 0 || status >= 500)) continue;
    Serial.print(status <= 0 ? "Backend unreachable: diagnostic not delivered. HTTP "
                             : "Diagnostic rejected: HTTP ");
    Serial.println(status);
    return false;
  }
  return false;
}

#if !BENCH_DIAGNOSTICS_ONLY
void sendScan(const char *uid, uint8_t byteCount) {
  uint64_t observedAt;
  if (WiFi.status() != WL_CONNECTED || !fetchServerTime(observedAt)) {
    backendReachable = false;
    Serial.println("Backend unreachable: check Wi-Fi, PC LAN IP, port 8787 and firewall.");
    showLCDTemporary("SERVER OFFLINE", "TRY AGAIN LATER", 5000);
    return;
  }
  backendReachable = true;
  char eventId[48], timestamp[24];
  snprintf(eventId, sizeof(eventId), "scan_%08lx%08lx%08lx%08lx",
           (unsigned long)esp_random(), (unsigned long)esp_random(),
           (unsigned long)esp_random(), (unsigned long)esp_random());
  snprintf(timestamp, sizeof(timestamp), "%" PRIu64, observedAt);
  String fields = String("[\"") + BENCH_READER_ID + "\",\"" + eventId +
      "\",\"" + uid + "\"," + byteCount + "," + timestamp + "]";
  unsigned char digest[32];
  int result = mbedtls_md_hmac(mbedtls_md_info_from_type(MBEDTLS_MD_SHA256),
      (const unsigned char *)BENCH_READER_KEY, strlen(BENCH_READER_KEY),
      (const unsigned char *)fields.c_str(), fields.length(), digest);
  if (result != 0) {
    Serial.println("Check-in rejected: could not sign reader event.");
    showLCDTemporary("CHECK-IN ERROR", "SIGNING FAILED", 5000);
    return;
  }
  char signature[65];
  for (size_t i = 0; i < 32; i++)
    snprintf(signature + i * 2, 3, "%02x", digest[i]);
  String payload = String("{\"readerId\":\"") + BENCH_READER_ID +
      "\",\"eventId\":\"" + eventId + "\",\"uid\":\"" + uid +
      "\",\"byteCount\":" + byteCount + ",\"observedAt\":" + timestamp + "}";
  Serial.print("Scan ID: "); Serial.println(eventId);
  // Retry the identical signed scan once if the first response is unavailable.
  for (int attempt = 0; attempt < 2; attempt++) {
    WiFiClient client;
    HTTPClient http;
    http.setTimeout(4000);
    http.begin(client, String(BENCH_SERVER) + "/scan");
    http.addHeader("Content-Type", "application/json");
    http.addHeader("X-Reader-Signature", signature);
    int status = http.POST(payload);
    String body = http.getString();
    http.end();
    if (status <= 0 || status == 503) {
      if (attempt == 0) {
        Serial.println("Backend unreachable or save unconfirmed: retrying same scan.");
        continue;
      }
      Serial.println("Backend unreachable or save unconfirmed: check My Reservation before tapping again.");
      showLCDTemporary("CHECK-IN UNKNOWN", "CHECK WEBSITE", 6000);
    } else if (status == 200 && body.indexOf("\"accepted\":true") >= 0) {
      Serial.print("Check-in accepted: "); Serial.println(body);
      checkedInGuest = guestNameFromScanResponse(body);
      localCheckedIn = true;
#if !CBLR_RESERVATION_SYNC_ENABLED
      setPathway(true); // Existing V4 fallback when synchronization is disabled.
#endif
      startWelcomeSequence(); // WELCOME TO / CATHERINE'S, then actual guest name.
    } else {
      Serial.print("Check-in rejected: HTTP "); Serial.print(status);
      Serial.print(" "); Serial.println(body);
      showLCDTemporary("CHECK-IN DENIED", "CONTACT STAFF", 5500);
    }
    return;
  }
}
#endif

// ---------- Wi-Fi / server status (no booking mutations) ----------
constexpr unsigned long WIFI_CONNECT_WINDOW_MS = 15000;
constexpr unsigned long WIFI_RETRY_DELAY_MS = 30000;
constexpr unsigned long BACKEND_CHECK_INTERVAL_MS = 20000;
constexpr uint8_t MAX_WIFI_ATTEMPTS = 3;
uint8_t wifiAttempts = 0;
bool wifiConnecting = false, wifiWasConnected = false;
bool networkReported = false;
unsigned long wifiStarted = 0, wifiRetryAt = 0, lastBackendAttempt = 0;

void beginWifiAttempt() {
  ++wifiAttempts;
  wifiConnecting = true;
  wifiStarted = millis();
  WiFi.disconnect();
  WiFi.begin(BENCH_WIFI_SSID, BENCH_WIFI_PASSWORD);
  Serial.print("Connecting to bench Wi-Fi; attempt ");
  Serial.print(wifiAttempts); Serial.println(" of 3 (15 second limit).");
  showLCDTemporary("CONNECTING WIFI", "PLEASE WAIT", 2000);
}

void serviceNetwork() {
  unsigned long now = millis();
  if (WiFi.status() == WL_CONNECTED) {
    if (!wifiWasConnected) {
      wifiWasConnected = true;
      wifiConnecting = false;
      wifiAttempts = 0;
      networkReported = false;
      lastBackendAttempt = now - BACKEND_CHECK_INTERVAL_MS;
      Serial.print("Wi-Fi connected. ESP32 IP: "); Serial.println(WiFi.localIP());
      showLCDTemporary("WIFI CONNECTED", "CHECKING SERVER", 2200);
    }
    if ((unsigned long)(now - lastBackendAttempt) >= BACKEND_CHECK_INTERVAL_MS) {
      lastBackendAttempt = now;
#if BENCH_DIAGNOSTICS_ONLY
      backendReachable = sendDiagnostic("network_ready", "", 0);
#else
      uint64_t serverTime;
      bool wasReachable = backendReachable;
      backendReachable = fetchServerTime(serverTime);
      if (backendReachable != wasReachable || !networkReported) {
        Serial.println(backendReachable ? "Backend health: ONLINE" : "Backend health: OFFLINE");
        showLCDTemporary(backendReachable ? "SERVER ONLINE" : "SERVER OFFLINE",
                         backendReachable ? "RFID READY" : "CHECK LAPTOP 1", 2300);
      }
#endif
      networkReported = true;
    }
    return;
  }
  if (wifiWasConnected) {
    Serial.println("Wi-Fi lost. No scans queued; local pathway state unchanged.");
    wifiWasConnected = false;
    backendReachable = false;
    networkReported = false;
    wifiRetryAt = now;
    showLCDTemporary("WIFI DISCONNECTED", "CHECK NETWORK", 4000);
  }
  if (wifiConnecting && (unsigned long)(now - wifiStarted) >= WIFI_CONNECT_WINDOW_MS) {
    WiFi.disconnect();
    wifiConnecting = false;
    wifiRetryAt = millis() + WIFI_RETRY_DELAY_MS;
    Serial.println(wifiAttempts < MAX_WIFI_ATTEMPTS
      ? "Wi-Fi unavailable. Retrying in 30 seconds."
      : "Wi-Fi unavailable after 3 attempts. Reset to retry.");
    showLCDTemporary("WIFI UNAVAILABLE", "CHECK SETTINGS", 3000);
  }
  if (!wifiConnecting && wifiAttempts < MAX_WIFI_ATTEMPTS &&
      (long)(now - wifiRetryAt) >= 0) beginWifiAttempt();
}

// ---------- Isolated RAW GPIO test (no servo movement) ----------
// This test is intentionally independent of the debouncer, LCD, RFID, and
// blocking HTTP requests. It matches the earlier successful standalone
// INPUT_PULLUP test as closely as possible without changing the pin wiring.
void runRawButtonTest() {
  if (buttonSamplerHandle) vTaskSuspend(buttonSamplerHandle);
  detachGateOutputs();
  // Reassert the same pin configuration as the successful standalone test.
  pinMode(PIN_OPEN_BUTTON, INPUT_PULLUP);
  pinMode(PIN_CLOSE_BUTTON, INPUT_PULLUP);

  Serial.println("=== BUTTON_TEST V3: 12 seconds, GATE DISARMED ===");
  Serial.println("Hold OPEN (GPIO25) for 2 seconds, release; then CLOSE (GPIO32) for 2 seconds.");
  Serial.println("LOW=PRESSED, HIGH=RELEASED. No servos will be commanded.");
  Serial.println("RFID/network/LCD application work pauses during this bench-only test.");

  unsigned long started = millis();
  unsigned long lastReport = started - 1000UL;
  int lastOpen = -1, lastClose = -1;
  bool sawOpenLow = false, sawCloseLow = false;
  while ((unsigned long)(millis() - started) < 12000UL) {
    int openRaw = digitalRead(PIN_OPEN_BUTTON);
    int closeRaw = digitalRead(PIN_CLOSE_BUTTON);
    if (openRaw == LOW) sawOpenLow = true;
    if (closeRaw == LOW) sawCloseLow = true;
    unsigned long now = millis();
    if (openRaw != lastOpen || closeRaw != lastClose ||
        (unsigned long)(now - lastReport) >= 1000UL) {
      Serial.print("RAW GPIO25="); Serial.print(openRaw == LOW ? "LOW/PRESSED" : "HIGH/RELEASED");
      Serial.print(" | GPIO32="); Serial.println(closeRaw == LOW ? "LOW/PRESSED" : "HIGH/RELEASED");
      lastOpen = openRaw;
      lastClose = closeRaw;
      lastReport = now;
    }
    delay(10);
  }
  Serial.print("RESULT OPEN GPIO25: "); Serial.println(sawOpenLow ? "LOW DETECTED" : "NEVER LOW");
  Serial.print("RESULT CLOSE GPIO32: "); Serial.println(sawCloseLow ? "LOW DETECTED" : "NEVER LOW");
  Serial.println("=== BUTTON_TEST COMPLETE. Gate remains DISARMED. ===");

  // Restart debouncing from the current electrical state.
  openButton.begin(PIN_OPEN_BUTTON);
  closeButton.begin(PIN_CLOSE_BUTTON);
  seenOpenPress = seenOpenRelease = 0;
  seenClosePress = seenCloseRelease = 0;
  if (buttonSamplerHandle) vTaskResume(buttonSamplerHandle);
}

// ---------- Operator serial commands ----------
String serialLine;
void printStatus() {
  Serial.print("RAW OPEN GPIO25: ");
  Serial.println(digitalRead(PIN_OPEN_BUTTON) == LOW ? "LOW/PRESSED" : "HIGH/RELEASED");
  Serial.print("RAW CLOSE GPIO32: ");
  Serial.println(digitalRead(PIN_CLOSE_BUTTON) == LOW ? "LOW/PRESSED" : "HIGH/RELEASED");
  Serial.print("DEBOUNCED OPEN: "); Serial.println(openButton.pressed() ? "PRESSED" : "RELEASED");
  Serial.print("DEBOUNCED CLOSE: "); Serial.println(closeButton.pressed() ? "PRESSED" : "RELEASED");
  Serial.print("BUTTON COUNTS OPEN: "); Serial.print(openButton.pressCount);
  Serial.print(" pressed, "); Serial.print(openButton.releaseCount); Serial.println(" released");
  Serial.print("BUTTON COUNTS CLOSE: "); Serial.print(closeButton.pressCount);
  Serial.print(" pressed, "); Serial.print(closeButton.releaseCount); Serial.println(" released");
  Serial.print("Gate armed: "); Serial.println(gateArmed ? "YES" : "NO");
  Serial.print("Gate target status: "); Serial.println(gateStatusText());
  printAxis(rightAxis);
  printAxis(leftAxis);
  Serial.print("Wi-Fi: "); Serial.println(WiFi.status() == WL_CONNECTED ? "CONNECTED" : "OFFLINE");
  Serial.print("Backend: "); Serial.println(backendReachable ? "ONLINE" : "OFFLINE/UNKNOWN");
  Serial.print("Local check-in: "); Serial.println(localCheckedIn ? "YES" : "NO");
  Serial.print("Pathway: "); Serial.println(pathwayOn ? "ON" : "OFF");
  Serial.println("IR: DISABLED. Live reservation/checkout events: NOT CONNECTED.");
}

void handleSerialCommand(String cmd) {
  cmd.trim(); cmd.toUpperCase();
  if (cmd == "IR_DISABLE") { irEnabled = false; irOpenRequest = false; Serial.println("IR automation disabled. Manual buttons remain available."); return; }
  if (cmd == "IR_ENABLE") {
#if CBLR_IR_VERIFIED
    if (!gateArmed || !servosAttached || irStable == CBLR_IR_BLOCKED_LEVEL || !irClearSince || millis() - irClearSince < 1000UL) {
      Serial.println("IR_ENABLE rejected: calibrated gates must be armed and verified beam CLEAR for one second.");
      return;
    }
    irEnabled = true;
    Serial.println("IR opening enabled by operator. One beam does not confirm full gate clearance.");
#else
    Serial.println("IR unavailable: physical verification configuration is disabled.");
#endif
    return;
  }
  if (handleGateCalibration(cmd)) return;
  if (cmd == "ARM_GATE") {
    if (selectedAxis || !gate1.attached() || !gate2.attached() ||
        !limitsReady(rightAxis) || !limitsReady(leftAxis) || !buttonsReleased()) {
      Serial.println("ARM_GATE rejected. Calibrate each axis, PREPARE_PAIR, CONFIRM_ATTACH, then release both buttons.");
      return;
    }
    gateArmed = true;
    lastGateStepAt = millis();
    Serial.println("Gate buttons ARMED. Hold to move; both pressed stops new motion commands.");
    showLCDTemporary("GATES ARMED", "HOLD BUTTON", 2500);
  } else if (cmd == "DISARM_GATE") {
    detachGateOutputs();
    showLCDTemporary("GATE DISARMED", "RFID RESUMED", 2500);
  } else if (cmd == "LOCAL_CHECKOUT") {
    // OPERATOR must confirm website checkout before sending this command.
    // Does not update the website or the backend.
    #if !CBLR_RESERVATION_SYNC_ENABLED
    setPathway(false);
    #endif
    localCheckedIn = false;
    checkedInGuest = "";
    welcomeSequenceActive = false;
    Serial.println("LOCAL checkout state cleared. Backend booking NOT changed by this command.");
    showLCDTemporary("LOCAL CHECKOUT", "PATHWAY OFF", 5000);
  } else if (cmd == "STATUS") {
    printStatus();
  } else if (cmd == "BUTTON_TEST") {
    runRawButtonTest();
  } else if (cmd == "HELP") {
    Serial.println("STATUS | BUTTON_TEST | STOP | DISARM_GATE | ARM_GATE");
    Serial.println("PREPARE RIGHT|LEFT seed_us low_us high_us | CONFIRM_ATTACH");
    Serial.println("NUDGE + | NUDGE - | MARK_OPEN | MARK_CLOSED");
    Serial.println("LIMITS RIGHT|LEFT known_closed_us known_open_us | PREPARE_PAIR right_seed_us left_seed_us");
    Serial.println("LOCAL_CHECKOUT keeps the original V4 local-only behavior; check the website separately.");
  } else if (cmd.length()) {
    Serial.print("Unknown command: "); Serial.println(cmd);
  }
}

void serviceSerial() {
  while (Serial.available()) {
    char c = (char)Serial.read();
    if (c == '\n' || c == '\r') {
      if (serialLine.length()) {
        handleSerialCommand(serialLine);
        serialLine = "";
      }
    } else if (serialLine.length() < 80) {
      serialLine += c;
    }
  }
}

void serviceRFID() {
  if (!reader.PICC_IsNewCardPresent() || !reader.PICC_ReadCardSerial()) return;
  char uid[21];
  if (formatUid(reader.uid.uidByte, reader.uid.size, uid, sizeof(uid))) {
    Serial.print("Card read: UID bytes="); Serial.print(reader.uid.size);
    Serial.print(" UID="); Serial.println(uid);
    showLCDTemporary("CARD DETECTED", "CHECKING RFID", 3500);
#if BENCH_DIAGNOSTICS_ONLY
    sendDiagnostic("card_read", uid, reader.uid.size);
    showLCDTemporary("DIAGNOSTIC ONLY", "NO CHECK-IN", 4500);
#else
    sendScan(uid, reader.uid.size);
#endif
  } else {
    Serial.println("Check-in rejected: unsupported UID length.");
    showLCDTemporary("INVALID RFID", "CONTACT STAFF", 4000);
  }
  reader.PICC_HaltA();
  reader.PCD_StopCrypto1();
}

void setup() {
  Serial.begin(115200);
  delay(250);

  // Pathway OFF before enabling GPIO output. Verify relay active polarity.
  digitalWrite(PIN_PATHWAY_RELAY, RELAY_ACTIVE_LOW ? HIGH : LOW);
  pinMode(PIN_PATHWAY_RELAY, OUTPUT);
  pathwayOn = false;
  openButton.begin(PIN_OPEN_BUTTON);
  closeButton.begin(PIN_CLOSE_BUTTON);
  // Button sampler runs separately from the main application loop. Core 0
  // is the ESP32's networking core; the task sleeps between 10 ms samples.
  BaseType_t buttonTaskOK = xTaskCreatePinnedToCore(
      buttonSamplerTask, "CBLR_buttons", 3072, nullptr, 1,
      &buttonSamplerHandle, 0);
  if (buttonTaskOK != pdPASS) {
    buttonSamplerHandle = nullptr;
    Serial.println("ERROR: background button sampler could not start.");
  } else {
    Serial.println("BUTTON SAMPLER V4-DERIVED: RUNNING (10 ms independent polling).");
  }
#if CBLR_IR_VERIFIED
  pinMode(PIN_IR_RECEIVER, INPUT); // GPIO34 has no internal pull-up/down.
  irRaw = irStable = digitalRead(PIN_IR_RECEIVER);
  irChangedAt = millis();
  irClearSince = irStable == CBLR_IR_BLOCKED_LEVEL ? 0 : millis();
#endif
  // Car motor remains unused.
  // Gate servos are intentionally NOT attached on boot.
  gateArmed = false;
#if CBLR_LEFT_PROFILE_VERIFIED
  leftAxis.closedUs = map(LEFT_REFERENCE_CLOSED_DEG, 0, 180, SERVO_MIN_US, SERVO_MAX_US);
  leftAxis.openUs = map(LEFT_REFERENCE_OPEN_DEG, 0, 180, SERVO_MIN_US, SERVO_MAX_US);
#endif

  Wire.begin(LCD_SDA, LCD_SCL);
  Wire.setClock(100000);
  Wire.setTimeOut(50);
  // USB-only testing may power ESP32 but not the LCD. Probe first to avoid
  // repeated I2C writes to an unpowered module; retry later in serviceLCD.
  Wire.beginTransmission(0x27);
  lcdReady = (Wire.endTransmission() == 0);
  lastLCDProbeAt = millis();
  if (lcdReady) {
    lcd.init();
    lcd.backlight();
    Serial.println("LCD: detected at 0x27.");
  } else {
    Serial.println("LCD: not detected (may be unpowered); Serial Monitor remains active.");
  }
  showLCDTemporary("CATHERINE'S", "SYSTEM STARTING", 3000);

  Serial.println("CATHERINE'S ESP32 #1 - RFID/LCD/MANUAL GATE");
  Serial.println("V4 SAFE SERVO REVIEW: outputs detached; no assumed gate positions.");
  Serial.print("Reset reason: "); Serial.println((int)esp_reset_reason());
  Serial.print("BENCH_SERVER: "); Serial.println(BENCH_SERVER);
  Serial.println(BENCH_DIAGNOSTICS_ONLY ? "Mode: DIAGNOSTICS ONLY; no /scan."
                                      : "Mode: authenticated check-in sender.");
  Serial.println("IR disabled. Car motor disabled. Gate DISARMED on boot.");
  Serial.println("Type HELP in Serial Monitor (115200, Newline).");

  SPI.begin(READER_SCK, READER_MISO, READER_MOSI, READER_SS);
  reader.PCD_Init();
  WiFi.mode(WIFI_STA);
  WiFi.setAutoReconnect(false);
  Serial.println("MFRC522 initialized; authenticated scan required for pathway ON.");
  beginWifiAttempt();
#if CBLR_RESERVATION_SYNC_ENABLED
  if (!ReservationDeviceSync::begin([](bool on) {
    digitalWrite(PIN_PATHWAY_RELAY, (on != RELAY_ACTIVE_LOW) ? HIGH : LOW); // Verified active-LOW GPIO33.
    pathwayOn = on;
  })) Serial.println("Device synchronization task failed; pathway remains OFF.");
#endif
}

void loop() {
#if CBLR_RESERVATION_SYNC_ENABLED
  // Independent lease task owns GPIO33 while synchronization is enabled.
#endif
  serviceSerial();
  if (!buttonSamplerHandle) { // Fallback if FreeRTOS task allocation failed.
    openButton.update();
    closeButton.update();
  }
  serviceGate();
  // Existing HTTP functions are synchronous. Keep manual operation responsive
  // by deferring them until the operator detaches servo outputs.
  if (!servosAttached && pendingAttach == ATTACH_NONE) {
    serviceLCD();
    serviceNetwork();
    serviceRFID();
  } else {
    // Cached lines avoid repeated I2C work while the operator controls a gate.
    lcdWrite(gateArmed ? "MANUAL GATES" : "SERVO CALIBRATE", "RFID/HTTP PAUSED");
  }
  // No long delay: manual button motion and LCD pages stay responsive.
}
