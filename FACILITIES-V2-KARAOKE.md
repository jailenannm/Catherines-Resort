> Latest guest/admin permissions and IoT Control Center: see [DASHBOARD-IOT-ALIGNMENT.md](DASHBOARD-IOT-ALIGNMENT.md). It removes guest door/pump access and restricts legacy Event Stage access; older examples below are historical.

# Facilities v2, shared audio and karaoke integration

19 November 2026, Philippine time. This implementation covers **all requested subsystems in software**, with explicit simulation/commissioning boundaries. It does not declare unverified hardware operational. ESP1, existing v1 firmware, reader credentials, reservation rules, deployed site and running LAN dataset remain unchanged. No upload, live command, credential provisioning, active-data migration or running LAN service restart was performed.

## What is delivered

- **Versioned multi-facility backend:** independently authorized cottage, Event, stage, Pool, KTV door/RGB and audio requests; shared resource aggregation; signed esp2 state; idempotency; delivered-version/output acknowledgements; checkout revocation.
- **Actual guest UI:** My Facility Controls on Guest Dashboard and facility pages, selected-reference/entitlement guards, disabled commissioning states, requested/reported state, KTV readiness, searchable song library, queue navigation, playback/volume and estimated lyrics. It uses the existing named Firebase session, with backend revalidation.
- **One audio manager:** reservation owner, category, track, queue/index, volume, start/change time, pause accounting, authorization expiry, completion, conflicts and fresh receipt-driven announcements.
- **Maintainable SD catalog:** only the supplied descriptions, all unverified by default; importer validates IDs/files/categories and creates a local catalog backup before replacing it.
- **ESP2 v2 project:** signed network client, independent output/lease task, virtual drivers for all facilities, bounded lyric window/cache, portable playback clock/parser/wrapping engine, GPIO map, prepared DFPlayer frame adapter and panel-independent TFT renderer.
- **Isolated preview:** real emulator sign-in/reservation read, actual mounted backend and signed virtual ESP2. Optional synthetic media clearly identifies itself as simulation with no sound/file.

**Hardware boundary:** the v2 sketch has NO GPIO, UART or SPI dispatch. Its default is uncommissioned; simulation must be explicitly selected. Server construction rejects physical v2 capability activation until driver review. This prevents unknown relay polarity, servo endpoints or audio wiring from becoming energized merely because a UI or protocol exists. The older polarity-gated cottage sketch remains available for separately approved physical cottage commissioning. This is substantially more than cottage-only architecture, but it is **not a finished physical-driver deployment**.

## Files and preservation

New backend files:

- `scripts/facilities-v2.cjs`: authoritative state/claims, permissions, signed protocol and normalization.
- `scripts/facilities-v2-http.cjs`: authenticated v2 routes, exact-origin checks and bounded bodies.
- `scripts/facility-audio.cjs`: one non-preemptive audio owner and queue.
- `scripts/song-catalog.cjs`, `scripts/import-song-catalog.cjs`: manifest and bounded LRC validation/import.
- `scripts/preview-facilities-v2.cjs`: isolated fixture preview, never running LAN ports/database.
- `config/sd-song-catalog.json`: unverified supplied mapping.

New firmware folder `esp32_firmware/ESP2_Facilities_V2/`:

- `ESP2_Facilities_V2.ino`: v2 request/response MACs, bounded HTTP decoding, Wi-Fi reconnect, mutex-protected plan, independent20ms task, simulated applied outputs and Serial diagnostics.
- `MediaEngine.h`: estimated play/pause/resume clock, bounded LRC cue parser, timed lookup, two-row wrapping and DFPlayer packet codec.
- `PeripheralAdapters.h`: uncommissioned DFPlayer transport interface and Adafruit-compatible TFT renderer, without panel initialization or UART activation.
- `FacilityCapabilities.h`: supplied unique GPIO map, preserving the stage19/TFT distinction.
- `facilities-v2-config.example.h`, `device-sync-secrets.example.h`: no real credentials; filled files are ignored.

