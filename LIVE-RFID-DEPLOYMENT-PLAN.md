# Live RFID check-in deployment review

The current demonstration uses the local two-laptop emulator setup documented in `LAN-DEMO.md`. Cloud deployment and billing steps below remain historical preparation instructions. The deployed website and live Firebase data are outside the local demo setup.

## First-live-tap readiness update

The latest read-only audit verified project `atherines-resort-reservations` is ACTIVE and the checked deployment permissions are granted. Billing is disabled. Cloud Run service inspection returns HTTP 403 with SERVICE_DISABLED, and the planned `rfid-checkin` runtime service account returns HTTP 404. The deployment therefore cannot proceed as planned until billing and the API/service-identity prerequisites are completed. `gcloud` was unavailable on the current PowerShell PATH. The earlier inventory statements below are historical preparation notes.

Live booking **CBLR-638844** is Confirmed with exact UID **B2321606**, and its live `rfidAssignments` entry points to the same reference. Its date is **19 November 2026**, with Evening Sanctuary **4 PM to midnight Philippine time**. On 15 November it is outside the scheduled window. The existing verifier has no date/time gate, so an approved allowlisted out-of-window test would still be accepted by the current code. Keep this reference as the designated first test unless the operator chooses another card/booking through the existing assignment policy. This card is already bound, and card reassignment remains disabled.

The immediate PowerShell command opens the project's billing setup for the operator to choose and link an account.

```powershell
Start-Process 'https://console.cloud.google.com/billing/linkedaccount?project=atherines-resort-reservations'
```

After billing is linked and Google Cloud SDK is available, begin the existing prerequisite commands below with API enablement. Then create the dedicated service identity, grant the reviewed roles and import the private secret. These cloud changes require the reviewed operator action. The actual deployment command for this designated booking is as follows, after those prerequisites. Use secret version 1 only if it is the version returned by the import.

```powershell
gcloud services enable run.googleapis.com cloudbuild.googleapis.com artifactregistry.googleapis.com secretmanager.googleapis.com --project atherines-resort-reservations
```

Complete the service-account and Secret Manager commands in the reviewed deployment section below before this deployment command.

```powershell
node scripts/prepare-rfid-production.cjs
gcloud run deploy rfid-checkin --project atherines-resort-reservations --region asia-southeast1 --source .local/rfid-deploy --service-account rfid-checkin@atherines-resort-reservations.iam.gserviceaccount.com --allow-unauthenticated --concurrency=8 --max-instances=1 --timeout=30 --set-env-vars="PROJECT_ID=atherines-resort-reservations,RFID_CHECKIN_ENABLED=false,RFID_ALLOWED_REFERENCES=CBLR-638844" --set-secrets="/secrets/reader-keys.json=rfid-reader-keys:1"
```

After deployment, read the actual service URL and update the private Arduino header using the existing helper.

```powershell
$endpoint = gcloud run services describe rfid-checkin --project atherines-resort-reservations --region asia-southeast1 --format="value(status.url)"
node scripts/prepare-rfid-production.cjs "--endpoint=$endpoint"
Invoke-RestMethod "$endpoint/health"
```

The private production header currently has matching reader credentials, an empty endpoint and empty Wi-Fi fields. Open `esp32_firmware/RFID_Production/RFID_Production.ino` with `production-secrets.h` and `UidFormatter.h` beside it. Fill the private Wi-Fi fields, select the actual ESP32 board and USB data-cable port, install MFRC522 if needed, click Verify, then operator Upload with the 12V battery and actuators disconnected. Open Serial Monitor at 115200 baud. The production sketch uses the installed ESP32 core's CA bundle and hostname verification, with synchronized time. A complete Arduino build and physical TLS handshake remain pending.

Only enable the service after deployment and configuration are verified, and during the November 19 scheduled window or after explicit approval of an out-of-window dedicated test. This command retains the single-reference restriction.

```powershell
gcloud run services update rfid-checkin --project atherines-resort-reservations --region asia-southeast1 --update-env-vars="RFID_CHECKIN_ENABLED=true,RFID_ALLOWED_REFERENCES=CBLR-638844"
```

