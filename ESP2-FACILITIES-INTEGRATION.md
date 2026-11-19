> Latest guest/admin permissions and IoT Control Center: see [DASHBOARD-IOT-ALIGNMENT.md](DASHBOARD-IOT-ALIGNMENT.md). It removes guest door/pump access and restricts legacy Event Stage access; older examples below are historical.

> New opt-in multi-facility, audio and lyrics software is documented in [FACILITIES-V2-KARAOKE.md](FACILITIES-V2-KARAOKE.md). V1 and the earlier snapshots below remain preserved. V2 physical dispatch stays uncommissioned; see its explicit simulation and test results.

# ESP32 #2 Facilities Controller — implementation and verification

19 November 2026, Philippine time. This report distinguishes compilable software from physical evidence. **No physical testing was performed.** No board was flashed, credential provisioned, running LAN service restarted, production deployed or running reservation changed.

## Delivered implementation

Open `esp32_firmware/ESP2_Facilities_Controller/ESP2_Facilities_Controller.ino` in Arduino IDE. This is the complete runnable implementation of the **currently supported reservation-authorized ESP2 output: the shared cottage relay**. It is not a claim that the remaining facility drivers are finished. Those capabilities are explicitly blocked, not simulated as working.

The project reuses the existing cottage code, `ReservationDeviceSync.h` and `DeviceOutputLease.h` without altering the wire protocol or ESP1. `FacilityCapabilities.h` documents/checks all19 unique reserved GPIO roles and reports blocked capabilities over Serial. No backend or frontend change is needed for the existing cottage contract. Adding arbitrary endpoints would not resolve missing electrical evidence or operating policy, so none were invented.

Files added:

- `esp32_firmware/ESP2_Facilities_Controller/ESP2_Facilities_Controller.ino`: Wi-Fi/reconnection, signed synchronization, callback-owned GPIO26, bounded Serial parser, status/help and explicit refusal of local relay bypasses.
- `FacilityCapabilities.h`: unique/input-safe supplied pin map and capability diagnostics, with no GPIO initialization or driver commands.
- Identical copies of the existing shared `ReservationDeviceSync.h` and `DeviceOutputLease.h` for an Arduino-compatible project folder.
- `facilities-config.example.h`: private Wi-Fi/backend/polarity template; polarity is deliberately unset.
- `device-sync-secrets.example.h`: private esp2-key template; no key generated.
- `tests/esp2-facilities.test.cjs`: pin map, single-output initialization, protocol-copy consistency, private-file exclusion and preserved-source fingerprints.
- This report. `.gitignore` additionally excludes the filled `facilities-config.h`; existing wildcard excludes `device-sync-secrets.h`.

Pre-edit copies and SHA-256 manifest: `.local/esp2-facilities-audit/2026-11-18T20-36-41-254Z/`. `.local/esp2-facilities-audit/latest.json` identifies the archive and hashes. ESP1 sketches, old ESP2 sketch, cottage starter, backend core/HTTP adapter and shared helpers were copied before work and their hashes were verified unchanged afterward. Private files were neither copied into public templates nor overwritten.

The interrupted previous task also completed its cottage-starter compilation successfully:946,148 flash bytes /48,400 static RAM. Its new Serial diagnostics remain in that starter. This new Facilities Controller preserves that behavior rather than replacing it with a standalone relay test.

## Actual evidence and architecture

The old `ESP2_Lighting/ESP2_Lighting.ino` contains TFT/ST7735, RGB and legacy device-project handlers, but also assigns26/14/13 as buttons, conflicting with the supplied current roles. It is preserved unchanged and **not treated as the verified current physical firmware**. No complete current hardware-tested ESP2 source has been supplied. The current bench code has every relay disabled and no networking; it does not establish relay polarity or website control.