New frontend: `js/facilities-v2.js`, `css/facilities-v2.css`. Wired into `guest-dashboard.html`, `cottage.html`, `event.html`, `pool.html`, `ktv.html`. Existing structure, cards/photos, cream/gold/green theme and navigation remain.

Modified integration:

- `scripts/rfid-bench-server.cjs`: optional v2 handler, before the existing reader-only fallback; existing `/scan` body/signing/response logic unchanged.
- `scripts/device-sync-config.cjs`: independent v2 flag; simulation restricted to test RTDB19000.
- `scripts/serve-reservation-lan.cjs`, `tests/serve.cjs`: explicit frontend feature flags.
- `.local/lcd-restart/lan-services.cjs`: the current legacy launcher now also passes opt-in device config on a future approved restart. Existing process was not restarted.
- `js/reservation-device-controls.js`: v1 cottage panel stays intact when v2 is off; suppresses duplicate authority when v2 is selected.
- `js/ktv-preview.js`: existing local-browser preview preserved when v2 is off; v2 uses one shared player authority rather than a second browser player.
- `js/guest-dashboard.js`: commissioning/simulation guidance when v2 is enabled.
- `js/reservation-device-monitor.js`: trusted admin sees v1 ESP1/ESP2 status plus v2 requested/reported facilities/audio; no new admin actuation bypass.
- `.gitignore`, `package.json`: private header exclusion and repeatable test/preview commands.

New tests: `facilities-v2.test.cjs`, `facilities-v2-ui.test.cjs`, `facilities-media.test.cjs`, `facilities-v2-emulator.test.cjs`, `facilities-v2-preview.test.cjs`.

The earlier `ESP2-FACILITIES-INTEGRATION.md` and shared ESP2 review now link here without removing their historical evidence. `config/lyrics/README.md` explains licensed input and bounded delivery.

Pre-edit snapshots: `.local/facilities-v2-backup/2026-11-18T20-50-20-708Z/`, with additional named snapshots directly under `.local/facilities-v2-backup/`. All old ESP1/ESP2 sketches remain. No private header was overwritten and no third controller added.

## Protocol, paths and permissions

The v1 boolean contract is unchanged: ESP1 pathway, old ESP2 cottage. V2 uses **different routes and HMAC domains**, not a reinterpretation of that boolean.

| Route | Authority |
|---|---|
| POST `/device/facilities/v2/sync` | esp2 HMAC, request ID,15-second freshness, correct simulation mode |
| GET `/guest/facilities/v2/state?reference=...` | Authenticated selected booking owner, Checked In |
| POST `/guest/facilities/v2/command` | Same owner/status check plus each capability's saved entitlement |
| GET `/admin/facilities/v2/state` | Trusted administrator; monitoring only |

Commands contain `reference`, `type`, typed `value`, stable `requestId` and audio `category` when appropriate. Server intents and receipts are under **`/reservationFacilitiesV2` in the existing reservation database**, protected by the current default-deny rules. Root compare-and-set commits claims and receipts atomically; no new reservation database or rule deployment was introduced.

| Capability | Saved entitlement / semantics |
|---|---|
| `cottage_lights` | cottage or buyout; OR across eligible ON contributors, including valid legacy cottage claims |
| `event_lights`, `stage_lights` | event or buyout; independent relay requests under one Event entitlement, not separate paid facilities; no auto-ON |
| `pool_pump` | pool, buyout, or Event packageVersion2; conservative shared OR in simulation; physical operating policy still unapproved |
| `ktv_door`, `ktv_rgb` | ktv or buyout; exclusive room/resource claims; door simulation requests expire to stop after2seconds; RGB additionally requires fresh Hall readiness |
| `audio_playback` | appropriate KTV/Event entitlement, exclusive player owner; KTV additionally requires fresh Hall readiness |
| `tft_status` | device-derived status, not a guest arbitrary-text command |

Pending/Confirmed/RFID assignment alone never grants facility authority. Ownership is checked on every request; another reference cannot grant access. Legacy Event does not gain Pool; Pool-only does not gain Event/Stage/Cottage/KTV. Full buyout and existing combinations preserve their mappings. Guest facility direct visits retain the existing page guard and only show controls relevant to that page.

