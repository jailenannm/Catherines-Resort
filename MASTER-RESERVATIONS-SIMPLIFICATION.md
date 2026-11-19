# Master Reservations simplification

Implemented in the existing checkout without reverting earlier local changes.

## Check-in diagnosis and behavior

The old `.quick-checkin` click handler in `js/admin-reservations.js` navigated directly to **`check-in.html`**. On `http://127.0.0.1:5001`, that requested **`http://127.0.0.1:5001/check-in.html`**, which is excluded by `cloudPages` in `tests/serve.cjs`; the server returns HTTP 403 and “This cloud-test server serves reservation pages only.” The old row handler did not itself save Checked In before navigating.

The row now stays on Master Reservations:

- Confirmed, unassigned: **Assign an RFID card first**, beside the compact Assign RFID panel.
- Confirmed, assigned, cloud-test mode: **RFID check-in is unavailable in this test mode**.
- Confirmed, assigned, normal mode: explains that a trusted live scanner is not configured.
- Pending and already checked-in rows have no misleading check-in action.

The existing check-in desk explicitly disables scanning in `js/check-in.js`; there is no supported live scan readiness/configuration contract in this checkout. Consequently, no environment currently gets an actionable Open Check-in Desk link. The controller retains a navigation-only eligible/configured branch, gated off until the actual trusted live integration exists. A browser flag, local role, UID input, or card assignment cannot enable live check-in. The trusted verifier, check-in desk, saved-status authorization, firmware and facility controls are unchanged. No row action writes Checked In or dispatches device commands.

## Simplification

- Seven columns: Reference & Date, Guest, Package / Facilities, Booking Total, Status, RFID Assignment, Actions.
- Actual saved statuses replace Guaranteed/Settlement/inferred lifecycle text. Saved totals have no fallback charge or payment claim.
- View Details opens a native accessible dialog containing the selected reference/status, saved check-in date, stay label, contacts, guest breakdown/count, package inclusions, nonblank requests and saved price breakdown. Escape/Close returns focus. Selecting another record replaces old content. Legacy `4500` displays Duration unavailable; records/totals are not migrated or recalculated.
- RFID rows show Assigned/Unassigned. Confirmed unassigned bookings have a native keyboard-operable, initially collapsed details panel for complete UID entry. Existing shared adapter validation and atomic assignment remain unchanged. Drafts/open panels survive realtime re-rendering and failed saves; success requires the adapter's server-confirmed result.
- Search, actual-status filters, facility filters and real check-in-date filters work. Today/Tomorrow labels use the current local date; default is All dates. Event version 2 includes Pool for filtering, while old unversioned Event retains its meaning.
- Removed sample timeline/rack occupants, node/lighting/beacon readings, hard-coded hardware-online claims, unsupported Cancel/restore/checkout buttons and New Walk-in Reservation. The old walk-in shortcut only opened the guest booking form; it was not an administrator walk-in creation flow.
- Retained Export CSV as a working download from the currently filtered shared records. It exports saved fields, quotes commas/quotes, guards spreadsheet-formula prefixes, and omits RFID UIDs and fabricated hardware/payment columns.
- Metrics now show actual booking count, pending verification count and saved Checked In guest count; no inferred cottage allocation or paid revenue.
- Sidebar changes are confined to this page. Dedicated hardware navigation remains in supported normal environments and is hidden in restricted cloud-test mode. The page no longer loads its unused local database or email SDK.
- Existing cream/gold/brown palette and Cormorant Garamond / DM Sans families remain. Body/inputs are 16px; table/status/actions/captions are at least 14px. Desktop tables scroll within their card; mobile uses labeled reservation cards without horizontal page scrolling. Sign Out has visible text as well as an accessible name.

## Exact changed files

Application:

- `admin-reservations.html`
- `js/admin-reservations.js`
- `css/admin-reservations.css`

Verification/documentation:

- `tests/master-reservations.test.cjs` (new focused emulator/browser suite)
- `tests/phase2a2.test.cjs` (assert unsupported Cancel is absent)
- `tests/phase2b1.test.cjs` (assert no fabricated settlement label)
- `tests/phase2b2.test.cjs` (open compact RFID panels and check Assigned instead of displaying UID; retain all security/concurrency checks)
- `package.json` (`test:master-reservations` command)
- This report, `MASTER-RESERVATIONS-SIMPLIFICATION.md`

`tests/serve.cjs`, `js/shared-reservations.js`, Firebase configuration/rules, check-in verifier, guest access behavior, firmware and dedicated hardware pages were inspected/reused where relevant and were not changed.

## Checks actually run

All **38 groups passed**:

| Suite | Passing groups |
| --- | ---: |
| Master Reservations | 7 |
| Phase 2B.1 approval | 9 |
| Phase 2B.2 RFID assignment | 11 |
| Phase 2A.2 shared booking integration | 11 |

The focused suite used a fresh restricted server on port 5014 with cloud-test navigation and browser configuration explicitly forced to the demo Firebase emulators. It covered pending, confirmed unassigned, confirmed assigned, and checked-in fixtures; exact row labels; details/legacy slot/switching/focus return; approval repeat clicks; invalid UID; forced assignment failure, retained input, retry and repeat clicks; leading zeros and reciprocal UID index; reference/status/date/Event-to-Pool filters; actual filtered CSV download; blocked check-in URL; unconfigured normal mode; guest denial; 1440px desktop, 390px mobile and 720px reflow; and no browser errors or unexpected alerts.

Existing lifecycle suites additionally verified unauthorized writes, simultaneous administrators, one-card/two-booking races, different-card/same-booking races, lost acknowledgements, no-op retries, preserved details, guest live updates, locked access after approval/assignment, and separate owner/admin views. Phase 2B.1/2 typography checks used desktop 100% and 200%-equivalent viewport/DPR settings without clipping or overlapping controls. These are automated reflow checks, not a physical browser zoom-key or real phone test.

Tests blocked external live Firebase/email services, used local SDK copies, and verified no emulator `/diorama` subtree was created. No real email, live cloud booking or physical device command was sent. Node syntax checks and Git whitespace checks passed. Screenshots were inspected under ignored `test-results/master-reservations-{desktop,mobile,reflow}.png`; prior source snapshots are under ignored `test-results/master-reservations-before/`.

Repeat in PowerShell with Node 22+, Java and Chrome available:

```powershell
$env:CHROME_PATH = 'C:\Program Files\Google\Chrome\Application\chrome.exe'
npm run test:master-reservations
```

## Server and deployment

**Port 5001 does not need a restart for this change.** The existing server reads these same HTML/JS/CSS paths on each request; no route allowlist or server code changed. Refresh or hard-refresh `http://127.0.0.1:5001/admin-reservations.html`.

No Firebase rule/configuration publication is needed for this task. No deployment was performed. Live check-in remains blocked until a trusted full-UID scan source and its server verification/readiness integration are configured; the manual live test and physical controls remain outside this work.
