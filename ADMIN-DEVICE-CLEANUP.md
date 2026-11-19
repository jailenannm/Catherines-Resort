# Admin Operational Center / Diorama Overrides: audit and cleanup

Implemented directly in the existing checkout, preserving earlier local edits. This report verifies the earlier `GUEST-FACILITIES-SIMPLIFICATION.md` findings against the current source. **Source-code support is not a physical bench test.** No firmware, physical wiring, deployed Firebase configuration/rules, live account/booking, or real hardware command was changed or exercised.

## Actual navigation and entry points

| Navigation entry | Actual page / old controller | Finding / revised behavior |
| --- | --- | --- |
| Operational Center | `admin-dashboard.html` → `js/admin-dashboard.js` | Previously used `ControlShell.isAdmin()` without shared Auth and loaded legacy database/device scripts before checking access. Its `renderStatus()` mixed default/command/simulated values with physical states. Now boots `AdminDeviceConsole.start(false)` after trusted named-app Auth. It is a concise read-only overview. |
| Diorama Overrides from Master Reservations | `diorama-control.html` → `js/diorama-control.js` | Previously DOM styling, hard-coded readings and success toasts only; no Firebase transport or trusted-admin guard. Now boots the verified request console, `AdminDeviceConsole.start(true)`. |
| Manual Override from older facility sidebars | `manual-override.html` → `js/manual-override.js` | Previously wrote actual paths but depended on legacy local-role checks and included unsupported power/beacon/auto-gate controls. This route now uses the same verified request console as Diorama Overrides, so the old route is not a bypass. |

All three now use Master Reservations' typography, card/button styling, cream/gold palette and readable sizes. The common sidebar retains the real navigation routes, with current-page highlighting and visible Sign Out. Master Reservations itself is unchanged. Existing dedicated facility controllers and guest access/package mappings are unchanged; the cleanup here covers the operational/override entry points and the manual alias.

## Trust, transport and accurate feedback

- `js/admin-device-console.js`: `start()`, `accountChanged()`, `send()` use `SharedReservations.identity(true)` from **`shared-reservations`** Auth, wait for initial restoration, bind to the administrator UID, recheck before dispatch, and revoke UI/transport access on sign-out or identity changes. Local flags/accounts cannot open the console or initialize transport.
- `js/admin-device-transport.js`: `create(uid)` / inner `verify()` independently recheck that identity. `send()` accepts only a strict firmware-backed path/value allowlist. Unsupported power, beacon, Event Mode, Pool RGB and arbitrary root commands are rejected.
- Emulator sessions use a real **Preview / read-only** transport. They do not load the live device configuration, open a device connection, simulate values, or send writes—even if a disabled control is triggered programmatically.
- Non-emulator sessions reuse the unchanged `js/firebase-config.js` device project/root through a separate named observer app, **`admin-diorama-monitor`**. Reservations remain on their own named app/project. No global/default-app replacement or SDK-version replacement is performed.
- The new transport reads **raw** device snapshots. It does not merge `DioramaLink.DEFAULT_STATE`, seed an empty database, read local simulated state, fall back to simulation, or optimistically mutate displayed state. The existing `js/diorama-link.js` and its configuration remain untouched for other workflows.
- Writes use acknowledged REST requests. The console distinguishes **Validating**, **Saving**, **Command request saved**, and failure. A saved request explicitly says **Physical action is not confirmed by this page**. Pump/hall/stage booleans are labeled as requests, never independent relay feedback. A KTV door click cannot set Hall readiness.
- Repeated clicks are serialized with a busy guard and disabled controls. Unknown/stale/disconnected device conditions block ordinary commands. Stop does not require visual clearance or an online heartbeat, but still requires administrator identity, a working database connection and a successful fresh-state read.

**Device-project authorization limit:** the device database is still the separate `catherines-diorama` project; reservation Auth belongs to `atherines-resort-reservations`. The reservation claim gates these web workflows, but does not automatically grant or enforce server permissions in the other project. Existing device-database rules remain authoritative; denied reads/writes are shown as unavailable/errors, not simulated success. Its deployed rules and cross-project server authorization were not inspected, changed, or certified here. Review that boundary before any live command testing; a trusted command backend/per-project authorization remains a separate integration decision.

## Current control/status evidence matrix

