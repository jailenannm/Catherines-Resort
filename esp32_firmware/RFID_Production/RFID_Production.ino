// Production reader-only HTTPS sender. Configure only after deployment review.
#include <SPI.h>
#include <MFRC522.h>
#include <WiFi.h>
#include <HTTPClient.h>
#include <NetworkClientSecure.h>
#include <time.h>
#include <mbedtls/md.h>
#include <esp_system.h>
#include <inttypes.h>
#include "production-secrets.h"
#include "UidFormatter.h"

constexpr uint8_t READER_SS = 5, READER_RST = 22;
constexpr uint8_t READER_SCK = 18, READER_MISO = 19, READER_MOSI = 23;
MFRC522 reader(READER_SS, READER_RST);

bool fetchServerTime(uint64_t &serverTime) {
  NetworkClientSecure client;
  client.useBuiltinCACertBundle();
  HTTPClient http;
  http.setTimeout(3000);
  http.begin(client, String(PRODUCTION_SERVER) + "/health");
  int status = http.GET();
  String body = http.getString();
  http.end();
  int start = body.indexOf("\"serverTime\":");
  if (status != 200 || start < 0) return false;
  serverTime = strtoull(body.c_str() + start + 13, nullptr, 10);
  return serverTime > 0;
}

void sendScan(const char *uid, uint8_t byteCount) {
  if (!String(PRODUCTION_SERVER).startsWith("https://") || time(nullptr) < 1600000000) {
    Serial.println("Check-in rejected: reviewed HTTPS endpoint and synchronized clock required.");
    return;
  }
  uint64_t observedAt;
  if (WiFi.status() != WL_CONNECTED || !fetchServerTime(observedAt)) {
    Serial.println("Backend unreachable: check Wi-Fi, reviewed HTTPS endpoint and certificate validation.");
    return;
  }
  char eventId[48], timestamp[24];
  snprintf(eventId, sizeof(eventId), "scan_%08lx%08lx%08lx%08lx", (unsigned long)esp_random(), (unsigned long)esp_random(), (unsigned long)esp_random(), (unsigned long)esp_random());
  snprintf(timestamp, sizeof(timestamp), "%" PRIu64, observedAt);
  String fields = String("[\"") + PRODUCTION_READER_ID + "\",\"" + eventId + "\",\"" + uid + "\"," + byteCount + "," + timestamp + "]";
  unsigned char digest[32];
  int result = mbedtls_md_hmac(mbedtls_md_info_from_type(MBEDTLS_MD_SHA256),
    (const unsigned char *)PRODUCTION_READER_KEY, strlen(PRODUCTION_READER_KEY),
    (const unsigned char *)fields.c_str(), fields.length(), digest);
  if (result != 0) { Serial.println("Check-in rejected: could not sign reader event."); return; }
  char signature[65];
  for (size_t i = 0; i < 32; i++) snprintf(signature + i * 2, 3, "%02x", digest[i]);
  String payload = String("{\"readerId\":\"") + PRODUCTION_READER_ID + "\",\"eventId\":\"" + eventId + "\",\"uid\":\"" + uid + "\",\"byteCount\":" + byteCount + ",\"observedAt\":" + timestamp + "}";
  Serial.print("Scan ID: "); Serial.println(eventId);
  // Retry the identical signed scan once if the first response is unavailable.
  for (int attempt = 0; attempt < 2; attempt++) {
    NetworkClientSecure client;
  client.useBuiltinCACertBundle();
    HTTPClient http;
    http.setTimeout(4000);
    http.begin(client, String(PRODUCTION_SERVER) + "/scan");
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

void setup() {
  Serial.begin(115200);
  SPI.begin(READER_SCK, READER_MISO, READER_MOSI, READER_SS);
  reader.PCD_Init();
  WiFi.mode(WIFI_STA);
  WiFi.begin(PRODUCTION_WIFI_SSID, PRODUCTION_WIFI_PASSWORD);
  Serial.print("Connecting to production reader Wi-Fi");
  unsigned long started = millis();
  while (WiFi.status() != WL_CONNECTED && millis() - started < 15000) { delay(250); Serial.print('.'); }
  Serial.println(WiFi.status() == WL_CONNECTED ? " connected." : " unavailable. Check production-secrets.h.");
  configTime(0, 0, "time.google.com", "pool.ntp.org");
  unsigned long clockStarted = millis();
  while (time(nullptr) < 1600000000 && millis() - clockStarted < 15000) delay(250);
  Serial.println(time(nullptr) >= 1600000000 ? "TLS clock ready." : "TLS clock unavailable; scans are blocked.");
  Serial.println("Reader ready. Production tap verification Pending.");
}

void loop() {
  if (!reader.PICC_IsNewCardPresent() || !reader.PICC_ReadCardSerial()) return;
  char uid[21];
  if (formatUid(reader.uid.uidByte, reader.uid.size, uid, sizeof(uid))) {
    Serial.print("Card read: UID bytes="); Serial.print(reader.uid.size); Serial.print(" UID="); Serial.println(uid);
    sendScan(uid, reader.uid.size);
  } else Serial.println("Check-in rejected: unsupported UID length.");
  reader.PICC_HaltA();
  reader.PCD_StopCrypto1();
}
