# Final guest/admin dashboard alignment

19 November 2026, Philippine time. This supersedes the guest pump/door and legacy-Stage permissions in earlier Facilities V2 reports. Exactly two controllers remain. No upload, running LAN restart, private provisioning, live Firebase change, reservation migration or physical actuation occurred.

## Implemented interfaces

`diorama-control.html` is now **IoT Control Center**, with the same admin shell/theme and URL. `manual-override.html` presents the same center. Shared navigation uses the new name without changing destinations or Sensors behavior.

Eight sections: Entrance, Cottages, KTV, Event Hall, Swimming Pool, Stage, Lighthouse and Device Health. They show requested/reported state, signed freshness, unknown/expired/errors and explicit commissioning blocks. KTV includes proper RGB color/brightness/effects, shared karaoke search/queue/transport/volume, and device-selected track/lyrics status. Pool/Stage RGB are draft-only previews with disabled Apply controls; no GPIO was invented. Maintenance pump and movement remain disabled without their trusted prerequisites.

Legacy position/IR/Hall/motor diagnostics remain in a collapsed, clearly labeled read-only section. Legacy mutable handlers are not attached and their controls stay disabled. They are not used as the new center's output authority. The old controller/transport source remains available; no tested V4 motion code was replaced. Physical OPEN/CLOSE switches are untouched. An unsupported web Stop is not misrepresented as a physical emergency stop.

Guests keep the existing selected-booking flow and navigation. All controls require an owned saved Checked In booking. Guest door and pump widgets were removed, not merely hidden by CSS. KTV now has a native color picker, brightness slider and permitted effects instead of fixed color-only buttons. RGB output is still simulated until commissioning; draft changes cannot activate unassigned Pool/Stage resources.

## Permissions matrix

| Saved guest entitlement, Checked In | Grouped cottage | KTV songs/RGB | Event lights | Spotlight | Pool RGB | Stage RGB | Door/pump/gate/maintenance |
|---|---|---|---|---|---|---|---|
|Cottage|Yes|No|No|No|No|No|Never|
|KTV|No|Yes, fresh Hall readiness|No|No|No|No|Never|
|Pool-only|No|No|No|No|Preview only; driver unassigned|No|Never|
|Event packageVersion2|No unless separately saved|No unless separately saved|Yes|Yes under same Event entitlement|Preview only|Preview only|Never|
|Legacy Event, no version2|No unless separately saved|No unless separately saved|Yes|No|No unless separately saved Pool|No|Never|
|Buyout|Yes|Yes, fresh Hall readiness|Yes|Yes|Preview only|Preview only|Never|
|Other combinations|Union of actual saved entitlements; no role or status bypass|||||||
|Signed out, other owner, Pending, Confirmed, Checking Out, Completed, Cancelled, legacy Active|Locked|||||||

`guestAllowed()` is used both for every guest request and reconciliation of existing claims. Previously stored guest pump/door claims and legacy Event spotlight claims are discarded from device intent when next reconciled; **reservation records are preserved**. Direct forged requests are denied even if a guest enables a disabled button. Stage RGB also requires version2/buyout before the separate commissioning block.

| Administrator operation | Requirements / current state |
|---|---|
|Shared cottage/Event/spotlight requests|Trusted admin, bounded request, simulation or commissioned capability; no guest booking required|
|KTV RGB/audio|Trusted admin, capability available, fresh Hall for KTV, and no conflicting resource owner|
|KTV movement|Trusted admin, server commissioning, verified pulse limits, fresh signed position/stopped-motion/clearance evidence, one-use operator visual confirmation; currently uncommissioned|
|KTV Stop|Trusted admin and bounded signed request; no clearance requirement in simulation. Cancels older admin door claims instead of allowing old movement to return|
|Pump|Admin-only maintenance intent plus server commissioning and fresh safe-operating evidence; currently uncommissioned|
|Entrance OPEN/CLOSE/Stop|Separate contract is rejected until a real ESP1 safe command route exists; never sent to ESP2|
|Pathway override|Not provided; normal Checked In-derived policy is preserved|
|Lighthouse maintenance|Not provided until physical driver and separate maintenance policy are approved|
|Pool/Stage RGB|Unassigned; blocked for administrators as well as guests|

