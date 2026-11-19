# ESP1 reader-to-emulator bench check-in

## Non-mutating USB comparison diagnostics

Set `#define BENCH_DIAGNOSTICS_ONLY 1` in the private `bench-secrets.h`, then Verify and operator Upload the updated bench sketch. This mode prints the reset reason, configured server and Wi-Fi IP, reads the full card UID and performs GET `/health`. It returns before generating or submitting a scan, preserving the booking's check-in for the eventual normal test.

For a USB baseline, keep the card away, turn off and disconnect the battery supply from the assembly and isolate actuator power before connecting laptop USB. Open Serial Monitor at 115200. Confirm `Mode: Diagnostics only`, the expected server, Wi-Fi connection and board IP. Then read the card. Expected output includes its byte count/full UID and `Diagnostics passed: Wi-Fi and GET /health reachable. Scan submission disabled.` If connectivity fails, the existing Backend unreachable message identifies that stage without submitting the scan.

The exact expansion-board model and its documented power input must be identified before changing the battery wiring or choosing a simultaneous serial/power arrangement. A battery-only failure is not established by an absent server receipt. Compare the USB diagnostic output first.cd C:\Users\Admin\Projects\catherines-diorama-IOT-BASED normal scan submission after the power comparison is resolved. Full compilation and the physical comparison remain operator checks.

Physical tap result **Pending**. The new sender uses the checked-in classic ESP32 reader mapping. The Wi-Fi sketch that prints `Website: NOT SENT (backend integration pending)` was absent from the checkout and the inspected Arduino temporary sketch folders. Copy that sketch to `.local/original-rfid-wifi-sketch.ino` for a pin/configuration comparison. That folder is ignored by Git.

Open `esp32_firmware/RFID_WiFi_Bench/RFID_WiFi_Bench.ino`. This sketch reads the MFRC522 and sends signed scans over Wi-Fi. Its code contains reader/network operations only. Uploading to the installed ESP1 replaces its flashed program. Use a spare ESP32, or isolate the controller by disconnecting actuator power and gate, motor, lighting, relay and audio connections before upload. Verify shared ground and avoid back-power through connected controllers.

## Pin mapping to verify physically

| MFRC522 | Classic ESP32 GPIO / power |
|---|---|
| SDA / SS / NSS | 5 |
| RST | 22 |
| SCK | 18 |
| MISO | 19 |
| MOSI | 23 |
| 3.3V | Regulated 3.3V |
| GND | Ground |
| IRQ | Unconnected |

These pins match `ESP1_Mechanics.ino` and `RFID_Serial_Test.ino`. The actual Wi-Fi bench sketch and physical wiring still need comparison. Reader SDA here is SPI chip-select. Use the board variant that matches the actual controller.

## Services and local credentials

The PC currently has LAN IPv4 **192.168.1.35**, gateway 192.168.1.1. The board endpoint is **http://192.168.1.35:8787**. Check `ipconfig` again if the network changes and update `BENCH_SERVER` in `bench-secrets.h`. The website remains at **http://127.0.0.1:5000** on the PC. The scan server binds all PC interfaces on 8787. Auth and RTDB stay on loopback 9099 and 9000.

The current preview and scan server were left running. Loopback and PC-LAN health checks both returned HTTP 200. Reachability from the physical ESP32 or another LAN device remains Pending.

From PowerShell in the checkout, make the locally installed Node tools available if needed.

```powershell
$env:Path = "$env:TEMP\catherines-phase2a2-tools\node-v22.16.0-win-x64;$env:Path"
Test-NetConnection 127.0.0.1 -Port 5000
Test-NetConnection 127.0.0.1 -Port 9000
Test-NetConnection 127.0.0.1 -Port 9099
```

If the emulator preview has stopped, start it in its own PowerShell terminal. This command seeds the standard demo fixtures.

```powershell
$env:Path = "$env:TEMP\catherines-phase2a2-tools\node-v22.16.0-win-x64;C:\Program Files\Weka-3-8-7\jre\jre-25.0.2-full\bin;$env:Path"
$env:FIREBASE_EMULATORS_PATH = "$env:TEMP\catherines-phase2a2-tools\emulators"
$env:XDG_CONFIG_HOME = "$env:TEMP\catherines-phase2a2-tools\config"
npm.cmd run preview:guest-dashboard
```

The setup command has already generated the credential files and the Confirmed booking **CBLR-694370**, with RFID empty. A setup rerun creates another booking and prints its reference. In a second terminal, these commands prepare the files if needed and start the scan server when port 8787 is free.

