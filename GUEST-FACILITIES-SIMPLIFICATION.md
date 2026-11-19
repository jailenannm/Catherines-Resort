# Guest facility pages: simplification and hardware evidence

Implemented directly in the existing checkout, retaining prior local edits. Guest previews are read-only. Firmware, live Firebase configuration/rules, physical wiring and device commands were not changed.

## Selected booking and navigation

Pool, Event, Cottage and KTV now reuse the shared public header, local Playfair Display / DM Sans typography, cream/gold cards and buttons. The guest sidebar is replaced with selected-booking return links and a compact eligible-facility navigation list. Body text is 1rem; labels/status/buttons are at least 0.875rem.

- `CBLR-820001`: Checked In Pool-only → Swimming Pool only. Direct Event/Cottage/KTV visits show a locked message and only Pool in eligible navigation.
- `CBLR-820002`: Checked In version-2 Celebration Event Package → Swimming Pool and Event Place with Stage Band. Both facility links and return links retain this reference.
- `CBLR-820004`: Confirmed with RFID → locked everywhere, with no eligible-facility links.
- Legacy unversioned Event remains Event-only; existing buyout/Cottage/KTV mappings remain in `GuestAccess` unchanged.

The actual chain is dashboard facility link → `kind.html?reservation=...` → `kind.js` → `ControlShell.prepareFacility(kind)` → existing named-app Auth and `GuestAccess.accessFor(kind)` → independent owner/status/package/freshness verification. Changing a selection, status, session or connection invalidates access. Facility links recheck eligibility at click time. Header My Reservation/account-menu links and both return links retain the selected reference. A reference never authorizes access.

The narrow locked card was caused by rendering one section inside the old twelve-column `.cs-grid` without spanning that grid. Guest layouts now use a full-width content column and responsive locked card, with Back to Guest Dashboard / My Reservation links. No Go to Check-in, checkout or simulated guest actions are displayed. Restricted cloud-test mode omits a dashboard return route; the server still denies direct facility/device routes on port 5001.

## Control audit and remaining entries

No guest device-control button, switch, slider, color picker or playback control remains. Remaining interactive controls are working navigation/account actions. The entries below are static read-only previews, **not newly authorized hardware controls**. Unknown means this guest page has no live verified reading. Unavailable means the control/integration is not offered.

