// Cottage-only development firmware. No other planned facility GPIO is initialized.
#include <WiFi.h>
#include "cottage-config.h"
#include "device-sync-secrets.h"
#ifndef CBLR_COTTAGE_ACTIVE_LOW
#error "Set CBLR_COTTAGE_ACTIVE_LOW to 0 or 1 only after the isolated polarity test."
#endif
#if CBLR_COTTAGE_ACTIVE_LOW != 0 && CBLR_COTTAGE_ACTIVE_LOW != 1
#error "CBLR_COTTAGE_ACTIVE_LOW must be exactly 0 or 1."
#endif
#define CBLR_DEVICE_ID "esp2"
#include "ReservationDeviceSync.h"
static_assert(sizeof(CBLR_DEVICE_KEY) >= 33, "Device key must contain at least 32 characters.");
constexpr uint8_t COTTAGE_RELAY_PIN = 26;
volatile bool cottageOutputOn = false;
uint32_t wifiAttemptAt = 0;
bool wifiWasConnected = false;
char command[32]; size_t used = 0; bool overflow = false;
void applyCottages(bool on) {
  // Independent lease task: no HTTP, LCD, Serial or delays here.
  digitalWrite(COTTAGE_RELAY_PIN, (on == bool(CBLR_COTTAGE_ACTIVE_LOW)) ? LOW : HIGH);
  cottageOutputOn = on;
}
void printStatus() {
  portENTER_CRITICAL(&ReservationDeviceSync::mux);
  const bool valid = ReservationDeviceSync::leaseState.duration &&
    uint32_t(millis()-ReservationDeviceSync::leaseState.receivedAt) < ReservationDeviceSync::leaseState.duration;
  const int64_t version = ReservationDeviceSync::appliedVersion;
  portEXIT_CRITICAL(&ReservationDeviceSync::mux);
  Serial.print("Wi-Fi: "); Serial.println(WiFi.status() == WL_CONNECTED ? "CONNECTED" : "NOT CONNECTED");
  Serial.print("Signed backend lease: "); Serial.println(valid ? "VALID" : "MISSING / EXPIRED");
  Serial.print("GPIO26 applied command: "); Serial.println(cottageOutputOn ? "ON" : "OFF");
  Serial.printf("Applied version: %lld\n", (long long)version);
  Serial.println("GPIO report only. Physical relay/light result requires observation.");
  Serial.println("EVENT GPIO33: DISABLED / physical state UNKNOWN");
  Serial.println("STAGE GPIO19: DISABLED / physical state UNKNOWN");
  Serial.println("PUMP GPIO16: DISABLED / physical state UNKNOWN");
  Serial.println("KTV/Hall/TFT/DFPlayer/RGB/microphone: NOT COMMISSIONED");
}
void executeCommand() {
  // Match the bench sketch's case-insensitive commands without unbounded String input.
  size_t first = 0;
  while (first < used && isspace((unsigned char)command[first])) ++first;
  while (used > first && isspace((unsigned char)command[used-1])) --used;
  command[used] = 0;
  char *text = command + first;
  for (char *c = text; *c; ++c) *c = toupper((unsigned char)*c);
  if (!strcmp(text,"STATUS") || !strcmp(text,"COTTAGE STATUS")) printStatus();
  else if (!strcmp(text,"HELP")) {
    Serial.println("STATUS | COTTAGE STATUS | HELP");
    Serial.println("Use the signed-in website's COTTAGES ON/OFF for an eligible Checked In booking.");
    Serial.println("Local relay commands are bench-only and cannot bypass website authorization here.");
  } else if (!strncmp(text,"COTTAGE ",8) || !strcmp(text,"ALL OFF")) {
    Serial.println("REFUSED: this network firmware accepts only signed backend relay state. Use website controls.");
    Serial.println("For isolated electrical tests, use ESP2_Cottage_Relay_Test instead.");
  } else if (!strncmp(text,"EVENT ",6) || !strncmp(text,"STAGE ",6) || !strncmp(text,"PUMP ",5)) {
    Serial.println("DISABLED: uncommissioned facility; no GPIO command issued.");
  } else if (*text) Serial.println("UNKNOWN COMMAND (HELP)");
}
void setup() {
  Serial.begin(115200);
  digitalWrite(COTTAGE_RELAY_PIN, CBLR_COTTAGE_ACTIVE_LOW ? HIGH : LOW);
  pinMode(COTTAGE_RELAY_PIN,OUTPUT);
  Serial.println("ESP2 cottage-only. Output initialized OFF using configured polarity.");
  Serial.println("Reset/boot can float GPIO26: verify load isolation and module behavior.");
  Serial.println("Commands: STATUS, HELP. No local ON/OFF bypass.");
  WiFi.mode(WIFI_STA);
  WiFi.begin(CBLR_WIFI_SSID,CBLR_WIFI_PASSWORD); wifiAttemptAt = millis();
  Serial.println("Wi-Fi connection requested; not yet confirmed.");
  if (!ReservationDeviceSync::begin(applyCottages)) Serial.println("SYNC TASK FAILED: no authorization renewal; output defaults/expires OFF.");
}
void loop() {
  const bool connected = WiFi.status() == WL_CONNECTED;
  if (connected != wifiWasConnected) {
    Serial.println(connected ? "Wi-Fi CONNECTED; waiting for fresh signed backend state." : "Wi-Fi LOST; output will fail OFF at lease expiry.");
    wifiWasConnected = connected;
  }
  if (!connected && uint32_t(millis()-wifiAttemptAt) >= 20000) {
    wifiAttemptAt = millis(); WiFi.disconnect(); WiFi.begin(CBLR_WIFI_SSID,CBLR_WIFI_PASSWORD);
    Serial.println("Bounded Wi-Fi reconnect attempt started.");
  }
  while (Serial.available()) {
    char c = Serial.read();
    if (c == '\r' || c == '\n') {
      command[used] = 0;
      if (overflow) Serial.println("Command too long; ignored.");
      else executeCommand();
      used = 0; overflow = false;
    } else if (used < sizeof(command)-1 && !overflow) command[used++] = c;
    else overflow = true;
  }
  delay(1);
}
