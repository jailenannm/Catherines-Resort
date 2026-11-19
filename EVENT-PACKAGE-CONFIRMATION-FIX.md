# Confirmation, Celebration Event Package and security badge fixes

## Confirmation error: exact cause and saved-booking state

The blocked URL was **`http://127.0.0.1:5001/guest-dashboard.html`**. The existing
`#closeModal` handler in `js/reservation.js` always navigated there. The restricted
server in `tests/serve.cjs` deliberately does not allow that path, so it returned
HTTP 403 with "This cloud-test server serves reservation pages only."

That handler runs after successful confirmation. `createReservation` can already
have saved the pending booking, returned its reference and opened the modal before
the navigation error appears. The blocked page is not evidence that the save
failed. Existing cloud bookings were not removed or rewritten by this fix.

The modal still opens and displays a reference only after a successful shared
save (or fresh server-confirmed recovery of the same attempt). The cloud-test
mode is now explicitly exposed from the existing host/port selection as
`SHARED_RESERVATIONS_CONFIG.cloudTest`. On port 5001, the existing button says
View Reservation and opens `my-reservation.html?reservation=<saved-reference>`.
Backdrop close and Escape do the same. My Reservation uses that reference only
within the authenticated guest's owned records; it does not silently choose a
newer booking. A foreign/missing selection cannot reveal a record.

Outside cloud-test mode the normal button destination remains
`guest-dashboard.html`, and backdrop/Escape retain their existing close behavior.
Failed saves remain on the form with the existing feedback and preserved inputs.
The per-attempt reference/ID and duplicate-click protections remain unchanged.
Device routes/scripts stay blocked; the server allowlist was not expanded.

## New Event bundle, versioned without rewriting older bookings

Step 3 now offers **Celebration Event Package**, explicitly including **Event
Place, Swimming Pool, and Stage Band**, using the existing `event` ID and
**PHP 15,000** price. Stage Band is one inclusion, with no extra checkbox, fee,
page, device command or firmware feature.

Standalone Pool remains PHP 1,200. When Event is checked, selection normalization
clears/disables the standalone Pool checkbox and shows the existing card's inline
included-Pool notice. Removing Event re-enables Pool-only selection. Prefills,
drafts, review and submission use the same normalization. The adapter also rejects
a raw new submission containing separately billed Event and Pool.

A new Event facility entry carries **`packageVersion: 2`** and one canonical name:
`Celebration Event Package — Event Place, Swimming Pool & Stage Band`. Existing
summary/review, guest and admin renderers receive that one line item from the saved
record/shared adapter. The new rules allow that marker only on Event and require
it for a newly created Event booking. They reject new Event-plus-Pool charges
across all supported item positions.

The new combination constraint applies only to creation (`data.exists()` is
false). Older records, including separately billed Event and Pool, retain their
original line items, descriptions and stored prices. Approval/RFID/check-in are
not migrations and do not rewrite them. My Reservation now displays saved price
components/totals when available instead of recomputing old receipts.

Versioning is also the entitlement boundary: a **version 2** Event booking with
verified **Checked In** status is eligible for **Event and Pool**. An older,
unversioned Event-only booking retains its former Event-only meaning; a legacy
booking that explicitly includes Pool keeps that Pool inclusion. Pool-only never
grants Event. Ownership, exact Checked In status, server verification, lease and
revocation checks remain unchanged. Guest device dispatch and live RFID check-in
remain disabled.

| Selection | Subtotal | Tourism fee | 8% service | Total |
| --- | ---: | ---: | ---: | ---: |
| Event Package | 15,000 | 250 | 1,200 | **16,450** |
| Pool-only | 1,200 | 250 | 96 | **1,546** |
| Existing legacy Event + Pool example | 16,200 | 250 | 1,296 | **17,746**, retained |

## Badge and layout

Removed the entire 256-bit Encrypted Reservation Vault badge and icon, its desktop
and mobile CSS, and the intro flex gap/space-between allocation used by that
second item. Surrounding heading/content, page structure, branding, fonts and
colors are retained. The included-Pool notice uses the existing selection-note
style and wraps inside the Pool information column.

## Exact files/functions changed