```powershell
$env:GCLOUD_PROJECT = 'demo-catherines-reservations'
$env:FIREBASE_DATABASE_EMULATOR_HOST = '127.0.0.1:9000'
node scripts/setup-rfid-bench.cjs
node scripts/rfid-bench-server.cjs
```

The server reader credential is in `.local/rfid-reader.json`. The same generated credential is in the ignored `esp32_firmware/RFID_WiFi_Bench/bench-secrets.h`. Edit that header locally to fill `BENCH_WIFI_SSID` and `BENCH_WIFI_PASSWORD`. Keep its generated reader ID and reader key consistent with the server JSON. The setup preserves existing credential files. Review these files locally and keep their contents out of screenshots and chat. Credentials for Firebase Admin or live Firebase are unnecessary for this bench flow.

In another terminal, verify the LAN endpoint.

```powershell
ipconfig
Test-NetConnection 192.168.1.35 -Port 8787
Invoke-RestMethod http://192.168.1.35:8787/health
```

Expected health fields include `ok = True`, project `demo-catherines-reservations`, and a current `serverTime`. From a phone on the same LAN, open `http://192.168.1.35:8787/health`. That checks another device's route to the PC. Guest Wi-Fi or AP client isolation can prevent it. If Windows blocks inbound traffic, an administrator can add this Private-network, local-subnet rule.

```powershell
New-NetFirewallRule -DisplayName 'Catherines RFID Bench 8787' -Direction Inbound -Action Allow -Protocol TCP -LocalPort 8787 -Profile Private -RemoteAddress LocalSubnet
```

The rule was provided for the operator and has not been installed by this task. Use the private bench LAN for this HTTP service. Each scan uses HMAC-SHA256 authentication with a test reader key and a 15-second freshness window.

## Assign the physical card and compare the booking

Use separate browser sessions for administrator and guest.

- Sign-in URL `http://127.0.0.1:5000/login.html`
- Emulator administrator `administrator@example.test` with password `TestPass123!`
- Emulator guest `guest-a@example.test` with password `TestPass123!`
- Master Reservations `http://127.0.0.1:5000/admin-reservations.html`
- My Reservation `http://127.0.0.1:5000/my-reservation.html?reservation=CBLR-694370`

Search **CBLR-694370** in Master Reservations. It is the synthetic Celebration Event Package, Confirmed, total PHP16,450. Copy your physical card's full UID from Serial and use Assign RFID. Preserve every leading zero. Expected lengths are 8, 14 or 20 uppercase hexadecimal characters for 4, 7 or 10 bytes. Wait for `RFID card assigned` and guest `Assigned`. The booking stays Confirmed at this point.

If a pre-assignment tap reaches the backend, expect `NO_ELIGIBLE_BOOKING`. You can copy that tap's printed UID, assign it, remove the card completely and tap again. A fresh accepted scan should move this same booking to Checked In in both sessions. Physical guest device dispatch remains disabled by the existing guest flow.

## USB-first / battery-only diagnostic comparison (current setup)

The pasted/uploaded version always called `sendScan` and lacked a diagnostic guard. The previous local guard only fetched `/health`, producing no card evidence in the laptop terminal. The revised **local source must be verified and uploaded once** before this comparison. Keep that identical flashed sketch, card and Wi-Fi for both power tests.

The reader mapping is unchanged: SS5, RST22, SCK18, MISO19, MOSI23. No actuator or production firmware was changed. The exact expansion-board model and its documented battery input remain unverified; this change makes no wiring or voltage recommendation.

Private file `esp32_firmware/RFID_WiFi_Bench/bench-secrets.h` now has:

```cpp
#define BENCH_DIAGNOSTICS_ONLY 1
#define BENCH_DIAGNOSTIC_SERVER "http://192.168.1.35:8788"
```

Existing Wi-Fi/reader credentials and `BENCH_SERVER` on8787 are preserved. Keep credentials private. The diagnostic build **compiles out the entire scan sender and its call**. It sends domain-separated HMAC events to `/diagnostic`; these cannot authorize `/scan`. The sidecar independently rejects every `/scan` request. It records no reservation, check-in receipt or device command.

The currently running8787 server predates this endpoint and responds404 for `/diagnostic`. A separate diagnostic-only listener on **192.168.1.35:8788** was started so the existing LAN process and emulator data need no restart. Its log is **`.local/rfid-diagnostics.log`**, ignored by Git. If the sidecar is no longer running, start only it from the project root (Node must be on PATH):

