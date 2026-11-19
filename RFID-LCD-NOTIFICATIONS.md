# Reservation names and LCD notifications

## Existing data and scan integration

`js/reservation.js` builds `guestName` from the submitted name. `js/shared-reservations.js` creates `/sharedReservations/<reference>` with that saved string and Pending Verification status. Rules validate names as strings of 1–150 characters. Approval changes status to Confirmed. Admin RFID assignment atomically links `sharedReservations/<reference>/rfidLinked` and `rfidAssignments/<full-UID>`.

`scripts/signed-rfid-check-in.cjs` authenticates the existing scan tuple `[readerId,eventId,uid,byteCount,observedAt]`. The check-in verifier reads the UID index and verifies that exact booking's reference, full UID, Confirmed status and existing eligibility policy. Its atomic write still changes only status and creates the existing receipt.

The verifier now carries `guestName` from that same verified booking on commit, replay resolution and lost-acknowledgement recovery. The local HTTP adapter adds it to a first successful200 response. Existing409 replay responses and failure responses retain their behavior. A legacy record without a string name returns an empty string, allowing the existing firmware fallback.

Actual successful HTTP response captured by `tests/rfid-guest-name.test.cjs` using its isolated synthetic record:

```json
{"accepted":true,"reference":"CBLR-980001","status":"Checked In","guestName":"María \"Luz\" Santos de la Cruz"}
```

The saved name is returned in full, preserving case, Unicode and JSON escaping. The API does no LCD truncation. `/health` contains no guest name. The endpoint adds no guest-name logging.

## Authenticated read-only display snapshots

The reviewed existing HTTP adapter had `/health`, `/diagnostic` and `/scan`. The new route is **POST `/reader-display`** on that same adapter. Requests require the existing reader ID/key. Browser-origin requests are rejected. There is no public GET snapshot.

Request body:

```json
{"readerId":"esp1-bench","eventId":"lcd_<unique random ID>","observedAt":<serverTime from /health>}
```

Set `X-Reader-Signature` to lowercase hexadecimal HMAC-SHA256 of this exact compact JSON array, using the existing key as UTF-8 bytes:

```text
["rfid-lcd-display-v1","esp1-bench","lcd_<unique random ID>",<serverTime>]
```

The signed purpose differs from the scan/diagnostic purposes. Credentials, signatures and scan IDs keep their existing formats. A display signature cannot authorize a scan. Requests expire after15seconds. Identical retries reuse the response for that request ID, and changed reuse is rejected. The handler has no database write operation.

The response contains only `reservations`, an array of `{reference,status,guestName,createdAt,rfidAssigned}`. These are projections of existing saved fields. `rfidAssigned` is true only when the booking UID and active index both match. The UID, contact information, owner UID and credentials are omitted. Included statuses are Pending Verification, Confirmed and Checked In. Completed/cancelled bookings leave this snapshot. Sorting uses saved `createdAt`, then reference.

The review example polls every5seconds. The first successful snapshot establishes a baseline. A newly observed reference queues `NEW RESERVATION` with its saved name. A newly observed active assignment on a Confirmed booking queues `RFID ASSIGNED / READY FOR ENTRY`. These are current-state notifications. A transition that finishes entirely between polls may be missed, and rebooting establishes a new baseline. This design avoids adding an event queue or acknowledgement fields to booking records.

The route uses the existing LAN HTTP transport and reader credentials. Only the laptop backend reads emulator data. Keep the reader key in the existing private configuration.

## Optional ESP32 additions for review

The local `.ino` inspected during this change lacks the working LCD functions described in the request. Its source and private config were left untouched. Use your current working LCD sketch for the following reviewed additions.

Install ArduinoJson7 if it is not already available. The separate `esp32_firmware/RFID_WiFi_Bench/ReservationLcdNotifications.example.h` contains the exact optional code. It is not included by the current sketch. It uses your existing `showLCD()` function and existing HTTP/Wi-Fi/mbedTLS imports and BENCH constants.

1. After your existing `showLCD()` definition, add:

```cpp
#include "ReservationLcdNotifications.example.h"
```

2. At the beginning of `loop()`, before any early card-read return, add:

```cpp
ReservationLCD::tick();
```

3. Keep the existing accepted-scan integration exactly as it is:

```cpp
String guestName = guestNameFromScanResponse(body);

if (guestName.length() > 0) {
  showLCD("WELCOME TO CBLR", guestName);
} else {
  showLCD("CHECK-IN OK", "WELCOME GUEST");
}
```

Immediately afterward, within that existing successful-scan branch, optionally add this to page long welcome names:

```cpp
if (guestName.length() > 0) ReservationLCD::welcome(guestName);
```

The example displays16-character pages every1.2seconds. It gives each notice at least8seconds and enough time for two cycles of longer names. It holds queued notifications while showing the welcome. UTF-8 names remain intact in JSON. The example replaces LCD characters outside printable ASCII with `?` because the installed character ROM is unverified. Confirm accent support before choosing a character mapping. The example adds synchronous short-timeout HTTP polling, which requires a hardware responsiveness check. If your existing network/LCD code also refreshes the screen, review its interaction with these calls against the actual working sketch.

No I2C initialization is added. Your working SDA16/SCL17 and logic-level-converter setup continue to be supplied by your LCD sketch.

## Testing and runtime activation

Run the focused tests with Node on PATH:

```powershell
node tests/rfid-guest-name.test.cjs
node tests/rfid-diagnostics.test.cjs
```

The name test uses an in-memory transport behind the actual HTTP adapter. It cannot write the running emulator. Existing `tests/rfid-bench.test.cjs` now asserts the saved name on its accepted scan, and runs on isolated emulators with the existing `tests/isolated-facility-ports.cjs` adapter.

Backend source changes require a reload of the Node process serving8787. A browser refresh does not reload that process. This task does not stop the running LAN/emulator processes. If using the combined `firebase emulators:exec` demo, stopping its child can shut down its emulators, so preserve/export the running dataset before restarting that combined launcher. Do not run a seed/reset command to activate this change. The8788 process started for earlier diagnostics also requires a process reload before serving the new route. Point notification polling at the same updated `BENCH_SERVER` as the working scan path.

Hardware checks remain pending. After reviewing/merging the optional code into the actual working sketch, perform Arduino Verify and an operator upload. With a running updated backend, establish the snapshot baseline, create a synthetic website reservation, observe its saved name, approve and assign the card, then observe readiness. Tap that card and confirm the200 response name matches the same reference and the LCD welcome. Verify a name longer than16characters, accent rendering, polling responsiveness, network loss, replay behavior and queued notices. No firmware upload was performed during this task.