All paths below are under `/diorama` in the existing device project. Current web entry functions are `AdminDeviceConsole.start/render/send` and `AdminDeviceTransport.create/refresh/send`; the three page-specific scripts only bootstrap that common controller.

| Visible control / indicator | Handler and exact command/state path | Matching current firmware / documented output | Decision and physical limit |
| --- | --- | --- | --- |
| Administrator verification / Sign In / Sign Out / navigation | `accountChanged()` → shared named-app identity; Sign Out → `SharedReservations.signOut()`; real page links | Application/Auth functions, not MCU commands | Retained; no local role credential grants device access. |
| State database connection | Transport `.info/connected` listener → `render()` | Firebase client connection metadata, not a board publisher | Connected/Disconnected refers only to the database connection. |
| ESP1 / ESP2 presence | Raw `status/esp1/heartbeat`, `status/esp2/heartbeat`; `render()` tracks counter changes, `health()` evaluates age | Each firmware `loop()` publishes an incrementing heartbeat every 3000ms (ESP1 around 175, ESP2 around 153) | Initial/missing/unchanging first sample = Unknown. Online only after observing a counter change while connected. Offline only after a previously observed change is at least 15s old while the database connection remains available. Connection loss = Unknown, not proof of physical power-off. |
| ESP1 / ESP2 signal | Fresh `status/{esp1,esp2}/rssi` | Firmware loops publish `WiFi.RSSI()` | Fresh plausible negative dBm shown; missing/default zero/stale = Unknown. No invented zero-dBm signal. |
| Firmware gate report | `gate/state` | ESP1 `readFirebaseCommands()` around 291 writes open/closed **immediately after reading target**, before servo travel | Labeled firmware report, explicitly not physical-clearance confirmation. |
| Request Gate Open / Close | `send('gateOpen'/'gateClose')` → `gate/target` = `open` / `closed` | ESP1 `readFirebaseCommands()`, `openGatesSlowly()`, `closeGatesSlowly()`; servo pins 12/27 | Retained, guarded by fresh ESP1/IR data, stopped motor and one-use visual clearance. No target-to-success inference. |
| Entrance clearance sensor | Fresh `gate/irBlocked` | ESP1 `readSensorsAndSync()` reads IR pin 21; HIGH is treated as blocked and triggers its existing automatic gate-opening logic | Clear/Blocked **reported** only when fresh; missing/stale = Unknown. Firmware automatic behavior is unchanged. |
| Motor Forward / Reverse / Stop | `carForward`, `carReverse`, `carStop` → `car/command` = `forward`, `backward`, `stop` | ESP1 `readFirebaseCommands()` around 318; TB6612 AIN1 25, shared AIN2 relay 26, PWMA 32 | Forward/reverse require fresh ESP1, IR explicitly clear, open gate report, stopped motor, and operator visual clearance. Stop bypasses motion-clearance requirements. No encoder/physical travel confirmation is claimed. |
| Motor PWM draft / Save PWM request | Range input only updates draft label; `carSpeed` → `car/speed`, integer 0–255 | ESP1 reads speed and uses `analogWrite(TB_PWMA_PIN, speed)` | Retained; changing PWM requires fresh clear IR, stopped motor and visual clearance. Draft 0/128/etc. is not a measured speed or RPM reading. |
| Firmware motor report | Fresh `car/state` | ESP1 publishes `moving forward`, `moving backward`, `stopped` in the command handler | Reported firmware execution state, not measured motion/speed. Missing/stale = Unknown. |
| Pump Request On / Off | `pumpOn` / `pumpOff` → `pool/pump` boolean | ESP2 `readPoolState()` at 350 → `POOL_PUMP_RLY_PIN` 16; physical button also writes this path | Retained admin-only, requiring fresh ESP2. Display says On/Off **requested — output Unknown**. No independent physical relay feedback exists here. |
| Pavilion On / Off | `hallOn` / `hallOff` → `event/hallLight` boolean | ESP2 `readEventState()` at 330 → `EVENT_HALL_RLY_PIN` 33 | Retained as a manual relay diagnostic, not coordinated Event Mode. Requested state is not measured illumination. |
| Spotlight On / Off | `stageOn` / `stageOff` → `event/stageLight` boolean | ESP2 `readEventState()` → `STAGE_SPOT_RLY_PIN` 19 in its manual branch | Retained as a binary spotlight relay diagnostic. Blocked while reactive ownership is active or unknown; fresh data must show `event/mode === false` or `event/reactive === false`. Not stage RGB. |
| Sound-reactive stage behavior | No new switch; source audit only: `event/mode`, `event/reactive`, `event/soundLevel` | ESP1 mic GPIO 35 publishes level; ESP2 switches spotlight relay 19 at level >50 when both flags are true | Firmware capability exists, but full Event Mode is unavailable. No fake sound meter/spectrum or claim of Pool/audio synchronization. Physical mic calibration remains unverified. |
| KTV Request Open / Close | `ktvOpen` / `ktvClose` → `ktv/target` = open/closed | ESP1 `readFirebaseCommands()` around 296 → servo pin 13, positions 0/90 | Retained with fresh ESP1 and explicit visual door clearance. Target is not door readiness. |
| KTV Hall-confirmed readiness | Fresh `ktv/hallOpen` | ESP1 `readSensorsAndSync()` around 372, Hall pin 34, active-low | True = Hall confirmed; false = Not Hall-confirmed; absent/stale = Unknown. Never inferred from target/command acknowledgement. |
| KTV Off / Party cycle | `ktvOff` / `ktvParty` → `ktv/lightMode` off/party | ESP2 `readLightingState()` at 302, digital RGB pins 25/27/32 | Retained with fresh ESP2. These are requests; no brightness or continuous RGB claims. |
| KTV static RGB draft / Request static RGB | Draft R/G/B checkboxes; `ktvStatic` PATCH `ktv` with `lightMode: static` and `light/r`, `light/g`, `light/b` booleans | ESP2 `readLightingState()` reads those booleans and drives digital pins | Retained as supported digital channel requests. No color slider/dimming or physical output confirmation. |
| Main power / fixed beacon description | Static information; no command path used | User-specified current hardware: stationary **1W warm-white light powered by the physical main switch**. No matching main-battery switch or beacon motor consumer found in firmware | No web power/beacon controls. Main switch state Unknown because no verified telemetry exists. Old beacon flag is not treated as lamp power or rotation feedback. |
| Coordinated Event Mode | Unavailable; `event/mode` excluded from command allowlist | Firmware has pavilion relay / reactive binary spotlight; stage RGB, event audio and Pool RGB orchestration lack matching implementation | No activation control until coordinated operation is verified. Manual relay diagnostics above remain separate. |
| Pool RGB / brightness / effects / bridge | Unavailable; no commands offered | ESP2 Pool reader only handles pump. No matching RGB driver, dimming/effect subscriber or separate bridge output found | Removed, not simulated as supported. KTV RGB is not evidence for Pool or stage RGB. |
| Cottage lighting / allocation | Unavailable; no grouped or per-cottage controls offered on these consoles | ESP2 `checkPhysicalButtons()` only writes `cottages/c1/light`; no Cottage relay read/output mapping. ESP1 relay 33 is pathway/check-in lighting, not evidence for a Cottage circuit | Verify actual relay/load/grouping before providing any Cottage output control. No automatic cottage assignment claim. |
| Audio / volume / source switching | Unavailable; no commands offered | ESP2 `readKTVState()/updateTFTUI()/drawLyrics()` consumes song/playback for sample TFT output, but no verified audio player/volume/source consumer | Removed. TFT sample lyrics do not establish functional karaoke audio. |
| Command feedback | `send()` waits for allowlisted transport acknowledgement | HTTP/database acknowledgement, not a physical output sensor | Saving/failure/saved-request are distinct; click alone never displays physical success. |