Tap once after health reports enabled, Serial shows Wi-Fi/TLS clock ready, and both live views show Confirmed/Assigned for this reference. Success is `Check-in accepted`, one receipt, and Checked In in both views. A repeat tap can report NO_ELIGIBLE_BOOKING, while an identical resent scan reports REPLAY. Both preserve the original saved check-in. Guest hardware controls remain disabled. No physical result has been claimed by this readiness audit.

Prepared on 15 November 2026. Deployment is paused for target and policy review. The running emulator website on port 5000 and reader service on 8787 both returned HTTP 200 after preparation.

## Verified targets and audit limits

| Item | Finding |
|---|---|
| Reservation frontend production project | `atherines-resort-reservations`, named app `shared-reservations`, from `js/shared-reservations-config.js` |
| Reservation database | `https://atherines-resort-reservations-default-rtdb.asia-southeast1.firebasedatabase.app` |
| Device project | `catherines-diorama`, configured separately in `js/firebase-config.js` |
| Proposed Hosting site | `atherines-resort-reservations` |
| Proposed Hosting URL | `https://atherines-resort-reservations.web.app` |
| Public Hosting observation | Both `atherines-resort-reservations.web.app` and `catherines-diorama.web.app` returned HTTP 404 and Firebase `Site Not Found`. No live page was served at those default addresses during the audit. |
| Firebase aliases and targets | `.firebaserc` and default `firebase.json` were absent. No checked-in alias/target mapping was available. New `firebase.production.json` explicitly names the reservation Hosting site. Every deployment command below explicitly names the reservation project. |
| Cloud inventory | Firebase CLI `login:list --json` returned no account, and `projects:list --json` failed authentication. Live Auth users/claims, enabled providers, additional Hosting sites/custom domains, RTDB instances, published rules and IAM remain unverified. `gcloud` was unavailable on the current PATH. |
| Emulator | `demo-catherines-reservations`, RTDB namespace `demo-catherines-reservations-default-rtdb`, loopback Auth 9099 and RTDB 9000. Isolated regression tests used 19099/19000 and left the running preview available. |

An authenticated project inventory is required before confirming a live website or publishing anything. Run these read-only commands after signing into an account authorized for the reservation project.

```powershell
firebase login
firebase projects:list --json
firebase hosting:sites:list --project atherines-resort-reservations --json
firebase database:instances:list --project atherines-resort-reservations --json
gcloud projects describe atherines-resort-reservations
gcloud run services list --project atherines-resort-reservations --region asia-southeast1
```

In Firebase Console, select project ID `atherines-resort-reservations`. Review Authentication → Users for the intended live guest UID and trusted administrator UID, including the administrator's `admin: true` claim. Review Authentication → Sign-in method for Email/Password and Settings → Authorized domains for the reviewed Hosting domain. Review Realtime Database → Rules and save the published rules privately before comparing them with `shared-reservations.rules.json`. Existing emulator accounts and booking fixtures belong to the demo project and are separate from live users.

## Prepared backend and policy decision

The proposed backend is Cloud Run service **`rfid-checkin`**, region **`asia-southeast1`**, project **`atherines-resort-reservations`**. Its HTTPS URL is pending deployment. Obtain the actual `status.url` from Cloud Run after the approved deployment. No service URL has been invented or placed into the production sketch.

`production/rfid/server.cjs` reuses `scripts/signed-rfid-check-in.cjs` and `scripts/check-in-verifier.cjs`. The production store uses an attached service identity and Google OAuth access tokens for the reservation database. It accepts only the fixed reservation project/database. The store verifies that a commit changes one approved booking from Confirmed to Checked In and adds one receipt. Owner, reference, price, facilities, RFID assignment, existing receipts and unrelated data must match the previous snapshot.

The proposed dedicated identity is `rfid-checkin@atherines-resort-reservations.iam.gserviceaccount.com`. Its proposed RTDB role is `roles/firebasedatabase.admin`, required here for the verifier's root read and conditional atomic root commit. This role has broad database privileges, so the service code's transition guard and deployment identity are part of the trust boundary. The reader receives a separate HMAC credential. The Cloud Run identity's access token stays on the server.

