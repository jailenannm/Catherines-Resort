# Two-laptop local RFID demo

Laptop 1 currently uses **192.168.1.35**. Both laptops must open the LAN address below. The original `127.0.0.1:5000` preview uses a separate older emulator dataset.

The LAN demo is already running. One automated fixture booking was created and checked in with a synthetic UID for software verification. Create a new booking for the physical demonstration. Physical UID **B2321606 is unassigned in this fresh LAN dataset**. Its older binding remains in the original loopback emulator.

## Laptop 1 startup

Open PowerShell in `C:\Users\Admin\Projects\catherines-diorama-IOT-BASED`. Close an earlier LAN demo or standalone port-8787 bench server before restarting. Keep the startup terminal running throughout the demonstration.

```powershell
Set-Location 'C:\Users\Admin\Projects\catherines-diorama-IOT-BASED'
$env:Path = "$env:TEMP\catherines-phase2a2-tools\node-v22.16.0-win-x64;C:\Program Files\Weka-3-8-7\jre\jre-25.0.2-full\bin;$env:Path"
$env:FIREBASE_EMULATORS_PATH = "$env:TEMP\catherines-phase2a2-tools\emulators"
$env:XDG_CONFIG_HOME = "$env:TEMP\catherines-phase2a2-tools\config"
npm.cmd run demo:lan -- --host=192.168.1.35
```

This starts dedicated demo Auth/RTDB emulators, seeds administrator/guest accounts, starts the LAN website and forwards LAN emulator traffic to those local processes. It also starts the RFID reader endpoint using the existing private bench credential. The Firebase emulator project is `demo-catherines-reservations` and the database namespace is `demo-catherines-reservations-default-rtdb`.

The dedicated demo is fresh each launch. Restarting resets its demo records and recreates its users. Both laptops should sign out and sign in again after a restart. Existing original emulator records and live Firebase records are separate from this dataset.

| Service | Laptop 2 / LAN endpoint | Laptop 1 internal destination |
|---|---|---|
| Website | `http://192.168.1.35:5000` | Node server on this LAN address |
| Auth emulator | `http://192.168.1.35:9099` | `127.0.0.1:29099` |
| RTDB emulator | `http://192.168.1.35:9000` | `127.0.0.1:29000` |
| RFID reader | `http://192.168.1.35:8787` | Verifier using `127.0.0.1:29000` |

The private internal ports avoid collisions with the original preview. The LAN page receives an explicit emulator-only configuration. Firebase browser SDK files are served locally from `/vendor/firebase/`. Live device connectors are blocked by this server. Opening the LAN URL therefore connects Laptop 2 to Laptop 1, including when using email/password over local HTTP.

If Laptop 1's IP changes, check `ipconfig`, supply the new address in `--host`, update the firewall LocalAddress and the sketch's `BENCH_SERVER`, and use the new URLs on both laptops. The current active interface is Ethernet through the same LAN router. Confirm Laptop 2 and the ESP32 Wi-Fi can reach that LAN.

## Windows Firewall operator step

The current Laptop 1 network is classified **Public**. Windows denied this session's attempt to change the profile, so the following step is still pending. Open **PowerShell as Administrator on Laptop 1** on your trusted demo network.

```powershell
$demoIP = '192.168.1.35'
$demoInterface = (Get-NetIPAddress -IPAddress $demoIP -AddressFamily IPv4).InterfaceIndex
Set-NetConnectionProfile -InterfaceIndex $demoInterface -NetworkCategory Private
New-NetFirewallRule -DisplayName 'Catherines LAN Demo' -Direction Inbound -Action Allow -Protocol TCP -LocalAddress $demoIP -LocalPort 5000,8787,9000,9099 -Profile Private -RemoteAddress LocalSubnet
```

This permits the four demo ports from the local subnet on the selected Private network. Keep Windows Firewall enabled. The emulator management ports and private credential files are outside these exposed services. If organizational policy prevents a Private network profile, ask the network administrator to permit the same scoped access. Avoid guest Wi-Fi with client/AP isolation.

After the event, the operator can remove this specific firewall rule.

```powershell
Remove-NetFirewallRule -DisplayName 'Catherines LAN Demo'
```

