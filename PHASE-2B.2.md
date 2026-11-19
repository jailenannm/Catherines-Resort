# Phase 2B.2 — first RFID assignment for confirmed bookings

This phase adds explicit administrator UID entry inside the existing RFID column
of Master Reservations. It uses the existing named Firebase app
`shared-reservations`, existing feedback badge, and Phase 2B.1 typography.
No live rule publication, role assignment, real-card scan, email or hardware
command is performed by this implementation or its automated checks.

## UID format verified against reader code

The local reader uses MFRC522 and builds its UID in
`esp32_firmware/ESP1_Mechanics/ESP1_Mechanics.ino`, lines 384–394:
`String(rfid.uid.uidByte[i], HEX)` is concatenated, then uppercased and written
as the legacy `lastUid` payload. It does **not** pad individual bytes to two
hex characters. `js/check-in.js` compares that legacy string literally with
local `rfidLinked`; it does not resolve missing byte boundaries or zeros.
Neither file was changed.

For the new web assignment, `normalizeRfidUid` accepts a complete, independently
verified card UID as **4, 7 or 10 bytes**: 8, 14 or 20 hex digits. These are the
MFRC522 library's documented UID lengths. Upper/lowercase compact input and
space/colon/hyphen-separated two-digit bytes are accepted. Storage is uppercase
hex with no separators, and no numeric conversion is used. Leading zeros and
zeros within every byte are preserved. Missing zeros are never guessed or padded.
Short legacy demo values such as `8801` and partial-byte groups are rejected.

Format illustration only (also used as an emulator fixture):
`00:01:a2:0f` becomes `0001A20F`. The current firmware would instead emit
`01A2F` for those bytes; the original byte boundaries cannot be reconstructed
reliably from that string alone. Even an abbreviated output with a valid-looking
length is not proof of a full UID. Obtain the true bytes and byte count from a
trusted full card readout before manual assignment. The web form validates format,
not physical possession or card authenticity. It does not read or generate cards.

**Still to confirm for later shared check-in:** actual deployed card type/UID
length, a full byte-preserving readout for those cards, and a coordinated
zero-padded reader payload/comparison contract. Do not assume the canonical UID
will match the existing lossy `lastUid` string. Firmware, physical reading and
the legacy check-in path remain outside this phase.

