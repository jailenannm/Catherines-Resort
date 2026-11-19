# Guest booking sign-in redirect fix

## Actual cause

Homepage `data-book` links, including Book Now and Make a Reservation, originally
pointed directly to `login.html`. `js/index.js` rewrote them using local
`isLoggedIn`, expiry and `resortUsers` membership rather than the Firebase session.
A real Firebase-only guest is deliberately absent from the legacy local account
list, so the homepage considered the guest signed out and deleted local login
hints. The login script then sent every guest back to `index.html`, losing the
booking destination and repeating the cycle.

The old reservation page did not have a Firebase page-entry guard: its header
navigation used a snapshot of local `isLoggedIn`, while booking submission already
required `SharedReservations.identity()` and the shared rules. The failure was
not proof that Firebase had lost the actual signed-in session.

## Fix

- Every homepage booking link and the shared footer's Make a Reservation link now
  points to `reservation.html`. The homepage loads the named Firebase app adapter
  and uses its restored identity for profile/navigation hints, never local account
  membership. The old destructive local-account check is removed.
- Reservation entry waits for `SharedReservations.identity()`, which awaits the
  named `shared-reservations` app's initial Auth state event. Confirm is disabled
  during that initial decision. A valid restored guest remains on the form.
- Signed-out entry goes to exactly `login.html?next=reservation.html`. Successful
  guest login accepts only `next=reservation.html`; everything else keeps the
  original homepage destination. Admin login still chooses `admin-dashboard.html`,
  even when a booking return is requested. No arbitrary URL is used as a return.
- Existing homepage `pendingReservation` choices still load normally. Date,
  duration, contact fields, requests, selected facilities, guest counts and consent
  survive a sign-in roundtrip in a tab-scoped `reservationSignInDraft`. Drafts have
  a 30-minute lifetime, are not auth/save signals, and are not uploaded. Fresh
  homepage availability choices take priority over older form drafts. Confirmed
  booking saves are not re-saved as a new navigation draft.
- Booking submission still calls named-app Firebase identity and the existing
  shared adapter/rules. No authorization comes from a local flag or draft.

## Exact files/functions changed

| File | Change |
| --- | --- |
| `index.html` | Booking hrefs point to reservation; existing shared Firebase SDK/config/adapter scripts precede index.js |
| `js/index.js` | `destination()` always chooses reservation; restored shared identity controls profile and existing session-aware links; removes local membership/expiry logic; availability form keeps its choices |
| `components/footer.html` | Shared Make a Reservation href points to reservation instead of an inert # |
| `js/login.js` | Successful-login redirect uses one fixed allowlisted guest booking return; existing default guest/admin destinations retained |
| `js/reservation.js` | Replaces local header auth snapshot; adds awaited entry guard, `saveBookingDraft`/`restoreBookingDraft`, draft lifecycle and existing summary/counter refresh after restore |
| `tests/booking-navigation.test.cjs` | New emulator/browser navigation, draft, return allowlist and admin routing checks |
| `BOOKING-REDIRECT-FIX.md` | This report |

Registration code/layout/checkboxes/dialogs, facility access code, Auth project
configuration, shared reservation rules, prices, booking save/duplicate protections,
email settings and the separate diorama integration were not edited.

## Verification

`tests/booking-navigation.test.cjs` passed all **5 groups** using actual isolated
Auth emulator sessions and fake `.test` accounts:

1. Signed-in guest uses both homepage buttons with local login flags removed and
   `resortUsers=[]`, reaches reservation and retains the same Firebase UID.
2. Each signed-out button goes through the fixed sign-in return to the form.
3. Direct access and refresh restore Auth without a second login; a signed-out
   refresh returns through login and preserves name/date/requests/KTV selection.
4. Fresh homepage availability choices survive sign-in and supersede an old draft.
5. External next URL is ignored; admin still routes through admin-dashboard
   (redirected to the safe admin list in the isolated test).

All external cloud/email calls were blocked and there were zero page errors.
The new suite did not submit a booking or send a device command.

Repeat with the existing Node/Java/dependency setup:

```powershell
Set-Location -LiteralPath 'C:\Users\Admin\Projects\catherines-diorama-IOT-BASED'
$env:CHROME_PATH = 'C:\Program Files\Google\Chrome\Application\chrome.exe'
npx firebase emulators:exec --only auth,database --project demo-catherines-reservations --config firebase.emulators.json 'node tests/booking-navigation.test.cjs'
npm run test:phase2a2
npm run test:phase2c2
npm run test:cloud-preparation
node tests/register.test.cjs
```

Run suites sequentially. Workstation Node/cache details are in Phase 2B.2. Port
5000 selects the demo emulators; port 5001 continues to select the unchanged cloud
reservations app. No live sign-in, live booking, Firebase deployment or hardware
operation was performed in this fix. The port 5001 manual test remains with the user.

## Completed regression results

- New navigation suite: **5 groups passed**, exit 0.
- `npm run test:phase2a2`: **11 groups passed**, exit 0, including authenticated
  booking submission/failure/retry and saved-reference checks.
- `npm run test:phase2c2`: **12 groups passed**, exit 0.
- `npm run test:cloud-preparation`: passed, exit 0.
- `node tests/register.test.cjs`: **6 groups passed**, exit 0.
- All four changed/new JavaScript files passed syntax checks; `git diff --check`
  passed. Runtime logs are in ignored `test-results/booking-*.log`.

Hard-refresh the open port 5001 homepage before manually trying the updated links.
