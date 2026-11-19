# Phase 2C.2 - reservation-based guest eligibility

## Result and scope

The guest dashboard and Cottage, Pool, KTV and Event pages now use Firebase Auth
and saved owner-authorized bookings from the existing named `shared-reservations`
app. They do not use local account lists, `currentReservation`, `isLoggedIn`,
`userRole`, local session dates, simulated check-in, legacy device flags or
legacy `Active` status to grant shared guest access.

Eligibility requires exact saved status **`Checked In`**, matching Auth owner UID,
and the facility's saved package ID. All other statuses are locked, including
`Pending Verification`, `Confirmed` (even with RFID), `Checking Out`, `Checked Out`,
`Completed`, `Cancelled` and `Active`. Unknown statuses are locked too.

**Eligibility is not device authorization.** An eligible facility's existing cards
are visible as a read-only preview; physical guest controls remain disabled.
The guest path never loads the legacy device config, database or DioramaLink and
never registers the legacy device action handlers. Synthetic actions or changing
an HTML disabled property cannot create a guest device transport. No shared
booking status, RFID, local currentReservation, or device data is written.
Live RFID check-in remains disabled as in Phase 2C.1. No rules were changed or
published, no live test performed, and firmware/wiring are untouched.

## Selection, verification and revocation

- `?reservation=CBLR-123456` selects a specific booking on the dashboard or a
  facility page. It is a navigation hint, never proof of ownership. A foreign,
  malformed, missing or unreadable explicitly selected booking locks the page;
  there is no fallback to a different owned booking.
- Without an explicit selection, the newest owned booking by saved `createdAt`
  is selected, consistent with the existing My Reservation page. It does not
  search older bookings for one that happens to unlock controls. There is no
  new selector UI. `GuestAccess.selectReservation(reference)` updates this URL
  selection and restarts verification; navigation preserves the reference.
- Existing owner-filtered realtime subscriptions provide invalidations. Before
  publishing eligible state, `subscribeOwnedReservation` performs an uncached
  REST server read under named-app Auth and checks owner UID, reference, current
  identity and connectivity. Cached/offline SDK data cannot establish eligibility.
- Selection, auth/token events, booking snapshots and disconnection invalidate
  eligibility. Sign-out clears rows/state through the existing Auth subscription.
  Cross-account responses are discarded using generation counters and a fresh
  identity check. Guest view models contain only an RFID assignment boolean.
- Server verification repeats every 5 seconds and has a 12-second maximum lease.
  The action-time eligibility check also checks that age (and rejects backwards
  clock movement), so a delayed background-tab timer cannot preserve stale access.
  Failed/unauthorized refreshes lock the page. Auth revocation/expiry is detected
  by Auth, connectivity and authenticated server responses; no local expiry flag
  authorizes access. The existing request timeout remains 15 seconds; eligibility
  is already locked during that pending refresh.
- Guest controls remain disabled during refresh. A previously eligible read-only
  preview can remain visible with a Locked/verifying caption to avoid restarting
  card animations every five seconds; denied/error/changed-status results render
  the existing Control locked panel. Actions always recheck current state.

## Package mappings and unclear inclusions

| Saved package `value` | Guest facility eligibility after Checked In |
| --- | --- |
| `cottage` | Cottage only |
| `pool` | Pool, including its existing bridge-control area |
| `ktv` | KTV only |
| `event` | Event only |
| `buyout` | Cottage, Pool, KTV and Event |

Multiple selected packages contribute their union. The existing ControlShell
mapping already treats buyout as all facilities; `reservation.html` explicitly
lists those inclusions for the full-property buyout. The saved package IDs are
used directly for shared bookings, not loosely matched marketing names.

**Event-to-Pool inclusion is not established.** The Event package description
lists the pavilion/stage/audio/seating, not Pool admission. Existing `event.js`
mentions music-reactive Pool lighting as a device effect, which is not an access
entitlement. This phase therefore denies Pool to Event-only guests. Confirm any
commercial Event-to-Pool, Cottage-to-Pool, or other bundled admission policy before
changing package entitlements. Nothing here grants Event guests a Pool effect
command either: every guest command remains disabled.

The generic Cottage package does not prove an assigned physical cottage number.
Its guest preview reports allocation unavailable; it does not infer one from a
browser-local assignment or select Cottage 2 from old demo content.

## Separate administrator workflow

The same facility pages retain their original administrator controllers and device
paths. `prepareFacility` verifies the actual named-app `admin: true` identity
before dynamically loading the existing legacy `database.js`, `firebase-config.js`
and `diorama-link.js`. A local `userRole=admin` cannot select this branch. Those
configuration/connector files themselves are unchanged.

The original controller bodies run for admins; the guest branch returns before
those listeners/timers register. A page-local `facilityLink` proxy stops future
set/update/log dispatch if the verified admin session changes or signs out.
This is not a new database permission grant and does not change the separate
admin device project's rules or physical protocol. Existing admin command behavior
was checked only with an isolated fake transport, never the real connector.
Other legacy admin/device pages and their workflows are outside this phase.

## Files and functions changed