## Exact browser URLs and accounts

Use the LAN URL on **both** laptops.

- Laptop 1 administrator sign-in `http://192.168.1.35:5000/login.html`
- Master Reservations `http://192.168.1.35:5000/admin-reservations.html`
- Laptop 2 guest sign-in `http://192.168.1.35:5000/login.html`
- Guest homepage `http://192.168.1.35:5000/index.html`
- Booking form `http://192.168.1.35:5000/reservation.html`
- Guest bookings `http://192.168.1.35:5000/my-reservation.html`

Administrator account `administrator@example.test`. Guest account `guest-a@example.test`. Both use emulator password **TestPass123!**. A second guest `guest-b@example.test` also exists for ownership-denial checks. These are demo accounts.

## Laptop 2 reachability checks

From PowerShell on Laptop 2, check all four ports.

```powershell
Test-NetConnection 192.168.1.35 -Port 5000
Test-NetConnection 192.168.1.35 -Port 9099
Test-NetConnection 192.168.1.35 -Port 9000
Test-NetConnection 192.168.1.35 -Port 8787
Invoke-RestMethod http://192.168.1.35:8787/health
```

All TCP checks should report `TcpTestSucceeded : True`. Health should report `ok = True` and project `demo-catherines-reservations`. If these fail, check Laptop 1's IP, its running terminal, firewall and Wi-Fi client isolation before trying to book or tap.

In the guest browser's developer console, the following read-only diagnostic should report emulator mode, the demo project, and Laptop 1's IP for both emulator URLs. It contains no credentials.

```javascript
({
  mode: SHARED_RESERVATIONS_CONFIG.mode,
  project: SHARED_RESERVATIONS_CONFIG.emulatorProjectId,
  auth: SHARED_RESERVATIONS_CONFIG.authEmulatorUrl,
  database: SHARED_RESERVATIONS_CONFIG.databaseEmulatorUrl
})
```

Expected Auth URL is `http://192.168.1.35:9099` and Database URL is `http://192.168.1.35:9000`. Network requests for Auth and RTDB should use those addresses. Reload the LAN page if an older tab was open before setup.

## Physical card sequence

**Current battery diagnosis:** the private bench config is diagnostic-only and sends signed network/card events to **192.168.1.35:8788**. The separate listener preserves the running8787 check-in server and LAN dataset, and rejects `/scan` itself. Follow the USB-first/battery-only instructions in `esp32_firmware/RFID_WiFi_Bench/README.md`; watch `Get-Content .local/rfid-diagnostics.log -Tail 0 -Wait`. These events do not check in a booking. Battery-only physical evidence remains Pending; the automated `software-diagnostic-fixture-*` log lines are not physical taps. Do not use the normal check-in sequence below until deliberately returning to normal mode for a separate test.

1. On Laptop 2, sign in as guest-a and use Book Now to submit a new booking. Note its actual confirmation reference. Open its My Reservation page using the View Reservation action or `my-reservation.html?reservation=THE_ACTUAL_REFERENCE`.
2. On Laptop 1, sign in as the administrator, search that exact reference in Master Reservations and verify guest, facilities and saved total. Click Approve and wait for Confirmed on both laptops.
3. In that same row, open Assign RFID, enter **B2321606** from your physical card and save. Wait for `RFID card assigned` on Laptop 1 and `Assigned` on Laptop 2. Status must still be Confirmed.
4. Use `esp32_firmware/RFID_WiFi_Bench/RFID_WiFi_Bench.ino`. Its private `bench-secrets.h` has the matching server credential and endpoint `http://192.168.1.35:8787`. Its Wi-Fi SSID and password are currently empty in the checkout. Fill them locally for the demo network. Use this bench sketch for this local demonstration.
5. Keep the MFRC522 attached and the 12V battery and actuators disconnected. Select the actual board/USB data-cable port, Verify, operator Upload, and open Serial Monitor at **115200 baud**. Confirm Wi-Fi is connected.
6. **Tap only after both laptops show the same reference as Confirmed and Assigned, and the health endpoint is reachable from Laptop 2.** Remove the card completely before a subsequent tap.
7. Pass requires `Card read` with the full UID, `Check-in accepted`, one saved receipt and Checked In for the same reference on both laptops. A repeat delivery reports REPLAY, or a new tap reports NO_ELIGIBLE_BOOKING because the booking is already Checked In. The original receipt/status stay intact.