| File | Change |
| --- | --- |
| `reservation.html` | Step 3 Event title/inclusions and Pool notice; remove badge/icon markup |
| `css/reservation.css` | Remove badge-only styling/spacing; scope included-Pool notice wrapping/hidden state |
| `js/reservation.js` | New `normalizeEventSelection`; `updateFacilities` emits version 2 Event; `getFacilityName` includes all three inclusions; `buildReservationObject` combination guard; cloud-aware `reservationConfirmationDestination`/modal button/backdrop/Escape |
| `js/shared-reservations-config.js` | Expose existing loopback-port-5001 `cloudTest` flag; cloud/emulator projects and credentials unchanged |
| `js/shared-reservations.js` | `normalize` supplies canonical new bundle label; `createReservation` rejects double-billed Event/Pool before a new write, while existing-attempt recovery remains intact |
| `js/my-reservation.js` | Owned explicit-reference selection; payment summary uses saved components/totals, preserving older receipts |
| `js/guest-access.js` | `includes` grants Pool for version 2 Event, retaining exact saved status/owner checks and disabled command dispatch |
| `shared-reservations.rules.json` | Creation-only package-combination validation; versioned Event facility field validation; legacy transition permissions preserved |
| `tests/event-package.test.cjs` | New actual SDK/Auth/RTDB emulator integration, port-5001 navigation, rules, legacy transitions, entitlements and responsive screenshots |
| `EVENT-PACKAGE-CONFIRMATION-FIX.md` | This report |

`js/admin-reservations.js` needs no edit: it already renders saved facility names
and saved totals supplied by the adapter. `tests/serve.cjs` was traced and reused
unchanged; its restrictions remain intentional.

## Checks completed

The new suite passes **5 integration groups**, covering:

- Event alone, Pool alone, Pool followed by Event, removing Event, directly
  restoring a draft containing both; one summary and one review package line with
  all inclusions; correct total and re-enabled Pool-only option.
- A forced save failure with zero records/modal and preserved input, then retry
  plus repeated click: exactly one pending booking, same attempt/reference, blank
  RFID; confirmation, My Reservation and Master Reservations agree.
- Actual port 5001 button, Escape and backdrop destinations; same owned reference;
  normal-app destination unchanged. Device pages and scripts still return 403.
- Raw new database writes with both Event and Pool, or an unversioned new Event,
  are denied. Legacy separately billed bookings retain details/totals through
  actual admin approval, RFID assignment and trusted emulator-fixture check-in.
- New pending/Confirmed Event remains ineligible; verified Checked In version 2
  Event becomes eligible for Event and Pool; checked-in Pool-only leaves Event
  locked; deviceAuthorized/guestAction still deny physical dispatch.
- Badge and icon absent; 1440px desktop and 390px mobile screenshots, no horizontal
  page overflow, no diorama subtree, live-project requests or browser exceptions.

The suite runs the cloud-test UI at port 5001 but overrides Auth/RTDB to the demo
emulators **inside the isolated test browser only**. It never changes the served
cloud configuration or contacts the live project. Test-only trusted fixtures
represent legacy records and scans; no physical card or real check-in is claimed.

Prior regression results:

- `test:phase2a2`: **11 groups passed**.
- `test:phase2b1`: **9 groups passed**.
- `test:phase2b2`: **11 groups passed**.
- `test:phase2c1`: **9 groups passed**.
- `test:phase2c2`: **12 groups passed** (its unversioned Event fixture retains its
  historical Event-only behavior).
- `test:cloud-preparation`: passed.
- `node tests/register.test.cjs`: **6 groups passed**.

## Repeat, restart and publication

With the existing workstation Node/Java/dependencies:

```powershell
Set-Location -LiteralPath 'C:\Users\Admin\Projects\catherines-diorama-IOT-BASED'
$env:CHROME_PATH = 'C:\Program Files\Google\Chrome\Application\chrome.exe'
npx firebase emulators:exec --only auth,database --project demo-catherines-reservations --config firebase.emulators.json 'node tests/event-package.test.cjs'
```

The test reuses an existing port 5001 server without stopping it, or starts an
isolated restricted server if absent. Run emulator suites sequentially. Logs and
screenshots are in ignored `test-results/event-*.log` / `*.png`.

**No local server restart is required** for these static-file changes: the server
reads them on each request, and its own code/allowlist is unchanged. Hard-refresh
the reservation page to load the new script/config. Restart only if no local
server is running, using the existing `npm run serve:cloud-test` command.

**Updated rules must be reviewed and published manually to
`atherines-resort-reservations` before live Event Package submission.** Publish
the complete local `shared-reservations.rules.json` to that reservations database,
not the separate diorama project. Older deployed rules reject the new facility
version field. No rules or configuration were deployed by this task, and no live
bookings/emails/hardware commands or firmware changes were made.

Final rerun of the new integration suite passed all 5 groups after capturing
selected-Event screenshots. Step 3 and the badge-free intro were visually reviewed
on desktop/mobile. Syntax checks for all six changed/new JavaScript files and
`git diff --check` passed. No local server process was restarted or stopped.
