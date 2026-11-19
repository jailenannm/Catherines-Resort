# Phase 2A.2: shared pending reservations

This phase connects the existing forms and reservation views to Firebase Auth
(email/password) and Realtime Database at `/sharedReservations/<reference>`.
No deployed Firebase configuration or rules were changed. No device integration
was added. Existing local accounts, bookings, RFID records, and seed logic remain
in `js/database.js`; they are neither shared authority nor migration sources.
The pre-existing Phase 2A.1 changes in that file are preserved byte-for-byte.

## Behavior and boundaries

- Both existing sign-in forms already contain the email/password fields required
  for Firebase Auth. No fields, layouts, CSS, navigation targets or modal markup
  changed. The five HTML changes only add Firebase/shared-adapter script tags.
- The login submit handler calls Firebase Auth, never local authentication.
  Registration calls Firebase Auth and stores no new plaintext password in the
  legacy local user list. Display name uses the Firebase user profile. Phone and
  newsletter controls remain in the form; newsletter enrollment is not added.
- `admin: true` is a trusted Auth custom claim, not a browser-local role or
  email comparison. Navigation hints written by `ResortDB.saveSession` confer
  no access to shared data. Booking-code sign-in is blocked using its existing
  error element. Legacy password-reset forms show that shared password recovery
  is unavailable instead of changing a local password and claiming success.
- Booking submission retains validation, package values/prices, field contents,
  the click lock and one snapshot/reference/attempt identity per page attempt.
  Shared creation is an authenticated, conditional REST PUT. No optimistic
  local acknowledgement, offline write queue, seed upload, or local fallback is
  used. A server read of the exact owner + attempt recovers an uncertain save.
  Failed requests release the button and retain the snapshot and inputs for retry.
  The in-memory attempt survives retry clicks, not closing/reloading the form.
- The modal uses the saved record reference only after confirmed persistence.
  Optional confirmation email is separately gated and disabled for emulators
  and by default. It cannot turn a booking failure into success.
- New records have `Pending Verification`, empty `rfidLinked`, and no node
  or facility-access assignment. They never enter `currentReservation` or
  `reservationHistory`, keeping them out of legacy local action handlers.
- My Reservation subscribes to a UID-filtered query, renders the most recent
  booking using the existing cards, and shows pending/unassigned information.
  Admin subscribes to the shared list using a trusted admin token. Local rows
  and seed bookings are excluded from both views. Auth changes clear old rows.
- Admin status/approval/cancel/check-in/checkout and guest contact/add-on changes
  display an existing alert explaining that no shared update was performed.
  Shared records are create-only in this phase, including for administrators.
- Status is deliberately not standardized here. The admin list recognizes
  `pending` in `mapStatusToClass` and `mapMeshStatus`; legacy restore
  still uses `Pending Verification`. `ControlShell.isCheckedIn` accepts
  only checked-in/in-facility/active values and rejects this new-booking status.

## Files and functions

| File | Phase 2A.2 changes |
| --- | --- |
| `js/shared-reservations-config.js` | Emulator-first configuration; separate reservations cloud project configured in follow-up; email opt-in |
| `js/shared-reservations.js` | New `initialize`, `identity`, `request`, `generateReference`, `createReservation`, `subscribeReservations`, `signIn`, `register`, `signOut` |
| `js/login.js` | Async login submit/lock; trusted-role navigation; booking-code submit blocked; local reset submit blocked; removed local-auth fallbacks and stale-local-session cleanup |
| `js/register.js` | Async registration submit/lock; removed local-user duplicate check, password persistence and local registration fallback |
| `js/reservation.js` | Async confirm handler, `generateUniqueReservationReference`, `saveReservationHistory`, `presentReservationConfirmation`, `sendConfirmationEmailOnce`; `buildReservationObject` and package calculations unchanged |
| `js/my-reservation.js` | New `loadSharedReservation`, `renderSharedReservation`, `setReservationText`; updated `updateGuestInformation`, logout, `setupContactEditor`, `setupAddonButtons`, payment/count rendering and initialization; removed local/demo reservation loading |
| `js/admin-reservations.js` | Shared subscription/cache; `getMasterReservationsList`, `updateMetrics`, `renderMasterReservations`, `showFolioDetailsModal`, `updateReservationStatus`, logout/init; removed local synchronization engine |
| `login.html`, `register.html`, `reservation.html`, `my-reservation.html`, `admin-reservations.html` | Script wiring only |
| `shared-reservations.rules.json` | Owner/query reads, trusted admin reads, validated create-only records, deny other paths |
| `firebase.emulators.json` | Loopback Auth/RTDB emulator configuration, no deployment configuration |
| `package.json`, `package-lock.json`, `.gitignore` | Pinned test tools, repeatable commands, ignored dependencies/logs/screenshots |
| `tests/seed-emulator.cjs`, `tests/serve.cjs`, `tests/phase2a2.test.cjs` | Emulator-only accounts, loopback static server, isolated browser/rules integration tests |

