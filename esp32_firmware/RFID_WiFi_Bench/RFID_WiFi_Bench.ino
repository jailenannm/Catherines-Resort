// Isolated reader/network bench sender. Uploading replaces the board's program.
#include <SPI.h>
#include <MFRC522.h>
#include <WiFi.h>
#include <HTTPClient.h>
#include <mbedtls/md.h>
#include <esp_system.h>
#include <inttypes.h>
#include "bench-secrets.h"
#include "UidFormatter.h"

// Set to 1 in the private bench-secrets.h for a non-mutating comparison.
#ifndef BENCH_DIAGNOSTICS_ONLY
#define BENCH_DIAGNOSTICS_ONLY 0
#endif
#ifndef BENCH_DIAGNOSTIC_SERVER
#define BENCH_DIAGNOSTIC_SERVER BENCH_SERVER
#endif

constexpr uint8_t READER_SS = 5, READER_RST = 22;
constexpr uint8_t READER_SCK = 18, READER_MISO = 19, READER_MOSI = 23;
MFRC522 reader(READER_SS, READER_RST);

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

bool fetchServerTime(uint64_t &serverTime) { return fetchTimeAt(BENCH_SERVER, serverTime); }

bool sendDiagnostic(const char *kind, const char *uid, uint8_t byteCount) {
  uint64_t observedAt;
  if (WiFi.status() != WL_CONNECTED || !fetchTimeAt(BENCH_DIAGNOSTIC_SERVER, observedAt)) {
    Serial.println("Backend unreachable: diagnostic not delivered; no booking changed.");
    return false;
  }
  char eventId[48], timestamp[24], signature[65];
  snprintf(eventId, sizeof(eventId), "diag_%08lx%08lx%08lx%08lx", (unsigned long)esp_random(), (unsigned long)esp_random(), (unsigned long)esp_random(), (unsigned long)esp_random());
  snprintf(timestamp, sizeof(timestamp), "%" PRIu64, observedAt);
  String fields = String("[\"rfid-bench-diagnostic-v1\",\"") + BENCH_READER_ID + "\",\"" + eventId + "\",\"" + kind + "\",\"" + uid + "\"," + byteCount + "," + timestamp + "]";
  unsigned char digest[32];
  if (mbedtls_md_hmac(mbedtls_md_info_from_type(MBEDTLS_MD_SHA256),
      (const unsigned char *)BENCH_READER_KEY, strlen(BENCH_READER_KEY),
      (const unsigned char *)fields.c_str(), fields.length(), digest) != 0) {
    Serial.println("Diagnostic rejected: could not sign event.");
    return false;
  }
  for (size_t i = 0; i < 32; i++) snprintf(signature + i * 2, 3, "%02x", digest[i]);
  String payload = String("{\"readerId\":\"") + BENCH_READER_ID + "\",\"eventId\":\"" + eventId + "\",\"kind\":\"" + kind + "\",\"uid\":\"" + uid + "\",\"byteCount\":" + byteCount + ",\"observedAt\":" + timestamp + "}";
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
      Serial.print("Diagnostic delivered: "); Serial.print(kind); Serial.println("; no booking changed.");
      return true;
    }
    if (attempt == 0 && (status <= 0 || status >= 500)) continue;
    Serial.print(status <= 0 ? "Backend unreachable: diagnostic not delivered. HTTP " : "Diagnostic rejected: HTTP ");
    Serial.println(status);
    return false;
  }
  return false;
}

// Compile the check-in POST out entirely in diagnostic mode.
#if !BENCH_DIAGNOSTICS_ONLY
void sendScan(const char *uid, uint8_t byteCount) {
  uint64_t observedAt;
  if (WiFi.status() != WL_CONNECTED || !fetchServerTime(observedAt)) {
    Serial.println("Backend unreachable: check Wi-Fi, PC LAN IP, port 8787 and firewall.");
    return;
  }
  char eventId[48], timestamp[24];
  snprintf(eventId, sizeof(eventId), "scan_%08lx%08lx%08lx%08lx", (unsigned long)esp_random(), (unsigned long)esp_random(), (unsigned long)esp_random(), (unsigned long)esp_random());
  snprintf(timestamp, sizeof(timestamp), "%" PRIu64, observedAt);
  String fields = String("[\"") + BENCH_READER_ID + "\",\"" + eventId + "\",\"" + uid + "\"," + byteCount + "," + timestamp + "]";
  unsigned char digest[32];
  int result = mbedtls_md_hmac(mbedtls_md_info_from_type(MBEDTLS_MD_SHA256),
    (const unsigned char *)BENCH_READER_KEY, strlen(BENCH_READER_KEY),
    (const unsigned char *)fields.c_str(), fields.length(), digest);
  if (result != 0) { Serial.println("Check-in rejected: could not sign reader event."); return; }
  char signature[65];
  for (size_t i = 0; i < 32; i++) snprintf(signature + i * 2, 3, "%02x", digest[i]);
  String payload = String("{\"readerId\":\"") + BENCH_READER_ID + "\",\"eventId\":\"" + eventId + "\",\"uid\":\"" + uid + "\",\"byteCount\":" + byteCount + ",\"observedAt\":" + timestamp + "}";
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
      if (attempt == 0) { Serial.println("Backend unreachable or save unconfirmed: retrying same scan."); continue; }
      Serial.println("Backend unreachable or save unconfirmed: check My Reservation before tapping again.");
    } else if (status == 200 && body.indexOf("\"accepted\":true") >= 0) {
      Serial.print("Check-in accepted: "); Serial.println(body);
    } else {
      Serial.print("Check-in rejected: HTTP "); Serial.print(status); Serial.print(" "); Serial.println(body);
    }
    return;
  }
}

