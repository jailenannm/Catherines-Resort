# ESP32 #1 working-sketch review and stage 1 proposal

Review only. Execution, integration, upload and restart await your confirmation.

## Exact sketch reviewed

The complete attachment `99167f7b-1278-499c-bd51-3b99f7be2fed/Pasted text.txt` was reviewed, including setup, network service, diagnostics, scan signing/retries, LCD functions and the main loop. Its SHA-256 is `01163F0E25B09AA6F35158247C92B888F2A3E66A9297123581C1C075B218292B`.

The attachment has LCD address0x27, 16columns/2rows, `Wire.begin(16,17)` and100kHz I2C. SPI uses18/19/23, reader SS5 and RST22. These pins do not overlap. `showLCD()` clears the screen and prints each line's first16bytes. The attachment includes the accepted-scan name parser and welcome branch that were absent from the local `.ino` reviewed previously. The optional notification header has not been integrated or physically tested.

## Smallest first-stage proposal

**Firmware patch: zero lines.** Your successful-scan branch already calls `guestNameFromScanResponse(body)` and `showLCD("WELCOME TO CBLR", guestName)`. First activate/review the prepared backend name response, then test a short ASCII name on a dedicated Confirmed test booking. This requires no notification polling or additional firmware library.

The existing backend source returns the full saved name from the booking selected through the exact UID index, after check-in succeeds:

```json
{"accepted":true,"reference":"CBLR-980001","status":"Checked In","guestName":"María \"Luz\" Santos de la Cruz"}
```

This is the captured synthetic software-test response. Stage1 uses the existing scan tuple, credential, event ID generation, endpoint, two-attempt retry and backend eligibility checks. Existing409 replay behavior can still display CHECK-IN DENIED even when an earlier delivery committed successfully. That behavior needs a separate reviewed decision if desired.

## Parser and display findings

- Compact JSON from the current backend works. The parser locates `guestName`, accepts a string, handles escaped quotes, slash and backslash, and replaces escaped newline/carriage-return/tab with spaces.
- Raw UTF-8 accents from Node's `JSON.stringify` survive parsing into Arduino String. LCD rendering is a separate issue. The1602 character ROM does not generally interpret UTF-8 byte sequences directly.
- Escaped `\uXXXX`, `\b` and `\f` cause the existing parser to return its empty fallback. The whitespace scan also omits literal carriage return. Current compact backend JSON does not insert that whitespace.
- The parser uses a field-name search rather than structural JSON parsing. The current flat response has one top-level `guestName`. A future response containing nested/duplicate name keys would require review.
- Long names are read completely, then `showLCD` cuts at16bytes. A cut can split a UTF-8 character. Stage1 can verify a short ASCII name first. Paging/transliteration requires a separately approved display change.
- The `accepted` check searches for the exact compact text `"accepted":true`. It matches the current adapter response.

## Optional header conflicts for stage 2

- `poll()` performs synchronous GET/POST requests. Its connect/read timeouts can pause the main RFID loop for several seconds. It runs even while a welcome is being displayed. The existing loop already performs diagnostic-health, diagnostic-POST, scan-health and scan-POST requests, with possible POST retries, before halting the card.
- Calling `tick()` before `serviceNetwork()` lets a Wi-Fi transition overwrite a notification. After a new tap displays CARD DETECTED, CHECK-IN DENIED or SERVER OFFLINE, an older active pager can overwrite that screen on a later tick. Accepted welcomes also need explicit ownership of the LCD. The example has no shared display priority/state manager for these paths.
- Every `showLCD()` calls `lcd.clear()`. Repeated pages can cause flicker. Blocking HTTP delays page timing.
- The snapshot response, JSON documents, copied Strings and vectors grow with the number of active bookings. The pending queue has no maximum. Repeated allocation/copying can increase memory pressure and fragment the heap. No actual ESP32 heap measurements have been taken.
- Snapshot polling establishes a baseline on startup and can miss transitions between polls. A newly observed already-confirmed booking can queue both reservation and assignment messages. Multiple guests can produce notices unrelated to the next card being scanned.
- The header replaces non-ASCII characters with `?` for LCD display. That is a review choice, not a physically verified character mapping. It requires ArduinoJson7, which the attached working parser does not require.

Stage2 should review these conflicts against the actual sketch before integrating any notification code.

## Current process ownership

Read-only inspection found the following processes. Recheck PIDs immediately before any approved action.

| Listener | PID | Role |
| --- | --- | --- |
|192.168.1.35:8787, :5000, :8790|6444|`node scripts/lan-demo.cjs --host=192.168.1.35`|
|127.0.0.1:29000|24980|Java RTDB emulator|
|127.0.0.1:24400|11632|Firebase CLI / emulator hub|
|192.168.1.35:8788|3008|Separate diagnostic server|