Checkout initiation already changes status to Checking Out. At the next reconciliation it loses guest claims/audio ownership; completion is not delayed by music. Other eligible ON contributors survive. Completed checkout announcements require the existing trusted departure receipt. Card assignment, approval, check-in and release logic were not changed.

**Date policy:** the current verifier does not enforce a booking date/time window. This task denies non-Checked In statuses but does not invent calendar expiration for an otherwise Checked In booking. A time-window policy still needs approval.

### Signed device exchange

Request MAC signs:

```text
["cblr-facilities-request-v2", deviceId, requestId, observedAt,
 ackVersion, reportJSONString, simulation]
```

Response MAC signs:

```text
["cblr-facilities-state-v2", deviceId, requestId, version,
 desiredJSONString, serverTime, validForMs, simulation]
```

Raw inner JSON strings are signed exactly; clients must not reserialize them before MAC verification. Same esp2 identity/key, separate from the RFID key, is used with domain separation. ESP1 requests remain byte-compatible with v1. Request nonce collisions with different content are rejected; identical fresh retry reuses its response. Versions persist, lower versions are refused, and a delivered version plus matching output/player report is needed for acknowledgement.

The response contains independent requested relay states, door state, RGB, player revision/track/title/state/position/volume and a bounded lyric window. GPIO/player report acknowledges application, not current sensing or acoustic output. Only simulation reports are accepted on a simulation backend; labels explicitly say **Simulation acknowledged**.

Lease maximum10seconds, adjusted for request latency/processing. The output task is separate from blocking HTTP. No fresh signed lease means virtual OFF/stop and blank lyrics. Network response sizes are bounded (health512bytes, v2 state12KB), reports2KB, request body8KB, lyric window8 cues. No signing key, token or Wi-Fi credential is logged.

## Audio manager and SD catalog

One player cannot play independent Event and KTV tracks simultaneously. The **simulation policy** is `nonpreemptive-fifo`: an existing owner continues, another guest's direct play is rejected Busy, and fresh welcome/checkout announcements queue until free. Announcements do not interrupt performances. This is an explicit test/default policy, **not approval for physical audio**. Live policy is null and playback remains disabled.

Owner state includes reference, category, track, queue/index, volume0–30, started/changed timestamps, position/pause accounting, revision and30-second authorization lease. The active guest UI renews ownership every10seconds while eligible. Playback stops/releases when status/access/readiness is revoked or lease expires. Closing/signing out without a successful stop is bounded by that lease, not assumed to revoke an issued token instantaneously. Completion uses a verified device report or a verified duration in the simulated clock. Manual Next/Previous follow the selected category queue without wrap; track end stops/releases rather than silently starting another song.

Welcome is scheduled once per fresh check-in receipt; Thank You once per fresh trusted completion receipt. Old imported receipts are recorded as considered and not replayed. Receipt deduplication prevents duplicate scan music. Only verified catalog entries can be scheduled; guests cannot directly request system announcement categories. Checkout access revocation happens before/independent of its optional audio.

### Actual catalog state

`config/sd-song-catalog.json` contains only supplied information:

| ID | Description | Status |
|---|---|---|
|0001|Welcome|Unverified file/index/duration|
|0002|Upuan|Unverified file/index/artist/duration/lyrics|
|0003|Thank You|Unverified file/index/duration|
|0004|Title not supplied; KTV category described|Unverified; no title invented|

No missing titles, MP3s, artists, song lyrics or durations were fabricated. Unknown track4 is labeled Untitled/unverified, not given a fictional title. There are no verified Event music files yet. The default UI shows unavailable tracks and disables Play until a verified matching catalog exists.

