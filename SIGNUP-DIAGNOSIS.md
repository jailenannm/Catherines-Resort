# Signup failure diagnosis - port 5001

## Verified facts

- The real local `http://127.0.0.1:5001/register.html` was loaded in an isolated
  browser context. Its actual Firebase 12.6 SDK reported:
  - app name `shared-reservations`
  - project ID `atherines-resort-reservations`
  - Auth and Realtime Database both from that named app
  - production mode, no Auth emulator configuration
  - database URL `https://atherines-resort-reservations-default-rtdb.asia-southeast1.firebasedatabase.app`
- `SharedReservations.register` calls that app's
  `auth.createUserWithEmailAndPassword`, not browser-local registration, the
  default device app or the demo emulator on this port.
- A **read-only** public Identity Toolkit `GET /v1/projects` with the existing web
  API key returned project number `441873595429`, matching the provided Firebase
  configuration. No signup, login, account creation or database write was sent.
- That response listed `localhost`,
  `atherines-resort-reservations.firebaseapp.com` and
  `atherines-resort-reservations.web.app` as authorized domains. `127.0.0.1` was
  absent. This is an observation, not proof of the email/password failure's cause.
  Public config does not reveal the password-provider enablement setting.

## Exact live error is still needed

The old page replaced every exception with one generic Account creation failed
message. The original SDK code was not retained, so the earlier failure cannot be
reconstructed from the empty Users list. No historical live error code is claimed
here. No live signup was replayed by this agent, as requested.

The code now shows the exact safe `auth/...` code inline and logs **only**:
`code`, `appName`, `projectId`, `mode` and a safe registration `stage`. It does not
log form values, email, passwords, tokens, request URLs, raw error messages,
customData, credentials or error objects. Failure stages distinguish initialization,
session persistence, account creation, profile update and session verification.
If creation succeeds but a later step fails, the UI says the account was created
and directs the user to sign in, rather than claiming no account exists.

Hard refresh `http://127.0.0.1:5001/register.html` with Ctrl+Shift+R. On your own
next signup attempt, retain only the parenthesized error code from the form (or
the safe Registration failed console entry). Do not share a password, token,
request payload or complete network/console dump. The actual cause remains
pending that user-operated retry or authenticated Console inspection.

## Console checks, conditional on the captured code

Always confirm the Console project selector and Project settings > General show
`atherines-resort-reservations`, not the old diorama project.

| Captured code | Setting/check |
| --- | --- |
| `auth/operation-not-allowed` | Firebase Authentication > Sign-in method > Email/Password: enable the **Email/Password** switch and Save. Email link alone is not the chosen registration method. |
| `auth/admin-restricted-operation` | If Identity Platform user actions are enabled, inspect Authentication/Identity Platform Settings > User actions: end-user Create (sign-up) must be allowed for this guest form. Do not change unrelated policies. |
| `auth/unauthorized-domain` | Authentication > Settings > Authorized domains: add the exact host `127.0.0.1` (no protocol/port), or use the already listed `localhost` host. This setting's absence alone does not prove ordinary password signup caused this error. |
| `auth/weak-password` / `auth/password-does-not-meet-requirements` | Authentication > Settings > Password policy; choose a compliant password. |
| `auth/email-already-in-use` | Sign in with that account rather than repeatedly signing it up. |
| `auth/network-request-failed` | Check connection/browser request blocking; no Console provider change can be inferred from this code alone. |
| `auth/invalid-api-key` | Check the reservations Web App configuration/API key and Google Cloud key restrictions; the read-only public config lookup in this task succeeded with the current key. |

References:
- https://firebase.google.com/docs/auth/web/password-auth
- https://docs.cloud.google.com/identity-platform/docs/concepts-manage-users
- https://docs.cloud.google.com/identity-platform/docs/reference/rest/v1/TopLevel/getProjects

No Console setting or deployed configuration/rule was changed.

## Changed files and checks

- `js/shared-reservations.js`: retains the initialized app for
  `registrationContext()`; `register` preserves safe Firebase code/stage and
  whether account creation completed, without retaining raw credential/error data.
- `js/register.js`: displays safe exact codes and targeted guidance; code-only
  diagnostic logging; form values and retry behavior retained.
- `tests/signup-diagnostics.test.cjs`: actual port 5001 SDK app/Auth/RTDB target
  checks, intercepted synthetic backend error, safe logging, preserved state and
  zero signup forwarding. Reuses an already running server without stopping it.
- `SIGNUP-DIAGNOSIS.md`: this report.

Completed checks:

- `node tests/signup-diagnostics.test.cjs`: passed. The actual SDK mapped an
  **intercepted synthetic** OPERATION_NOT_ALLOWED response to
  `auth/operation-not-allowed` at create-account stage. This verifies diagnostics;
  it is **not** evidence that the live project's provider is disabled. Zero signup
  requests were forwarded to the cloud. Malicious/raw error payload text was not
  logged or rendered.
- `node tests/register.test.cjs`: all **6 groups passed** (mouse/keyboard/touch
  checkboxes, consent validation, dialog wording/focus/state and submission doubles).
- `npm run test:phase2a2`: all **11 emulator groups passed**, including actual
  isolated Auth emulator signup and shared booking integration.
- `npm run test:cloud-preparation`: passed, including mode selection and named-app
  isolation. No real role assignment or signup in this suite.

No registration HTML/CSS, checkbox/dialog behavior, facility-access implementation,
firmware, device config or deployed Firebase rule was changed. Live account
creation remains with the user.
