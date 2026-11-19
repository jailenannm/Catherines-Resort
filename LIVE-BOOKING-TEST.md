# First live reservation test (operator-run only)

> Phase 2B.2 now adds first RFID assignment and a unique card index to the same
> local rules file. See [PHASE-2B.2.md](PHASE-2B.2.md) for current RFID format,
> no-reassignment policy and verification. Nothing has been published live.

> Phase 2B.1 adds admin-only pending → confirmed approval to the same local
> rules file. See [PHASE-2B.1.md](PHASE-2B.1.md) for the current rule change and
> verification. Statements below that all admin updates are denied describe
> Phase 2A.2; only approval is now enabled locally. RFID remains Phase 2B.2.

Target project: **atherines-resort-reservations** (the spelling starts with
`atherines`). Client named app: **shared-reservations**. Booking path:
`/sharedReservations/<reference>`. Neither this preparation nor the local
verification publishes rules, assigns live roles or submits live bookings.
The supplied test UID was a placeholder; enter the real UID locally below.

## 1. Review and publish the exact rules yourself

Use the entire [shared-reservations.rules.json](shared-reservations.rules.json)
file from Phase 2A.2, including its outer `{ "rules": ... }` object. The file
was reviewed without modification during this preparation. Do not paste a short
excerpt or the emulator configuration file.

The rules provide:

| Request | Result |
| --- | --- |
| Signed-in email/password guest creates a previously unused reference with their UID | Allowed only with all required fields, valid package prices/totals, `Pending Verification`, and empty `rfidLinked` |
| Guest queries `sharedReservations` with `orderByChild('ownerUid').equalTo(auth.uid)` | Own records only |
| Guest reads a specific existing record | Own record only |
| Authenticated guest probes an unused reference | May receive null; used only for collision checks |
| Trusted token with boolean `admin: true` reads the list | Allowed |
| Guest B reads Guest A's existing record; unauthenticated/unfiltered guest reads | Denied |
| Any client updates/deletes existing bookings, including admin status/RFID changes | Denied in this phase |
| Extra fields such as `nodeNumber`, `checkedIn` or `role`; another owner's UID; fabricated RFID; non-pending creation | Denied |
| Other database paths, including `/diorama` | Denied in this new project |