## Repeat automated verification

Requirements: Node.js 22+, Java 21+ on PATH, and Chromium/Chrome.

```powershell
npm ci --ignore-scripts
# Either install Playwright Chromium:
npx playwright install chromium
# Or point to an existing Chrome executable:
$env:CHROME_PATH = 'C:\Program Files\Google\Chrome\Application\chrome.exe'
npm run test:phase2a2
```

The command starts only Auth (9099) and RTDB (9000) for the demo project
`demo-catherines-reservations`, loads the repo rules, runs independent browser
contexts, and shuts the emulators down. Do not substitute a deployed project.
The database namespace is `demo-catherines-reservations-default-rtdb`.
First run downloads the emulator binary; subsequent tests use its local cache.
The browser suite serves the pinned Firebase SDK from node_modules via routing,
blocks external network requests, and replaces EmailJS with a failing test stub.
Screenshots go to ignored `test-results/`.

## Repeat manual local verification

1. Run `npm run emulators` in one terminal.
2. Run `node tests/seed-emulator.cjs` in a second terminal.
3. Run `npm run serve:test` and open `http://127.0.0.1:5000/login.html`.
4. Use separate browser profiles for `guest-a@example.test`,
   `guest-b@example.test`, and `administrator@example.test`.
   All emulator-only fixture passwords are `TestPass123!`.
5. Guest A submits; open My Reservation and compare its reference to the modal.
   Admin opens `admin-reservations.html` and sees the same pending record.
   Guest B sees no Guest A booking, even after spoofing a local admin hint.

These manual pages load SDK/fonts from their existing or added CDNs. Auth and
reservation writes still target only loopback emulators; confirmation email is
explicitly disabled. Do not browse unrelated device pages during these checks.

## Deployment dependencies (not performed)

1. Enable Firebase Auth email/password and authorize the hosting domain. Existing
   browser-local accounts are not Firebase accounts and were not migrated.
2. Provision administrator accounts and set `{ admin: true }` with the Admin
   SDK in a trusted server/operator environment. Never assign claims in client
   JavaScript. Refresh the user's ID token after changing claims.
3. Review and merge only the `sharedReservations` subtree/index rules into
   the deployed rules, preserving separately managed device-path rules. The
   emulator rules file deliberately denies all other paths: do not replace
   deployed device rules wholesale. Ensure no ancestor grants public or broad
   authenticated reads/writes, since RTDB grants cascade downward.
4. The configuration follow-up below supplies the separate reservations project
   and selects production on non-local hosts. Localhost still selects demo
   emulators. The existing `js/firebase-config.js` and its deployed diorama
   project values were not edited. Review Console setup before a live test.
5. Configure/verify optional email separately, then explicitly opt in via
   `confirmationEmailEnabled`. Shared password recovery, approval, RFID
   assignment, check-in/out and device controls remain later work.

