# Admin workflow audit and implemented cleanup

## Scope and evidence

Reviewed the current pages, handlers and both checked-in firmware sketches against `ADMIN-DEVICE-CLEANUP.md` and `GUEST-FACILITIES-SIMPLIFICATION.md`. Existing local edits were retained. No physical behavior was bench-tested: “implemented” below means source evidence, not physical verification. The stationary 1W warm-white beacon powered by the physical main switch is the supplied build description. ESP3, remaining lighting/audio, checkout and live trusted RFID integration are planned or unverified.

The earlier audit's command-by-command matrix in `ADMIN-DEVICE-CLEANUP.md` remains applicable. This report records the additional cleanup, including Sensors and every former demo step.

## Page decisions

| Page | Decision and resulting behavior |
| --- | --- |
| Operational Center (`admin-dashboard.html`) | Simplify to read-only connectivity, entrance gate/motor reports and a compact Sensors section. Move pump/pavilion/spotlight request values beside their Override actions. Remove the repeated unavailable-capabilities grid. One transport/Preview notice. Missing/stale readings are Unknown. |
| Master Reservations (`admin-reservations.html`) | Keep working list, reference/date/status/facility filters, details, approval, RFID assignment and CSV. Only align sidebar links and hide unavailable Sensors navigation in restricted cloud-test mode. Hardware diagnostics remain elsewhere. |
| Diorama Overrides (`diorama-control.html`) | Keep supported request actions grouped as Entrance, KTV and Relay diagnostics. Replace repeated monitoring cards with a short connection/authorization summary. Move motor PWM and individual pavilion/spotlight tests into collapsed Advanced Diagnostics. |
| Manual Override (`manual-override.html`) | Keep old URL using the same console, trusted access checks, command allowlist and safeguards as Diorama Overrides. |
| Sensors (`sensors.html`) | Merge real readings into Operational Center. Old URL replaces itself with `admin-dashboard.html#sensors`, whose existing trusted-admin guard controls access. Keep a fallback link; no telemetry simulator remains. |
| Demo (`demo.html`) | Replace automated runner with an authenticated, informational six-stage Demo Walkthrough. Ordinary anchor navigation only; no booking/device APIs, timers, calibration, replay/loop or fake emergency stop. |

All retain Master Reservations' font families, palette, readable sizes, cards and navigation. Desktop, mobile and narrow reflow checks cover all six routes.

## Current metrics and controls: source trace and decisions

Console entry points call `AdminDeviceConsole.start(false/true)` in `js/admin-device-console.js`. Its `accountChanged`, `render`, `health`, `fresh` and `send` functions handle identity, readings and requests. `js/admin-device-transport.js` supplies `create`, subscription, `refresh` and `send`. All device paths below belong to the existing separate device project under `/diorama`; reservation Auth still uses named app `shared-reservations`.

| Feature | Data/handler and firmware evidence | Decision / limit |
| --- | --- | --- |
| Auth, Sign In, Sign Out | SharedReservations identity/watch/signOut; console `accountChanged`; walkthrough `js/demo.js` identity generation guard | Keep trusted `admin: true` claim requirement. Legacy local flags cannot grant access. Sign-out hides content and closes console transport. |
| Database connection | Transport `.info/connected` subscription | Keep as database connectivity, not proof a controller is powered. |
| ESP1/ESP2 presence and signal | `status/esp1` and `status/esp2` heartbeat/RSSI; each firmware `loop` publishes about every 3 seconds | Keep. Observe a heartbeat counter change before Online. Previously observed change older than 15 seconds while connected yields Offline; missing baseline, disconnected, Preview or stale values yield Unknown readings. |
| ESP3 | No third sketch, publisher or role mapping in checkout | Show Not integrated. Do not invent a role or advertise three online controllers. |
| Gate report / IR | ESP1 `readFirebaseCommands`, `readSensorsAndSync`: `gate/state`, `gate/irBlocked`; servos GPIO12/27, IR21 | Keep reports. Firmware writes gate state before servo completion; not independent position/clearance confirmation. IR obstruction also triggers gate opening in source. Clear IR does not prove full car exit. |
| Motor report | ESP1 `readFirebaseCommands`: `car/state`; TB6612 direction GPIO25/26, PWM32 | Keep as firmware motor report, not measured travel or docking. No integrated car limit-switch publisher found. |
| Hall-confirmed KTV readiness | ESP1 `readSensorsAndSync`: `ktv/hallOpen`, Hall GPIO34 active-low, KTV servo13 | Keep. Hall belongs to KTV readiness, not a shuttle docking station. |
| Microphone | ESP1 `readSensorsAndSync`: `event/soundLevel`, analog GPIO35 mapped to 0–100 | Keep raw mapped level in Sensors. Not calibrated dB or beat detection. Missing/out-of-range/stale = Unknown. |
| Gate requests | Console `send`: `gate/target` open/closed; ESP1 `readFirebaseCommands` | Keep in Overrides with existing freshness, stopped-motor, IR and one-use visual-clearance safeguards. Saved request is not physical completion. |
| Motor Forward/Reverse/Stop and PWM | `car/command` forward/backward/stop; `car/speed` integer 0–255; ESP1 consumer above | Keep real Stop in main Entrance group. Move PWM to Advanced. Travel requires open gate report, clear IR, stopped motor and visual clearance. Stop retains its existing exemption from clearance/heartbeat, but requires Auth, connection and a fresh read. |
| KTV door | `ktv/target` open/closed; ESP1 consumer | Keep visual-clearance/freshness checks. Request acknowledgement never sets Hall readiness. |
| KTV digital RGB | `ktv/lightMode` off/party/static and static `ktv/light/r,g,b`; ESP2 `readLightingState`, GPIO25/27/32 | Keep supported channel booleans and party cycle. No brightness, arbitrary RGB intensities or audio claims. |
| Pool pump | `pool/pump`; ESP2 `readPoolState`, relay16 | Keep admin-only relay request. Display request value, not independent pump feedback. No pool RGB/effects/brightness or separate bridge-light command consumer found. |
| Pavilion / stage spotlight | `event/hallLight`, `event/stageLight`; ESP2 `readEventState`, relays33/19 | Move to Advanced Diagnostics. Manual stage requests remain blocked during firmware reactive mode. Spotlight is binary sound-level-reactive relay when mode/reactive are active, not stage RGB. |
| Coordinated Event Mode | No complete pavilion + stage RGB + event audio + pool-effect consumer | Unavailable. Individual supported relays and pump do not establish the coordinated experience. |
| Cottage / pathway | ESP2 `checkPhysicalButtons` writes `cottages/c1/light`, but no corresponding cottage output consumer/grouped-four wiring confirmed. ESP1 pathway relay33 follows legacy `guest/checkedIn` | No cottage or standby LED control added. Physical standby entrance LEDs remain Pending integration; pathway source is not proof of intended standby behavior. |
| Fixed beacon / web main power | No verified web consumer for fixed beacon or main battery switch; ESP2 button writes `beacon/on` only | Describe fixed beacon once on Operations; no power/beacon switch, motor or RPM claim. Demo references physical standby only. |
| Audio / TFT | ESP2 `readKTVState` and `drawLyrics` render display/sample lyrics; no verified playback/volume/source consumer | Omit unsupported audio controls and claims. Display rendering does not establish an audio integration. |