ESP1 remains responsible for gates, authenticated RFID, LCD and pathway relay. The verified V4 snapshots are retained. The actual latest flashed Laptop2 sketch cannot be inferred solely from a Laptop1 development copy. No ESP1 change is needed or made here. IR-assisted opening stays subject to its existing disabled-by-default verification flag; automatic closing is not added.

Both boards independently use Laptop1's backend; no UART between boards or third board is required. The named Firebase app is `shared-reservations`. Demo data lives in `demo-catherines-reservations-default-rtdb`, not the old `/diorama` device project.

Flow:

1. Guest booking → owner-bound `/sharedReservations/<reference>`; Pending/Confirmed/RFID assignment alone grants no output authority.
2. ESP1 `/scan` HMAC tuple remains `[readerId,eventId,uid,byteCount,observedAt]`. Exact canonical UID/index matching plus root CAS commits Checked In and `/verifiedCheckins` receipt. The response returns that record's guestName.
3. `reservation-device-sync.cjs` derives pathway ON from saved Checked In bookings. An eligible cottage owner explicitly requests cottage ON/OFF through `/guest/cottages`.
4. ESP2 polls signed `/device/sync` using its own key. Desired state, request nonce, persistent version and bounded lease are authenticated. Callback applies GPIO26; a subsequent request reports the applied version/output.
5. Checking Out/Completed revokes that booking's requests. Another eligible booking's ON request keeps the shared output ON. The existing trusted emulator completion path retains history and conditionally releases the active card index.

Current device protocol has **one boolean desired output per board**: ESP1 pathway, ESP2 cottages. It cannot safely represent arbitrary Event/pump/door/audio commands by relabeling that boolean. A future reviewed multi-capability contract must preserve this existing protocol and ESP1 compatibility.

### Authorization and state semantics

`reservation-device-http.cjs` obtains the current named-app token, verifies the demo account/project/provider/expiry and saved role, and the core independently checks owner UID, exact Checked In status and cottage/buyout inclusion on every command. The browser's `GuestAccess` is an additional UI guard, never the sole authority.

Current Event packageVersion2 includes Event, Stage experience and Pool; old Event retains its saved meaning. Pool-only cannot gain Event/Stage or cottage control. Guest controls for unimplemented hardware remain unavailable. Admin device monitoring is separate for esp1/esp2; the new device API does not implement admin relay overrides. Legacy admin diagnostics require separate device-project authorization and safety checks and remain read-only in emulators.

Request accepted ≠ GPIO acknowledged ≠ physical light measured. Backend requires a version previously issued to that device before calling it acknowledged. Expired output reports become Unknown; missing/stale heartbeat states do not become fabricated Online readings. There is no relay-current/light sensor in this implementation.

The shared-cottage OR policy still requires owner approval before activation. The existing verifier has **no check-in-date/time-slot window by default**. Non-Checked In lifecycle statuses are denied, but a calendar date alone does not expire a still-Checked In record. A date-expiration policy is an unresolved decision, not a silently added rule.

## GPIO/wiring report

| ESP2 component | GPIO / direction | State / evidence required |
|---|---|---|
| One cottage relay / all12 LEDs |26 OUT|Only implemented GPIO; polarity UNKNOWN, physical relay/contact behavior pending|
| KTV servo |14 OUT reserved|No attach/PWM; pulse limits, direction, clearance and supervised motion policy needed|
| KTV Hall |34 IN reserved|Input-only; external bias, voltage, magnetic polarity and fresh-state publisher needed; does not detect people|
| KTV RGB |25/27/32 OUT reserved|MOSFET/driver rating and polarity unverified; no direct high-current loads|
| Event hall relay |33 OUT reserved|Polarity/load/driver unverified; Event entitlement is not independent paid stage access|
| Stage relay |19 OUT reserved|Polarity/load unverified; no auto-ON on check-in|
| Pool pump relay |16 OUT reserved|Driver/pump ratings, polarity and admin/guest operating policy needed; no dry-run protection claimed|
| TFT |18 SCK,23 MOSI,5 CS,21 DC,22 RST reserved|Old source uses ST7735; actual panel/init variant and wiring unverified. Do not claim TFT MISO19, which is reserved for stage|
| DFPlayer UART |ESP TX13→module RX; ESP RX17←module TX reserved|No UART/audio commands; verify levels, wiring, module and tracks|
| Microphone |35 IN reserved|ADC input is not an analog mixing implementation|
| Legacy serial RX |36 IN reserved|Review before repurposing; cannot simultaneously serve a button and serial input|
| Possible buttons |36/39 IN reserved|External pull-ups required if later adopted; no internal pull-ups on34–39|