## Removed old controls / misleading statuses

The old source is snapshotted under ignored `test-results/admin-device-before/`; findings were recorded before edits.

| Old element / function | Previous behavior / missing evidence | Cleanup |
| --- | --- | --- |
| Operational Center `updateStats()` / local ResortDB occupancy and active guest counts | Local/demo reservation stats, not hardware measurements or the shared selected-booking lifecycle | Removed from this hardware overview. |
| Operational Center `renderStatus()` system power, guest, gate target, Pool light, beacon, Event Active | Default booleans/command values/local simulation were rendered as actual states; beacon could say Sweeping | Replaced by raw source-qualified reports, request labels and fixed-beacon information. |
| Operational Center `renderLogs()` / Link activity log | Web/simulation log entries were not proof of physical execution | Removed from concise overview; new per-command feedback is explicit. |
| Diorama Overrides `syncToggle` handler | Only CSS / ARMED-STANDBY / hard-coded 14ms latency | Removed. No fake latency, sync-success, online node/mesh count or armed claim. |
| `villaBrightness`, `balconyBrightness` input handlers | Updated percentage text only; no command path | Removed. |
| `.temperature-button` (2200K/2700K/4000K) | Updated active styling/toast only; no verified tunable-white output | Removed. |
| `[data-toggle]` roofline / bridge / strobe | Toggled classes and success toasts; no matching implemented firmware outputs | Removed. |
| `[data-toggle=pump]` on placeholder page | Toast only, unlike the separate real Manual Override path | Replaced by explicit acknowledged admin-only pump requests. |
| `.pool-color` and `.radio-option` wave cadence | CSS selection/toasts; no Pool RGB/effect consumer | Removed. |
| `testChime` | Timed text/button change and “triggered” toast, not audio playback | Removed. |
| Static KTV “Live Stream”, sample track/timing/progress and 75% range | No live source or implemented volume handler/audio output | Removed along with unavailable playback/source UI. |
| `.beacon-options button` (2.5 / 4.2 / 6.0 RPM), sidebar Sweeping text | Styling/text/toast only; no implemented beacon RPM motor reader, inconsistent with current stationary light | Removed. |
| `simulateKeycard` | Timed “Verified” handshake toast for a sample cottage, not trusted RFID evidence | Removed; no check-in or facility unlocking side effect is added. |
| `releaseControl` | Removed active CSS and displayed standby-success toast; no hardware release operation | Removed. |
| Manual Override `gateAutoSwitch` | Wrote `gate/auto`, but ESP1 IR auto-open is unconditional and does not read that flag | Removed rather than claim it disables firmware safety behavior. |
| Manual Override `powerSwitch` / `beaconSwitch` | Wrote `system/power` / `beacon/on` without matching physical power/beacon output consumers | Removed from route and command allowlist. |
| Manual Override gate/car/pump actions | Real paths, but local-role checks and no working explicit clearance validation in that controller | Moved to the trusted common console with fresh-data/clearance guards. Firmware behavior is preserved. |

