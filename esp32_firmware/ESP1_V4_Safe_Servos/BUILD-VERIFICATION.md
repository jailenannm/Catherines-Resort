# Integrated V4-derived sketch verification

The deliverable is `ESP1_V4_Safe_Servos.ino`, SHA-256 recorded in the private build manifest. Original user V4 is archived separately and its SHA-256 remains `1522e9a55cbee637d99b93daa3ef328c71590787b0999977686399479dc73c87`.

## Actual Arduino compile results

| Setting | Tested value |
| --- | --- |
|Arduino CLI|1.6.0|
|Target FQBN|`esp32:esp32:esp32` — classic ESP32 Dev Module|
|Espressif core|3.3.12|
|ESP32Servo|3.2.1|
|MFRC522|1.4.12|
|LiquidCrystal I2C|1.1.2|
|Normal mode, `BENCH_DIAGNOSTICS_ONLY=0`|PASS — 1,015,007 flash bytes, 50,548 static RAM bytes|
|Diagnostic mode, `BENCH_DIAGNOSTICS_ONLY=1`|PASS — 1,013,103 flash bytes, 50,548 static RAM bytes|

Both builds fit the tested default partition and report 277,132 bytes remaining for runtime allocations/local variables before application operation. The generic LiquidCrystal I2C package emits an AVR-architecture metadata warning. The complete builds nevertheless compiled and linked. Retain/review your working LCD library on Laptop2 and run Verify with that environment before an approved upload.

The build mirror is private under `.local/esp1-v4-tools`. It contains placeholder-only test credentials and documentation-only address192.0.2.1. Those build configuration files and binaries are not deployment artifacts. Use your existing tested `bench-secrets.h` in the deliverable sketch folder.

## Focused software verification

Run:

```powershell
node tests/esp1-v4-safe-servos.test.cjs
```

Results passed for:

- Original attachment and backup SHA-256 equality.
- Existing private header/reader-credential fingerprints.
- Source equality of16 V4 functions, covering HMAC, event IDs, scan retries, Wi-Fi servicing, UID call path, pathway activation and normal LCD/welcome behavior.
- Detached/disarmed startup and explicit attachment structure.
- Simultaneous-button guard and manual-mode HTTP interlock.
- Actual C++ calibration-bound checks for invalid windows and out-of-range seeds.
- Actual C++2microsecond stepping in both directions, mirrored gate travel and no endpoint overshoot.

The existing `UidFormatter.h` was copied byte-for-byte into the new sketch folder. The latest supplied attachment is byte-identical to the first V4 attachment. The actual V5.1/V6 code was absent from both.

## Physical checks pending

No upload, servo movement, relay operation, RFID scan, backend restart or database request was performed for this firmware task. The builds and assertions do not establish servo health or connector-level PWM. RIGHT/LEFT signal continuity, board S/V/G mapping, regulated5V under load, current capability, safe pulse seeds, direction and clear mechanical limits need hands-on verification using the staged README procedure.