The existing verifier has no booking-date/time enforcement. This demo preserves that behavior. Guest facility eligibility follows saved ownership, status and package, while guest physical commands remain disabled. Admin device controls remain emulator Preview/read-only.

## Verification completed

### Admin-confirmed checkout and card reuse

Refresh Master Reservations to load **Confirm Checkout**. Only a verified administrator in emulator mode sees it, and only for **Checking Out** bookings. Confirm the displayed reference, guest departure and that the physical card is ready for reuse. This records **admin-confirmed (demo)** departure; it does not claim gate clearance or sensor/reset evidence.

The local service is `http://192.168.1.35:8790/admin/confirm-checkout`. It verifies the administrator against Auth emulator29099, then calls the existing trusted departure verifier against RTDB29000 in `demo-catherines-reservations`. One ETag compare-and-set saves Completed, confirmer UID/server time, departure receipt and card-release history. It removes `/rfidAssignments/<UID>` only if that value is still this reference. Historical `rfidLinked` and check-in receipts remain. Repeating the completion reuses its receipt and cannot release a card subsequently assigned elsewhere. Failure keeps the booking/card binding intact; guests and signed-out requests are denied.

The already-running LAN demo was preserved. A separate8790 process was started for this session; future `npm.cmd run demo:lan -- --host=192.168.1.35` startup starts or reuses the matching checkout service. **Do not restart the current emulator just to load this UI.** If only this service needs starting in a new terminal:

```powershell
$env:GCLOUD_PROJECT='demo-catherines-reservations'
$env:FIREBASE_AUTH_EMULATOR_HOST='127.0.0.1:29099'
$env:FIREBASE_DATABASE_EMULATOR_HOST='127.0.0.1:29000'
node scripts/admin-checkout-server.cjs --host=192.168.1.35
```

Only Laptop 1's administrator browser needs8790. Do not expose it to the Internet or publish emulator rules. Laptop 2 receives booking updates through the existing9000 connection. If administering remotely, restrict any Windows Firewall inbound TCP8790 allowance to the demo LAN, like the existing demo ports.

Verified current LAN result: **CBLR-362342 Completed**, departure **admin-confirmed**, historical UID **B2321606** retained. The card was reassigned through Master Reservations to fresh **CBLR-265856**; an authenticated software scan fixture checked in only that new booking. This was **not a physical tap**. Both guest/admin browser sessions showed the saved statuses. Other LAN bookings were preserved. Reload each laptop's selected booking to see the result.

Repeat automated checks without modifying this LAN dataset:

```powershell
npm.cmd run test:admin-checkout
npm.cmd run test:checkout
```

These use isolated19099/19000 emulators and web15000. The attached `tests/admin-checkout-lan.test.cjs` intentionally changes the selected demo bookings and is not an ordinary regression command; do not rerun it against completed LAN references. Guest controls remain disabled and no device commands are sent. The private bench configuration currently enables `BENCH_DIAGNOSTICS_ONLY=1`; leave it unchanged during software checks. A physical card tap remains an operator check and requires consciously restoring scan-sending mode only after a new booking is Confirmed and assigned.

`tests/lan-demo-flow.test.cjs` passed against the running LAN address using separate browser sessions. A guest created a booking, an administrator approved it and assigned a synthetic UID, and an authenticated fixture scan changed that booking to Checked In in both views. Replaying the scan returned 409. Browser Auth and RTDB traffic used Laptop 1's LAN IP, Firebase SDKs loaded locally, private-file routes returned 403, and the guest action guard remained locked for physical commands. No cloud Firebase calls were made.

The test used a synthetic UID distinct from B2321606. A direct check confirmed the physical UID is still unassigned in the fresh LAN dataset, while the older original emulator binding is preserved. Local LAN website, Auth, RTDB and RFID listeners all responded from Laptop 1. Windows firewall configuration, actual Laptop 2 connectivity, Arduino compilation/upload and the physical tap remain operator checks. Physical demo result **Pending**.
