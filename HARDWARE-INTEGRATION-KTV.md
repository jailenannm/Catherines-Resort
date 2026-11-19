# Hardware integration readiness and Lighthouse karaoke

## Result and evidence boundary

The software work below is implemented and locally tested. **No feature is Bench verified in this pass.** No new confirmed wiring/scan output, ESP3 implementation, approved audio, audio mixer/amplifier route or physical result was supplied. No firmware was flashed, live cloud endpoint/rules deployed, device command issued or live booking created.

Reviewed `ADMIN-WORKFLOW-AUDIT.md`, `ADMIN-DEVICE-CLEANUP.md`, `GUEST-FACILITIES-SIMPLIFICATION.md`, `RFID-AND-PUBLIC-HEADER.md`, both current production firmware sketches and the Serial test. Their pin definitions establish source mappings, not proof of installed wiring.

## Feature checklist

Paths in this table are in the separate device project's `/diorama` root unless explicitly shared reservations. A Firebase write acknowledgement is **request accepted** only. Device acknowledgement requires a correlated device-produced receipt; physical result requires an appropriate sensor/measurement or operator observation. Current firmware has no general request-ID acknowledgement protocol.

| Feature / classification | Current UI and server authorization | Command / firmware / output / feedback | Blocker and operator bench check |
| --- | --- | --- | --- |
| Entrance and car — Software tested; physical operation Blocked | Overrides `AdminDeviceConsole.send`, trusted admin, fresh heartbeat/read, clear IR, stopped motor, one-use clearance. Admin needs no guest booking. Device-project server permissions remain separate. | `gate/target`, `car/command`, `car/speed`; ESP1 `readFirebaseCommands`, `readSensorsAndSync`, `openGatesSlowly`; servos12/27, TB6612 GPIO25/26/PWM32, IR21. `gate/state` is firmware intention published before completed travel; `car/state` is motor report, not position. | Verify actual wiring, current device rules and supervised travel/Stop. First obstruct the IR in a clear isolated travel area; confirm the existing IR flow opens the gate. Separately request motor Stop/Forward/Stop in Overrides only after clearance. Observe motion; do not infer car exit from clear IR. No car limit-switch publisher exists. |
| Authenticated RFID check-in — Software tested; live ingress Blocked | Existing server `createCheckInVerifier` plus new `createSignedRfidCheckIn`; exact assigned UID/index/Confirmed record; atomic receipt/status transition. Direct browser check-in remains forbidden. | Reader SS5/RST22, classic SPI18/19/23. New production `checkNFC` prints full uppercase UID only. Trusted server would update `/sharedReservations` + `/verifiedCheckins`, never a gate or device flag. | Next physical test: repeat one card at least five times using the isolated Serial sketch at115200; send byte count/full UID. Then provision authenticated reader transport, per-reader secret, trusted time and immutable event IDs. No reader sender/endpoint is deployed. Installed firmware still has the old bypass until operator flashes the reviewed source. |
| Pathway lights — Blocked | Guest pages read-only; no new guest command. No authorization should be inferred from legacy `guest/checkedIn`. | ESP1 `readFirebaseCommands` consumes legacy `guest/checkedIn` to drive active-low GPIO33. It is not a trusted shared booking signal or standby sequence. | Verify relay/load/polarity separately with actuator power isolated. Replace legacy access-flag ownership and define standby vs checked-in lighting before enabling any web command. |
| Grouped cottage lights — Blocked | Guest Cottage reports unavailable; no fabricated assignment or color control. | ESP2 button26 writes `cottages/c1/light`, but no matching grouped-four output consumer or relay map exists. | Supply actual four-cottage relay/output wiring and consuming firmware; bench-test the intended group on/off before adding commands. Do not repurpose pathway relay based on assumptions. |
| Pool — Software tested pump request; guest RGB Blocked | Admin Overrides pump retained. New server policy keeps pump admin-only, independent of guest booking. Guests have no pump command. | `pool/pump`, ESP2 `readPoolState`, relay16. Saved bool is a request, no flow/relay feedback. No Pool RGB/brightness/effects/bridge-light consumer. | Candidate first simple relay test: confirm relay16 and actual low-voltage test load/polarity with operator first. Then request On/Off in safeguarded Overrides and record request ACK, any device report and observed load separately. Without confirmed wiring this is a candidate, not a verified end-to-end output. |
| Event Mode — Blocked | Coordinated Event Mode stays Unavailable; individual admin relay diagnostics remain Advanced only. | ESP2 `readEventState`: pavilion33 and spotlight19; mic level from ESP1 can drive binary spotlight above50. No stage RGB, Event player, Pool RGB coordination or verified shared-speaker owner. | Bench-test each relay separately, then provide stage/pool RGB and audio hardware/firmware. A sound level is not beat detection. Full sequence must remain unavailable until all outputs/arbitration are measured. |
| KTV — Software tested browser preview and command policy; physical audio Blocked | Owned Checked In KTV/buyout booking required for guest picker. Server core rechecks booking on every authorization, requires fresh Hall and exclusive audio owner. Admins use supported diagnostics without guest booking. | ESP1 servo13/Hall34 (`ktv/target`, `ktv/hallOpen`); ESP2 `readLightingState`: digital RGB25/27/32; `readKTVState`/`drawLyrics`: TFT status/sample rendering. No verified DFPlayer/audio/volume/source consumer. Browser player issues no device writes. | Verify Hall polarity/door readiness first. Candidate guest output is one static KTV digital channel only after installed wiring/driver is confirmed. Speaker/mic integration and audio ownership are missing. Legacy unsupported audio/volume/pulse/beacon actions are now disabled; TFT is not a verified synchronized lyrics player. |
| Checkout — Blocked | No new checkout transition, card release or guest exit command. | No trusted complete shared checkout/exit/card-release/standby coordinator or car-exit feedback. Legacy flags are insufficient. | Define transactional lifecycle, card reuse, exit sensors and safe return-to-standby; bench-test supervised exit independently before automatic checkout. |