```powershell
$env:GCLOUD_PROJECT='demo-catherines-reservations'
$env:FIREBASE_DATABASE_EMULATOR_HOST='127.0.0.1:29000'
node scripts/rfid-diagnostic-server.cjs --host=192.168.1.35
```

In another Laptop1 PowerShell terminal:

```powershell
Invoke-RestMethod http://192.168.1.35:8788/health
Get-Content .local/rfid-diagnostics.log -Tail 0 -Wait
```

Health must show `diagnosticsOnly: True` and project `demo-catherines-reservations`. From Laptop2, run `Test-NetConnection 192.168.1.35 -Port 8788`. If blocked, allow this port on Laptop1's demo LAN using an elevated PowerShell terminal:

```powershell
New-NetFirewallRule -DisplayName 'Catherines RFID diagnostics LAN' -Direction Inbound -Action Allow -Protocol TCP -LocalAddress 192.168.1.35 -LocalPort 8788 -RemoteAddress LocalSubnet -Profile Private,Public
```

Do not stop/restart the emulator suite or the existing LAN demo. Do not create, reassign or reset a booking for this comparison.

1. **USB first:** isolate/disconnect the battery supply before connecting USB. With the MFRC522 unchanged and actuators disconnected, open this exact `.ino`, click **Verify**, then operator **Upload**. Open Serial Monitor at **115200**, reset, and wait for Wi-Fi and diagnostic acknowledgements. Tap the comparison card, remove it fully and repeat. Record its byte count/full UID; keep using this same card for battery comparison.
2. Laptop terminal must show signed `network_ready`, then `card_read` events with that exact UID/byte count. Their `bookingChanged` field is alwaysfalse. Serial should show `Diagnostic delivered: network_ready`, `Card read: ...`, `Diagnostic delivered: card_read`, and `Diagnostics only: check-in submission disabled; no /scan request.` It must never show `Check-in accepted` in diagnostic mode.
3. **Battery only:** power down, remove the ESP32 USB cable completely, then use the already-verified battery/expansion-board power arrangement. Do not connect USB and battery together for this comparison. Keep Laptop1 and its diagnostic log running; no Serial connection is needed. Wait up to about2minutes for bounded Wi-Fi attempts, then tap the same card. Do not change/reflash the sketch or alter Wi-Fi/card assignments between tests.
4. Pass requires **new** laptop-log `network_ready` and matching `card_read` entries after battery power-up with USB physically absent. The log uses UTC timestamps and random event IDs. Lines whose event IDs start `software-diagnostic-fixture-` are automated tests, **not physical evidence**. Record the battery-only time and send those new lines, without any credentials.

Interpretation:

- No battery-only `network_ready`: power/boot, Wi-Fi, endpoint or firewall remains unresolved; no basis yet to blame a booking or reader. Compare USB reset/Wi-Fi logs and verify the expansion-board model/documented power input before changing wiring.
- `network_ready` but no `card_read`: authenticated network delivery works; investigate card reading/reader supply and connections under battery power. This alone does not identify the electrical fault.
- Both events: the card and authenticated network path work on battery. Diagnostic mode intentionally leaves the booking unchanged; normal signed check-in is a separate later test.
- Wi-Fi fails initially: each connection attempt lasts at most15seconds, with30seconds between attempts, maximum3 per outage. Card reads remain local and are not queued. After exhaustion, correct the network/configuration and reset. A connected Wi-Fi session retries backend readiness every10seconds until acknowledged.

Software verification passed signed diagnostic authentication/replays/staleness/origin rejection, 4/7/10-byte UID preservation, cross-endpoint signature rejection and zero database accesses. The exact sketch passed C++ syntax/conditional compilation checks with API doubles in both modes; a full Arduino board/library build is still required (MFRC522 library was not found locally). Normal signed check-in regression passed on isolated emulators. Two signed software fixtures reached the running8788 listener; the LAN RTDB snapshot was byte-for-byte unchanged before/after. **USB physical comparison: Pending. Battery-only reception with USB absent: Pending.**

## Arduino IDE steps

