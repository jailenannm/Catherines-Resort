# Guest-facing reservation update

Implemented directly in the existing checkout; earlier local edits were retained. No Firebase deployment, live account/booking creation, firmware change, email delivery, or physical command was performed.

## Behavior

- Home, Reservation and My Reservation use `js/public-header.js` and `css/public-header.css`: the same sticky header, desktop alignment, mobile menu, accessible account menu, and measured anchor offset. My Reservation no longer has a sidebar. Existing standalone about/contact/facilities/gallery HTML files are empty; they were not replaced with invented content. The shared links use the actual Home sections.
- Headings use locally served Playfair Display; body, labels and controls use locally served DM Sans. Both variable fonts and their OFL licenses are included. Browser tests loaded the actual local font files, checked computed text sizes, and checked desktop/mobile/reflow widths. Reservation captions previously below 14px now use rem sizes.
- My Reservation remains read-only and waits for the named `shared-reservations` Auth identity. It shows only server-verified owned records. Missing/unowned references share generic feedback. Changing records or signing out clears the previous record. Background refreshes retain the current view/message instead of flashing Loading again.
- Its saved summary includes check-in date, stay slot, guest breakdown/count, primary guest, nonblank contacts, packages, optional requests, saved subtotal/tax/service charge/total, and Assigned/Unassigned RFID text. No UID or inferred payment/allocation appears. Version-2 Event inclusions remain Event Place, Swimming Pool and Stage Band; historical package descriptions and stored totals remain intact.
- The old slot options all used the price-like value `4500`. New bookings save `staySlotId` plus a matching `duration` label: `coastal-22h`, `day-retreat`, or `evening-sanctuary`. An additional wrapping label below the native select shows the full times. Legacy `4500` remains Duration unavailable. No historical record is migrated, and pricing is unchanged. Review/Overview and My Reservation now consistently format PHP amounts with two decimals.
- A verified Checked In booking gets a selected-reference dashboard link in normal mode. The dashboard verifies ownership/status/package again and hides ineligible facility cards. Guest commands remain disabled. Cloud-test mode explains that the dashboard is unavailable and omits its link.

## Final destinations

| Control | Destination |
| --- | --- |
| Logo / Home | `index.html` / `index.html#home` |
| About / Facilities / Contact | `index.html#about`, `index.html#facilities`, `index.html#contact` |
| Book Now / Make a Reservation | `reservation.html`; its Auth guard uses `login.html?next=reservation.html` when necessary and preserves the tab-scoped draft |
| My Reservation / View My Reservation / former public footer Guest Dashboard | `my-reservation.html` |
| Signed-out account icon | `login.html?next=my-reservation.html` |
| Signed-in guest account icon | Accessible My Reservation / Sign Out menu, in both normal and cloud-test modes |
| Trusted administrator account | Existing `admin-dashboard.html` routing; restricted server redirects that page to `admin-reservations.html` |
| Confirmation View Reservation | `my-reservation.html?reservation=<saved-reference>`; a reference selects but never authorizes a record |
| Checked In dashboard link, supported normal mode only | `guest-dashboard.html?reservation=<owned-reference>` |

The existing login booking-code entry still cannot authenticate anyone: email/password sign-in is required. Direct owned reference links remain supported. Unavailable Diorama/device links are hidden in cloud-test mode, and the server still denies device pages/scripts.

## Missing photographs and contacts

No original photographs are present under `assets/`; the only pre-existing image is the resort logo. These referenced JPGs are absent:

- `hero-lighthouse.jpg`, `cottage.jpg`, `pool.jpg`, `pavilion.jpg`, `ktv.jpg`
- `about-lighthouse.jpg`, `about-interior.jpg`
- `gallery-grounds.jpg`, `gallery-cottage.jpg`, `gallery-lighthouse.jpg`, `gallery-pavilion.jpg`, `gallery-ktv.jpg`, `gallery-pool.jpg`

Broken images now become clean, labeled fallbacks, preserving their section/category and gallery filtering. Actual photos still need to be supplied. The homepage footer's request for verified contact details was removed. No independently verified phone/email source was found; no replacement contact was invented. The shared footer retains the existing address and drops its unverified phone/email sample.

## Files changed in this task

Application:

- `index.html`, `reservation.html`, `my-reservation.html`
- `css/public-header.css` (new), `css/reservation.css`, `css/my-reservation.css`
- `js/public-header.js` (new), `js/booking-slots.js` (new)
- `js/index.js`, `js/reservation.js`, `js/my-reservation.js`, `js/shared-reservations.js`, `js/guest-dashboard.js`
- `components/footer.html`
- `assets/fonts/DM-Sans.ttf`, `assets/fonts/Playfair-Display.ttf`, and the two adjacent `*-OFL.txt` licenses (new)
- `shared-reservations.rules.json`

Verification/documentation:

- `tests/serve.cjs`: allow the two new public scripts and serve TTF correctly; device routes remain blocked.
- `tests/my-reservation-page.test.cjs`: shared-header, slot/rules, exact pre-save-versus-saved summary, ownership, loading/error/retry, font/layout and navigation coverage; fresh restricted test server on port 5011.
- `tests/public-navigation.test.cjs`: account-menu contract, cloud Checked In messaging and booking-code denial; fresh restricted test server on port 5013.
- `tests/event-package.test.cjs`: saved-reference destination in normal/cloud modes; isolated restricted server on port 5012.
- `tests/phase2a2.test.cjs`: shared-header sign-out control.
- `tests/phase2b2.test.cjs`: valid slot fields on newly created guest fixtures; legacy fixture coverage remains elsewhere.
- `tests/phase2c2.test.cjs`: selected-reference dashboard handoff and only-Pool-visible assertion.
- `tests/public-guest-regression.cjs` (new): sequential suites with demo-emulator-only database resets.
- `package.json`: `test:public-guest` command.
- This report, `PUBLIC-GUEST-UPDATE.md`.

## Verification

Passing suites run during this task: Phase 2A.2 (11 groups), Phase 2B.1 (9), Phase 2B.2 (11), Phase 2C.1 (9), Phase 2C.2 (12), Event Package (5), My Reservation (9), booking navigation (5), public navigation (6), and registration (6): 83 groups in total. Cloud-preparation isolation checks and Git diff whitespace checks also passed. Intermediate test failures were corrected; the final focused recheck covers the exact summary/currency comparison and final readable captions.

Coverage includes valid/failed/uncertain/repeated saves, matching modal/store/guest/admin references, unchanged legacy totals and lifecycle transitions, all three new slot identifiers plus invalid/missing/mismatched slot writes, owned/missing/unowned links, multiple-record switching, sign-out/empty/error/retry states, named Auth restoration, allowlisted return paths, draft preservation, account menu keys/Escape, booking-code non-authentication, sticky desktop/mobile anchors, real local fonts, current Event inclusions, checked-in Pool-only access, read-only guest dispatch, and zero live project/email/device calls. Reflow used 1440px, 390px and 720px viewports; the latter is a 200%-equivalent viewport/DPR check, not a physical browser zoom-key test.

Repeat from PowerShell with Node 22+, Java and Chrome available:

```powershell
$env:CHROME_PATH = 'C:\Program Files\Google\Chrome\Application\chrome.exe'
npm run test:public-guest
npm run test:cloud-preparation
```

The browser suites substitute local Firebase SDK files, use the demo Auth/RTDB emulators, and block external live services. Restricted-server behavior is checked on fresh isolated ports with emulator mode explicitly forced; the user's existing cloud-test server and cloud data were not used. Screenshots are under ignored `test-results/` (My Reservation desktop/mobile/reflow, public headers, Event selection and dashboard).

## Before manual cloud testing

1. Restart port 5001 (`npm run serve:cloud-test`) so its running process picks up the new public script allowlist and font MIME type. Then refresh the browser.
2. Review and manually publish **`shared-reservations.rules.json`** to Realtime Database in **`atherines-resort-reservations`**. The new client includes `staySlotId`; the old deployed strict field allowlist will reject it until these rules are published. New creates require an allowed ID and its exact label. Existing records are grandfathered for the supported lifecycle transitions.
3. No rules/configuration were deployed here. Live RFID/check-in/device integration remains disabled/outside scope. No physical-device or live booking test was run. Actual 200% browser zoom and real-phone touch checks remain manual; automated responsive and touch registration checks passed.
