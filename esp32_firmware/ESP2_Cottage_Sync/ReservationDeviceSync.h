#pragma once
// Reviewed integration helper. Requires ArduinoJson 7 and existing ESP32 core.
// Device secrets belong in a private device-sync-secrets.h, never frontend/Git.
#include <ArduinoJson.h>
#include <WiFi.h>
#include <HTTPClient.h>
#include <mbedtls/md.h>
#include <esp_system.h>
#include <inttypes.h>
#include "DeviceOutputLease.h"

namespace ReservationDeviceSync {
static portMUX_TYPE mux = portMUX_INITIALIZER_UNLOCKED;
static bool reported = false, reportKnown = false;
static int64_t appliedVersion = -1;
static DeviceOutputLease leaseState;
static TaskHandle_t worker = nullptr, outputWorker = nullptr;
static void (*applyOutput)(bool) = nullptr;

String mac(const String &fields) {
  unsigned char digest[32];
  if (mbedtls_md_hmac(mbedtls_md_info_from_type(MBEDTLS_MD_SHA256),
      (const unsigned char *)CBLR_DEVICE_KEY, strlen(CBLR_DEVICE_KEY),
      (const unsigned char *)fields.c_str(), fields.length(), digest) != 0) return "";
  char result[65];
  for (size_t i = 0; i < 32; i++) snprintf(result + i * 2, 3, "%02x", digest[i]);
  return String(result);
}

bool sameMac(const String &left, const String &right) {
  if (left.length() != 64 || right.length() != 64) return false;
  unsigned char different = 0;
  for (size_t i = 0; i < 64; i++) different |= left[i] ^ right[i];
  return different == 0;
}

void poll() {
  WiFiClient client;
  HTTPClient http;
  http.setConnectTimeout(1500);
  http.setTimeout(2000);
  if (!http.begin(client, String(BENCH_SERVER) + "/health")) return;
  const int healthCode = http.GET();
  JsonDocument health;
  const DeserializationError healthError = deserializeJson(health, http.getString());
  http.end();
  if (healthCode != 200 || healthError || !health["serverTime"].is<uint64_t>()) return;
  const uint64_t observedAt = health["serverTime"].as<uint64_t>();
  char nonce[48], timestamp[24], version[24];
  snprintf(nonce, sizeof(nonce), "sync_%08lx%08lx%08lx%08lx", (unsigned long)esp_random(), (unsigned long)esp_random(), (unsigned long)esp_random(), (unsigned long)esp_random());
  snprintf(timestamp, sizeof(timestamp), "%" PRIu64, observedAt);
  portENTER_CRITICAL(&mux);
  const int64_t ack = appliedVersion;
  const bool actual = reported, known = reportKnown;
  portEXIT_CRITICAL(&mux);
  snprintf(version, sizeof(version), "%" PRId64, ack);
  const String actualJson = known ? (actual ? "true" : "false") : "null";
  const String fields = String("[\"cblr-device-sync-v1\",\"") + CBLR_DEVICE_ID + "\",\"" + nonce + "\"," + timestamp + "," + version + "," + actualJson + "]";
  const String signature = mac(fields);
  if (signature.length() != 64) return;
  const String payload = String("{\"deviceId\":\"") + CBLR_DEVICE_ID + "\",\"requestId\":\"" + nonce + "\",\"observedAt\":" + timestamp + ",\"ackVersion\":" + version + ",\"actual\":" + actualJson + "}";
  const uint32_t started = millis();
  if (!http.begin(client, String(BENCH_SERVER) + "/device/sync")) return;
  http.addHeader("Content-Type", "application/json");
  http.addHeader("X-Device-Signature", signature);
  const int code = http.POST(payload);
  JsonDocument response;
  const DeserializationError error = deserializeJson(response, http.getString());
  http.end();
  const uint32_t elapsed = millis() - started;
  if (code != 200 || error || !response["desired"].is<bool>() || !response["version"].is<int64_t>() ||
      !response["serverTime"].is<uint64_t>() || !response["validForMs"].is<uint32_t>() ||
      response["deviceId"].as<String>() != CBLR_DEVICE_ID || response["requestId"].as<String>() != nonce) return;
  const int64_t nextVersion = response["version"].as<int64_t>();
  const uint32_t lease = response["validForMs"].as<uint32_t>();
  if (nextVersion < 0 || lease > 10000 || lease <= elapsed) return;
  char serverTime[24], next[24], ttl[16];
  snprintf(serverTime, sizeof(serverTime), "%" PRIu64, response["serverTime"].as<uint64_t>());
  snprintf(next, sizeof(next), "%" PRId64, nextVersion);
  snprintf(ttl, sizeof(ttl), "%lu", (unsigned long)lease);
  const bool desired = response["desired"].as<bool>();
  const String signedResponse = String("[\"cblr-device-state-v1\",\"") + CBLR_DEVICE_ID + "\",\"" + nonce + "\"," + next + "," + (desired ? "true" : "false") + "," + serverTime + "," + ttl + "]";
  if (!sameMac(mac(signedResponse), response["signature"].as<String>())) return;
  portENTER_CRITICAL(&mux);
  // Server versions are persistent. A lower version requires reviewed recovery.
  leaseState.accept(nextVersion, desired, lease - elapsed, millis());
  portEXIT_CRITICAL(&mux);
}

void task(void *) {
  for (;;) {
    if (WiFi.status() == WL_CONNECTED) poll();
    vTaskDelay(pdMS_TO_TICKS(1500));
  }
}

// Independent of the RFID/LCD main loop and of the blocking HTTP worker.
// The callback must only apply the output: no HTTP, LCD, delays or Serial writes.
void outputTask(void *) {
  for (;;) {
    portENTER_CRITICAL(&mux);
    const bool on = leaseState.desired(millis());
    const int64_t version = leaseState.version;
    portEXIT_CRITICAL(&mux);
    applyOutput(on);
    portENTER_CRITICAL(&mux);
    reported = on; reportKnown = true; appliedVersion = version;
    portEXIT_CRITICAL(&mux);
    vTaskDelay(pdMS_TO_TICKS(20));
  }
}

bool begin(void (*output)(bool) = nullptr) {
  if (output && !outputWorker) {
    applyOutput = output;
    applyOutput(false);
    if (xTaskCreatePinnedToCore(outputTask, "CBLR_output_lease", 2048, nullptr, 2, &outputWorker, 1) != pdPASS) return false;
  }
  if (worker) return true;
  return xTaskCreatePinnedToCore(task, "CBLR_device_sync", 8192, nullptr, 1, &worker, 0) == pdPASS;
}

bool desired() {
  portENTER_CRITICAL(&mux);
  const bool result = leaseState.desired(millis());
  portEXIT_CRITICAL(&mux);
  return result;
}

// Legacy manual-loop reporting is deliberately unversioned. Use begin(callback)
// for bounded fail-OFF and correct version acknowledgements.
void outputApplied(bool on) {
  if (outputWorker) return;
  portENTER_CRITICAL(&mux);
  reported = on; reportKnown = true; appliedVersion = -1;
  portEXIT_CRITICAL(&mux);
}
} // namespace ReservationDeviceSync