The existing verifier enforces full uppercase 4/7/10-byte UID matching, reader authentication, 15-second scan freshness, Confirmed status and atomic receipt/status saving. **It does not enforce reservation date, stay slot, early arrival, late arrival or a Philippine-time check-in window.** Decide those policies before enabling check-in for general real bookings. This preparation adds an optional eligibility predicate with unchanged default behavior for existing callers.

For the first live test, I chose an explicit reference allowlist and a disabled default. `RFID_ALLOWED_REFERENCES` limits the wrapper to the approved dedicated test booking. `RFID_CHECKIN_ENABLED=false` prevents scan writes until the reviewed first-tap enable step. This allows one controlled test while the general date/time policy is still pending.

Browser rules require no new client check-in grant. The proposed rules content is the existing `shared-reservations.rules.json`. Guests retain owner access. Trusted admins retain approval and RFID assignment. Direct guest/admin browser writes to Checked In and receipts remain denied. The privileged service performs the verified transition. **The diff against deployed rules is unknown until the live rules are retrieved and reviewed.** Publishing the local rules is a separate approval step.

Duplicate delivery of the same fresh event returns REPLAY with the original reference/status. A new scan for an already Checked In booking is ineligible. Both preserve the original receipt. Lost database acknowledgements are recovered only when a fresh read confirms the same receipt and booking state. Failed/unconfirmed saves produce failure feedback. The backend does not dispatch device commands.

## Private production reader pair and TLS

A new private production reader pair has been generated and locally verified with a fake store. Its key differs from the bench key. The old bench key was rejected by the new production keyset during that test.

- Server import file `.local/rfid-production-reader.json`
- Reader config `esp32_firmware/RFID_Production/production-secrets.h`
- Reader ID `esp1-production-v1`
- Sketch `esp32_firmware/RFID_Production/RFID_Production.ino`

Both private files are Git-ignored. The deployment source and Hosting source were checked and contain no production reader secret. The endpoint is currently empty. Wi-Fi fields are private local entries to complete before Arduino Verify.

The production sketch uses `NetworkClientSecure`, the installed ESP32 3.3.12 core's built-in CA bundle, a synchronized clock and HTTPS. It does not call `setInsecure`. The installed core source uses `MBEDTLS_SSL_VERIFY_REQUIRED`, sets the server hostname with `mbedtls_ssl_set_hostname`, and HTTPClient connects with the configured hostname. Thus its configured TLS path validates trust and hostname. A physical ESP32 TLS handshake, invalid-certificate/hostname rejection and full Arduino compilation still need verification. The bench sketch remains a separate local sender.

After deployment approval and after reading the actual service URL, configure the private production header using the helper. Preserve the endpoint returned by Cloud Run exactly.

```powershell
$endpoint = gcloud run services describe rfid-checkin --project atherines-resort-reservations --region asia-southeast1 --format="value(status.url)"
node scripts/prepare-rfid-production.cjs "--endpoint=$endpoint"
```

The helper preserves existing production Wi-Fi entries and key material. It stages the backend from an explicit file list. Before running a future Hosting restage, rename the existing `.local/hosting-rfid` directory for review, then run `node scripts/stage-rfid-hosting.cjs`. That staging helper requires a fresh directory to prevent stale files from entering the upload.

## Commands for review, to run only after deployment approval

The following commands create or change cloud resources. They were prepared but have not been run. Confirm project ownership, billing, the instance, existing service accounts and deployment/build permissions first.

```powershell
gcloud services enable run.googleapis.com cloudbuild.googleapis.com artifactregistry.googleapis.com secretmanager.googleapis.com --project atherines-resort-reservations
gcloud iam service-accounts create rfid-checkin --display-name="RFID check-in runtime" --project atherines-resort-reservations
gcloud projects add-iam-policy-binding atherines-resort-reservations --member="serviceAccount:rfid-checkin@atherines-resort-reservations.iam.gserviceaccount.com" --role="roles/firebasedatabase.admin"
gcloud secrets create rfid-reader-keys --replication-policy=automatic --project atherines-resort-reservations
gcloud secrets versions add rfid-reader-keys --data-file=.local/rfid-production-reader.json --project atherines-resort-reservations
gcloud secrets add-iam-policy-binding rfid-reader-keys --member="serviceAccount:rfid-checkin@atherines-resort-reservations.iam.gserviceaccount.com" --role="roles/secretmanager.secretAccessor" --project atherines-resort-reservations
```

