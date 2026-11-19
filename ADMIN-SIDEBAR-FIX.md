# Shared admin sidebar and Sensors navigation

## Cause and fix

The five admin pages contained separate copies of the sidebar. Master Reservations loaded Font Awesome while the other simplified pages did not, so identical icon markup produced different visible sidebars. Duplicated markup also allowed highlights to diverge.

The Sensors URL was already `admin-dashboard.html#sensors`, not a missing page. Operational Center's active link was hard-coded and did not follow the hash. Its explicit scrolling ran only from `AdminDeviceConsole.accountChanged` after Auth/transport initialization; there was no shared hash-change handling for in-page navigation or Back/Forward. The target is initially hidden pending trusted Auth, so relying on the browser's initial fragment scroll is fragile. This fix handles the fragment again once authorized content is ready, and handles hash changes and repeated clicks on an already-selected Sensors link. It does not bypass the guard or expose Sensors before authorization.

`js/admin-layout.js` now renders one sidebar, with one set of local inline SVG icons, logo, link order, footer and accessible current-page indicators. `css/admin-layout.css` owns the common desktop/mobile shell styles extracted from the Master Reservations reference. No external icon-font download is required for sidebar icons. The Sensors section scrolls into view with spacing above its heading and receives keyboard focus. Sensors is highlighted for `#sensors`, Operational Center for its base URL; the Manual Override alias highlights Diorama Overrides. Native fragment history is retained for Back/Forward. `sensors.html` still redirects to the same guarded destination.

Restricted cloud-test mode shows only Master Reservations in the admin navigation. It omits Operational Center (which otherwise redirects back), Sensors, Overrides and Demo. The cloud server permits the new presentation-only `admin-layout.js`; it still blocks device scripts, device pages, Sensors and Demo.

## Authorization review

The shared renderer contains no authorization grant or device dispatch. The page guards and command safeguards remain authoritative:

- `AdminDeviceConsole.accountChanged` and `send` verify `SharedReservations.identity(true)` from named `shared-reservations` Auth. The transport verifies that same trusted administrator identity independently. Neither consults a booking, package, RFID assignment, guest check-in or `GuestAccess` eligibility.
- Master Reservations retains its trusted-admin shared-list/action checks. Demo retains its own trusted-admin guard. The old Sensors route leads to the guarded Operational Center.
- Existing facility-page `ControlShell.prepareFacility` separately verifies the trusted admin before restoring dedicated admin diagnostics. Its admin path bypasses guest package eligibility; guests still receive read-only, ownership/status/package-checked pages. No changes to that flow were needed.
- Device-project authorization, heartbeat freshness, request acknowledgements, one-use visual clearance, motor/gate conditions, reactive spotlight ownership and Stop exceptions are unchanged. Emulator transport remains read-only. Unsupported coordinated Event Mode remains Unavailable.

The reservation-project admin claim does not establish server authorization in the separate device project. Its rules and any future trusted command backend still govern live device permissions; no claim about physical/live authorization was inferred from these tests.

## Files changed in this task

- New `js/admin-layout.js` and `css/admin-layout.css`: common markup, self-contained icons, active state, fragment handling and cloud-test omissions.
- `admin-dashboard.html`, `admin-reservations.html`, `diorama-control.html`, `manual-override.html`, `demo.html`: replace duplicated sidebars with the shared renderer and stylesheet. Main content retained.
- `css/admin-reservations.css`: move common shell rules into `admin-layout.css`; reservation-specific styles remain.
- `js/admin-device-console.js`: notify the shared layout after trusted content is revealed, instead of maintaining a separate initial-hash scroll implementation.
- `js/admin-reservations.js`: remove duplicated cloud navigation hiding now owned by the renderer.
- `tests/serve.cjs`: allow only the new presentation script in cloud-test mode; device restrictions unchanged.
- `tests/admin-workflow.test.cjs`: exercise actual sidebar clicks, same-page Sensors, history/refresh and identical shell geometry/markup/icons across pages.
- `ADMIN-SIDEBAR-FIX.md`: this report.

## Verification actually run

`npm.cmd run test:admin-workflow` passed **26 groups**: admin-workflow 7, admin-devices 6, master-reservations 7 and guest-facilities 6. The first navigation run exposed a test timing issue: the URL changes before the browser dispatches `hashchange`; the test now waits for the visible active state rather than asserting synchronously. The complete rerun passed.

Tests used isolated Auth/RTDB emulators and browser sessions, plus fake command transport. They did not replace/reset the existing port-5000 preview. Coverage:

- Every navigation destination clicked starting from Master Reservations, Overrides and Demo; Visitor Site navigation; correct Manual alias highlight.
- Sensors sidebar click from Operational Center, repeated same-hash click after scrolling away, reload, Back/Forward, initial guarded target and direct `sensors.html` redirect.
- Identical sidebar markup, icon count, width, padding, gaps and fonts at matching 1440px and 390px viewports; 720px reflow; no horizontal page/sidebar overflow. Generated desktop/mobile screenshots were reviewed.
- Trusted administrator without a guest booking reaches supported pages and exercises all 17 supported requests through fake transport. Guest/signed-out denial remains effective despite forged local admin flags. Sign-out revokes content/control access.
- Real emulator transport remains Preview/read-only. Freshness, Unknown/Offline distinctions, visual clearance, Stop, failed requests, repeated clicks and acknowledgement semantics remain covered.
- Master Reservations approval/RFID/details/filter/CSV regressions and guest read-only/package/ownership regressions passed.
- Restricted test server hides unavailable sidebar links and returns 403 for device/Sensors/Demo routes/scripts. The safe shared layout loads successfully there.
- Walkthrough navigation sends zero booking mutations/device requests. No live emails, Firebase deployment or physical commands were performed.

Syntax checks and `git diff --check` passed. The existing port-5000 server returned HTTP 200 for `/js/admin-layout.js`.

## Preview and restart

- `http://127.0.0.1:5000/admin-reservations.html`
- `http://127.0.0.1:5000/admin-dashboard.html#sensors`
- `http://127.0.0.1:5000/diorama-control.html`
- `http://127.0.0.1:5000/manual-override.html`
- `http://127.0.0.1:5000/demo.html`
- `http://127.0.0.1:5000/sensors.html` (legacy redirect)

Use a trusted emulator admin account. Port 5000 needs only a hard refresh. Restart a running port-5001 cloud-test server so it picks up the allowlist change (`npm.cmd run serve:cloud-test`); a newly started process already uses it. No Firebase rules or firmware changes are needed for this layout fix.
