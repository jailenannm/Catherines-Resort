# Create Account checkbox and policy dialog fix

## Root cause reproduced

Registration imported `css/login.css`, whose checkmark/checked-color selectors
apply only to `.remember-row input:checked + .custom-checkbox`. Registration
instead used `.checkbox-row`. Its own CSS made native inputs fully transparent,
absolutely positioned and non-pointer-interactive, with no visible focus style.
The decorative squares stayed white with no checkmark regardless of checked
state. In the baseline browser reproduction, clicking both decorative squares
changed native checked properties but did not change their visible decoration;
keyboard focus also had no visible outline. This made working label activation
appear broken and prevented direct interaction with the hidden native input.
The optional offers checkbox additionally had an unwanted `checked` attribute.

## Fix and preserved behavior

- Visible native checkboxes replace decorative squares, with explicit associated
  labels, the existing gold accent, normal pointer behavior and visible keyboard
  focus. Consent remains required; offers is optional and unchecked by default.
- `invalid` and fallback submit validation display the existing styled inline
  consent error, associated with the input. Checking consent clears that error.
- Each policy link opens its own native modal dialog using the existing
  `modal-card`, gold button, serif heading and registration palette. Native modal
  behavior makes the background inert; explicit Tab/Shift+Tab wrapping, Escape,
  Close and return-to-opener focus are implemented. Policy links prevent label
  activation and form submission. No form reset occurs.
- Policy text is 1rem with a scrollable body and a Close button outside that
  scrolling area. Small-screen bounds use the viewport/dynamic viewport height.
- Both policies already had wording in the JavaScript alerts. That exact wording
  was retained (Terms becomes its equivalent numbered list). Neither policy's
  current wording is missing; no additional policy language was invented.
- The existing named Firebase registration call, validation of other fields,
  saveSession behavior and success/error flow remain unchanged. Facility access,
  shared adapter, device paths, firmware and deployed Firebase were not edited.

## Exact files changed

| File | Change |
| --- | --- |
| `register.html` | Native checkbox/label markup, unchecked optional offers, associated `termsError`, two separately titled policy dialogs |
| `css/register.css` | Restore native input visibility/hit testing, checked accent and focus; scoped inline-error and responsive policy-dialog styling; imported login stylesheet unchanged |
| `js/register.js` | New `consentError` and invalid/change listeners; consent error in `clearErrors`/submit fallback; new `setupPolicyDialog` replaces the two browser-alert handlers |
| `tests/register.test.cjs` | New isolated desktop/touch-emulation browser tests with registration doubles and external traffic blocked |
| `tests/phase2a2.test.cjs` | Registration test uses native input rather than removed decorative span; asserts offers remains unchecked during actual Auth emulator registration |
| `REGISTRATION-FIX.md` | This report |

## Checks actually completed

- Baseline local browser reproduction of hidden inputs, checked-state changes
  without visible checkmarks and absent keyboard focus.
- `node tests/register.test.cjs`: **6 groups passed**. Mouse clicks on both inputs
  and labels, keyboard Space toggles/focus, required versus optional/default
  states, blocked unchecked-consent submit, styled inline error, two separate
  dialogs, policy wording, link opening without consent changes/submission,
  Tab/Shift+Tab containment, Close/Escape, return focus, form/state persistence,
  checked-consent/unchecked-offers submission, forced failure/retry/success.
- The same suite tested **390px mobile touch emulation** for both checkboxes and
  labels and both policy links/Close buttons. Both dialogs stayed within viewport
  bounds. Synthetic long text was added only to the test DOM to verify scrolling
  while Close remains visible; actual policy wording was not extended.
- Mobile screenshots of both policy dialogs were visually inspected. Fonts/icons
  are blocked in the isolated tests; original font-family declarations remain.
- `npm run test:phase2a2`: **11 groups passed**, including real isolated Firebase
  Auth emulator registration with consent checked and offers unchecked.
- `npm run test:phase2c2`: **12 groups passed**, verifying preserved shared guest
  eligibility and disabled physical guest dispatch.
- JavaScript syntax checks and `git diff --check` passed.

No native browser alerts, page errors, real email/device requests or live Firebase
account creation/deployment occurred. Touch was emulated, not tested on a physical
phone. No cloud credentials or production account was used.

## Repeat locally

With the existing Node/dependencies/Java setup and Chrome available:

```powershell
Set-Location -LiteralPath 'C:\Users\Admin\Projects\catherines-diorama-IOT-BASED'
$env:CHROME_PATH = 'C:\Program Files\Google\Chrome\Application\chrome.exe'
node tests/register.test.cjs
npm run test:phase2a2
npm run test:phase2c2
```

Run emulator suites sequentially. Existing workstation runtime/cache details are
in `PHASE-2B.2.md`. Browser test screenshots and regression logs are in ignored
`test-results/register-*.png` / `test-results/register-regression-*.log`.