An administrator claim is authorization to request, not evidence that hardware is safe or acted successfully. The maintenance checkbox is operator context, not a trusted permission grant. Server commissioning and trusted device evidence are additional requirements.

## Separate admin command contract

`POST /admin/facilities/v2/command` is separate from read-only `GET /admin/facilities/v2/state` and the guest endpoint. Existing read endpoints were not repurposed.

The HTTP factory obtains identity from the existing authentication adapter. In the local emulator it checks issuer/project/provider/expiry, looks up the actual Auth account and requires **both** token `admin:true` and saved account custom claim `admin:true`. Body roles, localStorage flags, booking references and old browser credentials cannot grant this role.

Example schema, not a command issued by this work:

```json
{
  "requestId": "unique-stable-attempt-id",
  "issuedAt": 0,
  "expiresAt": 0,
  "type": "event_lights",
  "value": true,
  "operatorClearance": false,
  "maintenance": false
}
```

Use current server time and expiry at most10seconds after issuance. The zero values above intentionally cannot authorize a request. Audio additionally specifies category and the existing action/track/queue value. No raw GPIO or private key is accepted in this body.

Requests are atomically processed with the same root CAS as Facilities V2. Immutable request-ID fingerprints suppress duplicate mutation, reject changed retries, and prevent an older accepted ON retry from undoing a newer OFF. Authentication/shape failures do not create actuator state. Valid authenticated but safety/policy-denied requests are recorded as rejected audit entries. Failed CAS/save does not show success or leave a claim; retry uses the same identity while fresh.

Audit data is protected under `/reservationFacilitiesV2/adminAudit`, including request ID, authenticated UID, type/value, issuance/expiry, recorded time, accepted/rejected result, error and desired version. No password, token or reader/device key is logged. Admin views distinguish rejected, expired, no-longer-active, pending and current acknowledged requests. An old audit entry is not called acknowledged merely because some different later command was applied.

Admin lighting claims expire after10seconds. They OR with every other active eligible guest/admin ON contribution; OFF clears only that administrator's contribution. No silent force-OFF maintenance policy was added. KTV RGB/door resource claims refuse conflicts. Shared audio remains non-preemptive: an administrator cannot steal an active guest performance just because they are an administrator. Active admin audio is renewed only while the trusted page/session remains available and is bounded by its lease.

Motion contracts require server-held commissioning/calibration, not browser-supplied safety data. Simulated tests use explicit artificial limits; no real KTV endpoints were guessed. Signed safety observations must be fresh, report a known position/stopped motion and clear travel path, and agree with the operator confirmation. Missing/spoofed/stale evidence is denied. Loss of fresh clearance or pump operating-safety evidence removes the corresponding active claim. A Hall magnet state is not clearance/person sensing. Physical local interlocks and safe hold-to-move travel remain commissioning work.

## Single-writer routing plan

| Output | Board / authority | Current routing |
|---|---|---|
|Pathway33|ESP1; derived from saved Checked In records|Existing v1 signed sync; no routine admin switch|
|RFID/LCD/gate mechanisms|ESP1; existing V4/manual workflow|RFID contract and firmware unchanged; no unverified web gate route|
|Cottage26|ESP2; shared OR intent|Choose v1 cottage firmware or v2 firmware, never both helpers on the same GPIO|
|Event33, spotlight19, pump16, KTV14/34/25/27/32|ESP2|V2 typed state; virtual/uncommissioned physical adapters|
|DFPlayer13/17 and TFT18/23/5/21/22|ESP2|One player authority and matching device-selected display state; physical binding uncommissioned|
|Pool/Stage RGB|ESP2 future independent resources|No assigned GPIO/channel driver in firmware; commands blocked|
|Lighthouse|Not mapped|Status Unknown; no actuator route|

The center's desired/reported facility data comes from Facilities V2; ESP1 pathway/signed freshness comes from the existing v1 monitor. Their labels distinguish controller identity and simulation. Old `/diorama` diagnostics remain clearly separate/read-only here. Other legacy source files were not deleted; before any future physical merge, review any remaining legacy facility-admin writers and retire/reroute them. V2 must never consume `/diorama` commands alongside a second writer for the same output.

## RGB resource audit and feasible expansion proposal