### Controllers

- ESP1 source: entrance mechanics, RFID, IR, KTV servo/Hall, raw mic, LCD and pathway relay. It is not evidence of car docking Hall sensing.
- ESP2 source: pump/pavilion/spotlight relays, digital KTV RGB and TFT. Cottage button writes do not establish a cottage output. It contains no verified audio module integration.
- ESP3: **Not integrated / Blocked**. No third firmware, authenticated identity, pin map or state publisher exists in this checkout. Supply its actual role and wiring before assigning it any output.
- Beacon: stationary1W warm-white physical-main-switch light per supplied build description; no web rotation/power feature.

## Implemented trusted software path

`scripts/signed-rfid-check-in.cjs` is a server-only HMAC-SHA256 scan verifier. Canonical signed bytes are UTF-8 JSON of `[readerId,eventId,uid,byteCount,observedAt]`. It requires an allowlisted reader key (at least32 bytes), exact uppercase 8/14/20-character UID, matching4/7/10 byte count, unique event ID and a signed UTC observation no older than15 seconds (future times denied). It uses constant-time signature comparison, rejects conflicting event identities and passes server-resolved authenticated scans into the existing atomic check-in verifier. Keys must stay in a trusted server/device provisioning store, never frontend code, Git, logs or chat. The test key is explicitly synthetic.

This is a prepared ingress library, **not a deployed authenticated reader**. A reviewed HTTPS receiver, secret provisioning/rotation, device signing implementation, trusted time/rate limiting and durable ingress identity need integration. A cloned UID is not a cryptographic card credential. The receipt logic prevents a second booking transition; no card scan causes a gate request.

Production `ESP1_Mechanics.ino/checkNFC` now preserves leading zeros and has no Firebase writes, welcome/check-in side effects or `openGatesSlowly` call. The IR gate flow is unchanged. This source change does not remove the bypass from already-flashed hardware. Do not claim physical access enforcement until the operator flashes and tests the reviewed program. Other legacy `guest/checkedIn` consumers remain deferred and must not be used as trusted access.

`scripts/facility-command-service.cjs` is a server-only policy core. Injected `verifyIdToken` must verify Firebase token signature/project/audience/expiry/revocation and trusted admin claims. Injected booking reads must use the current shared reservations project. Guest requests re-read owner, exact Checked In status and package; Event version2 includes Pool, legacy Event retains its meaning. Pump remains admin-only. Candidate KTV static digital RGB is the only guest command shape prepared, not enabled. The final server check runs immediately before submit. No browser reference/flag grants authority.

Integration flags default disabled and no transport exists by default. A future transport must durably deduplicate UID+request ID+payload, reauthorize at worker execution, and bind device receipts to request IDs. The fake transport tests that contract; it is not an implementation of a live queue/worker. Server authorization at request time alone does not solve revocation after queuing or guarantee physical execution.

The core returns `requestAccepted:true`, `deviceAcknowledged:false`, `physicalResultConfirmed:false` only after transport acceptance. It does not claim device ACK or physical state. KTV requires trusted server telemetry fresh within3 seconds; browser-supplied Hall/audio flags are not server data. Missing/disconnected/stale controller state blocks commands. Admin entrance movement continues through existing Overrides clearance/IR/Stop safeguards; this new core does not introduce a gate/motor API or bypass them.

Cross-project device authorization is still a deployment dependency: the reservations project's Auth claim cannot automatically authorize a device-project RTDB connection. Do not open device rules for browser guest commands. No rules/deployed config were changed here.

## Browser karaoke

`js/ktv-preview.js` mounts only in the selected eligible guest KTV page through `ControlShell`. It provides searchable approved local catalog entries, title, Play/Pause/Stop, status and text-only timed lyrics driven by actual `audio.currentTime` (including pause/resume/seek). Existing branding/cards/fonts/navigation and selected booking reference remain. Guest physical commands remain disabled.