The preferred commissioning scheme is **`/MP3/0001.mp3`, `/MP3/0002.mp3`, ...** with an explicitly verified number mapping. DFRobot's official implementation uses `playMp3Folder`/command0x12 for that folder; it is different from root/copy-order playback. See the [official library source](https://github.com/DFRobot/DFRobotDFPlayerMini/blob/master/DFRobotDFPlayerMini.cpp) and [official example](https://github.com/DFRobot/DFRobotDFPlayerMini/blob/master/examples/FullFunction/FullFunction.ino). The prepared adapter also encodes pause/resume/stop/volume, but is not bound to physical UART or treated as a verified player acknowledgement.

DFPlayer is not used to enumerate filenames/artists/lyrics. There is no verified separate ESP32-readable SD interface. Inspect the actual card on a computer, inventory its exact folders/files, supply approved metadata/durations and authorized lyric files, and verify track numbers audibly before marking them verified.

Offline catalog update:

```powershell
node scripts/import-song-catalog.cjs PATH\TO\reviewed-catalog.json config/sd-song-catalog.json
```

Importer validates bounded IDs, exact matching NNNN filenames/lyric IDs, categories, duration/offset and verified MP3-folder mapping. It backs up an existing output as timestamped `.bak`. It neither edits the physical SD card nor verifies audio, uploads media or changes Firebase. Backend catalog reload requires a later approved service restart; running data is not reseeded.

## Lyrics and TFT

Place licensed/provided `NNNN.lrc` in `config/lyrics/` only after matching the catalog. None was supplied or created for real songs. Automated tests use generic `LINE_A`/`LINE_B` markers only, with no backing sound.

The backend parser handles timestamp tags, sorts cues, rejects ambiguous duplicate times, oversized content/lines and invalid seconds. Limits:64KB input,512 cues,120 UTF-8 bytes per line. Larger songs need deliberate pagination/limit review rather than silent truncation.

Only eight cues around reported estimated position are delivered in authenticated state; no whole MP3 or full-song text is held on the ESP32. Its fixed-size cache, playback clock and two-line wrapping renderer support play/pause/resume/stop/track reset. A per-song offset (±30seconds) calibrates estimated alignment; positive offset advances the displayed cue. Browser lyrics use reported position and a bounded short extrapolation, not merely the title clicked.

DFPlayer lacks precise continuous timestamps in this integration. Request latency, player startup, pause timing and oscillator drift require measurement. No perfect synchronization is claimed. Loss of lease/readiness stops simulated playback and clears lyrics; stale timing is not presented indefinitely. After expiry, a fresh playback action is required rather than silently restarting an old audio revision.

`PeripheralAdapters.h:renderTft` prepares a two-row Adafruit-compatible layout. Width comes from the supplied display; it does not assume a verified resolution/rotation. Unsupported UTF-8 glyphs become `?` in the fixed-font preview instead of splitting byte sequences; a verified font is needed for full Unicode. No physical TFT SPI initialization occurs. The old source references ST7735, but actual panel/controller/init variant, pin levels and boot behavior still need confirmation. `STATUS` prints **TFT text preview**, not a claim that the screen is rendering.

## GPIO, hardware and safe commissioning

| Component | ESP2 GPIO | Physical requirement still pending |
|---|---|---|
|Shared cottage relay|26|Per-module polarity, COM/NO/NC, resistor/load/power verification|
|Event relay|33|Polarity/driver/current verification|
|Stage relay|19|Polarity/driver; never TFT MISO|
|Pool pump relay|16|Ratings, polarity, supply/suppression and approved operating policy; no dry-run sensor claimed|
|KTV servo|14|External regulated servo supply, ground, cautious pulse calibration, clearance/hold-to-move policy; no angles guessed|
|KTV Hall|34|Input-only, safe external bias/voltage, magnetic polarity, freshness source; not occupancy sensing|
|KTV RGB|25/27/32|Rated MOSFET/driver and channel polarity; no high-current GPIO load|
|TFT|18/23/5/21/22|Controller, SPI/init, no MISO19, GPIO5 strapping behavior|
|DFPlayer|ESP TX13→module RX; ESP RX17←module TX|Levels, UART, DAC/mixer connection and actual replies|
|Microphone|35|Sensor input only; not an implementation of analog mixing|
|Reserved RX/buttons|36/39|Input-only, external pull-ups if adopted; resolve legacy RX36 before repurposing|

