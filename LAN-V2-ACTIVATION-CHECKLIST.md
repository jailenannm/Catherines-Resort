# LAN V2 activation — prepared, not executed

## Verified preflight (19 November 2026, Philippine time)

- LAN address: **192.168.1.39**. Website: http://192.168.1.39:5000/.
- Adapter **PID 18076**, `.local/lcd-restart/lan-services.cjs --host=192.168.1.39`, owns 5000/8787/8790 and LAN forwards 9099/9000.
- Keep Firebase CLI **PID 5340** (Auth 29099, hub 24400) and Java RTDB **PID 13120** (29000) running. No independent 8788 listener was found.
- `/health` returns 200; guest/admin/device V2 paths return 404. Served device-sync and V2 flags are false. The running process has not loaded the optional routing changes; the private device registry is also absent. Source changes alone do not reload Node.
- Project: `demo-catherines-reservations`; namespace: `demo-catherines-reservations-default-rtdb`.
- Backup: `.local/emulator-backups/lcd-stage1-20261116-233447-746-PHT`. All four recorded SHA-256 hashes match. Current database equals the export; stable Auth identity, credential, provider and role data match (volatile login metadata excluded).
- Preserved counts: 3 accounts, 3 reservations, 1 active RFID binding, 3 check-in receipts, 2 departure receipts, 2 release-history entries. Statuses: CBLR-169607/CBLR-638114 Completed; CBLR-970389 Checked In.
- Export metadata and current emulator configuration/rules hashes match. This export has previously been imported successfully. No restore was performed during this preflight. Evidence: `.local/lan-activation-preflight.json`.

## Operator sequence — requires separate authorization

1. Pause bookings, checkout and card taps. Recheck backup/data equality before stopping anything; if data changed, STOP and arrange a fresh verified export. Never import this backup over newer data.
2. Recheck identities immediately before shutdown:

```powershell
Set-Location 'C:\Users\Admin\Projects\catherines-diorama-IOT-BASED'
Get-CimInstance Win32_Process | Where-Object ProcessId -In 18076,5340,13120 |
  Select-Object ProcessId,ParentProcessId,ExecutablePath,CommandLine
Get-NetTCPConnection -State Listen |
  Where-Object LocalPort -In 5000,8787,8788,8790,9000,9099,29000,29099,24400 |
  Select-Object LocalAddress,LocalPort,OwningProcess
Get-NetIPAddress -AddressFamily IPv4 | Where-Object IPAddress -EQ '192.168.1.39'
```

3. In the **confirmed adapter terminal only**, press **Ctrl+C**. Do not close the Firebase terminal or kill parent processes. There is no application-level drain handler: finish requests first. If the adapter terminal cannot be identified, STOP; do not substitute broad Node/Java termination. Confirm the adapter ports are released and the original emulator PIDs/listeners remain.
4. After explicit provisioning approval, generate separate device keys:

```powershell
node scripts/provision-reservation-devices.cjs
git check-ignore .local/reservation-devices.json
```

Expected: private registry created, with distinct ESP1/ESP2 keys; existing registry is never overwritten. Do not print its contents. This does not touch `.local/rfid-reader.json` or existing RFID credentials. Do not copy these new keys to boards or edit working ESP1 V4 during route activation. Future board-specific private `device-sync-secrets.h` files must remain ignored; templates exist under `ESP1_Reservation_Sync` and `ESP2_Facilities_V2`.

5. Start **adapters only**, in a dedicated foreground PowerShell terminal:

```powershell
$env:GCLOUD_PROJECT='demo-catherines-reservations'
$env:FIREBASE_AUTH_EMULATOR_HOST='127.0.0.1:29099'
$env:FIREBASE_DATABASE_EMULATOR_HOST='127.0.0.1:29000'
$env:CATHERINES_DEVICE_SYNC='1'
$env:CATHERINES_TRUSTED_DEMO_LAN='1'
$env:CATHERINES_FACILITIES_V2='1'
Remove-Item Env:CATHERINES_FACILITIES_SIMULATION -ErrorAction SilentlyContinue
node scripts/serve-reservation-lan.cjs --host=192.168.1.39
```

This launcher checks the existing emulator hub and never seeds/imports/resets. Do **not** use a seed/demo launcher. Do not enable simulation on this database: it requires the separate test emulator on 19000. V2 physical capabilities remain uncommissioned. V1 sync can derive pathway ON from the existing checked-in booking, so keep newly provisioned sync credentials off hardware. No firmware upload or device command is part of activation.

## Verify registration without commands or reservation changes

```powershell
curl.exe -i http://192.168.1.39:8787/health
curl.exe -i http://192.168.1.39:8787/admin/facilities/v2/state
curl.exe -i http://192.168.1.39:8787/guest/facilities/v2/state
```

Expected: health 200; protected state routes **403 FORBIDDEN** without a token, rather than 404. A 403 proves the route exists but denies the caller. A 503 means a handler/server failure, not successful authorization. Device sync is a signed **POST**, not a public GET; do not send a fake sync or scan to test registration.

After approval for derived-state initialization, sign in as the existing emulator administrator on the LAN website and run this in that page's browser console (never print/copy tokens):

```javascript
const identity = await SharedReservations.identity(true);
const response = await fetch(`http://${location.hostname}:8787/admin/facilities/v2/state`, {
  headers: { Authorization: `Bearer ${await identity.user.getIdToken()}` }
});
console.log({ status: response.status });
```

Expected: authenticated admin 200; guest credentials on the admin route 403. Review the UI for unavailable/uncommissioned controls. Authenticated state GETs reconcile **derived device state** and can write those subtrees; they are not strictly zero-write probes. Do not issue command POSTs. Recompare reservations/accounts/receipts afterward. Confirm Laptop 2 still opens http://192.168.1.39:5000/ and uses LAN Auth9099/RTDB9000.

## Rollback

Stop only the newly started adapter using Ctrl+C in its own terminal. Keep Auth/RTDB running. In that terminal:

```powershell
Remove-Item Env:CATHERINES_DEVICE_SYNC,Env:CATHERINES_TRUSTED_DEMO_LAN,Env:CATHERINES_FACILITIES_V2,Env:CATHERINES_FACILITIES_SIMULATION -ErrorAction SilentlyContinue
node scripts/serve-reservation-lan.cjs --host=192.168.1.39
```

Expected: website/RFID/checkout/forwarding restored with optional sync disabled; protected V2 routes return 404 again. Keep private keys stored but unused; do not delete or rotate RFID keys. **Normal adapter rollback needs no database restore.** If emulator/data integrity fails, STOP and request a separate recovery decision; never start duplicate emulators or automatically import an older backup. Firmware, ESP1 V4, Hosting and live Firebase remain untouched.