1. Open `RFID_WiFi_Bench.ino` in its matching folder. Keep `UidFormatter.h` and the locally generated `bench-secrets.h` beside it.
2. Select the actual ESP32 board and USB port. The installed ESP32 board package observed on this PC is 3.3.12. Classic ESP32 Dev Module applies only if it matches the board.
3. Install the MFRC522 library that supplies `MFRC522.h`. SPI, WiFi, HTTPClient, esp_system and mbedTLS come with the ESP32 core.
4. Fill the Wi-Fi fields and confirm `BENCH_SERVER` is `http://192.168.1.35:8787`. Use a network available to the ESP32 and reachable from the PC.
5. Click Verify. A full Arduino board/library build was not run during this task. The inspected library folders lacked MFRC522 and an Arduino CLI executable was not located. Resolve any Verify error before uploading.
6. After verifying board, port, wiring and physical isolation, upload the bench sketch yourself. This task performed no firmware upload.
7. Open Serial Monitor at **115200 baud** and reset the board. Wait for `Wi-Fi connected` and `Diagnostic delivered: network_ready`; initialization alone does not prove card reading or backend delivery.
8. Follow the assignment steps above. Tap the same card, remove it fully, then retap. Compare the printed byte count and full UID each time. Send the Serial output, excluding private configuration contents.

## Serial outcomes

The following UID and reference are examples. Your scan ID is random per physical read.

```text
Card read: UID bytes=4 UID=0001A20F
Scan ID: scan_...unique hex...
Check-in accepted: {"accepted":true,"reference":"CBLR-694370","status":"Checked In"}
```

An unknown, unassigned or ineligible card produces this outcome. Pending, Checked In, Checking Out and completed bookings cannot start another check-in.

```text
Card read: UID bytes=4 UID=0001A20F
Scan ID: scan_...unique hex...
Check-in rejected: HTTP 422 {"accepted":false,"code":"NO_ELIGIBLE_BOOKING"}
```

Incorrect reader credentials, modified signed data or expired scans produce this outcome.

```text
Check-in rejected: HTTP 401 {"accepted":false,"code":"INVALID_READER_EVENT"}
```

A repeated delivery of a committed scan is rejected as a replay. The saved booking remains Checked In. This also covers retry after a response was lost.

```text
Check-in rejected: HTTP 409 {"accepted":false,"code":"REPLAY","reference":"CBLR-694370","status":"Checked In"}
```

If Wi-Fi or the health endpoint is unreachable, the reader still prints its local result.

```text
Card read: UID bytes=4 UID=0001A20F
Backend unreachable: check Wi-Fi, PC LAN IP, port 8787 and firewall.
```

If the POST or database confirmation becomes unavailable, the sender retries the identical signed event once.

```text
Backend unreachable or save unconfirmed: retrying same scan.
Backend unreachable or save unconfirmed: check My Reservation before tapping again.
```

## Software verification and trust path

`scripts/rfid-bench-server.cjs` exposes `/health` and signed `/scan`. It uses `scripts/signed-rfid-check-in.cjs` and `scripts/check-in-verifier.cjs`, preserving the full-UID index lookup, Confirmed requirement and atomic status/receipt commit. The board signs `[readerId,eventId,uid,byteCount,observedAt]`. The server clock is fetched immediately before signing. The credential is used as a UTF-8 HMAC key. Replayed event IDs cannot apply another transition, including after server restart. A new tap has a new ID and must still match a Confirmed booking.

The HTTP adapter's store accepts only the demo project and local emulator hosts on 9000 or isolated test port 19000. Browser-origin scan requests are rejected. Emulator rules continue to deny browser check-in writes. The privileged store runs on the PC and reuses the verifier's atomic compare-and-set workflow.

`tests/rfid-bench.test.cjs` passed against isolated Auth/RTDB emulators and the real HTTP adapter. It covered valid 4/7/10-byte leading-zero UIDs, My Reservation changing Confirmed to Checked In, unassigned card, Pending booking, invalid credential, stale/malformed scan, concurrent duplicate delivery, repeated delivery, modified event ID reuse, replay after adapter restart, repeat tap and unreachable server. Three valid events produced exactly three receipts. The emulator diorama path stayed empty. The existing running port-5000 data was preserved.

The bench formatter is a copy of the existing Serial sketch's `UidFormatter.h`, keeping the Arduino sketch self-contained. Both must retain the same canonical implementation.

**Bench checklist**

- Confirm pins, 3.3V, board selection and actuator isolation.
- Complete Arduino Verify, then operator upload.
- Confirm phone/LAN health reachability and ESP32 Wi-Fi connection.
- Confirm a fresh synthetic booking is Confirmed and your exact UID is Assigned.
- Observe one accepted tap and the same reference becoming Checked In in My Reservation and Master Reservations.
- Retap and confirm rejection with the booking still Checked In.
- Record physical tap result as Pending until the actual Serial and website results are supplied.