Existing ESP2 reservations: cottage26; servo14/Hall34; KTV RGB25/27/32; Event33; spotlight19; pump16; TFT18/23/5/21/22; DFPlayer TX13/RX17; microphone35; reserved RX36/proposed input39. GPIO34–39 cannot supply RGB outputs and lack internal pulls. GPIO19 is **not** available for TFT MISO. Default I2C21/22 would collide with TFT DC/RST and must not be enabled blindly.

Classic ESP32 has16 LEDC channels, but channel count is not the same as exposed, electrically safe output pins or timer compatibility. KTV needs3 PWM channels and the servo needs a separately managed servo-rate resource; Pool plus Stage analog RGB adds6 independently controlled outputs. Do not silently multiplex their colors onto25/27/32 or commandeer UART/TFT pins. See [Espressif LEDC documentation](https://docs.espressif.com/projects/arduino-esp32/en/latest/api/ledc.html) and [GPIO restrictions](https://docs.espressif.com/projects/esp-idf/en/release-v4.4/esp32/api-reference/peripherals/gpio.html).

**Proposed resource design, not an installed wiring claim:** one external PCA9685 PWM expander, with logical channels0–2 for Pool RGB and3–5 for Stage RGB, each feeding its own appropriately rated driver/MOSFET circuit and load supply. This provides independent duty/color/effect buffers without sharing zone outputs or adding a third ESP32. It consumes two reviewed I2C GPIOs rather than six new direct PWM pins. Keep the KTV servo off this shared-frequency LED expander, and manage its ESP32 timer separately. PCA9685 outputs are not a direct high-current strip supply; its channels share one PWM frequency and higher load power needs external drivers. See [NXP's datasheet](https://www.nxp.com/docs/en/data-sheet/PCA9685.pdf).

No bus GPIO is selected in source. A board-level pinout/photo and module/load inventory are required to identify two genuinely spare, exposed, voltage-safe GPIOs and validate boot behavior. GPIO4/15 may be investigated only as candidates if actually exposed/unclaimed;15 is a strapping pin and is **not approved or assigned**. Do not borrow21/22,19,13/17 or input-only pins to make a diagram fit. If two suitable pins cannot be verified, the expansion needs a separately approved hardware/bus redesign. Confirm common-anode/cathode topology, PWM polarity, supply/current, ground, power-up disable/OE behavior and MOSFET ratings before any purchase/wiring/activation. The code remains disabled until that review produces a conflict-free physical map.

## Karaoke/TFT contract

The existing manifest, importer, audio manager, signed virtual device, bounded lyrics engine and tests are reused. One DFPlayer means one current playback owner. KTV/Event cannot play unrelated tracks simultaneously. Next/Previous use the selected category queue; volume0–30 is validated on the server. The new admin and guest UI use the same desired/reported state and never call the TFT as an independent song controller.

“Playing” requires a matching signed player report/revision, and is explicitly labeled Simulation when appropriate. It still does not prove acoustic output. A stopped owner exposes only non-private stopped state; another guest's active track stays hidden from an unrelated guest. TFT text/lyrics are derived from that same selected track/timing, but actual display rendering is Unknown until panel commissioning.

All supplied catalog mappings remain unverified by default; no new MP3 filename, title, artist or copyrighted lyric was fabricated. The synthetic preview has explicitly labeled, no-sound fixtures. Physical UART/SD replies, actual folder indexing, amplifier/mixer/microphone wiring, speaker repair, timing drift and licensed lyric files still require confirmation. No working ESP1 LCD/guest-name or RFID logic changed.

## Changed files and verification

- `diorama-control.html`, `manual-override.html`; `js/diorama-control.js`, `js/manual-override.js`, new `js/iot-control-center.js`; shared label in `js/admin-layout.js`.
- `js/facilities-v2.js`, scoped `css/facilities-v2.css`: guest removals and RGB pickers/brightness/effects/status; admin-compatible styling.
- `scripts/facilities-v2.cjs`, `scripts/facilities-v2-http.cjs`: strict guest matrix, claim revocation, separate admin endpoint, audit/expiry/safety/resource checks, signed health metadata.
- `scripts/preview-facilities-v2.cjs` and `esp32_firmware/ESP2_Facilities_V2/ESP2_Facilities_V2.ino`: virtual disco respects requested brightness; no physical driver enabled.
- New `tests/dashboard-alignment.test.cjs` and `tests/dashboard-alignment-http.test.cjs`.
- Updated `tests/facilities-v2.test.cjs`, `tests/facilities-v2-ui.test.cjs`, `tests/facilities-v2-preview.test.cjs`; legacy `admin-workflow`/`admin-devices` assertions now verify the new center/read-only diagnostics instead of dispatching removed legacy buttons. Transport-factory permission tests remain.

Backups: `.local/dashboard-alignment/2026-11-18T22-02-37-260Z/`, with additional test snapshots directly in `.local/dashboard-alignment/`. Existing local edits were retained.

| Check | Result |
|---|---|
|Core alignment/security|PASS: guest admin denial; pump/door and legacy Stage denial; admin without booking; OR/idempotency/failed save/retry/expiry; trusted calibrated motion fixture; spoof/stale safety denial; pump maintenance/freshness; Stop; blocked pathway/gate/lighthouse routes|
|HTTP role verification|PASS: anonymous/guest/local-role and token-only admin spoof denied; saved and token claims both needed; CORS rejection; audited admin request without booking; v1 compatibility. Fake Auth/RTDB transport|
|Facilities V2 suites|PASS: core, browser fixtures, media engine; RGB pickers, no guest pump/door, queue/search/transport, title/lyrics, shared ownership, lifecycle and mobile fit|
|Actual emulator browser flow|PASS: real named-app guest login/owned booking; signed virtual player/RGB; independent trusted-admin session; eight sections and alias; audited cottage request with reported ON; admin karaoke Play/Pause/Resume/Stop and renewal; disabled uncommissioned gate/pump; guest denied admin page; desktop1440/mobile390 layouts|
|Broader isolated regression|PASS:52 named checks: admin-workflow7, admin-devices5, phase2c1 9, phase2c2 12, guest-facilities6, checkout6, guest-dashboard-simple7; plus combined v2 emulator backend integration|
|Firmware|PASS: updated ESP2 virtual brightness build, classic ESP32/core3.3.12, ArduinoJson7.4.2, dummy config;953,904 flash bytes/49,760 static RAM; not uploaded. ESP1 source unchanged|
|Physical equipment|NOT PHYSICALLY VERIFIED; no equipment energized|

Initial real-page test attempts exposed an outdated RGB status assertion after the picker redesign; the status now includes requested effect and reported color separately, and the final browser run passed. Simulated replies are never relabeled physical success.

Repeat focused checks:

```powershell
node tests/dashboard-alignment.test.cjs
node tests/dashboard-alignment-http.test.cjs
npm.cmd run test:facilities-v2
```

Use the environment preparation in `FACILITIES-V2-KARAOKE.md`, then:

```powershell
& node_modules/.bin/firebase.cmd emulators:exec --only auth,database --project demo-catherines-reservations --config firebase.facility-tests.json "node tests/facilities-v2-preview.test.cjs"
```

This uses test Auth19099/RTDB19000, web15000 and a loopback virtual-device backend, never running LAN29099/29000. Screenshots: `test-results/iot-control-center-desktop.png`, `iot-control-center-mobile.png` and updated guest screenshots. Static CSS/HTML changes need a hard refresh; backend code/route activation requires a later controlled restart, which was not performed.

## Current activation and blockers

Read-only probes confirmed the running LAN remains unchanged: homepage5000 returns200; both admin and guest v2 state routes on8787 return404. Private registry is still unprovisioned. The source mounting fix from Facilities V2 is ready, but not loaded into the existing process. Do not start duplicate listeners or restart without approval. Port5001 remains reservation-only and the new admin script is blocked there.

Before physical use: confirm relay polarities/ratings/contacts; KTV safe servo limits and truthful position/clearance sensing; pump electrical/operating safeguards; actual Hall wiring/freshness; RGB driver/expander resource plan; TFT/DFPlayer/SD/audio chain; and maintenance/conflict policies. ESP1 requires a separate reviewed command route if remote gate operation is wanted; its V4/manual firmware must not be replaced casually. Lighthouse driver remains unknown. Pathway stays derived from verified Checked In reservations.

Emulator tokens/interfaces are development tools, not a hostile-client production security boundary. This implementation verifies the trusted demo account/claims; production requires real Firebase token verification/revocation, device-project authorization, restricted service identity/rules and reviewed TLS. No live deployment or admin claim assignment was performed.
