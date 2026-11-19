// Standalone input test. Open this sketch in its own Arduino IDE folder.
#include <Arduino.h>

constexpr uint8_t OPEN_BUTTON_PIN = 25;
constexpr uint8_t CLOSE_BUTTON_PIN = 32;
constexpr uint32_t DEBOUNCE_MS = 30;

struct DebouncedInput {
  bool rawHigh = true;
  bool stableHigh = true;
  uint32_t changedAt = 0;

  constexpr void initialize(bool high, uint32_t now) {
    rawHigh = high;
    stableHigh = high;
    changedAt = now;
  }

  constexpr bool update(bool high, uint32_t now) {
    if (high != rawHigh) {
      rawHigh = high;
      changedAt = now;
    }
    if (stableHigh != rawHigh && uint32_t(now - changedAt) >= DEBOUNCE_MS) {
      stableHigh = rawHigh;
      return true;
    }
    return false;
  }
};

DebouncedInput openButton;
DebouncedInput closeButton;
bool bothWerePressed = false;

void printStates() {
  Serial.printf("OPEN=%s, CLOSE=%s\n",
                openButton.stableHigh ? "HIGH" : "LOW",
                closeButton.stableHigh ? "HIGH" : "LOW");

  const bool bothPressed = !openButton.stableHigh && !closeButton.stableHigh;
  if (bothPressed && !bothWerePressed) {
    Serial.println("SIMULTANEOUS: OPEN and CLOSE are both PRESSED.");
  } else if (!bothPressed && bothWerePressed) {
    Serial.println("SIMULTANEOUS: cleared; at least one button was RELEASED.");
  }
  bothWerePressed = bothPressed;
}

void setup() {
  Serial.begin(115200);
  pinMode(OPEN_BUTTON_PIN, INPUT_PULLUP);
  pinMode(CLOSE_BUTTON_PIN, INPUT_PULLUP);

  const uint32_t now = millis();
  openButton.initialize(digitalRead(OPEN_BUTTON_PIN) == HIGH, now);
  closeButton.initialize(digitalRead(CLOSE_BUTTON_PIN) == HIGH, now);

  Serial.println("Manual OPEN/CLOSE button input test");
  Serial.println("GPIO25=OPEN, GPIO32=CLOSE; LOW=pressed, HIGH=released.");
  Serial.println("Independent 30 ms debounce. Initial sampled states:");
  printStates();
}

void loop() {
  const uint32_t now = millis();
  // Sample both inputs before reporting their combined debounced state.
  const bool openChanged = openButton.update(digitalRead(OPEN_BUTTON_PIN) == HIGH, now);
  const bool closeChanged = closeButton.update(digitalRead(CLOSE_BUTTON_PIN) == HIGH, now);

  if (openChanged) {
    Serial.printf("OPEN GPIO25: %s\n", openButton.stableHigh ? "RELEASED" : "PRESSED");
  }
  if (closeChanged) {
    Serial.printf("CLOSE GPIO32: %s\n", closeButton.stableHigh ? "RELEASED" : "PRESSED");
  }
  if (openChanged || closeChanged) {
    printStates();
  }
  delay(1);
}