Play requires a fresh server-issued readiness lease for the same reference. The browser posts its Firebase bearer token/reference to same-origin `/api/ktv-preview-readiness`; a future server adapter must call the implemented policy's `readiness`. The static preview intentionally has no such endpoint, so it shows Unknown/unavailable and cannot claim Hall readiness. A lease lasts at most3 seconds; polling is every1 second, with access/expiry checks every250ms. Access loss, unknown/closed/stale Hall, failed verification or Event/unknown audio owner stops/blocks playback without automatic restart. Stop remains local and needs no device authorization. This is bounded polling, not an instantaneous physical interlock.

No approved audio/timed lyrics were found; `assets/ktv/catalog.json` is empty. `assets/ktv/README.md` specifies the exact required backing track, cue JSON and catalog format. Automated media is a generated muted4-second WAV tone served only inside tests. No sample song metadata is presented as installed karaoke media.

### Physical audio route still needed

Provide the audio module/model, amplifier and speaker wiring/ratings, browser audio connection if intended, microphone/preamp/mixer route and Event/KTV switching hardware. A possible **unverified proposal** is browser line/USB audio into a real mixer, microphone through its proper mic preamp into the same mixer, then amplifier/speakers. The ESP microphone ADC used for sound level does not mix the singer into the backing track. Do not wire a speaker or mic directly to a GPIO as an audio solution.

The policy conservatively requires exclusive `audioOwner:'ktv'` from a trusted coordinator; `event` or Unknown blocks KTV. There is no verified owner publisher, physical switch or Event stop/duck integration yet. Do not connect preview to shared speakers until arbitration/muting is verified. The browser shows timed lyrics; the TFT remains status/sample-rendering only. No physical volume/source switch was added.

## Verification and repeat commands

Run from the repository with its existing Node/Java/Chrome toolchain:

```powershell
node tests/hardware-integration.test.cjs
node tests/ktv-preview.test.cjs
& .\node_modules\.bin\firebase.cmd emulators:exec --only auth,database --project demo-catherines-reservations --config firebase.facility-tests.json 'node --require ./tests/isolated-facility-ports.cjs tests/public-guest-regression.cjs phase2c1 admin-devices guest-facilities'
```

- Hardware software tests: signed/leading-zero UID, bad signatures/readers/count/staleness, replay/concurrent receipt, unknown/pending card, owner/status/package denial, admin pump without booking, Hall/audio freshness/arbitration, duplicate request acceptance, rejected writes/default-disabled integration, and production NFC source has no gate/Firebase bypass. Fake stores/transport only.
- KTV browser tests: actual muted synthetic WAV playback, selection/search, pause/resume/stop, media-clock timed lyrics/seek, missing audio/catalog, closed/stale Hall, Event owner, lost status/package/sign-out, desktop/mobile fit. The test media route implements byte ranges; without range support the test exposed a seek fixture limitation that was corrected. A Stop/media error clears lyrics rather than displaying a stopped cue.
- Emulator regressions cover existing trusted check-in/rules/ownership/status rendering and admin safeguards; guest facility regressions retain physical read-only boundaries and restricted port5001. Tests use isolated ports, not the existing5000 preview. The guest regression was adapted for a second KTV card/local media controls; physical controls remain prohibited.

Actual results: both new software/browser suites passed; the emulator check-in suite passed9 groups, admin-device suite passed6 groups and guest-facility suite passed6 groups (**21 emulator regression groups across runs**). The initial guest layout assertion assumed one card and was updated for the new second KTV card, then that suite passed. Syntax and whitespace checks also passed.

Physical output, complete Arduino build, speaker/mic operation and live reader/server/device authorization are **pending**, not test passes.

## Changed files

- `scripts/signed-rfid-check-in.cjs`, `scripts/facility-command-service.cjs` (new server-only cores).
- `esp32_firmware/ESP1_Mechanics/ESP1_Mechanics.ino` (full UID diagnostics; remove NFC bypass only).
- `js/ktv-preview.js` (new local player), `ktv.html` (script wiring), `js/control-shell.js` (eligible local player lifecycle/capture exception only), `css/guest-facilities.css` (scoped player styles).
- `js/ktv.js` (disable unsupported legacy physical audio/volume/pulse/beacon actions and simulated lyric completion writes; retain supported admin diagnostics).
- `assets/ktv/catalog.json`, `assets/ktv/README.md` (empty approved-media catalog and required files).
- `tests/hardware-integration.test.cjs`, `tests/ktv-preview.test.cjs` (new); `tests/guest-facilities.test.cjs`, `tests/isolated-facility-ports.cjs` (regression fixture/layout/private-port support).
- `HARDWARE-INTEGRATION-KTV.md` (this report).
- `esp32_firmware/RFID_Serial_Test/README.md` (historical-audit note pointing to the new production-source bypass removal; installed firmware remains unmodified).

The web files need a hard refresh; no existing static-server route was changed. No rules publication or cloud deployment is included. Port5001 remains reservation-only. For a real owned checked-in KTV booking the normal page remains `http://127.0.0.1:5000/ktv.html?reservation=YOUR_OWN_REFERENCE`; media/readiness stay unavailable until the dependencies above are supplied. Do not manufacture a live booking/check-in for this preview.