Open [the target project's RTDB Rules page](https://console.firebase.google.com/project/atherines-resort-reservations/database/atherines-resort-reservations-default-rtdb/rules).
Before clicking Publish, verify all three:

1. Project settings > General shows project ID `atherines-resort-reservations`.
2. The browser Console URL contains `/project/atherines-resort-reservations/`.
3. The selected database URL is exactly
   `https://atherines-resort-reservations-default-rtdb.asia-southeast1.firebasedatabase.app`.

From the checkout, copy the full, reviewed file locally:

```powershell
Set-Location -LiteralPath 'C:\Users\Admin\Projects\catherines-diorama-IOT-BASED'
Get-Content -LiteralPath '.\shared-reservations.rules.json' -Raw | Set-Clipboard
```

Paste it into Realtime Database > Rules in the **new** project and review the
full diff before publishing yourself. The existing locked-mode rules remain in
force until you publish. This file intentionally denies other paths; apply it to
the new reservation database, not the `catherines-diorama` device database.
No CLI deployment is required for this manual step.

In the same new project's Authentication > Sign-in method, enable **Email/Password**
(not email-link sign-in). Create distinct test guest and test admin accounts in
Authentication > Users. Copy the admin UID from this project's Users table and
note the matching email. Local/emulator users and old hard-coded credentials are
not accounts in the new project. Use non-deliverable fake account emails, for
example `cloud-guest-a@example.test` and `cloud-admin@example.test`, with
unique test passwords kept locally. No verification or reset emails are needed.

## 2. Assign the admin claim yourself from a trusted local terminal

This uses `scripts/reservations-admin-claim.cjs`, copied outside the repository.
It defaults to read-only verification. Only `--apply` plus an exact typed
project/UID confirmation can call `setCustomUserClaims`. The tool verifies the
service-account JSON's project ID, sets the Admin SDK project explicitly, looks
up the UID in that project, compares its email with your expected email, and
rejects disabled users and emulator/conflicting-project environments.

Obtain a service-account JSON for **atherines-resort-reservations** from a trusted
operator setup (Project settings > Service accounts > Firebase Admin SDK is one
option). Its service account needs Firebase Auth user read/update permissions.
Save the private JSON outside this checkout, for example under a private directory
inside `$env:LOCALAPPDATA\CatherinesReservationAdmin\credentials`. Do not
paste its contents in chat, frontend code, source control or terminal commands.
The tool prints project/UID/email and existing claim **keys**, never credentials
or existing claim values. Do not run concurrent claim-changing tools during the
update; the Auth API replaces claims rather than providing a merge transaction.

Open a fresh Windows PowerShell terminal. These commands prepare and dry-run the
tool; the final `node` command reads live Auth only when **you** execute it.

```powershell
$ErrorActionPreference = 'Stop'
$reservationRepo = 'C:\Users\Admin\Projects\catherines-diorama-IOT-BASED'
$reservationNodeDir = Join-Path $env:TEMP 'catherines-phase2a2-tools\node-v22.16.0-win-x64'
if (Test-Path (Join-Path $reservationNodeDir 'node.exe')) {
    $env:PATH = $reservationNodeDir + ';' + $env:PATH
}
node --version
npm --version

$adminTools = Join-Path $env:LOCALAPPDATA 'CatherinesReservationAdmin'
New-Item -ItemType Directory -Path $adminTools -Force | Out-Null
Copy-Item -LiteralPath (Join-Path $reservationRepo 'scripts\reservations-admin-claim.cjs') -Destination (Join-Path $adminTools 'reservations-admin-claim.cjs') -Force
Push-Location -LiteralPath $adminTools
try {
    if (-not (Test-Path -LiteralPath '.\package.json')) {
        npm init -y
        if ($LASTEXITCODE -ne 0) { throw 'npm init failed' }
    }
    npm install --save-exact firebase-admin
    if ($LASTEXITCODE -ne 0) { throw 'Admin SDK installation failed' }

    $env:RESERVATIONS_REPO_ROOT = $reservationRepo
    $env:GOOGLE_APPLICATION_CREDENTIALS = Read-Host 'Absolute path to the private service-account JSON outside the checkout'
    $env:RESERVATIONS_ADMIN_UID = Read-Host 'Test admin UID from the new project Authentication Users table'
    $env:RESERVATIONS_ADMIN_EMAIL = Read-Host 'Matching test admin email from that same Users row'
    node .\reservations-admin-claim.cjs
    if ($LASTEXITCODE -ne 0) { throw 'Dry run failed; do not apply' }
} finally {
    Pop-Location
}
```

If the temporary Node runtime no longer exists and `node` is not on PATH,
install Node.js 22+ before proceeding. Do not substitute the placeholder UID.
Confirm the dry-run output matches the new project's Console, its exact admin UID
and its email. Wrong credentials/project, missing UID or an email mismatch stops
the tool before any claim update. A freshly opened terminal should have no
`FIREBASE_AUTH_EMULATOR_HOST` or `FIREBASE_DATABASE_EMULATOR_HOST`; if the
tool reports one, use a clean cloud-operator terminal rather than the emulator
terminal.

Only after those checks, run the separate live role command yourself in that
same terminal (do not execute this as part of local/emulator verification):

```powershell
Push-Location -LiteralPath $adminTools
try {
    node .\reservations-admin-claim.cjs --apply
    if ($LASTEXITCODE -ne 0) { throw 'Role update not verified; inspect Auth before retrying' }
} finally {
    Pop-Location
}
```

The prompt requires exactly `GRANT admin TO <your-real-UID> IN atherines-resort-reservations`.
Before the write, the script fetches the user again and merges
`{ ...latest.customClaims, admin: true }`. It reads back the user and verifies
boolean `admin: true` and every prior non-admin claim. Its Admin SDK app has
no database operations. Sign the admin out and in again afterward to refresh the
ID token. Then clear the process-local credential/target variables:

```powershell
Remove-Item Env:GOOGLE_APPLICATION_CREDENTIALS, Env:RESERVATIONS_REPO_ROOT, Env:RESERVATIONS_ADMIN_UID, Env:RESERVATIONS_ADMIN_EMAIL -ErrorAction SilentlyContinue
```

## 3. Use the explicit local cloud-test port

The environment is selected per origin, not via a query string or browser-local
role. Existing emulator commands remain unchanged:

| URL/origin | Reservations target |
| --- | --- |
| `http://127.0.0.1:5000` | Demo Auth/RTDB emulators |
| Loopback on other ports except 5001 | Demo Auth/RTDB emulators |
| **`http://127.0.0.1:5001`** | **New cloud reservation project** |
| Non-loopback hosting domain | New cloud reservation project (existing behavior) |

In a separate PowerShell terminal, after the Console/account/rules steps above:

```powershell
Set-Location -LiteralPath 'C:\Users\Admin\Projects\catherines-diorama-IOT-BASED'
$reservationNodeDir = Join-Path $env:TEMP 'catherines-phase2a2-tools\node-v22.16.0-win-x64'
if (Test-Path (Join-Path $reservationNodeDir 'node.exe')) {
    $env:PATH = $reservationNodeDir + ';' + $env:PATH
}
npm run serve:cloud-test
```

Open exactly **http://127.0.0.1:5001/login.html** in each test browser profile.
Use the port-5001 server started by this command, not another general server.
Its allowlist serves reservation/sign-in pages and their static assets only.
The normal admin sign-in redirect to `admin-dashboard.html` is intercepted
server-side and redirected to `admin-reservations.html`; device pages,
`js/diorama-link.js`, `js/firebase-config.js`, firmware and operator scripts
are blocked on this server. Normal app navigation and port-5000 behavior are
unchanged. This is needed because the normal dashboard loads the old device
connector, which can seed `/diorama` defaults if its database is empty.

For this test origin the hostname is `127.0.0.1`. In the new project's
Authentication > Settings > Authorized domains, add `127.0.0.1` if absent
(host only, no `http://`, path or `:5001`). Password sign-in does not use an
OAuth redirect URI; do not enable OAuth/email-link providers for this test. The
host entry keeps this development origin explicitly configured for Auth browser
flows. If you use `localhost` instead, that is a separate domain entry; new
Firebase projects do not necessarily include it by default. Domain settings do
not select emulator versus cloud mode; port 5001 is the explicit switch here.

## 4. Manual live test (you run it; no approval/RFID work)

1. Keep `confirmationEmailEnabled: false` in `js/shared-reservations-config.js`.
   It is already false. Do not click forgotten-password/reset flows or send
   verification emails from Console. Use only the port-5001 reservation server;
   do not open the device project or device-control pages on another server.
2. Use two separate browser profiles (for example Chrome Guest and another
   browser/profile), not two tabs in the same profile. Open
   `http://127.0.0.1:5001/login.html` in both. Sign in Guest A with the new
   project's guest account, and sign in the admin with the UID you verified.
   Admin should land on `http://127.0.0.1:5001/admin-reservations.html`.
3. In Guest A, open `http://127.0.0.1:5001/reservation.html`. Use fictional
   details: name `Cloud Test Guest A`, mobile `00000000000`, contact email
   `booking-test@example.invalid`, a future check-in date, two adults,
   and request `LIVE TEST ONLY - no payment or facility access`. These details
   are intentionally not real contact information. Leave the existing stay
   selector as-is; all its options currently save the same legacy value
   `4500`, a known limitation documented in Phase 2A.2.
4. Deselect the preselected cottage and select only the pool package (1200).
   Review the unchanged summary, accept the test terms and click Confirm once.
   Expect total 1546 (1200 + 250 tourism fee + 96 service charge).
5. Wait for the success modal. Record reference `R` locally. Do not start
   another submission from a fresh reservation page. A repeated click on the
   same saved page reuses that attempt, but reloading the form starts a new one.
6. Open `http://127.0.0.1:5001/my-reservation.html`. Expect reference `R`,
   Guest A's fictional details, pool only, `Pending Verification`, unassigned
   RFID, and no facility access. Refresh this view and confirm `R` remains.
7. In the independent admin session, the list should receive exactly one new
   row with `R` and `Pending Verification`. Compare its guest details,
   package and amount with Guest A's view. Do not click Approve, Cancel, Check-in,
   Checkout or RFID controls; those operations are not part of this phase.
8. Optionally check the new project's RTDB Data tab:
   `sharedReservations/R` has the guest's Auth `ownerUid`, `status` is
   `Pending Verification`, `rfidLinked` is an empty string, and there is no
   `nodeNumber` or access flag. In the new reservations project the
   `/diorama` subtree should still be absent. Do not inspect/change live
   device state in the old project as part of this test.
9. Optional Guest B check: use a third independent profile, sign in a different
   test guest and open My Reservation. It must not display Guest A's booking.
   Do not create another booking if the goal is exactly one live test record.
10. Stop the test server with Ctrl+C. Leave the pending test record for review;
    client deletion is intentionally denied by these rules. Do not weaken rules
    or approve/link RFID just to clear a test row.

If sign-in fails, check Email/Password provider, the new-project account and
local Auth feedback. If the list is denied, check the correct project's rules
and refreshed admin claim. If booking save fails, the form must remain available
and no success reference should appear; retry from that same page after resolving
the problem. Do not disable rules to make a test pass.

## Verification and changed files

Local preparation changes only `js/shared-reservations-config.js`,
`tests/serve.cjs`, the two new npm script entries in `package.json`,
`scripts/reservations-admin-claim.cjs`, `tests/cloud-preparation.test.cjs`
and this guide. The existing rules, HTML/UI/CSS, firmware, device configuration,
shared named-app adapter and all pre-existing local edits are preserved.

`npm run test:cloud-preparation` verifies port selection and the named app
with test doubles, cloud-test route allowlisting/dashboard redirect, disabled
emails, dry-run with no writes, wrong project/placeholder UID/wrong email/confirmation
rejection, merged existing claims and refusal of emulator environments. It uses
no real credential, live Auth request or live role assignment. The original
`npm run test:phase2a2` separately verifies the emulator booking flow.

References: [Admin SDK setup](https://firebase.google.com/docs/admin/setup),
[custom claim replacement/merging and token refresh](https://firebase.google.com/docs/auth/admin/custom-claims),
[password authentication setup](https://firebase.google.com/docs/auth/web/password-auth),
[Auth domain configuration](https://firebase.google.com/docs/auth/faq-and-troubleshooting).

Verification completed during preparation: `npm run test:cloud-preparation`
passed; `npm run test:phase2a2` passed all 11 groups (exit 0);
`git diff --check` passed. The device configuration and connector were compared
to their pre-edit contents and preserved. No live credential file was read, no
live UID was queried, and no cloud rules, roles or bookings were changed.