All planned pin roles remain separate. Old26/14/13 button assignments were not reused. The old ESP2 sketch and all ESP1 firmware remain intact. ESP1's RFID5/22/18/19/23, LCD16/17, gates14/27, buttons25/32, pathway33 and proposed IR34 are unchanged. Same pin numbers on separate boards are not conflicts. No automatic gate closing was added.

Reset/boot can float/glitch pins before firmware. A software OFF value does not prove an unknown-polarity relay safe. Isolate loads and verify module logic/supply thresholds, buck capacity, ground, drivers/protection and contact choice first. Never put12V on an ESP32 GPIO. V2's unconfigured pins have Unknown physical state, not guaranteed load OFF.

Actual audio route to verify: DFPlayer DAC→XH-M273 mixer→PAM8610→speakers; microphone→appropriate mixer input. MAX9814 ADC35 is not the mixing circuit. Replace the reported damaged speaker, verify power/levels/ground and test at a safe level before enabling an adapter. Software does not repair/verify speakers.

## Isolated manual preview and test commands

Use a separate terminal in the project. These commands target **test emulators19000/19099, web15000 and loopback backend8787**. They create synthetic fixture accounts/bookings there. They do not use or reset the running LAN29000/29099 database. If a test port is occupied, stop and identify that test process; do not kill the running demo or substitute its ports.

Prepare the same installed test environment used by the existing suites:

```powershell
$env:PATH=(Join-Path $env:TEMP 'catherines-phase2a2-tools\node-v22.16.0-win-x64')+';C:\Program Files\Microsoft\jdk-21.0.13.21-hotspot\bin;'+$env:PATH
$env:FIREBASE_EMULATORS_PATH=Join-Path $env:TEMP 'catherines-phase2a2-tools\emulators'
$env:XDG_CONFIG_HOME=Join-Path $env:TEMP 'catherines-phase2a2-tools\config'
$env:CHROME_PATH='C:\Program Files\Google\Chrome\Application\chrome.exe'
$env:CI='true'
```

Preview the real unverified catalog:

```powershell
npm.cmd run preview:facilities-v2
```

Or explicitly use **synthetic/no-sound media fixtures** to exercise playback/lyrics:

```powershell
& node_modules/.bin/firebase.cmd emulators:exec --only auth,database --project demo-catherines-reservations --config firebase.facility-tests.json "node --require ./tests/isolated-facility-ports.cjs scripts/preview-facilities-v2.cjs --synthetic-media"
```

Emulator-only login: `http://127.0.0.1:15000/login.html?next=my-reservation.html`, `guest-a@example.test` / `TestPass123!`. Then open:

`http://127.0.0.1:15000/guest-dashboard.html?reservation=CBLR-930001`

This synthetic buyout has a trusted fixture check-in, not a real card tap. My Reservation opens the same reference. Synthetic catalog entries explicitly say SIMULATION FIXTURE/no audio file, never masquerade as real song titles or acoustic playback. Welcome/Thank You remain unverified in this preview; receipt scheduling is exercised separately in unit tests. Ctrl+C stops only the preview/test process. The loopback preview is not a LAN server for the physical boards.

Focused suites:

```powershell
npm.cmd run test:facilities-v2
```

Real emulator/browser virtual-device smoke:

```powershell
& node_modules/.bin/firebase.cmd emulators:exec --only auth,database --project demo-catherines-reservations --config firebase.facility-tests.json "node tests/facilities-v2-preview.test.cjs"
```

## Arduino IDE and activation plan — no upload performed