Every console request remains serialized, strictly allowlisted and rechecks the shared admin identity before dispatch. Success says the request was saved and physical action is not confirmed. Emulator transport is genuinely read-only Preview and does not load the live device configuration. Failed requests remain failures, never optimistic output changes.

**Authorization boundary:** device Firebase remains a separate project. The reservations admin claim gates this UI but cannot by itself enforce authorization in the device project's database. Existing device rules remain authoritative; cross-project trusted command authorization is not certified by these emulator/fake-transport checks. No device rules were changed.

## Removed Sensors claims

The previous `js/sensors.js` `updateTelemetry`, `runTelemetrySimulation`, `addLog` and JSON-dump handler generated random/timed telemetry or literal samples. The old page's node cards and filters changed presentation only.

| Former feature | Classification and decision |
| --- | --- |
| Nine-node mesh, sync counters, gateway identity/uptime/MAC, ping, packet loss and update rates | Simulated/hard-coded; remove. Only two controller publishers exist. |
| Serial stream, pause/clear controls, ESP-NOW ACKs and fabricated JSON dump | Timed sample log, not a device stream; remove. |
| Sample RFID transaction/raw UID, RF carrier and shuttle station | Sample/unverified; remove. ESP1 legacy NFC is not a trusted shared check-in or station sensor. |
| Rotating beacon, stepper and RPM | Unsupported and inconsistent with supplied stationary beacon build; remove. |
| Climate charts, DHT22/BMP280 values, lux, INA219 voltage/current, power rails, fault counts and water percentages | No matching checked-in publisher/wiring evidence; remove. |
| Entrance IR, KTV Hall, controller heartbeat/RSSI and raw mic level | Source implemented; move to compact Operations monitoring with freshness and accurate labels. |

## Every former demo step

Old `js/demo.js` used a local step array, `renderSteps`, `activateStep`, `handleActiveAction`, `startTimer`/`updateTimer`, intervals and toast actions. These were simulated presentation, not confirmations from firmware.