References: [trusted custom claims](https://firebase.google.com/docs/auth/admin/custom-claims),
[query-based RTDB rules](https://firebase.google.com/docs/database/security/rules-conditions),
[Auth emulator](https://firebase.google.com/docs/emulator-suite/connect_auth),
[RTDB emulator](https://firebase.google.com/docs/emulator-suite/connect_rtdb).

## Verification performed

The real Firebase Auth + RTDB emulators and four isolated headless Chrome
browser contexts passed the integration suite on 2026-11-13. The suite covers
registration/sign-in; rejection of hard-coded credentials; owner submission,
required-name validation and repeated clicks; matching modal/guest/admin refs;
reload persistence; Guest B and unauthenticated read denial; local-role spoofing;
owner/status/RFID/access-field write denial; nested-query ownership boundaries;
malformed package-list and inconsistent-total rejection; blocked admin/local edit actions;
lost commit acknowledgement + retry; forced save failure + retry; empty RFID,
no node assignment; no demo upload; sign-out; and zero real-email/device calls.
The emulator device subtree remained absent. No live project was used.

All seven modified/new client scripts passed syntax checks. The five HTML files
were compared to their pre-edit contents with only the new script tags removed:
each matched exactly. CSS was unchanged; git diff --check passed. Browser
screenshots were inspected for the existing guest/admin card layouts. External
fonts/icons are blocked in automated tests, so exact CDN font/icon rendering is
not covered. Deployed Auth, claims, rules, hosting and email delivery are untested
and intentionally untouched.

One pre-existing data limitation was verified and left unchanged: every
`#stayDuration` option in `reservation.html` has `value="4500"`, despite
different displayed stay labels. `buildReservationObject` continues saving that
existing value. It cannot distinguish those labels in either shared view; a
separate field/value correction requires a coordinated later change. Static
demo telemetry and room-rack content outside the shared list also remain outside
this phase.

### Runtime paths used on this workstation

Node was downloaded to a temporary tools directory, not installed system-wide.
To repeat the verified command in a new PowerShell terminal on this machine:

```powershell
$env:PATH = (Join-Path $env:TEMP 'catherines-phase2a2-tools\node-v22.16.0-win-x64') + ';C:\Program Files\Weka-3-8-7\jre\jre-25.0.2-full\bin;' + $env:PATH
$env:CHROME_PATH = 'C:\Program Files\Google\Chrome\Application\chrome.exe'
$env:FIREBASE_EMULATORS_PATH = Join-Path $env:TEMP 'catherines-phase2a2-tools\emulators'
$env:XDG_CONFIG_HOME = Join-Path $env:TEMP 'catherines-phase2a2-tools\config'
$env:CI = 'true'
$env:DEBUG = ''
npm run test:phase2a2
```

If the temporary tools have been removed, install the standard prerequisites
above instead. No global environment variables were modified.

## Configuration follow-up: separate reservations project

The existing named app `shared-reservations` is reused.
`js/shared-reservations-config.js` now contains the supplied web app config for
`atherines-resort-reservations` (including that exact spelling) and its
Asia Southeast RTDB URL. Login, registration, booking submission, My Reservation
and the administrator reservation list all use `SharedReservations`, whose
Auth and RTDB services come from that named app. Bookings remain under
`/sharedReservations`. No default-app calls were added.

Localhost, 127.0.0.1 and [::1] still select the demo-project emulators. Other
hostnames select the new cloud config. Confirmation email remains disabled.
No cloud Auth accounts, bookings, claims, rules or deployment were created or
changed during this follow-up. The cloud database's locked-mode rules were left
untouched; their Console state was not independently inspected.

The diorama configuration remains on `catherines-diorama`;
`js/firebase-config.js`, `js/diorama-link.js` and `esp32_firmware/` are
unchanged by this follow-up. Emulators and their test accounts/rules stay on
`demo-catherines-reservations` and its default-rtdb namespace, not the cloud
project. Only the new shared config and this report were edited.

Before a live booking test, select `atherines-resort-reservations` in Firebase
Console, enable Authentication > Sign-in method > Email/Password, check the
intended hosting domain under Authentication > Settings > Authorized domains,
and create the intended Auth accounts (or use registration after setup).
Review and publish the repository's create-only owner/admin reservation rules
for this new project, keeping other paths denied and never using public/test
rules. No rules should be changed on the old diorama project. Locked mode will
deny reservation access until this separate rules step is completed.

An administrator Auth account must additionally receive the `admin: true`
custom claim through a trusted Firebase Admin SDK environment; creating a user
in Console alone does not confer admin access. Refresh/sign in again after that
future claim assignment. No live claims were assigned here.

Offline named-app checks verified all three loopback hostnames select demo Auth
+ RTDB, while a non-local hostname selects the supplied cloud project on the same
named app. These checks used test doubles and made no cloud requests.

After this configuration change, `npm run test:phase2a2` passed all 11
integration test groups (exit 0), including independent guest/admin views,
ownership/rule denials, duplicate clicks, uncertain-save retry, failed-save retry,
reload, preserved local records and sign-out. The suite blocked external
application requests, sent no real email and left the emulator device subtree
absent. `git diff --check` passed. Live cloud access and locked-mode Console
state were not tested.