If the reviewed resources already exist, inspect them and reuse their verified identity/configuration. Record the actual returned secret version. The following first deployment uses version 1 only if that is the version just created. `CBLR-000000` is a disabled placeholder, to be replaced with the approved dedicated test reference at the enable step.

```powershell
node scripts/prepare-rfid-production.cjs
gcloud run deploy rfid-checkin --project atherines-resort-reservations --region asia-southeast1 --source .local/rfid-deploy --service-account rfid-checkin@atherines-resort-reservations.iam.gserviceaccount.com --allow-unauthenticated --concurrency=8 --max-instances=1 --timeout=30 --set-env-vars="PROJECT_ID=atherines-resort-reservations,RFID_CHECKIN_ENABLED=false,RFID_ALLOWED_REFERENCES=CBLR-000000" --set-secrets="/secrets/reader-keys.json=rfid-reader-keys:1"
```

Cloud Run is publicly reachable for the ESP32. The `/scan` application authenticates each reader with HMAC. Browser-origin scan requests are rejected. The public `/health` response contains clock/enable state and no booking data. Logs must exclude request bodies, authentication headers and secret contents.

Hosting is staged in `.local/hosting-rfid` using the existing reservation-only page/script allowlist. Its shared config selects reservation-only navigation. Device and guest facility routes/scripts are absent, and the old admin-dashboard destination redirects to Master Reservations. This is a deliberate first-test scope choice to keep physical controls out of the hosted test. The original source pages retain their existing behavior in the local preview.

After confirming the Hosting site exists, deploy with the explicit project/config. If the site is absent, create it only after approval using `firebase hosting:sites:create atherines-resort-reservations --project atherines-resort-reservations`.

```powershell
firebase deploy --only hosting --config firebase.production.json --project atherines-resort-reservations
```

Only after separately reviewing the published-rules diff, the rules deployment command is as follows.

```powershell
firebase deploy --only database --config firebase.production.json --project atherines-resort-reservations
```

## First live tap after target and policy review

1. Verify the approved Hosting URL serves this staged build and that both browser sessions use the reservation project and named app. Confirm Email/Password and trusted live administrator claims. Use separate live guest/admin sessions.
2. Through the normal reservation flow, create one dedicated synthetic live test booking under the intended guest UID. Record its new reference. Approve it in Master Reservations and assign physical UID `B2321606`, provided the live card index shows it is available. Resolve an existing card binding using the established assignment policy. Reassignment/card release is currently disabled.
3. Record the booking reference as the sole approved reference. The live booking is created only after review. Existing emulator reference `CBLR-434373` is separate emulator data.
4. Keep the reader controller physically isolated from actuators. Open the production sketch, fill its private Wi-Fi settings, verify the actual Cloud Run URL and complete Arduino Verify before operator flashing.
5. Check HTTPS health and the ESP32's successful TLS connection. During the initial disabled revision, `/scan` returns CHECKIN_DISABLED. Validate the device certificate/hostname checks with a separately built test configuration and an invalid/untrusted endpoint before the live tap.
6. After confirming the dedicated test reference and accepting the test-only date policy, enable the wrapper for that reference. Replace the example reference with the actual reviewed live reference.

```powershell
gcloud run services update rfid-checkin --project atherines-resort-reservations --region asia-southeast1 --update-env-vars="RFID_CHECKIN_ENABLED=true,RFID_ALLOWED_REFERENCES=CBLR-123456"
```

7. Open `https://atherines-resort-reservations.web.app/admin-reservations.html` and `https://atherines-resort-reservations.web.app/my-reservation.html?reservation=CBLR-123456`, replacing the example reference. Both must show that same Confirmed booking and Assigned RFID before the tap.
8. Tap once. Pass requires a saved `verifiedCheckins/<scan-id>` receipt containing the exact UID/reference/reader and the same reservation becoming Checked In in both views. Inspect the receipt through the authorized Firebase Console. Record the Serial output and website status. A repeat tap must preserve that receipt and booking. Physical tap result remains Pending until observed.
9. Disable scan writes after the test. Review the evidence and date/time policy before enabling broader use. Gate, car, lights, audio and guest hardware controls stay outside this test.