All19 reserved GPIO numbers are unique in the map; output roles on34–39 are rejected at compile time. Only GPIO26 is configured at runtime. Do not turn reserved metadata into enabled hardware merely by changing a pin number. GPIO5 strapping/attached TFT levels require boot testing. Disabled/unconfigured pins have **Unknown physical state**, not guaranteed OFF.

ESP1 map is unchanged: RFID5/22/18/19/23, LCD16/17, gates14/27, buttons25/32, pathway33, proposed IR34. The same GPIO numbers on different boards are not conflicts. Entrance LEDs remain directly main-switched through regulated supply/resistors, independent of pathway33.

ESP32 logic is3.3V. Verify module input/output levels and safe bias; never connect12V to a GPIO. Relays, servo, pump, strips and audio amplification require correctly rated external power/drivers, common grounding where required, suppression/protection and measured buck capacity. Do not assume a module coil voltage identifies its input-logic threshold. Reset/boot can float/glitch GPIOs before software OFF; external hardware/interlocking and contact choice must provide the actual fail-safe behavior.

## Firmware setup and commissioning

1. Identify ESP2 and its COM port. Preserve ESP1 on Laptop2; select the correct board before any later upload.
2. First use `ESP2_Cottage_Relay_Test` with loads isolated.115200 baud/Newline. Type `ISOLATED`, then individually `LOW`, `STATUS`, `HIGH`, `STATUS`. No automatic toggles. Initial INPUT/floating state is not guaranteed OFF.
3. Record whether LOW/HIGH energizes the relay and the LED load; verify COM/NO/NC behavior. A click alone is not proof of12 working LEDs. Correct load resistors/supply/contact wiring before reattaching loads. Report the observations before configuring polarity.
4. Copy the new project's `facilities-config.example.h` to private `facilities-config.h`. Fill Wi-Fi locally and the actual backend URL, currently `http://192.168.1.39:8787`; recheck DHCP. Set `CBLR_COTTAGE_ACTIVE_LOW` to verified0 or1. Missing/invalid polarity must not be bypassed merely to build.
5. Copy `device-sync-secrets.example.h` to private `device-sync-secrets.h`. After separately approved provisioning, use the registry's **esp2** key, never the RFID key or esp1 key. No Firebase Admin secret goes on the board. No credentials were provisioned by this work.
6. Arduino IDE: classic **ESP32 Dev Module**, core3.3.12 (`esp32:esp32:esp32`) and ArduinoJson7.4.2 are the tested build profile. Confirm actual module/flash profile. Other dependencies come from the core. Open the matching `.ino`, select correct port, click Verify. Do not upload dummy `.local` build artifacts.
7. After explicit approval and load isolation, Upload this reviewed project to ESP2 only. Serial115200. `HELP`, `STATUS` or `COTTAGE STATUS` show connection, signed lease, GPIO command/version and blocked features. Local `COTTAGE ON/OFF`, `ALL OFF` and other facility commands do not bypass website authority; electrical testing stays in the isolated sketch.
8. Website activation requires a separately approved controlled adapter restart and private registry; the last read-only runtime probe had device API404, website/health200 and no registry. Keep the existing Auth/RTDB dataset running; do not rerun seed/reset launchers. Detailed no-seed instructions are in `ESP2-COTTAGE-SETUP.md` and `BACKEND-TWO-ESP32-VERIFICATION.md`.
9. With authorized synthetic Checked In cottage bookings, test ON/OFF from the website, applied-version acknowledgement, two active ON contributors, one guest checkout, then final checkout. Observe actual LEDs separately. Test board reset, Wi-Fi loss and backend interruption with loads isolated before declaring fail-OFF operation.