1. Preserve Laptop2's exact working ESP1 sketch/private files. Leave it flashed as is.
2. Identify ESP2 by label/COM port. Tested profile: classic **ESP32 Dev Module**, Espressif core3.3.12, ArduinoJson7.4.2. V2 does not require physical TFT/DFPlayer/servo libraries because those adapters are not activated.
3. Copy the v2 example headers to private `facilities-v2-config.h` and `device-sync-secrets.h`. Keep Wi-Fi/key values local; use the separately approved esp2 key, not reader/esp1 credentials. No actual keys were provisioned here.
4. V2 simulation1 only communicates with a simulation backend; default0 is uncommissioned and drives nothing. Neither selection turns on physical adapters. Arduino Verify first; do not upload dummy `.local` binaries.
5. After explicit approval, isolate actuator/load supplies before Upload to ESP2 only; Serial115200/Newline. `STATUS` shows mode, Wi-Fi, lease, applied version/track, stack high-water marks and TFT text preview. `SIM HALL READY` / `SIM HALL CLOSED` only affect simulation; they are never a real sensor reading or live bypass.
6. For physical relays, first use the separate GPIO26 diagnostic and report LOW/HIGH behavior. Repeat an approved isolated procedure per relay. Do not edit unknown polarities into guessed defaults. KTV servo requires separately reviewed calibration and clearance, Hall test, RGB driver verification. TFT/UART/audio require the hardware checks above before a physical adapter can be reviewed/enabled.

### Fix for404 and no-seed activation

Root cause: the running `.local/lcd-restart/lan-services.cjs` previously never loaded/passed `deviceSyncConfig`. Source is now wired, as is `scripts/serve-reservation-lan.cjs`, but flags remain off and the private registry is still absent. A running Node process does not load edits automatically. Static UI flags also come from the launcher.

Do not start another adapter on occupied ports or restart without approval. After verifying a fresh backup, approving private provisioning and stopping only the identified LAN adapter, preserve the running emulators and use the existing no-seed launcher. Existing physical cottage operation can continue on v1 by leaving v2 off:

```powershell
$env:CATHERINES_DEVICE_SYNC='1'
$env:CATHERINES_TRUSTED_DEMO_LAN='1'
# Optional v2 route/UI review only; uncommissioned physical mode disables actions.
$env:CATHERINES_FACILITIES_V2='1'
Remove-Item Env:CATHERINES_FACILITIES_SIMULATION -ErrorAction SilentlyContinue
node scripts/serve-reservation-lan.cjs --host=192.168.1.39
```

Simulation activation is deliberately refused against29000; only the separate19000 test environment allows it. Enabling v2 suppresses the duplicate v1 cottage/browser-audio UI, so do not switch a physically commissioned board until its reviewed v2 adapter is ready. V1 endpoints/ESP1 remain compatible. Port5001 remains reservation-only, with device pages/scripts blocked. No cloud configuration/rules were published.

Rollback before physical activation: stop only the newly approved adapter, restore its source snapshots or unset v2, then restart the no-seed v1 adapter with the same current emulators. Do not import old data, reseed, reset or roll back bookings. No reservation migration is required.

## Test results and defects found