## Safety and remaining hardware checks

1. **Gate clearance:** firmware writes `gate/state` before servo travel; `isGatePhysicallyOpen` is only a local firmware variable and is not independent remote limit-switch telemetry. The revised web requests require an operator to visually confirm clearance per request, plus fresh IR and stopped-motor reports where relevant. This is not a new physical safety interlock. Verify real gate limits/travel, IR polarity/placement, obstruction handling and motor-direction clearance before bench/live operation.
2. **Motor:** source maps TB6612/shared relay/PWM, but physical forward/reverse polarity, stop/brake behavior and the shared relay circuit were not tested. Firmware itself does not enforce every web clearance condition; local buttons/automatic behavior remain unchanged.
3. **KTV:** verify door linkage, Hall mounting/polarity/readiness and clearances. Hall confirmation, not command echo, is the supported readiness source.
4. **Pump / event relays / KTV RGB:** verify actual connected loads, relay polarity and flashed firmware match the pin map. These are source-supported outputs, not measured output confirmations.
5. **Event coordination:** verify stage RGB wiring/driver, actual audio integration, Pool RGB/effects and coordination before enabling an Event Mode control.
6. **Cottages:** identify the actual relay pin(s), whether four cottages share one relay/circuit, connected loads and corresponding firmware consumer. A logical `c1/light` button write is insufficient evidence.
7. **Audio and beacon:** verify real audio hardware/protocol/catalog/volume/source feedback separately. The fixed beacon remains physical-switch-only per the current hardware description; no motor/RPM behavior is assumed.
8. **Device-project authorization:** verify the separate device database's deployed access policy / trusted command authorization before live command testing. This task does not deploy or broaden its permissions.

## Exact files changed

Application:

- `admin-dashboard.html`, `diorama-control.html`, `manual-override.html`
- `js/admin-dashboard.js`, `js/diorama-control.js`, `js/manual-override.js` (common-controller bootstraps)
- `js/admin-device-console.js` (new)
- `js/admin-device-transport.js` (new)
- `css/admin-devices.css` (new, scoped; reuses existing Master Reservations base CSS)

Verification / documentation:

- `tests/admin-devices.test.cjs` (new)
- `tests/isolated-facility-ports.cjs` (include the new suite in the existing private-port adapter)
- `package.json` (`test:admin-devices` command)
- This report, `ADMIN-DEVICE-CLEANUP.md`.

No changes to firmware, `js/firebase-config.js`, `js/diorama-link.js`, shared-reservation Auth/rules/configuration, guest access guards, guest facility controllers, or `tests/serve.cjs`. Old page CSS is no longer loaded by these entry points; it was not deleted or rewritten.

## Verification actually run

All **24 groups passed**:

| Suite | Passing groups |
| --- | ---: |
| New admin device console / real transport unit checks | 6 |
| Guest facility pages | 6 |
| Existing Phase 2C.2 access/command-denial regressions | 12 |

The admin suite was additionally rerun after extending positive checks to gate open/close, reverse, KTV close, PWM, and synthetic stale-heartbeat rejection. Tests verify:

- Named Auth administrator access; guest/signed-out denial despite forged local flags, on all three routes.
- No device-transport initialization before trusted authorization; sign-out revocation; UID binding; real Preview transport rejecting writes.
- Raw missing values = Unknown, no default seed/simulation/optimistic state; Online after observed heartbeat change; Offline only after timeout; disconnected = Unknown; Hall-based readiness.
- Allowlisted supported paths, failure feedback, acknowledged request messaging, no physical success inference, busy/repeated-click protection, payloads for pump/relays/door/digital RGB/motor/PWM.
- Clear IR/open gate report/stopped motor/one-use visual clearance, reactive spotlight ownership, stale-heartbeat synthetic-action rejection, Stop exception.
- Desktop 1440px, mobile 390px and 720px reflow: 16px body, at least 14px controls, wrapping and no horizontal page overflow. Mobile rendering was visually inspected at `test-results/admin-device-mobile.png` (fake test data, not physical measurements).
- Port 5001 still rejects override/manual/device scripts; its existing `admin-dashboard.html` redirect to Master Reservations is preserved.
- Guest facility pages remain read-only, selected-reference/ownership/status/package boundaries work, and separate existing administrator facility tests use fake transport only.

The real transport module was unit-tested in a VM with fake Firebase/network primitives, including permission failures and no optimistic data mutation. Browser tests used real demo Auth and replaced device transport with a fake; no real device project request or command was sent. Emulator previews also exercised the real factory's read-only branch. Tests ran on private Auth/RTDB/web ports through the existing test adapter, leaving the active port-5000 preview and its booking fixtures intact. Syntax and Git whitespace checks passed.

Repeat in PowerShell, with Node/Java/Chrome available:

```powershell
$env:CHROME_PATH = 'C:\Program Files\Google\Chrome\Application\chrome.exe'
npm.cmd run test:admin-devices
```

No physical hardware behavior, live deployed device rules or real-phone operation was confirmed. Responsive checks were browser viewport/reflow checks, not a physical zoom-key or real-phone test.

## Local read-only preview

Use the existing emulator web server:

- Operational Center: `http://127.0.0.1:5000/admin-dashboard.html`
- Diorama Overrides: `http://127.0.0.1:5000/diorama-control.html`
- Older Manual Override alias: `http://127.0.0.1:5000/manual-override.html`

Sign in to the demo emulator as `administrator@example.test` / `TestPass123!` (the emulator seeder provides the trusted claim; frontend credentials/local role flags do not). If the preview is not already running, `npm.cmd run preview:guest-dashboard` starts the existing demo Auth/RTDB/web preview and seeds its accounts. Do not start a second process on occupied preview ports.

These emulator pages show **Preview**, Unknown readings and disabled requests; no device configuration or live project is loaded. No query parameter enables real commands. Hard-refresh existing port-5000 pages to load the new files; **no server restart is needed** because the route/server implementation did not change. Port 5001 remains reservation-only, not a device preview.

No Firebase deployment, permission change, firmware update or physical command was performed. Hardware and authorization checks above remain prerequisites for a separately scoped live test.