References: [MFRC522 Uid structure](https://github.com/miguelbalboa/rfid/blob/master/src/MFRC522.h),
[MFRC522Extended UID lengths](https://github.com/miguelbalboa/rfid/blob/master/src/MFRC522Extended.cpp).

## First-assignment policy and atomic uniqueness

No card-reuse policy was found in the checkout. Before implementing this flow,
the conservative scope was stated: **first assignment only**, no replacement,
unassignment, release or reuse. An administrator can assign only to a booking
that is already `Confirmed` and whose RFID is still blank. Approval and RFID
assignment cannot be combined into one request to bypass that requirement.

One atomic root PATCH writes exactly two leaves in the reservations project:

| Path | Value |
| --- | --- |
| `sharedReservations/<reference>/rfidLinked` | Canonical UID string |
| `rfidAssignments/<canonical-UID>` | Same booking reference |

The rules require authenticated, non-anonymous `admin: true` for both writes.
They validate that the two **post-write** entries point to each other. The
reservation must previously be Confirmed/unassigned, and the UID index must
previously be absent. The operation either saves both leaves or neither. No
broad root write permission was added. In simultaneous requests, the first
committed claim makes a competing claim fail; different cards racing for the
same booking likewise leave one valid pair and no orphan index entries.

Only `rfidLinked` changes on the booking. Status remains Confirmed; reference,
owner, prices, facilities, guest details and timestamps remain identical. The
index is administrator-readable only. Guests still query their own records as
before, but the guest subscription strips the UID from its view model and
provides a boolean `rfidAssigned` instead. My Reservation renders Assigned or
Unassigned and never renders the UID. This is UI/view-model masking: existing
owner-authorized reads of a full reservation still include its `rfidLinked`
field. Field-level UID confidentiality from the owner API is not claimed.

The UI never invents an RFID value or prepopulates the UID input. Explicit
submission is required. Per-booking locks prevent duplicate in-flight requests;
a retry of the exact confirmed pair performs no new write. Input survives a
failed save and unrelated realtime re-renders. A lost acknowledgement reports no
save success unless a fresh server read verifies both entries. Reads straddling
another admin's commit are rechecked before reporting an inconsistent/reused card.

Card assignment does not imply check-in: facility controls remain locked by the
actual `ControlShell` predicates, and no local currentReservation/history,
email function or device command is used. All other state transitions and device
paths remain outside the operation.

**Policy still needed later:** whether/when to release a card after a completed
stay, whether replacement is permitted, who may do it, and how old assignment
history is retained. Until that is decided and implemented with corresponding
rules, a claimed card cannot be recycled into another booking—even after a
future checkout. No reassignment or cleanup capability is silently introduced.

## Exact local rules file for review

The file to review and later publish is
**[shared-reservations.rules.json](shared-reservations.rules.json)**, in full,
including the new `rfidAssignments` subtree and the reciprocal validation on
`sharedReservations/$reference/rfidLinked`. Existing create/approval/read rules
remain, with unchanged-status validation permitted during RFID assignment.
Only the new reservations project `atherines-resort-reservations` should
receive these rules after review. Nothing has been published here. Do not apply
them to the old diorama project.

```powershell
Set-Location -LiteralPath 'C:\Users\Admin\Projects\catherines-diorama-IOT-BASED'
Get-Content -LiteralPath '.\shared-reservations.rules.json' -Raw | Set-Clipboard
```

For a later manual publication, verify Project settings > General shows
`atherines-resort-reservations`, the Console URL contains that project ID,
and the database URL is exactly
`https://atherines-resort-reservations-default-rtdb.asia-southeast1.firebasedatabase.app`.
Live testing and publication remain deferred. A deployed older ruleset is
expected to reject the new assignment until you review/publish this update.

## Files and functions changed

| File | Changes |
| --- | --- |
| `js/shared-reservations.js` | `request` supports explicitly selected shared/index/root paths on the same named-app database; new `normalizeRfidUid`, `assignConfirmedRfid`, `assignRfid`; `subscribeReservations` gives guest views only assignment state |
| `js/admin-reservations.js` | Existing RFID column gains a labeled UID input/submit form for Confirmed, unassigned rows; `renderMasterReservations`, `bindRowActionButtons`, `mapMeshStatus`, `showFolioDetailsModal`; new `assignRfidToReservation`; shared feedback/action-state helpers support approval and assignment; in-memory drafts survive re-renders |
| `js/my-reservation.js` | `renderSharedReservation` displays assignment state with no UID while leaving status and facility lock messaging intact |
| `css/admin-reservations.css` | Small appended rules for the existing RFID area's form, 1rem input/.875rem button/.75rem help, wrapping; Phase 2B.1 rules remain intact |
| `shared-reservations.rules.json` | Trusted-admin, Confirmed-only first UID assignment plus immutable, reciprocal unique-card index; unchanged status validation |
| `tests/phase2b2.test.cjs` | New emulator/browser format, authorization, atomicity, races, failure/retry, masking, preservation, access and typography tests |
| `package.json` | Add `test:phase2b2`; no dependency change |
| `PHASE-2B.2.md` | This report |
| `PHASE-2B.1.md`, `LIVE-BOOKING-TEST.md` | Add notices pointing to the newer RFID rules/scope |

HTML page structure, branding, firmware, physical reading, check-in/checkout,
facility controls, Firebase project configuration, default diorama app/connection
and all pre-existing local records/edits are preserved. The new UID form is
created inside the existing RFID area; no page redesign or separate enrollment
page was added. Test UIDs are synthetic emulator fixtures only, not live card
assignments.

## Repeat automated verification

Use the Node/Java/Chrome paths from the previous phases on this workstation:

```powershell
Set-Location -LiteralPath 'C:\Users\Admin\Projects\catherines-diorama-IOT-BASED'
$env:PATH = (Join-Path $env:TEMP 'catherines-phase2a2-tools\node-v22.16.0-win-x64') + ';C:\Program Files\Weka-3-8-7\jre\jre-25.0.2-full\bin;' + $env:PATH
$env:CHROME_PATH = 'C:\Program Files\Google\Chrome\Application\chrome.exe'
$env:FIREBASE_EMULATORS_PATH = Join-Path $env:TEMP 'catherines-phase2a2-tools\emulators'
$env:XDG_CONFIG_HOME = Join-Path $env:TEMP 'catherines-phase2a2-tools\config'
$env:CI = 'true'
$env:DEBUG = ''
npm run test:phase2b2
npm run test:phase2b1
npm run test:phase2a2
npm run test:cloud-preparation
```

Run emulator suites sequentially. Each starts/stops only loopback Auth/RTDB for
`demo-catherines-reservations` with the local rules file. Browsers use isolated
contexts and block live-project/email requests. No service-account credential or
real-card interaction is involved.

Phase 2B.2 coverage includes valid 4/7/10-byte formats and leading zeros;
invalid/incomplete UID rejection without writes; guest/unauthenticated/spoofed-role
rejection; pending and combined approval/assignment rejection; partial/orphan and
noncanonical writes; immutable booking fields; forced failure/input retention;
re-render draft retention; duplicate clicks; same-card/two-booking and
two-card/one-booking races; no orphan claims; repeated pair with zero writes;
replacement/removal/index deletion/reuse denial; reads straddling a commit;
lost acknowledgement/recovery; guest view/reload with no UID rendering;
administrator-only registry reads; Confirmed/locked facility access; and zero
emails, device/live-project requests or page exceptions.

New RFID controls are checked at 1440×1000 CSS px/DPR 1 and 720×500 CSS px/DPR 2
(100% and 200%-equivalent desktop layouts). Checks cover 16px inputs/14px buttons,
contained scrolling, child clipping and overlaps. Screenshots in
`test-results/phase2b2-100-percent.png` and
`test-results/phase2b2-200-percent.png` were inspected visually. CDN fonts/icons
are blocked in isolated checks; the established font families/colors remain
unchanged. Native zoom with loaded CDN fonts, a real-card readout and live cloud
assignment remain manual work outside this emulator-only phase.

References: [atomic Firebase multi-location updates](https://firebase.google.com/docs/database/web/read-and-write),
[newData/parent snapshots and validation](https://firebase.google.com/docs/reference/security/database).

## Completed local verification

- `npm run test:phase2b2`: all 11 groups passed; final rerun exited 0.
- `npm run test:phase2b1`: all 9 approval regression groups passed.
- `npm run test:phase2a2`: all 11 submission/authentication regression groups passed.
- `npm run test:cloud-preparation`: passed.
- JavaScript syntax checks and `git diff --check`: passed.
- Original Firebase/device configuration, diorama connector, page HTML and firmware were preserved; Phase 2B.1 CSS remains intact as the prefix of the stylesheet.

No cloud rules were deployed, live bookings changed, real emails sent, hardware
commands issued or physical cards read. Real-card format confirmation and native
browser zoom with network fonts remain the manual limitations described above.
