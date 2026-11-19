# Phase 2C.1 - trusted shared RFID check-in (emulator verified, live disabled)

## Scope and current result

The existing named Firebase app `shared-reservations` remains the only browser
source for shared booking status. Master Reservations and My Reservation show
`Checked In` after a trusted server save. The check-in page now observes those
shared records instead of local demo bookings or device flags. Its live scanner,
manual/simulation processing and gate actions are disabled. Existing page markup,
layout, CSS, branding and typography are retained; only script wiring changes.

**There is no deployed verifier or live scan ingress in this phase.** The trusted
server core is exercised through server-held emulator fixtures only. Browser UID
entry, local roles, simulation and `guest/checkedIn` cannot invoke it. No browser
check-in write API was added to `js/shared-reservations.js`.

## Exact legacy scan trace and why it is insufficient

`esp32_firmware/ESP1_Mechanics/ESP1_Mechanics.ino`, `checkNFC()` (lines 384-410):

- Concatenates `String(rfid.uid.uidByte[i], HEX)` without two-digit zero padding,
  uppercases it and writes `/diorama/nfc/lastUid`.
- Separately writes `/diorama/nfc/lastScan = millis()`. That value is device uptime,
  not a UTC/server timestamp, and it is not atomic with the UID.
- Sends no byte count, unique event ID, reader identity proof or signed payload.
- Independently displays an LCD welcome, opens the gate and sets
  `/diorama/guest/checkedIn = true`. These existing firmware behaviors are untouched.

Previously `check-in.html` loaded `firebase-config.js` and `diorama-link.js`.
`DioramaLink.on("nfc")` delivered cached Firebase/simulated state to `check-in.js`.
The page compared device uptime with `Date.now()`, matched browser-local bookings,
and could auto-link an unknown card to the first pending/arriving booking.
Manual check-in also bypassed card verification. Both paths promoted local status
and wrote guest/gate device state. All of those page-side paths were removed.

Example: full bytes `00 01 A2 0F` become canonical `0001A20F`, but the firmware
emits `01A2F`. No missing zeros can safely be inferred. Even a legacy string with
8/14/20 hex characters does not prove it contains every original byte. Existing
DioramaLink browser writes/simulation cannot authenticate the physical source.
The page therefore does not subscribe to this feed or interpret its flags.

**Web live check-in disabled does not disable the independent firmware bypass.**
Do not treat this phase as physical access enforcement. Firmware/wiring/device
rules, facilities, gate, pathway lights, LCD, audio and checkout remain outside scope.

## Trusted verification path

`scripts/check-in-verifier.cjs` exports `createCheckInVerifier` for a trusted Node
server context, never a frontend script. It accepts injected server-only scan
resolution and storage. No HTTP endpoint, deployment or production credential is
provided. `scripts/emulator-check-in-verifier.cjs` supplies a loopback-only demo
transport and an immutable-by-caller copy of test fixtures held inside Node.
It refuses any project except `demo-catherines-reservations` and any database
emulator host except `127.0.0.1:9000`. It cannot target the cloud database.

The emulator event contract is:

```javascript
{
  eventId: "fixture-scan-valid-0001", // unique, immutable, server-resolved ID
  readerId: "emulator-fixture-reader", // allowlisted test reader
  authenticated: true,               // result of trusted ingress, NOT a browser assertion
  fullUid: true,                      // established by trusted ingress, NOT guessed
  uid: "0001A20F",                    // uppercase, two hex characters per byte
  byteCount: 4,                       // supported 4, 7 or 10 bytes, exactly matches UID length
  receivedAt: 1790000000000           // trusted server time, epoch milliseconds
}
```

These are explicitly **simulated fixtures**, not actual authenticated scans.
Booleans alone would offer no trust if accepted from an untrusted caller. The
resolver is supplied only by the test process, and no browser can insert events.
The page labels saved emulator check-ins as fixtures. The provisional test
freshness window is 15 seconds with future timestamps denied; a live integration
must establish its freshness policy and guard against delayed/replayed ingress,
not just timestamp a replayed payload anew.

The verifier requires a known, authenticated reader and complete canonical UID,
then exact equality with BOTH the immutable `/rfidAssignments/<UID>` index and
`/sharedReservations/<reference>/rfidLinked`. The record must already be exactly
`Confirmed`. It never assigns a card, picks an arriving guest, normalizes an
ambiguous scan, or accepts a reference in place of physical scan evidence.

A conditional root transaction (REST ETag/if-match in the emulator adapter)
atomically changes only the booking status to `Checked In` and creates one
private `/verifiedCheckins/<eventId>` receipt. The existing reservation fields,
UID and index remain unchanged. Failed versions retry from the server; two
requests for one booking cannot both transition it. A repeat of the same still-
fresh event returns the existing confirmed result without applying a transition.
A different event for an already checked-in booking is rejected. Expired scans,
including expired same-event retries, are rejected. A failed save does not consume
the event; retry is allowed while fresh. A lost acknowledgement can be recovered
only from a fresh server read of the matching receipt, status and RFID binding.

The adapter's root operation is confined to the separate **demo reservations**
database. It does not connect to or send commands to the old device project.
Production adapter/ingress design and deployment remain pending.

## Authorization and local rules

