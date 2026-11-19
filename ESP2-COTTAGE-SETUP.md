# ESP32 #2 cottage relay setup

For the newer Facilities Controller project and full reserved GPIO/feature matrix, see [ESP2-FACILITIES-INTEGRATION.md](ESP2-FACILITIES-INTEGRATION.md). The cottage-only diagnostic and starter below remain available. The starter now also accepts `COTTAGE STATUS`, normalizes command case/whitespace, reports uncommissioned facilities as Unknown and explicitly rejects local relay bypass commands. Its updated build passed at946,148 flash bytes /48,400 static RAM.

This is a cottage-only starting firmware, not a replacement for ESP32 #1 or a complete Facilities Controller. GPIO26 drives all four cottage groups/12 LEDs through one relay. Relay polarity remains **UNKNOWN until the operator reports observations**.

## Deliverables and changes

- Diagnostic: `esp32_firmware/ESP2_Cottage_Relay_Test/ESP2_Cottage_Relay_Test.ino`.
- Integration: `esp32_firmware/ESP2_Cottage_Sync/ESP2_Cottage_Sync.ino`.
- Local configuration templates in the integration folder: `cottage-config.example.h` and `device-sync-secrets.example.h`.
- Identical copies of the existing `ReservationDeviceSync.h` and `DeviceOutputLease.h` are included so the sketch folder opens directly in Arduino IDE. Keep them identical to `esp32_firmware/shared` when updating the protocol.
- `.gitignore` now protects this project's filled `cottage-config.h`; the existing wildcard already protects `device-sync-secrets.h`.
- `esp32_firmware/shared/ESP2-INTEGRATION-REVIEW.md` links to this cottage-only starter; its full-facilities merge guidance remains for later work.
- `tests/esp2-cottage.test.cjs` checks configuration guards, helper consistency, the single output, ignored private files and protected ESP1/backend fingerprints.

No existing ESP1 sketch, shared protocol helper, backend, website workflow, database rule, credential or reservation was changed. No credential provisioning, running-service restart, emulator reset or upload was performed.

## 1. Arduino IDE preparation

Use ESP32 #2 only. Label the board and select its own USB COM port; do not upload to ESP32 #1 accidentally. Uploading either sketch replaces whatever is currently flashed on the selected board.

The available build environment uses **ESP32 Dev Module** (`esp32:esp32:esp32`), Espressif core3.3.12, for the classic ESP32. Confirm the actual module marking before upload; the 32-pin expansion board alone does not identify the module/flash configuration.

The diagnostic needs only the ESP32 core. The integration additionally needs **ArduinoJson7.4.2**; WiFi, HTTPClient, FreeRTOS and mbedTLS come from the core. It needs no ESP32Servo, RFID, LCD, TFT, DFPlayer or Firebase Arduino library.

Open the `.ino` matching its folder name. Select board and port, then **Verify**. Upload only after operator approval and load isolation. Serial Monitor: **115200 baud**, **Newline** or **Both NL & CR**. Commands are uppercase.

## 2. Safe polarity test — hardware result pending

**Hindi pa natin alam kung LOW o HIGH ang ON.** Neither GPIO level, reset nor a floating pin is guaranteed safe. Isolate LED/load power first. Keep other facility loads and actuators disconnected from this test. Do not apply12V to GPIO26. Verify the relay module's supply/input ratings, common ground and the expansion board's S/V/G labeling before powering it; do not infer them from wire colors.

1. With loads isolated, open the diagnostic sketch and run Verify. It has no network/database code and no other facility outputs.
2. After approved upload, startup leaves GPIO26 as a high-impedance INPUT. This deliberately avoids choosing an unknown ON/OFF output level before an operator command, but the relay may still energize from its module bias/floating input. Treat the load as potentially ON.
3. Type `STATUS`. Expected initial text: `GPIO26 command: INPUT / not driven`.
4. Type `LOW` before acknowledgement if checking the guard: expected `REFUSED: isolate loads, then type ISOLATED first.` No output change occurs.
5. Confirm loads really are isolated; type `ISOLATED`. This only acknowledges isolation; it does not drive the pin.
6. Type `LOW`. Only now does the sketch preload LOW and configure GPIO26 as OUTPUT. Observe relay indicator/click and, with load power isolated, verify contact continuity as appropriate for the module. Record the result.
7. Type `HIGH`. Record the same observations. There are no timers or repeated toggles. The last commanded level is held until another explicit command or reset.
8. Use `STATUS` or `HELP` as needed. Serial output reports only the commanded electrical level, not measured relay/LED operation.