## Reader-key retirement and rollback

The existing local bench key remains active in the emulator until the new production reader is verified. It has not been imported into the production keyset. Secret Manager import, production credential verification and retirement of any previous live credential remain pending approval and deployment.

For a future live key rotation, use a new reader ID and a new key. Deploy a keyset containing both readers while verifying the new reader. A signed unknown-card probe returning NO_ELIGIBLE_BOOKING can verify authentication without checking in a reservation. Then publish a keyset excluding the previous reader, send all traffic to that revision and verify the old reader now gets INVALID_READER_EVENT. Disable old secret versions after this verification. Removing a Secret Manager version alone does not remove a key already loaded into an older running revision. Review revision traffic and tags.

Immediate write-stop command after review is as follows.

```powershell
gcloud run services update rfid-checkin --project atherines-resort-reservations --region asia-southeast1 --update-env-vars="RFID_CHECKIN_ENABLED=false"
```

Record the pre-change Cloud Run revision and Hosting release, plus a private copy of the published rules, before deploying. Roll back Cloud Run traffic with the reviewed revision name. On the initial deployment, keep the service disabled if there is no earlier revision.

```powershell
gcloud run services update-traffic rfid-checkin --project atherines-resort-reservations --region asia-southeast1 --to-revisions="REVIEWED_PREVIOUS_REVISION=100"
```

Use Firebase Console → Hosting release history to roll back to the recorded release. Restore the privately saved, reviewed rules using an explicit project/config after approval. Avoid resetting a Checked In test booking or deleting its receipt to simulate a rollback. Preserve the audit record and use a fresh test booking when needed. Revoked reader credentials should remain revoked during rollback, so review the keyset loaded by any revision receiving traffic.

## Verification performed and remaining dependencies

- `tests/rfid-production.test.cjs` passed with fake cloud transport, covering disabled default, allowlist, fixed target, OAuth header, new/old credential behavior, freshness, concurrent and repeat delivery, one receipt/status transition and unrelated-data guard.
- The privately generated new key passed HMAC verification against a fake store. The bench key failed against that production keyset. Secret values were not printed.
- `tests/rfid-bench.test.cjs` passed through real HTTP and isolated Auth/RTDB emulators, including My Reservation status updates, leading-zero UIDs, eligibility/authentication/replay handling, adapter restart and unreachable server.
- All nine Phase 2C.1 check groups passed on isolated emulator ports, including guest/admin direct-write denial, failed saves, lost acknowledgements, concurrent scans and shared UI status.
- `tests/hardware-integration.test.cjs` passed signed-reader and disabled hardware-flow checks with fake transport.
- Generated deployment files contain no reader key. Both production credential files are Git-ignored. The Hosting stage excludes device pages and connectors. Dependency lockfile, JavaScript syntax and diff checks passed.

Pending dependencies are authenticated live inventory, approved site/instance/rules diff, Cloud Run/IAM and Secret Manager provisioning, date/time policy, an approved live test reference, actual HTTPS endpoint, Arduino compilation and physical TLS/tap verification. Cloud container build and runtime ADC/IAM have not been tested against live services. No Hosting, rules, live Auth, IAM, secrets or live booking was published or changed during preparation.

Official references used for the preparation include [RTDB REST OAuth authentication](https://firebase.google.com/docs/database/rest/auth), [Cloud Run service identity](https://docs.cloud.google.com/run/docs/configuring/services/service-identity), [Cloud Run secrets](https://docs.cloud.google.com/run/docs/configuring/services/secrets), [source deployment](https://docs.cloud.google.com/run/docs/deploying-source-code) and [RTDB IAM roles](https://docs.cloud.google.com/iam/docs/roles-permissions/firebasedatabase). ESP32 TLS behavior was checked against the installed 3.3.12 core sources and its built-in CA-bundle example.
