> New opt-in multi-facility, audio and lyrics software is documented in [FACILITIES-V2-KARAOKE.md](../../FACILITIES-V2-KARAOKE.md). V1 and the earlier snapshots below remain preserved. V2 physical dispatch stays uncommissioned; see its explicit simulation and test results.

> A separate cottage-only starter is now available at `../ESP2_Cottage_Sync/ESP2_Cottage_Sync.ino`, with an isolated polarity diagnostic at `../ESP2_Cottage_Relay_Test/ESP2_Cottage_Relay_Test.ino`. See `../../ESP2-COTTAGE-SETUP.md` for setup and test results. It does not implement the remaining facilities, and relay polarity is still physically unverified. The merge guidance below remains relevant when adding those facilities later.

# ESP32 #2 merge dependency

The newer `ESP2_Facilities_Controller` project packages the supported cottage authority with the full reserved pin map and explicit blocked-capability diagnostics. See `../../ESP2-FACILITIES-INTEGRATION.md` for current build/test results. It does not claim that unverified Event/pump/KTV/TFT/audio drivers are implemented. Older sketches remain preserved.

The checked-in `ESP2_Lighting/ESP2_Lighting.ino` does not match the supplied current wiring. It configures GPIO26 as `BTN_COTTAGE_PIN`, GPIO14 as `BTN_POOL_PIN` and GPIO13 as `BTN_BEACON_PIN`. It has no cottage relay output at26, no verified relay polarity there, and no matching current KTV servo/Hall/DFPlayer implementation. Its cloud Firebase connector reads/writes `/diorama` independently of reservations.

The user reports a physically tested cottage relay on26. The exact current working facilities sketch and its active relay polarity are required to merge this safely while preserving the other outputs. No replacement standalone facilities firmware is supplied as a verified integrated sketch.

## Exact merge additions for the working facilities source, after review

Copy `DeviceOutputLease.h`, `ReservationDeviceSync.h` and the private `device-sync-secrets.h` into the actual facilities sketch folder. Keep the existing Wi-Fi config. Set private `CBLR_DEVICE_ID` to `esp2`, its unique `CBLR_DEVICE_KEY` to the registry's esp2 value, and `BENCH_SERVER` to the same server as ESP32 #1. This synchronization key is separate from the existing RFID signing key.

Add the following after the existing imports and private configuration:

```cpp
#include "device-sync-secrets.h"
#include "ReservationDeviceSync.h"
constexpr uint8_t COTTAGE_RELAY_PIN = 26;
// Set only after checking the physically tested source/module.
constexpr bool COTTAGE_RELAY_ACTIVE_LOW = /* VERIFIED true or false */;
bool cottageOutputOn = false;
```

The polarity placeholder intentionally requires a known value. Replace any prior button configuration or other output writer on26 only after reconciling it with the actual source. No other pin may be reassigned by this snippet.

In setup, before output mode, initialize the relay OFF, then start the worker after existing Wi-Fi initialization:

```cpp
digitalWrite(COTTAGE_RELAY_PIN, COTTAGE_RELAY_ACTIVE_LOW ? HIGH : LOW);
pinMode(COTTAGE_RELAY_PIN, OUTPUT);
if (!ReservationDeviceSync::begin([](bool on) {
  digitalWrite(COTTAGE_RELAY_PIN, (on == COTTAGE_RELAY_ACTIVE_LOW) ? LOW : HIGH);
  cottageOutputOn = on;
})) Serial.println("Device sync failed; cottage output remains OFF.");
```

The callback runs in a separate 20ms output task. Keep it limited to GPIO and the reported state; no network, LCD, Serial or delays. Remove the old main-loop desired/outputApplied snippet. Make cross-task display state volatile or protect it with the existing application lock.

All old local-button, UART or cloud writers for the same cottage relay must be routed through the reviewed authority policy. Otherwise they can bypass server permission or overwrite its output. Other facilities require independent review and stay on their existing paths until that source is provided. Do not upload a hybrid source with conflicting writers.

The callback acknowledgement reports the executed GPIO assignment. It does not prove physical light/current sensing. A valid signed state lease expires after10seconds. The independent output task enforces OFF on expiry even while the main loop or HTTP worker blocks. Test that with the actual TFT/audio code before upload.
