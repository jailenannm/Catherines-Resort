// Isolated MFRC522 bench test ONLY. No WiFi, Firebase, actuators or check-in.
// Uploading this to installed ESP1 replaces its current flashed program.
// Use a spare controller, or physically disconnect actuator power/outputs first.
#include <SPI.h>
#include <MFRC522.h>
#include "UidFormatter.h"

// SS/RST match ESP1_Mechanics. Explicit SPI pins reproduce its SPI.begin()
// defaults for a classic ESP32 Dev Module; verify your board and physical wiring.
constexpr uint8_t RC522_SS_PIN = 5;
constexpr uint8_t RC522_RST_PIN = 22;
constexpr uint8_t RC522_SCK_PIN = 18;
constexpr uint8_t RC522_MISO_PIN = 19;
constexpr uint8_t RC522_MOSI_PIN = 23;
MFRC522 reader(RC522_SS_PIN, RC522_RST_PIN);

void setup() {
  Serial.begin(115200);
  delay(250);
  SPI.begin(RC522_SCK_PIN, RC522_MISO_PIN, RC522_MOSI_PIN, RC522_SS_PIN);
  reader.PCD_Init();
  Serial.println("Serial-only RFID test. Remove and tap the same card again to repeat.");
}

void loop() {
  if (!reader.PICC_IsNewCardPresent() || !reader.PICC_ReadCardSerial()) return;
  char uid[21];
  Serial.print("UID bytes: ");
  Serial.println(reader.uid.size);
  if (formatUid(reader.uid.uidByte, reader.uid.size, uid, sizeof(uid))) {
    Serial.print("UID: ");
    Serial.println(uid);
  } else {
    Serial.println("Unsupported UID length; do not assign this scan in the app.");
  }
  Serial.println();
  reader.PICC_HaltA();
  reader.PCD_StopCrypto1();
}