| Observation | Configuration, after verification |
|---|---|
| LOW energizes relay, HIGH de-energizes | `CBLR_COTTAGE_ACTIVE_LOW 1` |
| HIGH energizes relay, LOW de-energizes | `CBLR_COTTAGE_ACTIVE_LOW 0` |
| Both/neither activate, unstable or inconsistent | Stop: check module input ratings, wiring, power and S/V/G path. Do not guess polarity. |

Check COM/NO/NC wiring too. The integration's logical OFF de-energizes the relay using the verified polarity. If the LEDs use NC contacts, de-energizing may turn the load ON; resolve that mismatch before claiming fail-OFF. A click or module LED alone does not prove all12 LEDs work. Only after polarity/contact behavior is established should an operator-approved load test verify all four groups and their appropriate resistors/supply.

Please report: relay module model, LOW result, HIGH result, which contacts feed the LEDs, and actual load ON/OFF observation. A successful Verify/upload is not physical proof.

## 3. Private integration configuration

Do this **after** polarity verification; no working secrets were generated/copied automatically.

1. Copy `cottage-config.example.h` to `cottage-config.h` in `ESP2_Cottage_Sync`.
2. Fill the existing Wi-Fi SSID/password privately. Set `BENCH_SERVER` to Laptop1's actual LAN backend, currently `http://192.168.1.39:8787`. Never use127.0.0.1 on the board.
3. Uncomment exactly one polarity define,0 or1. Leaving it unset or setting an invalid numeric value intentionally fails compilation.
4. Copy `device-sync-secrets.example.h` to `device-sync-secrets.h`. Use only the **esp2** device key from the privately provisioned `.local/reservation-devices.json`. Do not use the ESP1 key, RFID reader key, Firebase Admin credential or database secret. `CBLR_DEVICE_ID` is fixed to `esp2` by the sketch.
5. Keep filled headers out of Git/chat/logs. The sketch does not print Wi-Fi credentials, keys, signatures, tokens or guest details.

No registry provisioning was run. If the registry is still missing, the existing setup command is `node scripts/provision-reservation-devices.cjs`, but run it only after explicit approval. It refuses overwrite. Copy credentials privately; do not paste their contents into chat.

## 4. Integration behavior

- GPIO26 is preloaded to the configured OFF level before enabling its output driver. Reset/boot electrical behavior still needs bench verification.
- Only the cottage GPIO is initialized. No outdated GPIO26 button assignment is reused.
- Wi-Fi attempts do not wait in a long setup loop. Each failed connection gets another attempt after20seconds. Serial distinguishes requested connection, actual connection and loss.
- The existing shared worker obtains server time at `/health` and posts its authenticated `esp2` request to `/device/sync`. No `/scan` call is made by this firmware.
- Existing HMAC request/response format, nonce binding, version monotonicity and lease handling are reused unchanged. Only authenticated state for this request/device can renew the lease.
- A separate20ms task applies the GPIO instruction and acknowledges the captured version. It remains separate from blocking network operations. A GPIO acknowledgement is not physical current/light sensing.
- Missing/invalid/unrenewed state leaves or returns the relay OFF after its at-most10-second signed lease, adjusted for request latency and normal scheduler operation. Wi-Fi loss is not instant OFF; existing authority expires. Actual timing under board load remains a bench test.
- After checkout the server drops that booking's cottage request. An old command retry cannot restore it. A lower-version old ON response is rejected; a replay cannot renew arbitrary future requests because responses are nonce-bound. A previously issued valid ON lease can persist until the next OFF poll or expiry, so do not claim instantaneous physical checkout shutdown.
- The proposed shared-OR policy keeps the relay ON if another eligible Checked In booking still requests ON. This policy still requires owner approval before activation.
- Integration Serial commands: `STATUS`, `HELP`. There is **no local ON/OFF override**. `STATUS` shows Wi-Fi state, valid/missing/expired signed lease, GPIO command and applied version. It does not claim physical illumination.

Other planned pins are reserved and untouched: KTV14/34/25/27/32, Event33, stage19, pump16, TFT18/23/5/21/22, DFPlayer TX13/RX17, microphone35, proposed buttons36/39. Input-only36/39 require external pull-ups for future active-LOW buttons. Confirm TFT does not also claim19 as MISO before adding stage output. These reservations do not imply implemented drivers.

