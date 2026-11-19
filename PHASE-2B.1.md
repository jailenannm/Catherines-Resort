# Phase 2B.1 — admin approval and Master Reservations readability

> Phase 2B.2 now adds first RFID assignment and a unique card index to the same
> local rules file. See [PHASE-2B.2.md](PHASE-2B.2.md) for current RFID format,
> no-reassignment policy and verification. Nothing has been published live.

Only local changes and demo-project emulator verification were performed.
No cloud rules were published, live claims changed, real emails sent or hardware
commands issued. RFID assignment remains Phase 2B.2.

## Approval behavior

The existing Approve button calls the shared adapter rather than the local
ResortDB status handlers. The adapter requires Firebase Auth with the trusted
boolean `admin: true` claim on the named `shared-reservations` app.

Approval reads the status and its ETag from the server and conditionally PUTs
only `/sharedReservations/<reference>/status` as `Confirmed`. Per-reference
UI and adapter locks suppress duplicate requests in a page. Two independent
admins can race safely: the ETag and database rule permit one transition; the
other reads back the already-confirmed state and does not apply another write.
No local history or `currentReservation` record is edited.

Success feedback uses the existing showing-entries badge with an aria-live status
role and appears only after the server confirms the write or a fresh server read
confirms a concurrent/already-committed result. An unconfirmed failure restores
the button and permits retry. A lost acknowledgement cannot cause a second
transition. Canonical status changes reach both Master Reservations and the
owner's My Reservation through the existing realtime subscriptions.

The exact same booking object is retained except for `status`: no ownership,
reference, prices, facilities, timestamps or guest details are changed. RFID
stays an empty string; there is no node/access assignment. The existing
`ControlShell.isCheckedIn` and `accessFor` predicates reject `Confirmed`.
Admin display defaults no longer mark an approved booking paid or count its
guests as checked in. Guest package/status captions show the canonical status
while still explaining that RFID/access require later check-in work.

## Exact rules file for review and later publication

Publish the entire **[shared-reservations.rules.json](shared-reservations.rules.json)**
to **atherines-resort-reservations**, after your review. This preparation leaves
the deployed rules unchanged. Do not publish to the old diorama project.

The existing record-level write permission still allows only validated initial
creation by the guest owner. One new, narrower child permission at
`sharedReservations/$reference/status` allows a non-anonymous trusted admin
only when the stored status is exactly `Pending Verification`, the new value
is exactly `Confirmed`, and existing `rfidLinked` is empty. Field validation
allows initial pending creation or that transition. Owner validation explicitly
retains the existing owner on updates. No write permission was added for RFID,
other booking fields or any device path. Parent/full-record replacement and
multi-field tampering are denied; repeat/no-op/rollback/status escalation and
deleting a booking remain denied. Non-approval operations still show existing
feedback explaining that no update occurred.

```powershell
Set-Location -LiteralPath 'C:\Users\Admin\Projects\catherines-diorama-IOT-BASED'
Get-Content -LiteralPath '.\shared-reservations.rules.json' -Raw | Set-Clipboard
```

Paste only into the reservations project's Realtime Database > Rules. Confirm
Project settings > General has `atherines-resort-reservations`, the Console
URL contains that project ID, and the selected database URL is
`https://atherines-resort-reservations-default-rtdb.asia-southeast1.firebasedatabase.app`.
No live deployment or role assignment is part of this phase. Previously
published Phase 2A.2 rules will continue denying approval until you review and
publish this local update.

## Typography scope

Only `css/admin-reservations.css` changes typography. Existing HTML structure,
branding, font-family declarations, palette, navigation, seven-column table and
facility timeline remain. Font sizes now use rem, with body/form inputs at 1rem
(16px with the default root), primary table/buttons/filter/timeline text at
.875–1rem (14–16px), and captions/badges at .75–.875rem (12–14px).

Line-height, wrapping, control height, sidebar scrolling and responsive tabs
were adjusted for the larger text. The table and timeline scroll horizontally
inside their own cards so columns/actions stay readable rather than shrinking
text or overflowing the page. At narrow/zoomed widths, filters and headings wrap.
Static demonstration timeline contents are unchanged; typography does not turn
those existing demo values into live telemetry.

## Files and functions changed in this phase