#endif

constexpr unsigned long WIFI_CONNECT_WINDOW_MS = 15000, WIFI_RETRY_DELAY_MS = 30000;
constexpr uint8_t MAX_WIFI_ATTEMPTS = 3; // Initial attempt plus two retries per outage.
uint8_t wifiAttempts = 0;
bool wifiConnecting = false, wifiWasConnected = false, networkReported = false;
unsigned long wifiStarted = 0, wifiRetryAt = 0, lastBackendAttempt = 0;

void beginWifiAttempt() {
  ++wifiAttempts;
  wifiConnecting = true;
  wifiStarted = millis();
  WiFi.disconnect();
  WiFi.begin(BENCH_WIFI_SSID, BENCH_WIFI_PASSWORD);
  Serial.print("Connecting to bench Wi-Fi; attempt "); Serial.print(wifiAttempts); Serial.println(" of 3 (15 second limit).");
}

void serviceNetwork() {
  unsigned long time = millis();
  if (WiFi.status() == WL_CONNECTED) {
    if (!wifiWasConnected) {
      wifiWasConnected = true;
      wifiConnecting = false;
      wifiAttempts = 0;
      networkReported = false;
      lastBackendAttempt = time - 10000UL;
      Serial.print("Wi-Fi connected. ESP32 IP: "); Serial.println(WiFi.localIP());
      Serial.println("Checking backend; Wi-Fi alone does not confirm delivery.");
    }
    if (!networkReported && (unsigned long)(time - lastBackendAttempt) >= 10000UL) {
      lastBackendAttempt = time;
      networkReported = sendDiagnostic("network_ready", "", 0);
    }
    return;
  }
  if (wifiWasConnected) {
    Serial.println("Wi-Fi lost. Card reads remain local until reconnection; no scans queued.");
    wifiWasConnected = false;
    networkReported = false;
    wifiRetryAt = time;
  }
  if (wifiConnecting && (unsigned long)(time - wifiStarted) >= WIFI_CONNECT_WINDOW_MS) {
    WiFi.disconnect();
    wifiConnecting = false;
    wifiRetryAt = millis() + WIFI_RETRY_DELAY_MS;
    Serial.println(wifiAttempts < MAX_WIFI_ATTEMPTS ? "Wi-Fi unavailable. Retrying in 30 seconds; no events delivered." : "Wi-Fi unavailable after 3 attempts. Check network/configuration and reset to retry.");
  }
  if (!wifiConnecting && wifiAttempts < MAX_WIFI_ATTEMPTS && (long)(time - wifiRetryAt) >= 0) beginWifiAttempt();
}

void setup() {
  Serial.begin(115200);
  delay(250);
  Serial.print("Reset reason: "); Serial.println((int)esp_reset_reason());
  Serial.print("BENCH_SERVER: "); Serial.println(BENCH_SERVER);
  Serial.print("BENCH_DIAGNOSTIC_SERVER: "); Serial.println(BENCH_DIAGNOSTIC_SERVER);
  Serial.println(BENCH_DIAGNOSTICS_ONLY ? "Mode: Diagnostics only; signed /diagnostic events; /scan excluded." : "Mode: Check-in scan sender.");
  SPI.begin(READER_SCK, READER_MISO, READER_MOSI, READER_SS);
  reader.PCD_Init();
  WiFi.mode(WIFI_STA);
  WiFi.setAutoReconnect(false); // Explicit bounded attempts below.
  Serial.println("MFRC522 initialized; card-read and network delivery are separate checks.");
  Serial.println("Wi-Fi not ready yet. No booking changes until an authenticated scan is accepted.");
  beginWifiAttempt();
}

void loop() {
  serviceNetwork();
  if (!reader.PICC_IsNewCardPresent() || !reader.PICC_ReadCardSerial()) return;
  char uid[21];
  if (formatUid(reader.uid.uidByte, reader.uid.size, uid, sizeof(uid))) {
    Serial.print("Card read: UID bytes="); Serial.print(reader.uid.size); Serial.print(" UID="); Serial.println(uid);
    sendDiagnostic("card_read", uid, reader.uid.size);
#if !BENCH_DIAGNOSTICS_ONLY
    sendScan(uid, reader.uid.size);
#else
    Serial.println("Diagnostics only: check-in submission disabled; no /scan request.");
#endif
  } else Serial.println("Check-in rejected: unsupported UID length.");
  reader.PICC_HaltA();
  reader.PCD_StopCrypto1();
}