The shared worker checks request identity, HMAC response, nondecreasing version and a maximum10-second lease. Its independent20ms GPIO task is not blocked by the HTTP worker. Checkout produces OFF on the next valid state or expiry; it is not instantaneous and normal scheduler operation is assumed. An already issued ON lease can persist until OFF/expiry; stale retries cannot create a new authorization. Another eligible guest's ON contribution intentionally remains ON.

For later relays: individually verify polarity/contacts and driver/load ratings with isolated power before adding a signed command contract. Pump must remain disabled until an actual operating safety policy is agreed. No new unrestricted serial relay control is included in this network sketch.

For KTV: isolate servo power and establish a cautious supervised calibration without arbitrary angles/sweeps; initial attachment may move a permanently attached mechanism. Verify Hall voltage/bias and magnet state independently, then establish freshness and mismatch rejection on the trusted backend before allowing any motion/readiness. Never infer a person from Hall state.

For TFT: confirm panel model, initialization variant and3.3V levels, verify SPI without19, then test a separate display-only status view before merging. Old drawing functions are preserved in the legacy source; they are not proof that current wiring is correct.

For audio: verify DFPlayer DAC→XH-M273→PAM8610→speakers and mic→appropriate mixer input. Replace the reported damaged speaker. Confirm levels/grounds and approved files/track numbering. Owner must decide Event/KTV/welcome priority and interruption/resume behavior. Only then implement one server-authorized playback owner and fresh Hall gating; no arbitrary priority or track numbers were chosen. Browser lyrics remain separate; DFPlayer does not supply timed lyrics by this implementation. Do not test acoustic output or claim repairs from compilation.

## Feature verification matrix

| Feature | Implemented / compiles | Simulation | Physical / blocker |
|---|---|---|---|
| ESP2 signed cottage control |Yes; new project compile result below|Core, HTTP, browser and real isolated Auth/RTDB test|NOT VERIFIED; polarity, registry and adapter activation pending|
| Four cottages / one relay |One output, no individual assignment|ON/OFF, OR aggregation, checkout|NOT VERIFIED; all12 loads/contacts/power|
| ESP1 RFID/LCD/pathway |Existing source unchanged|RFID name/security plus pathway derivation passed|Existing user-reported behavior preserved; new synchronized relay upload not asserted|
| Restart/network/leases |Default OFF, signed refresh, independent expiry task|Portable C++ assertions and server replay/version tests|Real timing/reset/glitch behavior NOT VERIFIED|
| Event hall/stage |Reserved/blocked; no new command contract|No affirmative actuation test claimed|Polarity/driver and trusted command policy missing|
| Pool pump |Reserved/blocked|No affirmative actuation test claimed|Hardware/policy missing; no dry-run sensing invented|
| KTV door/Hall/RGB |Reserved/blocked|Existing pages remain read-only; unsafe readiness is never authorized by this project|Calibration, Hall bias/polarity/publisher, driver and command safety missing|
| TFT |Old source retained, new driver blocked|No new display simulation claimed|Actual panel/init/pins pending|
| Audio owner/DFPlayer |NOT IMPLEMENTED in shared authority|Concurrent audio arbitration not claimed tested|Policy, track map, wiring and speaker repair missing|
| Date-based reservation expiration |NOT IMPLEMENTED as a new rule|Non-Checked In statuses denied|Business window policy required|
| Production security |Not enabled|Fake production/RFID tests from prior audit are not deployment evidence|Trusted emulator LAN only; real Auth verification/TLS/server identity required|