| Old step | Audit and decision |
| --- | --- |
| 1 Dawn pathway PWM | No matching PWM output; remove automation. Physical standby description replaces it; entrance LEDs Pending integration. |
| 2 Gate and welcome chime | Gate servos exist in ESP1, chime/DFPlayer not verified. Move gate explanation to arrival; remove chime claim. |
| 3 Shuttle station / Hall docking | Actual driver is TB6612, Hall is KTV and no car docking limit exists. Remove station claims; explain IR and supervised safe travel. |
| 4 Cottage 1/2 welcome pulse | Output/color sequence unverified; remove. |
| 5 Cottage 3/4 balcony fade | Output/fade unverified; remove. |
| 6 Shoreline amber cascade | No matching consumer; remove. |
| 7 Pool wave / pump / electrical values | Only pump relay is source-supported; retain pump diagnostic in Overrides. Remove wave, PWM and electrical-value claims. |
| 8 Bridge LEDs | Separate controllable output unverified; remove. |
| 9 Pavilion chandelier / dual SSR | One hall relay exists, not verified dual-SSR choreography. Move individual hall test to Advanced. |
| 10 DMX stage RGB | Only binary stage relay is evidenced; remove RGB/DMX runner. Keep separate Advanced relay diagnostic. |
| 11 KTV audio / optical prism | Unsupported playback/rotation; remove. Walkthrough explains Hall readiness instead. |
| 12 NEMA17 beacon 4.2 RPM | No consumer and conflicts with fixed build; remove. |
| 13 10W sweeping beacon | Conflicts with supplied stationary 1W beacon; remove. |
| 14 Fourteen-channel symphony | No matching coordinated implementation; remove. Event Mode remains unavailable. |
| 15 Finale / automatic standby | Checkout/exit/card release/standby integration unverified; replace with informational Pending integration stage. |

The replacement order is physical power/standby → reservation/admin confirmation → car arrival/IR gate → assigned RFID check-in → reserved facilities → checkout/safe exit/standby. Current Celebration Event Package includes Event Place, Swimming Pool and Stage Band. Legacy package boundaries remain unchanged. Live RFID check-in stays disabled: ESP1 `checkNFC` concatenates unpadded UID bytes, opens a gate and writes legacy `guest/checkedIn=true`; it does not verify ownership/full assigned UID in shared reservations. The walkthrough neither invokes it nor treats it as trusted evidence.

The fake Emergency Stop System only stopped the old UI runner. It is removed, along with calibration, timer/progress, replay/loop and fake serial sync. Real admin motor Stop remains in Overrides.

## Changed files in this task

- Pages: `admin-dashboard.html`, `admin-reservations.html`, `diorama-control.html`, `manual-override.html`, `sensors.html`, `demo.html`.
- Controllers/styles: `js/admin-device-console.js`, `js/admin-reservations.js`, `js/control-shell.js` (admin navigation only), `js/sensors.js`, `js/demo.js`, `css/admin-devices.css`.
- Verification: new `tests/admin-workflow.test.cjs`; adapted `tests/admin-devices.test.cjs`; isolated test routing in `tests/isolated-facility-ports.cjs`; new `test:admin-workflow` script in `package.json`.
- Report: `ADMIN-WORKFLOW-AUDIT.md`.

No firmware, shared reservation rules, deployed configuration, device transport implementation, guest facility controls or port-5001 server allowlist was changed.

## Verification actually run

`npm.cmd run test:admin-workflow` passed all **25 test groups**: admin-workflow 6, admin-devices 6, master-reservations 7, guest-facilities 6. Tests use private Auth/RTDB emulators, isolated browser sessions and fake device transport. They preserve the existing port-5000 preview processes/data.

Coverage includes trusted-admin access and guest/signed-out denial despite local admin flags; initial/missing/stale/Offline readings; raw microphone range/freshness; unchanged command allowlist, clearance/Stop, failures and acknowledgement semantics; both override URLs; old Sensors redirect and guarded section; six-stage navigation with no device transport and unchanged database contents; sign-out; Master Reservations filters/details/approval/RFID/CSV; guest read-only/package access regressions; restricted port-5001 device/script denial and hidden unavailable navigation. No test sent a real email, live device request or live booking write.

Browser layout assertions and generated screenshots cover desktop 1440px, mobile 390px and narrow 720px reflow. Reviewed the rendered mobile Operations/Walkthrough and desktop Overrides screenshots; controls/text wrap without page overflow. Screenshots are under ignored `test-results/admin-workflow-*.png`. JavaScript syntax and `git diff --check` were also checked.

## Preview and remaining physical checks

Use the existing emulator preview at:

- `http://127.0.0.1:5000/admin-dashboard.html`
- `http://127.0.0.1:5000/admin-dashboard.html#sensors`
- `http://127.0.0.1:5000/diorama-control.html`
- `http://127.0.0.1:5000/manual-override.html` (same implementation)
- `http://127.0.0.1:5000/sensors.html` (legacy redirect)
- `http://127.0.0.1:5000/demo.html`
- `http://127.0.0.1:5000/admin-reservations.html`

Sign in with an emulator account carrying the trusted admin claim. If preview is not already running, use `npm.cmd run preview:guest-dashboard`; do not start another instance over the running preview. The server serves frontend files per request: hard refresh is sufficient, no port-5001 restart is needed. Port 5001 remains reservation-only; its admin landing redirects to Master Reservations and device/Sensors/Demo routes remain blocked.

Before physical integration: supply the third ESP's firmware/role/wiring; verify relay polarity and actual cottage/pathway/entrance LED mapping; bench-test gate travel, motor clearance and Stop; add reliable car exit evidence; verify Hall polarity/readiness; confirm raw mic/reactive spotlight behavior; document full coordinated Event RGB/audio/pool support; replace lossy/untrusted RFID payload and legacy bypass; implement trusted checkout/card release/standby; and review separate device-project server authorization. None of those were inferred from a saved command or tested on hardware here.
