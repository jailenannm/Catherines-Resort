#pragma once
// REVIEW ONLY. Include after your existing showLCD() definition, if approved.
// Requires ArduinoJson 7. Uses existing BENCH_* constants and ESP32 libraries.
#include <ArduinoJson.h>
#include <vector>

namespace ReservationLCD {
struct Seen { String reference; bool assigned; };
struct Notice { String title; String name; };
static std::vector<Seen> previous;
static std::vector<Notice> pending;
static bool initialized = false, displaying = false;
static String title, name;
static size_t offset = 0;
static unsigned long lastPoll = 0, lastFrame = 0, holdUntil = 0;

// Standard 16x2 LCD character ROMs differ. Keep JSON names intact, and replace
// unsupported UTF-8 characters with '?' for this review example's LCD rendering.
String lcdText(const String &text) {
  String result;
  for (size_t i = 0; i < text.length(); i++) {
    uint8_t byte = (uint8_t)text[i];
    if (byte >= 32 && byte <= 126) result += (char)byte;
    else if (byte >= 192) result += '?';
  }
  return result;
}

void start(const String &heading, const String &guestName) {
  title = heading;
  name = lcdText(guestName);
  offset = 0;
  lastFrame = millis();
  // Every 16-character page remains visible for 1.2 seconds, with two cycles.
  unsigned long duration = ((name.length() + 15) / 16) * 2400UL;
  holdUntil = millis() + (duration > 8000UL ? duration : 8000UL);
  displaying = true;
  showLCD(title.c_str(), name.substring(0, 16));
}

void welcome(const String &guestName) { start("WELCOME TO CBLR", guestName); }

void poll() {
  WiFiClient client;
  HTTPClient http;
  http.setConnectTimeout(1000);
  http.setTimeout(1500);
  if (!http.begin(client, String(BENCH_SERVER) + "/health")) return;
  int status = http.GET();
  String body = http.getString();
  http.end();
  JsonDocument clock;
  if (status != 200 || deserializeJson(clock, body)) return;
  uint64_t observedAt = clock["serverTime"].as<uint64_t>();
  if (!observedAt) return;
  char eventId[48], timestamp[24], signature[65];
  snprintf(eventId, sizeof(eventId), "lcd_%08lx%08lx%08lx%08lx", (unsigned long)esp_random(), (unsigned long)esp_random(), (unsigned long)esp_random(), (unsigned long)esp_random());
  snprintf(timestamp, sizeof(timestamp), "%" PRIu64, observedAt);
  String fields = String("[\"rfid-lcd-display-v1\",\"") + BENCH_READER_ID + "\",\"" + eventId + "\"," + timestamp + "]";
  unsigned char digest[32];
  if (mbedtls_md_hmac(mbedtls_md_info_from_type(MBEDTLS_MD_SHA256),
      (const unsigned char *)BENCH_READER_KEY, strlen(BENCH_READER_KEY),
      (const unsigned char *)fields.c_str(), fields.length(), digest) != 0) return;
  for (size_t i = 0; i < 32; i++) snprintf(signature + i * 2, 3, "%02x", digest[i]);
  String payload = String("{\"readerId\":\"") + BENCH_READER_ID + "\",\"eventId\":\"" + eventId + "\",\"observedAt\":" + timestamp + "}";
  if (!http.begin(client, String(BENCH_SERVER) + "/reader-display")) return;
  http.addHeader("Content-Type", "application/json");
  http.addHeader("X-Reader-Signature", signature);
  status = http.POST(payload);
  body = http.getString();
  http.end();
  JsonDocument snapshot;
  if (status != 200 || deserializeJson(snapshot, body) || !snapshot["reservations"].is<JsonArray>()) return;
  std::vector<Seen> current;
  for (JsonObject booking : snapshot["reservations"].as<JsonArray>()) {
    String reference = booking["reference"].as<String>();
    bool assigned = booking["rfidAssigned"].as<bool>();
    bool found = false, wasAssigned = false;
    for (const Seen &old : previous) {
      if (old.reference == reference) { found = true; wasAssigned = old.assigned; break; }
    }
    if (initialized) {
      if (!found) pending.push_back({"NEW RESERVATION", booking["guestName"].as<String>()});
      if (assigned && !wasAssigned && booking["status"].as<String>() == "Confirmed") pending.push_back({"RFID ASSIGNED", "READY FOR ENTRY"});
    }
    current.push_back({reference, assigned});
  }
  previous = current;
  initialized = true;
}

void tick() {
  unsigned long time = millis();
  if (displaying && (long)(time - holdUntil) >= 0) displaying = false;
  if (displaying && name.length() > 16 && (unsigned long)(time - lastFrame) >= 1200UL) {
    offset = (offset + 16 < name.length()) ? offset + 16 : 0;
    showLCD(title.c_str(), name.substring(offset, offset + 16));
    lastFrame = time;
  }
  if (!displaying && !pending.empty()) {
    Notice next = pending.front();
    pending.erase(pending.begin());
    start(next.title, next.name);
  }
  if (WiFi.status() == WL_CONNECTED && (unsigned long)(time - lastPoll) >= 5000UL) {
    lastPoll = time;
    poll();
  }
}
} // namespace ReservationLCD
