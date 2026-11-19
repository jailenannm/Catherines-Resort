# Public My Reservation, account entry and sticky navigation

## Result and blocked route

The yellow public account control previously targeted **`/guest-dashboard.html`**.
At `http://127.0.0.1:5001/guest-dashboard.html`, the existing restricted server
returns HTTP 403: "This cloud-test server serves reservation pages only."
The allowlist is intentional and was not expanded.

The homepage and reservation header now expose a clearly labeled **My Reservation**
link to signed-in guests. Book Now remains the new-booking entry. On the homepage,
the link is in the existing main navigation (including the existing mobile menu).
On the reservation page it is in the existing action area, which wraps on mobile
so the label, Book Now and account icon remain usable.

Cloud-test account behavior:

- Signed-in guest: account control goes to `my-reservation.html`.
- Signed-out homepage visitor: the visible account control goes to
  `login.html?next=my-reservation.html`; guest login returns to My Reservation.
- Only `reservation.html` and `my-reservation.html` are accepted guest return
  destinations. Arbitrary/foreign URLs are not used.
- Trusted-admin login/account routing still chooses `admin-dashboard.html`, which
  the restricted server already redirects to the shared admin list.
- Outside cloud-test mode the signed-in guest account destination remains
  `guest-dashboard.html`. No separate admin/device workflow was changed.
- Both icon controls have the accessible name **My account**.

Header state waits on the named `shared-reservations` Auth identity and updates
on Auth/token events. Async generations prevent stale Auth results from restoring
a link after a newer session change. Browser-local roles or booking references
are not used as authorization.

## Existing booking discovery and confirmation

My Reservation now shows **Your reservations** links in its existing hero content.
Every link displays the owned booking's reference and current saved status. Clicking
one selects its existing `?reservation=<reference>` details. The newest owned
record remains the default when no reference is selected. Status updates refresh
the links; sign-out clears them.

The list is built only from the existing owner-filtered shared subscription, under
Firebase Auth and the existing rules. A foreign selected reference does not fall
back to another record or reveal that foreign booking; an unauthenticated request
cannot read it. A reference is a selector, never a credential.

The previous confirmation fix is retained: cloud-test **View Reservation**, Escape
and backdrop close use the newly saved booking's reference. The Event/confirmation
integration suite was rerun against the new booking list to verify the modal and
selected details continue to agree. No real booking reference or live account
was used in automated tests; the user's manual check remains theirs.

## Sticky public header

The implemented public header variants are the homepage `.site-header` and the
reservation `.navbar`. The homepage was relative, and the reservation mobile
breakpoint below 480px changed sticky to relative. Both now remain `position:
sticky; top: 0` across breakpoints, in normal document flow.

A ResizeObserver measures the header's actual height into `--public-nav-height`.
Root scroll padding accounts for that height plus breathing room. Reservation
step navigation uses the same measured height instead of a fixed 125px estimate.
The existing homepage mobile menu remains operable/scrollable; its close handler
updates the measurement before the browser follows the anchor. Header heights
stay stable while scrolling; no fixed-header spacer or scroll-time relocation
was introduced. Styles, colors and font families are retained.

No header was added to empty placeholder pages or to the separate guest/admin
application shells. The existing two public header implementations were updated.

## Exact files/functions changed