| File | Changes |
| --- | --- |
| `js/shared-reservations.js` | New `subscribeOwnedReservation` for owner selection, uncached verification, invalidations, lease and refresh; new `watchIdentity` for page-local admin session invalidation; existing booking/RFID/check-in interfaces retained |
| `js/guest-access.js` | New shared guest state module: `accessFor`, `includes`, `subscribe`, `selectReservation`, `facilityUrl`, `guestAction`; no device or booking writes |
| `js/control-shell.js` | `role`, `currentReservation`, `hasFacility`, `accessFor` use GuestAccess on these pages; `isCheckedIn` accepts exact checked-in state, not Active; logout signs out shared Auth; new `prepareFacility`, `renderGuestPreview`, `facilityLink` separate guest previews from existing admin handlers |
| `js/guest-dashboard.js` | Replaces local-account/demo control/check-in/checkout handlers with shared profile/booking rendering, four links in the existing sidebar, eligibility captions, disabled guest action guards and Firebase sign-out |
| `js/cottage.js`, `js/pool.js`, `js/ktv.js`, `js/event.js` | Small async bootstrap guard and page-local Link acquisition; original admin controller bodies retained |
| `guest-dashboard.html` | Shared Firebase/Auth/database, GuestAccess and ControlShell script wiring |
| `cottage.html`, `pool.html`, `ktv.html`, `event.html` | Shared script wiring replaces unconditional legacy device loading; legacy config loads only in the verified admin branch |
| `tests/phase2c2.test.cjs` | Isolated real Auth/RTDB emulator and browser eligibility tests; explicit network blocking and fake admin transport |
| `package.json` | New `test:phase2c2`, no dependency changes |
| `PHASE-2C.2.md` | This report |

No CSS, shared database rules, Firebase project config, firmware, verifier,
checkout implementation or separate diorama connector/config was changed.
Page HTML layouts are unchanged apart from script wiring. Existing cards, status
areas, fonts, branding and styles are reused. Read-only previews label device
state unavailable rather than displaying fabricated live telemetry. The existing
sidebar receives facility links; no new page, modal or control panel is added.

## Verification and repeat command

```powershell
Set-Location -LiteralPath 'C:\Users\Admin\Projects\catherines-diorama-IOT-BASED'
$env:CHROME_PATH = 'C:\Program Files\Google\Chrome\Application\chrome.exe'
npm run test:phase2c2
```

Use the existing Node/Java/emulator dependency setup documented in Phase 2B.2.
The command explicitly selects `demo-catherines-reservations`, loopback Auth/RTDB
and `firebase.emulators.json`. No credential or live account is required. Run
suites sequentially to avoid emulator port conflicts. Fake booking details and
isolated Guest A/Guest B/admin browser contexts are created by the test; trusted
emulator-only fixtures include lifecycle states the browser cannot write.

New coverage includes delayed initial server response/default lock; exact
Pool-only dashboard eligibility; locked links; direct facility visits; confirmed
RFID booking; foreign owner selection and rule denial; stale local Active/buyout/
admin data; all non-Checked In lifecycle statuses changing while open; lease
expiry; network loss; 401 verification failures; recovery; sign-out and anonymous
navigation; separate Guest B; Event/buyout mapping; synthetic guest actions;
separate admin fake-transport dispatch and sign-out; no shared booking mutation;
zero device, live-project or email requests and zero page errors.

Browser screenshots are under ignored `test-results/phase2c2-dashboard.png` and
`test-results/phase2c2-pool.png`. External fonts/icons are blocked in tests and
finite animations are fast-forwarded for screenshots. No real hardware was used.

## What is still needed before physical guest controls

1. The Phase 2C.1 authenticated, full-UID, fresh scan ingress and deployed trusted
   verifier. Live check-in is still disabled, and the firmware's independent gate
   bypass is still unchanged; this phase does not secure physical access.
2. A trusted command authorization/dispatch service that independently verifies
   Auth owner, selected shared booking, current Checked In status and exact saved
   package for every command. A browser eligibility flag must never grant device
   database access. No such endpoint or guest command permission was added here.
3. A reviewed device protocol and mapping from reservations to physical units,
   routing into the separate device project without putting its privileged
   credentials in the guest browser; server-side revocation/fail-safe behavior.
4. Confirm any additional package inclusions, especially Event-to-Pool effects
   versus admission, before adding corresponding server authorization.
5. Later review/deployment and manual integration testing. The explicit cloud-test
   server remains reservations-only; it was not expanded to enable these guest
   or device pages. Checkout, card release/reuse, gate/lights/audio commands and
   live Firebase deployment remain deferred.

## Completed verification

- `npm run test:phase2c2`: **12 groups passed**, exit 0 on the final run. This
  includes saved summary/Event captions, expired verification lease and eligible
  read-only Cottage/KTV/Event previews as well as the required Pool-only cases.
- `npm run test:phase2c1`: **9 groups passed**, exit 0.
- `npm run test:phase2b2`: **11 groups passed**, exit 0.
- `npm run test:phase2b1`: **9 groups passed**, exit 0.
- `npm run test:phase2a2`: **11 groups passed**, exit 0.
- `npm run test:cloud-preparation`: passed, exit 0.
- All nine changed/new JavaScript files passed syntax checks; `git diff --check`
  passed. Existing CRLF normalization warnings are informational.
- Pool and dashboard screenshots were visually reviewed for retained layout;
  static demo booking/inclusion captions found during review were replaced with
  shared values and covered by assertions. No stylesheet was changed.

Logs are in ignored `test-results/phase2c2*.log`. No live device command, cloud
booking/rules write, real email, physical check-in or firmware action was sent.
Native 200% zoom with downloaded fonts and physical/cloud integration were not
performed in this phase. Deployment and physical guest command authorization
remain pending as described above.
