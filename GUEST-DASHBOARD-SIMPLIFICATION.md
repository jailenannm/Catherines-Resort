# Guest Dashboard simplification and check-in guidance

Implemented in the existing checkout; earlier local edits were preserved. No Firebase deployment, live RFID check-in, firmware change, live booking/account creation, email, or physical device command was performed.

## Result

- Guest Dashboard now uses the same shared header, locally served Playfair Display headings, DM Sans body text, cream/gold/brown palette, rounded cards and gold buttons as Reservation / My Reservation. Body text is 1rem; status/captions/buttons are at least 0.875rem. The separate dashboard sidebar and sample experience/hardware sections are gone.
- At the top it shows only the selected server-verified booking's reference, actual status and saved package descriptions. **Back to My Reservation** returns to `my-reservation.html?reservation=<selected-reference>`.
- Pending and confirmed bookings show a short locked-access explanation. A confirmed card assignment does not grant access. Unknown, foreign, signed-out, disconnected or failed verification states expose no eligible cards.
- A saved, owned Checked In Pool-only booking shows **Swimming Pool**. The current version-2 Celebration Event Package shows **Swimming Pool** and **Event Place with Stage Band**. Old unversioned Event remains Event-only. Existing Cottage/KTV/buyout mappings are reused unchanged.
- Cards contain only a short description, **Facility controls unavailable**, and a working link to the existing read-only facility page with the selected reference. There are no switches, simulated scans, checkout controls, fake telemetry, hard-coded guests/bookings, placeholder alerts or device transport on the dashboard.
- `GuestAccess` and the existing shared adapter continue to recheck Auth ownership, the saved status, package coverage, connection state and verification freshness. Each facility link checks eligibility again at click time, and the facility page independently re-verifies the reference. Background verification can keep already-verified same-owner summary text steady, but it immediately locks/hides facility cards. Selection/auth changes and failed verification clear the old summary. Cached/local flags never grant access.
- Signing in from a direct dashboard link uses the fixed `login.html?next=my-reservation.html` return. A tab-scoped reference hint restores the same selection in My Reservation after Auth, with its usual ownership check. A reference alone cannot authenticate or reveal a booking.

## My Reservation guidance

For Confirmed bookings outside restricted cloud-test mode:

> Your booking is confirmed. Check in at the front desk to access your reserved facilities.

On port 5001 / restricted cloud-test mode:

> Your booking is confirmed. RFID check-in is unavailable in this reservation test. Facility access remains locked.

**Open Guest Dashboard** remains visible only for the selected owned record after a server-verified `Checked In` status, and only outside restricted mode. The selected reference travels into the dashboard. Restricted mode explains that the dashboard is unavailable and omits the link even for Checked In records. The normal front-desk sentence is guidance; it does not enable the currently disabled live web scanner or mark a booking checked in.

## Exact changed files

Application:

- `guest-dashboard.html` — compact selected-booking summary, shared-header wiring and simple hidden-by-default facility cards.
- `css/guest-dashboard.css` — scoped matching typography, cards, colors, buttons and responsive layout.
- `js/guest-dashboard.js` — render from GuestAccess; selected-reference back/sign-in/facility navigation; locked/empty states; no device actions.
- `js/my-reservation.js` — plain confirmed guidance, explicit restricted-test message and port-5001 route guard.

Emulator preview / verification:

- `scripts/seed-dashboard-preview.cjs` (new) — guarded demo-only accounts and fixture records; uses the existing trusted emulator verifier for the two Checked In examples.
- `scripts/preview-guest-dashboard.cjs` (new) — seeds those fixtures and starts the normal local web server on port 5000.
- `tests/guest-dashboard-simple.test.cjs` (new) — end-to-end dashboard/guidance tests.
- `tests/phase2c2.test.cjs` — update two assertions to use the compact package summary and require removed simulation controls to be absent; retain the existing access/security/command-denial checks.
- `package.json` — `preview:guest-dashboard` and `test:guest-dashboard` commands.
- This report, `GUEST-DASHBOARD-SIMPLIFICATION.md`.

`my-reservation.html` needed no markup change; its existing status message/link elements are reused. `js/guest-access.js`, `js/shared-reservations.js`, `js/control-shell.js`, facility-page guards, Firebase configuration/rules, `tests/serve.cjs`, the trusted verifier and firmware were not changed.

## Verification actually run

**27 groups passed**:

| Suite | Passing groups |
| --- | ---: |
| Simplified Guest Dashboard | 6 |
| Phase 2C.2 ownership / facility access regressions | 12 |
| My Reservation regressions | 9 |