| Guest entry | Frontend trace / evidence in the checkout | Result and verification still needed |
| --- | --- | --- |
| Pool RGB lighting | `js/pool.js`: `COLORS`, `poolSwitch`, brightness handler and effect handlers write `pool/light`, `pool/color`, `pool/brightness`, `pool/effect`. `ESP2_Lighting.ino:350` `readPoolState()` reads only `pool/pump` and drives `POOL_PUMP_RLY_PIN` 16. No Pool RGB/color/brightness/effect subscriber or output was found in either checked-in `.ino`. | One Pool RGB lighting preview marked Unavailable. Removed all eight web presets (Lagoon/Ocean/Sunset/Coral/Orchid/Lime/Gold/Moonlight), custom color, brightness, and Solid/Wave/Pulse/Rainbow options. Confirm the actual Pool LED driver/pins, color encoding, dimming/effect implementation and flashed firmware before exposing any option. KTV's digital RGB pins are not evidence for Pool RGB. |
| Arched bridge lighting | `js/pool.js` writes `pool/bridge`; neither checked-in firmware file consumes it or defines a separate bridge-light output. | Independent bridge toggle and simulated bridge reading removed. Verify a distinct wired output and matching subscriber before claiming separate operation. |
| Pool pump | ESP2 defines pump relay 16 and `readPoolState()` drives it. The physical button writes `pool/pump`; the legacy web controller already treats pump as owner-only. | Pump omitted from guests. Firmware output does not establish guest authorization. Existing admin diagnostics remain unchanged. |
| Event Mode | `js/event.js` writes `event/mode`, hall/stage/music/reactive flags. ESP2 `readEventState()` at 330 reads mode/reactive, drives hall relay 33 from `event/hallLight`, and drives stage spotlight relay 19. | Exactly one Event Mode preview presents pavilion lights, stage RGB, event music and Pool effect as parts of the coordinated experience. It is presentation only: current firmware does not establish a single live command coordinating all four parts. No guest switches remain. Pavilion state is Unknown; unverified stage RGB/music/Pool effect are Unavailable. |
| Sound-reactive stage capability | ESP1 defines mic GPIO 35 and publishes mapped `event/soundLevel` in `readSensorsAndSync()` at 378. ESP2 `readEventState()` at 339 uses `eventModeOn && reactive`, and switches stage spotlight relay 19 when sound level is over 50. | A sound-reactive **stage spotlight** capability is documented as Preview only. No live level, animated fake spectrum or sensitivity switch is shown. This evidence is binary spotlight relay logic, not stage RGB or Pool audio reactivity. Verify physical microphone/relay wiring, calibration and deployed firmware before live use. |
| Stage RGB / event music / Pool effect | The stage output found is relay 19. The only RGB pins found are explicitly KTV LEDs (25/27/32). No event music audio-player code or Pool RGB effect output was found. `js/pool.js`'s Event-mode pulse is a browser visual effect. | Components remain named in the Event preview but marked Unavailable. No separate controls. Confirm stage RGB output, audio transport/player and Pool coordination before making them supported capabilities. Pool-only guests still cannot enter Event. |
| Cottage lighting | `js/cottage.js` writes per-cottage light/occupied/reference paths and infers allocation. ESP2's Cottage button at 201 only writes `cottages/c1/light`; no Cottage relay read/output or four-cottage shared relay mapping was found. ESP1 relay 33 is a pathway relay tied to `guest/checkedIn` at 280, not evidence of a cottage circuit. | One lighting-information entry marked Unavailable; no individual switches, color controls, occupancy/map claims, automatic assignment or release action. A grouped four-cottage control is **not asserted**. Verify the relay pin, connected loads, whether all four share the circuit, and corresponding firmware consumer. |
| KTV sliding door / Hall readiness | `js/ktv.js` panel target handler writes KTV target. ESP1 defines servo 13 and Hall sensor 34; `readControls()` around 296 reads `ktv/target` and writes servo 0/90; `readSensorsAndSync()` at 372 publishes active-low `ktv/hallOpen`. | Door status and Hall-confirmed readiness remain as Unknown. No open/close control or ready claim. Physical sliding linkage, Hall position and calibration still need confirmation; a requested target alone is not confirmed readiness. |
| KTV lighting | `js/ktv.js` light handlers write `ktv/lightMode` and per-channel booleans. ESP2 `readLightingState()` at 302 implements off, static R/G/B on/off, and a timed party cycle using digital pins 25/27/32. | Lighting state remains Unknown, with no guest switches or brightness/continuous-color claims. Existing admin controls retain their original controller. |
| KTV karaoke/display | ESP2 reads song/playback for TFT status; `updateTFTUI()` and `drawLyrics()` around 250–290 contain a few sample lyric cases. `js/ktv.js` writes song/playback/volume and uses a web song catalog, but no actual audio-player/DFPlayer command consumer or volume output was found in the firmware. | Display status Unknown; audio Unavailable. Removed song list, play/pause/stop/next/previous, volume, progress and lyrics controls and sample lyric display. Verify real audio hardware/driver, song-ID mapping, playback feedback and lyric source before presenting a working karaoke integration. |
| Beacon rotation | KTV web handlers write beacon on/RPM. ESP2's beacon button writes a boolean, but no verified RPM motor-control consumer for that path was found. It is also not a guest KTV booking function. | Removed beacon controls, rotation readings and animated lighthouse/beam illustration from the guest view. No physical rotation is inferred. |

Evidence is from the current checked-in code, not a bench test or a wiring certificate. Guest copy stays short; implementation details and unresolved wiring requirements are documented here instead of being presented as guest controls.

## Admin preservation

The original page-content markup is captured before guest rendering. Only a trusted `admin: true` identity restores it and loads the existing legacy controllers/configuration/transport. Guest-only styles are loaded only in the guest branch; admin headings, diagnostics, controls and original controller files remain unchanged. A neutral loading message prevents either role from seeing a flash of the other role's controls.

Tests restored original Pool/Event/Cottage/KTV admin controls and diagnostics and invoked sample handlers using an isolated fake transport. This verifies preservation of the web workflow, **not physical operation or certification of every legacy diagnostic option**. No admin feature or device permission was added.

## Exact changed files

Application:

- `pool.html`, `event.html`, `cottage.html`, `ktv.html`: neutral pre-role loading state and accurate metadata; original admin markup retained.
- `js/control-shell.js`: guest-only shared header/layout, selected-reference navigation, eligible-only facility links, simple audited preview entries, responsive locked state; original trusted admin branch retained.
- `css/guest-facilities.css` (new): scoped guest typography/cards/navigation/locked layout. Existing `css/control-pages.css` is unchanged.

Verification:

- `tests/guest-facilities.test.cjs` (new): three requested references plus trusted Cottage/KTV/legacy fixtures, navigation/boundaries/layout and four admin workflow checks.
- `tests/isolated-facility-ports.cjs` (new): test-process-only port adapter, including browser configuration responses. Normal application files/endpoints are not edited by it.
- `firebase.facility-tests.json` (new): reviewable demo-only test configuration on private ports.
- `tests/phase2c2.test.cjs`, `tests/guest-dashboard-simple.test.cjs`: expect unsupported guest controls to be absent; retain access/security tests and synthetic-action denial coverage.
- `package.json`: `test:guest-facilities` command.
- This report, `GUEST-FACILITIES-SIMPLIFICATION.md`.

No changes to firmware, `js/pool.js`, `js/event.js`, `js/cottage.js`, `js/ktv.js`, the package mappings in `js/guest-access.js`, shared booking rules/configuration, admin pages, or `tests/serve.cjs`.

## Verification actually run

All **24 groups passed** via `npm.cmd run test:guest-facilities`:

| Suite | Passing groups |
| --- | ---: |
| Guest facility pages | 6 |
| Existing Phase 2C.2 access / command-denial regressions | 12 |
| Simplified Guest Dashboard regressions | 6 |

Coverage includes dashboard→facility→return navigation; public My Reservation/account links; `CBLR-820001` Pool-only; `CBLR-820002` current Event with Stage Band and Pool; locked `CBLR-820004`; direct unbooked visits; legacy Event-only meaning; switching selection; saved status change and recovery; sign-out; zero guest device handlers/transports; guest/foreign ownership checks and stale local flags; disconnection/expired verification; synthetic injected-control denial; and preserved trusted-admin handlers using fake transport.

Desktop 1440px, mobile 390px and reflow 720px checks covered all four eligible pages plus an unbooked locked page. Body text measured 16px and headings used Playfair Display; cards were full-width relative to content, without text clipping or horizontal page scrolling. Rendered mobile Pool/KTV/Event and desktop locked-state screenshots were visually inspected. Screenshots are under ignored `test-results/guest-facility-*.png`; prior source snapshots are under `test-results/guest-facilities-before/`.

The standard emulator ports were already occupied. Verification therefore used separate Auth 19099 / RTDB 19000, web 15000 and restricted web 15016/15017 ports. The existing emulator/port-5000 preview was not stopped, cleared or overwritten. An initial private-port adapter issue served default browser endpoints and was corrected; final checks assert the private Auth/RTDB endpoints before navigation. No production configuration was changed. No guest UI booking mutations, live Firebase/email/device requests or `/diorama` writes occurred. Admin dispatch checks used fake transport only. Syntax and Git whitespace checks passed.

Repeat with Node, Java and Chrome available:

```powershell
$env:CHROME_PATH = 'C:\Program Files\Google\Chrome\Application\chrome.exe'
npm.cmd run test:guest-facilities
```

The private test-port setup is isolated and does not change the normal `npm.cmd run preview:guest-dashboard` workflow. Real-phone touch, physical hardware operation and live deployment were not tested or requested.

## Manual preview

Hard-refresh your existing port-5000 preview. No server restart is required: the server reads the updated HTML/JS/CSS files on request.

- Pool-only: `http://127.0.0.1:5000/pool.html?reservation=CBLR-820001`
- Event Package: `http://127.0.0.1:5000/event.html?reservation=CBLR-820002`
- Pool included in Event: `http://127.0.0.1:5000/pool.html?reservation=CBLR-820002`
- Confirmed/locked: `http://127.0.0.1:5000/pool.html?reservation=CBLR-820004`
- Boundary check: `http://127.0.0.1:5000/event.html?reservation=CBLR-820001`

Use the existing emulator guest account from the dashboard preview instructions. Port 5001 remains reservation-only: no facility routes or device scripts were added to its allowlist. No Firebase rule publication/deployment or firmware update is needed for this task. Guest controls remain read-only.