| File | Change |
| --- | --- |
| `index.html` | Signed-in My Reservation navigation link; account icon name/fallback href |
| `reservation.html` | My Reservation action link; account icon accessible name |
| `my-reservation.html` | Owned-booking navigation inside the existing hero |
| `js/index.js` | Cloud-aware account click/identity routing; Auth-aware header visibility; measured sticky height and mobile-menu anchor offset |
| `js/reservation.js` | Cloud-aware account destination/login return; signed-in link state; measured header and `scrollToStep` offset; confirmation reference navigation retained |
| `js/login.js` | Fixed allowlist accepts My Reservation in addition to the existing booking return; admin/default routes retained |
| `js/my-reservation.js` | Owner-only reference/status links, selected-record highlighting, clearing on auth/error; scope the original hero badge update so it does not overwrite booking-link text |
| `css/index.css` | Sticky public header, measured root anchor padding, hidden-link handling and existing mobile-menu scroll bounds |
| `css/reservation.css` | Sticky mobile header, measured anchor padding, existing action-area wrapping and visible mobile account control |
| `css/my-reservation.css` | Owned links reuse hero badge colors/fonts, wrap on mobile and expose keyboard focus/current selection |
| `tests/public-navigation.test.cjs` | New isolated Auth/RTDB emulator/browser coverage for navigation, ownership, status changes, responsive anchors and blocked device routes |
| `PUBLIC-NAVIGATION-FIX.md` | This report |

`tests/serve.cjs`, Firebase project configuration, shared rules, firmware, device
paths and registration implementation were not changed by this task.

## Checks actually run

New public-navigation suite: **6 groups passed**, including:

1. Homepage My Reservation visibility; two owned fixture references/statuses;
   selecting an older booking; realtime status update; foreign and unauthenticated
   read denial. No real manual-check reference was accessed.
2. Both cloud-test public account controls reach My Reservation for a signed-in
   guest, never the blocked guest dashboard.
3. Signed-out account entry returns through actual emulator login to My Reservation.
4. Admin login retains its route; normal-mode account behavior uses the original
   guest-dashboard destination, intercepted with harmless test HTML.
5. Desktop **1440px** and mobile **390px** sticky position/height, mobile-menu
   operation, exact anchor/step landing below the measured header, no horizontal
   page overflow, mobile booking-link wrapping, and clearing on sign-out.
6. Device pages/scripts still return 403; no diorama writes, live project/email/
   hardware calls or browser errors.

The suite uses the real port 5001 restricted UI and actual Firebase SDK but
switches its isolated browser's backend config to the **demo emulators only**.
It never changes the served cloud configuration or the user's browser session.
External fonts/icons are blocked. Mobile screenshots and navigation screenshots
under `test-results/public-*.png` were visually inspected.

## Repeat locally

With the existing Node/Java/dependencies:

```powershell
Set-Location -LiteralPath 'C:\Users\Admin\Projects\catherines-diorama-IOT-BASED'
$env:CHROME_PATH = 'C:\Program Files\Google\Chrome\Application\chrome.exe'
npx firebase emulators:exec --only auth,database --project demo-catherines-reservations --config firebase.emulators.json 'node tests/public-navigation.test.cjs'
```

Run emulator suites sequentially. Existing workstation runtime/cache details are
in Phase 2B.2. An existing port 5001 server is reused without stopping it, or a
restricted test server starts if absent.

**Port 5001 does not need a restart:** all changes are static HTML/CSS/JS, read by
the unchanged server on each request. Hard-refresh the homepage/reservation page.
No new Firebase rules or deployment are needed for this navigation-only change.
Any earlier unpublished Event Package rules remain a separate prerequisite for
live Event submissions. Live check-in and guest physical commands stay disabled.

## Final regression results

- New public-navigation suite: **6 groups passed**.
- Event/confirmation suite: **5 groups passed**, including actual one-record save,
  matching modal/My Reservation reference and all cloud modal close paths.
- Booking-navigation suite: **5 groups passed**.
- `test:phase2a2`: **11 groups passed**.
- `test:phase2c2`: **12 groups passed**.
- `test:cloud-preparation`: passed.
- Registration UI/doubles: **6 groups passed**.
- All five changed/new JavaScript files passed syntax checks; `git diff --check`
  passed. All test commands exited 0. Logs are in ignored
  `test-results/public-regression-*.log` and `public-navigation.log`.

No live booking/account or manual-check reference was accessed, no Firebase
configuration/rules were deployed, no hardware command was sent and no user's
local server was restarted or stopped.