## 5. Website/backend integration — activation is separate

Existing backend `reservation-device-sync.cjs:authorize` independently requires a signed-in non-admin owner, selected booking status exactly `Checked In`, and saved `cottage` or `buyout`. Confirmed-with-RFID, another guest, Pool-only and Event-only cannot request cottage lighting. Guest-facing `GuestAccess` also checks the selected booking, but is not the server authority.

The existing routes are:

- `POST /guest/cottages`: token, reference, boolean ON/OFF, stable request ID.
- `GET /guest/device-state`: selected owned/eligible reference.
- `GET /admin/device-state`: trusted administrator monitoring.
- `POST /device/sync`: device HMAC, separate esp2 identity/key.

All12 LEDs are one output. Dashboard and cottage-page COTTAGES ON/OFF controls appear only with emulator device sync explicitly enabled. Desired/request accepted, pending, controller acknowledged, unknown/offline and failed saves remain distinct. Guest commands never write protected device state directly.

The last audited running launcher had these optional routes disabled (404), and the registry was absent. This task does **not** restart it. After private provisioning, polarity test, policy review and explicit activation approval, the reviewed **no-seed** adapter is:

```powershell
# Do NOT run while the current adapter owns these ports.
# First arrange an approved controlled adapter stop; leave Auth/RTDB running.
$env:CATHERINES_DEVICE_SYNC='1'
$env:CATHERINES_TRUSTED_DEMO_LAN='1'
node scripts/serve-reservation-lan.cjs --host=192.168.1.39
```

Recheck DHCP before using the address. Do not run seed/reset commands. Do not stop emulators or import an older dataset to activate this feature. Current website URL: `http://192.168.1.39:5000/`; Master Reservations at `/admin-reservations.html`; guest My Reservation at `/my-reservation.html`. Keep port5001 reservation-only. No ESP1 changes are necessary merely to register the ESP2 device API, although enabling the full two-device monitor expects separate configured identities.

This protocol is for an explicitly trusted demo LAN. HMAC provides message authentication, not encryption; Firebase emulators are not a production authentication boundary. Keep it off public/untrusted networks. No live deployment was enabled.

## 6. Verification results

Arduino compilation completed using `esp32:esp32:esp32`, core3.3.12 and ArduinoJson7.4.2:

| Build | Result |
|---|---|
| GPIO26 diagnostic | PASS;272,732 bytes flash;22,164 bytes static RAM |
| Integration, simulated active-LOW | PASS;945,116 bytes flash;48,400 bytes static RAM |
| Integration, simulated active-HIGH | PASS;945,116 bytes flash;48,400 bytes static RAM |
| Integration, polarity undefined | Expected compile rejection: required polarity configuration |
| Integration, polarity2 | Expected compile rejection: must be0 or1 |

No unexpected compilation errors or missing dependencies were encountered. Both polarity settings are software build fixtures, **not a hardware polarity finding**. All compilation uses dummy credentials in `.local/esp2-cottage-build`; never upload those build binaries. The portable source folders intentionally have no filled private headers.

Tests already passed:

- `node tests/reservation-device-sync.test.cjs`: ownership/status/package enforcement, default OFF, shared requests, concurrency, safe retries, failed save, response MAC, acknowledgement, checkout revocation, replay and offline handling; fake store.
- `node tests/reservation-device-http.test.cjs`: actual HTTP/CORS/authenticated routes, guest/admin denial, signed polling; fake Auth/RTDB.
- `node tests/reservation-device-ui.test.cjs`: browser requests on insecure HTTP fixture origin, ON/OFF, pending/acknowledged, failed/unconfirmed saves and same-ID retry, access revocation, desktop/mobile; all network fixtures.
- `node tests/device-output-lease.test.cjs`: actual portable C++ lease assertions for startup, expiry, lower version, OFF, wraparound and bounds.
- `node tests/esp2-cottage.test.cjs`: shared helper copies, mandatory config guards, sole GPIO26 initialization, private-file exclusion and unchanged protected source hashes.
- `node tests/esp1-v4-safe-servos.test.cjs`: original/private fingerprints,16 preserved functions, gate bounds, and unchanged16 sync-sketch functions also passed.

No emulator was started/reset for these tests. No running reservation was used as a test fixture. Physical polarity, boot behavior, actual LEDs, board Wi-Fi connectivity, signed exchange and lease-expiry load shutdown are **Pending**.