PID6444's parent is cmd1904, whose parent is Firebase CLI11632. The database emulator also has parent11632. Stopping the LAN child can therefore make `emulators:exec` shut down the emulator session. A browser refresh cannot load changed Node modules. Restarting this session requires preserving both Auth and RTDB first.

## Proposed safe restart procedure, after approval only

No commands in this section were executed. The full coordinated procedure is necessary for the currently combined launcher. It restores Auth and RTDB together and starts the LAN services separately without calling the seed helper.

1. Pause booking/admin/card activity for a consistent export. Inspect `http://127.0.0.1:24400/emulators` and confirm Auth29099, Database29000 and the demo project. Record the selected booking status, card binding, check-in receipts and account UIDs privately for comparison.
2. Export through that exact hub. This avoids another demo project's hub locator being selected by the CLI. Use a new directory and inspect the successful response and export metadata before stopping anything:

```powershell
$lcdBackup = Join-Path (Get-Location) ('.local\lcd-stage1-' + (Get-Date -Format 'yyyyMMdd-HHmmss'))
New-Item -ItemType Directory -Path $lcdBackup | Out-Null
$lcdExport = @{path=$lcdBackup; initiatedBy='approved-lcd-stage1-restart'} | ConvertTo-Json
Invoke-RestMethod -Method Post -Uri 'http://127.0.0.1:24400/_admin/export' -ContentType 'application/json' -Body $lcdExport
Get-Content (Join-Path $lcdBackup 'firebase-export-metadata.json')
```

3. Verify metadata and nonempty Auth/database export files. Keep the backup private. If either component is missing or export fails, keep the running session and investigate. After a verified backup and approval, stop the original combined demo from its terminal. Keep the independent8788 diagnostics process running for this stage.
4. Start the same emulators from the backup in one terminal. Substitute the recorded full backup path. This terminal must remain open:

```powershell
.\node_modules\.bin\firebase.cmd emulators:start --only auth,database --project demo-catherines-reservations --config firebase.lan-demo.json --import 'FULL_BACKUP_PATH'
```

5. In a separate terminal from the project root, start the LAN forwards, website, updated scan adapter and checkout adapter using the following reviewed command. It does not call `seed()`:

```powershell
$env:GCLOUD_PROJECT='demo-catherines-reservations'
$env:FIREBASE_AUTH_EMULATOR_HOST='127.0.0.1:29099'
$env:FIREBASE_DATABASE_EMULATOR_HOST='127.0.0.1:29000'
@'
const net = require('node:net');
const fs = require('node:fs');
const { startServer } = require('./tests/serve.cjs');
const { startBenchServer } = require('./scripts/rfid-bench-server.cjs');
const { startAdminCheckoutServer } = require('./scripts/admin-checkout-server.cjs');
const host = '192.168.1.35';
async function forward(port, target) {
    const listener = net.createServer(client => {
        const upstream = net.connect(target, '127.0.0.1');
        client.pipe(upstream).pipe(client);
        client.on('error', () => upstream.destroy());
        upstream.on('error', () => client.destroy());
        client.on('close', () => upstream.destroy());
        upstream.on('close', () => client.destroy());
    });
    await new Promise((resolve, reject) => {
        listener.once('error', reject);
        listener.listen(port, host, resolve);
    });
}
(async () => {
    await forward(9099, 29099);
    await forward(9000, 29000);
    await startServer(5000, {host, lanDemo:true, authPort:9099, databasePort:9000});
    await startBenchServer({host, port:8787, readerKeys:JSON.parse(fs.readFileSync('.local/rfid-reader.json','utf8'))});
    await startAdminCheckoutServer({host, webPort:5000});
    console.log('LAN services ready after imported-data restore.');
})().catch(error => { console.error(error.message); process.exitCode=1; });
'@ | node
```

If a listener fails, resolve that port before allowing demo activity. Compare restored account UIDs, bookings, statuses, active card index and receipts against the backup before tapping. Both laptops should read the same restored data. Keep the backup until verification passes. Rollback uses that same import and the previously working backend source, without new seed data.

## Verification completed and pending

The focused backend test `node tests/rfid-guest-name.test.cjs` passed against in-memory transport, including exact name/reference, failed writes, replay, lost-acknowledgement recovery and legacy fallback. A byte-equivalent JavaScript translation of the attachment's parser passed compact JSON, raw UTF-8, quotes/backslashes and long names, and confirmed unsupported-escape fallback and a split UTF-8 LCD crop. This translation is not execution of the ESP32 binary.

After approval and backend activation, first use a short ASCII guest name on a dedicated Confirmed booking with its assigned card. Confirm the successful response's name/reference, the same guest name on the LCD, and the existing Checked In transition on both laptops. Then review long-name/Unicode presentation separately. Physical verification, Arduino compilation, firmware integration and all restart commands remain pending. No source/config/credential changes or uploads are part of this review.