| Area | Result / actual evidence |
|---|---|
|Backend all-facility authorization|PASS: owner/status/entitlement checks, Event vs Pool, typed relay/RGB/disco-preview/door requests, shared OR, CAS concurrency, failed retry and old-ID non-resurrection|
|Device security/leases|PASS: HMAC request/response domains, wrong key/changed replay/stale request denial, delivered-version and matching output/player report, unknown/offline and physical-activation guard|
|Audio/catalog|PASS: correct ID/filename validation, unavailable track, category, queue bounds, exclusive owner, play/pause/resume/next/previous/stop/volume, fresh announcement receipt dedupe and checkout scheduling|
|Lyrics/TFT software|PASS: backend LRC bounds/timestamps and portable C++ clock/track reset/pause/resume/stop, packet checksum and two-row wrapping assertions; no physical panel/acoustic claim|
|Browser fixtures|PASS: all authorized panels, title/artist search, correct song/queue, no optimistic Playing, reported playback/lyrics, same-ID failed retry, reference switch, signout, Pool-only and desktop/mobile fit|
|Real Auth/RTDB + mounted v2|PASS: isolated backend/token/owner checks and checkout revocation, alongside v1 RFID/pathway/cottage compatibility|
|Actual dashboard + signed virtual ESP2|PASS after fixes: real named app login, owned buyout, mounted HTTP, signed virtual reports, acknowledged Play/Pause/Resume/Next/Previous/Stop, virtual disco and estimated lyrics. Actual dashboard fits1440px desktop and390px mobile; screenshots reviewed at `test-results/facilities-v2-desktop.png` and `facilities-v2-mobile.png`|
|Existing isolated regressions|40 named checks passed: phase2c1(9), phase2c2(12), guest-facilities(6), checkout(6), guest-dashboard-simple(7), plus combined v2 emulator integration|
|Existing v1/ESP1 suites|PASS: reservation device HTTP/UI/core, RFID name response, portable lease and original/private/function preservation checks; original firmware not recompiled because unchanged|
|V2 compilation|PASS; simulation953,900 bytes flash, uncommissioned953,408 bytes; both49,760 bytes static RAM,277,920 bytes remaining before heap/task use. Classic esp32:esp32:esp32, core3.3.12, ArduinoJson7.4.2; dummy config, no upload|
|Physical GPIO/pump/servo/Hall/RGB|NOT PHYSICALLY VERIFIED; blocked from dispatch|
|Physical TFT/DFPlayer/mic/mixer/speakers|NOT PHYSICALLY VERIFIED; physical bindings blocked|
|Calendar expiry/live policy/TLS deployment|BLOCKED pending approved rules/policies and production review|

Real-page testing initially failed; it was not reported as success. It exposed RTDB pruning of empty containers/null values and key-order changes. The core now reconstructs empty state on every read, compares canonical desired values without version churn, and restores explicit wire nulls even when a version is unchanged. A round-trip regression reproduces these Firebase behaviors. Guest background verification also temporarily removes its record; the panel now locks and preserves drafts only for the same current authenticated owner/reference, otherwise clears private content. Test waits handle transient locks rather than dereferencing missing controls.

Extended testing also caught a Stopped-feedback bug: clearing the player owner redacted its entire report, leaving the former owner waiting despite a valid stop acknowledgement. The view now exposes only the non-private acknowledged Stopped state when the player has no owner; another guest's active track remains hidden. Switching tracks also resets lyric-window selection instead of using the previous track's reported position. Both fixes are covered by the final core/browser tests.

Memory/concurrency evidence is software-only: fixed cue arrays, bounded HTTP/JSON transfer, mutex-protected plan/report copies, no network/String allocation inside the output critical section, separate network/output tasks, compile-time clock/wrap tests and on-board high-water diagnostics for later measurement. Real task scheduling, heap margin under long runtime, boot glitches and relay fail-OFF timing remain hardware tests.

The firmware uses estimated timing, not precise DFPlayer timestamps. Disco is a500ms three-color virtual preview, not verified sound reactivity or a physical RGB driver. The prepared send adapter reports transport success only, not acoustic success or validated module reply; UART feedback/BUSY handling and actual ST7735 initialization remain commissioning work. These limitations are intentionally not hidden behind enabled buttons.

## Required next inputs

- Relay model/polarity/contact measurements for cottage, Event, stage and pump; driver/supply/current verification and pump policy.
- KTV servo pulse limits/direction/clearance/hold-to-move rules; Hall voltage/bias/polarity and fresh publisher; RGB driver mapping.
- Actual TFT model, resolution/init variant, font/Unicode needs and SPI/boot behavior; keep19 reserved for stage.
- Actual microSD folder/file inventory and complete titles/artists, verified durations, permitted Event tracks, licensed LRC files and per-song timing measurements.
- Audio route verification, damaged speaker replacement, UART reply behavior and approved physical priority/interruption policy.
- Approved private device provisioning, controlled no-seed activation and any later production Auth/TLS/database review.

Firebase emulators issue development tokens and expose privileged interfaces. They are not a hostile-client production security boundary. Keep demo ports on a trusted network; HMAC is authentication, not HTTP encryption. No production security, hardware functionality or perfect lyric synchronization is claimed by compilation or synthetic tests.