Review **`shared-reservations.rules.json`**. Existing status permissions allow only
trusted-admin `Pending Verification -> Confirmed`; they never allow any client
(including an admin) to write `Checked In`. Guests cannot change RFID assignment.
The new `verifiedCheckins` subtree explicitly denies all client reads/writes;
only the trusted privileged server can record/consume scan receipts. Existing
ownership/query rules, booking creation, approval and first RFID assignment rules
remain intact. A privileged backend bypasses client rules by design: its verifier
is responsible for enforcing the scan checks and transaction. Do not give those
privileges or resolver inputs to browsers.

Nothing was published. After review, this file belongs only to
`atherines-resort-reservations`, not the old diorama Firebase project. Publishing
rules alone will not enable live check-in.

## Files and functions changed

| File | Change |
| --- | --- |
| `check-in.html` | Script wiring only: named shared Firebase app/Auth/database adapter replaces legacy local database and device connectors |
| `js/check-in.js` | Replaces local/manual/simulated `processCheckIn` paths with authenticated shared status observation and existing feedback; no auto-link, UID write or device command |
| `js/admin-reservations.js` | `mapMeshStatus` describes Checked In without implying device activation; state caption says verified; existing quick-checkin navigates to check-in desk without mutating status |
| `js/my-reservation.js` | `renderSharedReservation`/`updateExperienceCount` display Checked In consistently, retain assigned flag/UID masking and locked-facility messaging |
| `shared-reservations.rules.json` | Explicitly private server-only `verifiedCheckins` subtree; existing client status transition restrictions retained |
| `scripts/check-in-verifier.cjs` | New `createCheckInVerifier` server core with trusted-event validation, full UID equality, freshness, atomic transition/receipt, concurrency and failure recovery |
| `scripts/emulator-check-in-verifier.cjs` | New demo-only `createEmulatorVerifier`, server-held fixture resolution and privileged loopback ETag storage |
| `tests/phase2c1.test.cjs` | New real Auth/RTDB emulator and isolated browser integration tests |
| `package.json` | New `test:phase2c1`; no dependency changes |
| `PHASE-2C.1.md` | This report |

`js/shared-reservations.js` was inspected and reused unchanged: `identity` uses
named-app Auth, and `subscribeReservations` provides owner/admin authorized live
records with guest UID masking. No shared record is copied into local action
handlers or local `currentReservation`. Firmware, wiring, shared/device Firebase
configuration, local stored records and facility handlers are unchanged.

## Repeat local verification

With Node, Java and the existing dependencies available:

```powershell
Set-Location -LiteralPath 'C:\Users\Admin\Projects\catherines-diorama-IOT-BASED'
$env:CHROME_PATH = 'C:\Program Files\Google\Chrome\Application\chrome.exe'
npm run test:phase2c1
npm run test:phase2b2
npm run test:phase2b1
npm run test:phase2a2
npm run test:cloud-preparation
```

Run suites sequentially. The npm commands select the demo project and local rules;
no service-account file or live account is used. This workstation's temporary Node
and emulator cache setup is also documented in `PHASE-2B.2.md`. The new suite uses
fake `.invalid` booking details, isolated guest/admin browser contexts, local SDK
assets and blocked external requests. It creates malformed pending/unassigned
bindings only as privileged negative emulator fixtures, never from frontend code.

## Still blocking live check-in

1. A trustworthy full-byte reader payload (canonical UID plus verified byte count)
   with leading/internal zeros preserved, not the current concatenated `lastUid`.
2. Authenticated device-to-server ingress: provisioned reader identity, protected
   credentials/signatures or equivalent verified transport, immutable event ID
   and replay protection. A browser, admin claim, UID textbox or guest flag is not
   a scan source. Full UID matching also does not prove an unclonable card.
3. Reliable freshness using server reception plus a protocol that rejects old
   device events/delayed replays, and a reviewed operational freshness window.
4. A deployed least-privilege trusted verifier/production transaction adapter on
   the reservations project, protected event ingestion and durable receipts. No
   production ingress or public verifier URL exists in this phase.
5. Coordinated review of the firmware's independent physical bypass before any
   claim of real access enforcement; that work is expressly deferred here.

Card release/reuse and replacement stay disabled. Facility unlocking, hardware
commands, checkout and live testing have not been implemented or performed.

## Completed checks

- `npm run test:phase2c1`: **9 groups passed**, exit 0. Covers valid assigned card,
  leading zeros, unknown/incomplete/ambiguous/untrusted/stale/future events,
  pending/unassigned bookings, forged browser/legacy evidence, unauthorized writes,
  repeated/simultaneous scans, atomic receipt consumption, field preservation,
  failed save/retry, lost acknowledgement, guest/admin/desk updates and refresh.
- `npm run test:phase2b2`: **11 groups passed**, exit 0, including existing RFID
  readability checks at 100%/200%-equivalent layouts.
- `npm run test:phase2b1`: **9 groups passed**, exit 0.
- `npm run test:phase2a2`: **11 groups passed**, exit 0.
- `npm run test:cloud-preparation`: passed, exit 0.
- Syntax checks for all six changed/new JavaScript modules and `git diff --check`:
  passed. No firmware, diorama connector/config or ControlShell diff was introduced.

Logs are under ignored `test-results/phase2c1*.log`. No real card was scanned,
no live database/rules changed, no real email sent and no hardware command issued.
Native zoom with downloaded fonts and physical/live integration remain untested
and deferred. Live check-in remains disabled even if these rules are published.