## Tests executed and limits

- **Firmware compilation PASS:** classic `esp32:esp32:esp32`, Espressif core3.3.12 and ArduinoJson7.4.2;946,792 bytes flash /48,400 bytes static RAM. Dummy credentials and a simulated active-LOW setting were used in `.local/esp2-facilities-audit/build`; no polarity was physically established and nothing was uploaded. No missing library or unexpected compilation error occurred.
- **Isolated regression PASS:**40 named checks (phase2c1:9, phase2c2:12, guest-facilities:6, checkout:6, guest-dashboard-simple:7), plus the combined real isolated Auth/RTDB + actual HTTP + browser cottage integration test. The isolated emulators shut down normally; the running LAN emulators were not restarted.
- Passed focused suites: `reservation-device-sync`, `reservation-device-http`, `reservation-device-ui`, `device-output-lease`, `rfid-guest-name`, `esp1-v4-safe-servos`.
- New `esp2-facilities.test.cjs` passes map consistency/input-only checks, unchanged helpers and original-source hashes, private-file exclusion and single GPIO initialization. Its initial expected-count assertion was corrected from20 to19; no GPIO was added to satisfy a mistaken test count.
- Isolated emulator command and final result below. It targets Auth19099/RTDB19000 and web15000; tests may create/delete **only their isolated fixtures**, never the running LAN29099/29000 dataset.
- No ESP1 recompile was necessary: its firmware and shared helpers were not modified. Fingerprint/function tests passed.
- Polarity, physical acknowledgements, Hall mismatch under real sensor conditions, TFT, acoustic playback, simultaneous real audio requests and actuator safety remain **NOT VERIFIED/BLOCKED**, not passed by proxy.

Reproduce isolated tests:

```powershell
$env:PATH=(Join-Path $env:TEMP 'catherines-phase2a2-tools\node-v22.16.0-win-x64')+';C:\Program Files\Microsoft\jdk-21.0.13.21-hotspot\bin;'+$env:PATH
$env:FIREBASE_EMULATORS_PATH=Join-Path $env:TEMP 'catherines-phase2a2-tools\emulators'
$env:XDG_CONFIG_HOME=Join-Path $env:TEMP 'catherines-phase2a2-tools\config'
$env:CHROME_PATH='C:\Program Files\Google\Chrome\Application\chrome.exe'
$env:CI='true'
& node_modules/.bin/firebase.cmd emulators:exec --only auth,database --project demo-catherines-reservations --config firebase.facility-tests.json "node --require ./tests/isolated-facility-ports.cjs tests/public-guest-regression.cjs phase2c1 phase2c2 guest-facilities checkout guest-dashboard-simple reservation-device-emulator"
```

Firebase emulators are development services with unsigned tokens and privileged interfaces, not a hostile-client production security boundary. Keep ports off public/untrusted networks. HMAC authenticates state but does not encrypt HTTP. Real production deployment requires reviewed TLS, verified real Auth and server/database permissions; no such deployment was attempted.

## Remaining dependencies

1. Actual relay polarity/contact behavior and electrical ratings for each output.
2. Approval of shared cottage OR policy; check-in/date expiry policy separately.
3. Approved private device provisioning and no-seed adapter activation.
4. KTV servo calibration and safe movement policy; Hall bias/polarity/freshness source; RGB driver verification.
5. Actual TFT model/init/boot behavior and current wiring; resolve legacy RX36 before button reuse.
6. Audio priority/interruption decisions, track/file map, verified analog route and damaged-speaker replacement.
7. Event/stage/pump command semantics and physically tested drivers before extending the current one-boolean protocol.

These dependencies prevent an honest claim of complete physical Facilities Controller operation. The delivered build implements the verified available authority and keeps unresolved functions visibly blocked without deleting the legacy implementations.