The focused suite seeded real demo Auth/RTDB fixtures, verified server-held trusted check-in receipts for the Pool/Event examples, and exercised pending, confirmed-with-RFID, checked-in Pool, current Event, legacy Event, another owner's reference, direct facility navigation, switching through GuestAccess and My Reservation, reference-preserving sign-in, sign-out/refresh, status changes while open and recovery after fresh verification.

It checked front-desk versus restricted-test wording and used a fresh restricted server on port 5016, explicitly forced to emulator services, to verify that no dashboard link appears in cloud-test mode. Direct requests for dashboard/check-in/facility/device-script routes remained HTTP 403. The existing port-5001 cloud server and real project were not used.

At 1440px desktop, 390px mobile and 720px reflow widths, actual local Playfair Display and DM Sans fonts loaded, body text measured 16px and status text 14px; cards/buttons wrapped without clipping or horizontal page scrolling. Desktop/mobile screenshots were visually inspected in `test-results/guest-dashboard-simple-{desktop,mobile,reflow}.png`. These were headless viewport/reflow checks, not a real-phone or physical browser zoom-key test.

The existing Phase 2C.2 suite also verified stale local Active/admin/buyout flags, expired verification, lost connection/session, all non-Checked In lifecycle statuses, another guest, direct restricted facilities, synthetic control events, and the separate administrator workflow with an isolated fake transport. All UI booking records remained unchanged by the guest flow; `/diorama` stayed absent. External live Firebase/email/device calls were blocked in tests. The preview seeder rejected a cloud project target before any request. Node syntax checks and Git whitespace checks passed.

Repeat tests from the checkout:

```powershell
$env:CHROME_PATH = 'C:\Program Files\Google\Chrome\Application\chrome.exe'
npm run test:guest-dashboard
```

## Exact local preview command and URLs

Stop any older emulator/port-5000 preview process first, but leave the port-5001 cloud-test server alone. In PowerShell from this checkout:

```powershell
npm run preview:guest-dashboard
```

This starts demo Auth on 9099, demo RTDB on 9000, seeds only the named preview records, and serves the web app on 5000. Keep the terminal running; Ctrl+C stops the preview/emulators. The preview guard requires project `demo-catherines-reservations` and the exact loopback Auth/RTDB emulator hosts. It has no cloud credentials, never seeds cloud data, and refuses to overwrite an unrelated fixture reference/card claim.

Use this emulator-only account:

- Email: `guest-a@example.test`
- Password: `TestPass123!`

**Checked-in Pool-only dashboard:**

`http://127.0.0.1:5000/guest-dashboard.html?reservation=CBLR-820001`

If signed out, click Sign In and use the emulator account. The fixed return opens the same owned booking in My Reservation; click Open Guest Dashboard. Alternatively start at:

`http://127.0.0.1:5000/my-reservation.html?reservation=CBLR-820001`

**Checked-in current Celebration Event Package:**

`http://127.0.0.1:5000/guest-dashboard.html?reservation=CBLR-820002`

Additional fixture references: pending `CBLR-820003`, confirmed with RFID `CBLR-820004`. They stay locked. The two Checked In fixtures are produced by trusted Node-held emulator scan events; no simulated browser scan or live reader is enabled.

If Node/Java are not on the PowerShell PATH, these are the tool paths used for verification in this workspace:

```powershell
$dashboardToolRoot = Join-Path $env:TEMP 'catherines-phase2a2-tools'
$env:PATH = "$dashboardToolRoot\node-v22.16.0-win-x64;C:\Program Files\Weka-3-8-7\jre\jre-25.0.2-full\bin;$env:PATH"
$env:FIREBASE_EMULATORS_PATH = Join-Path $dashboardToolRoot 'emulators'
$env:XDG_CONFIG_HOME = Join-Path $dashboardToolRoot 'config'
npm run preview:guest-dashboard
```

The fixture helper and the same pages/routes were verified by the automated suite; the persistent preview process is not left running after this task. Port 5001 remains reservation-only and is not a dashboard preview URL.

## Server / deployment

No port-5001 restart is needed for these changes: the same existing scripts are served from disk on refresh, and the server allowlist was not changed. Refresh My Reservation to see the updated wording. Start the new emulator preview command separately for the dashboard.

No new Firebase rule/configuration publication is required for this task. No live deployment, live scan, real card read, gate/facility command or firmware change was made. Live check-in remains disabled pending the separately scoped trusted reader integration.