| File | Changes |
| --- | --- |
| `js/shared-reservations.js` | `request` optionally returns ETags; new `approvePendingReservation` and public `approveReservation` with conditional status-only writes and per-reference locks |
| `shared-reservations.rules.json` | Narrow status-child admin transition permission/validation; immutable existing owner validation |
| `js/admin-reservations.js` | Existing Approve binding; new `showApprovalFeedback` and `bindApprovalState`; async `updateReservationStatus`; feedback persistence in `applyFilters`; `updateMetrics`, `mapMeshStatus` and payment display defaults keep approval separate from access/payment |
| `js/my-reservation.js` | `renderSharedReservation` and `updateExperienceCount` reflect Confirmed while leaving RFID/access/payment unassigned/unsettled |
| `css/admin-reservations.css` | Page-scoped rem typography, wrapping, line-height and contained scrolling |
| `tests/phase2b1.test.cjs` | New emulator/browser approval, authorization, concurrency, failure, preservation, access and typography checks |
| `tests/phase2a2.test.cjs` | Replace the obsolete admin-approval-denied expectation with denied Active escalation and blocked cancellation; keep earlier submission regression coverage |
| `package.json` | Add `test:phase2b1` command; no dependency changes |
| `PHASE-2B.1.md` | This scope, rule publication and verification report |
| `LIVE-BOOKING-TEST.md` | Add a notice linking this newer approval rules/behavior description |

The existing local edits were preserved. Firebase project configurations, the
separate named-app setup, cloud-test port setup, login/register forms, local
ResortDB store, ESP32 firmware, `js/diorama-link.js`, and `/diorama`
integration were not changed in this phase.

## Repeat local verification

Use Node.js 22+, Java 21+ and Playwright Chromium or Chrome. On this workstation
the runtime paths from the previous phase are still usable:

```powershell
Set-Location -LiteralPath 'C:\Users\Admin\Projects\catherines-diorama-IOT-BASED'
$env:PATH = (Join-Path $env:TEMP 'catherines-phase2a2-tools\node-v22.16.0-win-x64') + ';C:\Program Files\Weka-3-8-7\jre\jre-25.0.2-full\bin;' + $env:PATH
$env:CHROME_PATH = 'C:\Program Files\Google\Chrome\Application\chrome.exe'
$env:FIREBASE_EMULATORS_PATH = Join-Path $env:TEMP 'catherines-phase2a2-tools\emulators'
$env:XDG_CONFIG_HOME = Join-Path $env:TEMP 'catherines-phase2a2-tools\config'
$env:CI = 'true'
$env:DEBUG = ''
npm run test:phase2b1
npm run test:phase2a2
npm run test:cloud-preparation
```

Run emulator suites sequentially, not simultaneously: each starts/stops loopback
Auth/RTDB for `demo-catherines-reservations` using
`firebase.emulators.json` and the local rules file. Browser sessions intercept
SDK/EmailJS requests and block live project access. No service-account credential
is required or read.

The Phase 2B.1 checks cover: valid admin approval and guest live update; guest and
unauthenticated rejection; local role spoofing; atomic denial of ownership,
price, facility, detail and RFID tampering; wrong status transitions; forced
write failure with retry; duplicate clicks; two-admin concurrency with exactly
one successful status write; repeat/no-op/rollback/deletion denial; reload;
field-for-field preservation apart from status; empty RFID/no node; the actual
facility access predicate remaining locked; lost commit acknowledgement with
safe retry; zero email/device/live-project requests; and page exceptions.

Typography checks use separate browser contexts at 1440×1000 CSS px/DPR 1 and
720×500 CSS px/DPR 2, reproducing 100% and 200% desktop zoom layout on the same
physical screen size. They check computed sizes, page overflow, child content
clipping and overlapping controls. Screenshots are saved as
`test-results/phase2b1-100-percent.png` and
`test-results/phase2b1-200-percent.png` and inspected visually. Additional
`phase2b1-100-percent-actions.png` / `phase2b1-200-percent-actions.png` captures
show the accessible right-hand action columns after horizontal scrolling. External CDN
fonts/icons are blocked in the isolated suite; font-family declarations remain
unchanged, so screenshots use browser fallbacks when those assets are absent.
Native browser zoom with network-loaded fonts and live-cloud approval were not
exercised; those remain manual review steps after rules publication.

References: [Firebase conditional REST updates](https://firebase.google.com/docs/database/rest/save-data),
[child permissions and validation](https://firebase.google.com/docs/database/security/core-syntax).

## Completed local results

- `npm run test:phase2b1`: all 9 groups passed, exit 0.
- `npm run test:phase2a2`: all 11 regression groups passed, exit 0.
- `npm run test:cloud-preparation`: passed, exit 0.
- Client/test JavaScript syntax checks and `git diff --check`: passed.
- Final 100% and 200%-equivalent screenshots, including horizontally scrolled
  action-column screenshots, were visually inspected. Automated checks reported
  no page overflow, clipped child contents or overlapping controls. Computed
  body/input/select sizes were 16px, primary table/filter/button/timeline sizes
  were 14px and secondary timeline/badge sizes were 12px at the default root.
- HTML, device configuration and connector were compared with their pre-edit
  contents and preserved; firmware had no diff. No live writes or publication
  were performed.
