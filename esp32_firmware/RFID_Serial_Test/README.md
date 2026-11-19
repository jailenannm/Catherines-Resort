# Isolated MFRC522 Serial bench test

Later integration-preparation update: production `checkNFC()` source now prints canonical UID diagnostics only; its legacy gate/checkedIn bypass was removed in source. See `HARDWARE-INTEGRATION-KTV.md`. The history below describes the prior audit and separate test-sketch task. Installed firmware is unchanged until the operator flashes it, and live authenticated scan ingress is still not deployed.

Sketch: `esp32_firmware/RFID_Serial_Test/RFID_Serial_Test.ino`.

This is a separate read-card/print-to-Serial sketch. The production `ESP1_Mechanics.ino` is unchanged. There is no WiFi/Firebase dependency, database write, gate/car/relay/light/audio control, reservation lookup or check-in in this test. SPI communicates only with the reader. No firmware was uploaded during preparation.

## Pin evidence and physical checks

Production ESP1 explicitly defines SS=GPIO5 and RST=GPIO22, then calls `SPI.begin()` without pin arguments. The installed ESP32 core's classic `variants/esp32/pins_arduino.h` defines SCK18, MISO19, MOSI23 and SS5. The test makes that mapping explicit:

| MFRC522 label | Classic ESP32 connection to verify |
| --- | --- |
| SDA / SS / NSS | GPIO5; this label is SPI chip-select, not I2C SDA |
| SCK | GPIO18 |
| MISO | GPIO19 |
| MOSI | GPIO23 |
| RST | GPIO22 |
| 3.3V | Regulated 3.3V, not a 5V logic/power assumption |
| GND | Controller ground |
| IRQ | Not used by this sketch; leave unconnected |

This agrees with the checked-in SS/RST definitions and classic-board SPI defaults. There was no separate pin-specific supplied wiring diagram in the request/audit references to validate against the installed build. Confirm the board model, every jumper, power voltage and reader labels physically before connecting. Another ESP32 variant can have different default SPI pins: this sketch is explicitly for the mapping above. Do not assume an S3/C3 board has the same available pins. Production LCD uses `Wire.begin(16,17)`; reader SDA/SS must not be confused with that LCD I2C bus. Reader RST22 is not a reason to move the gate/KTV outputs or revise production wiring here.

Use a spare ESP32 with only USB and this reader connected. If using the installed ESP1, isolate it first: disconnect actuator power and gate, car, relay, lighting/audio connections, including paths through other controllers. Do not depend on an inactive sketch to hold outputs safe during boot/reset/upload. **Uploading this test to installed ESP1 replaces its flashed production program temporarily** and stops its normal program/telemetry. Retain the known production source/configuration and plan restoration separately. This task did not upload or restore either program.

## Arduino IDE bench steps (performed by the operator)

1. Open Arduino IDE, then **File → Open** and select `RFID_Serial_Test.ino` in its own matching `RFID_Serial_Test` folder. Keep `UidFormatter.h` beside it.
2. In Boards Manager, use the ESP32 board package appropriate for the actual controller. Under **Tools → Board**, select its exact board (classic **ESP32 Dev Module** only if that matches the hardware). Verify the wiring table before proceeding.
3. In Library Manager, install the MFRC522 library that supplies `MFRC522.h`. SPI comes with the board core. This test needs neither Firebase nor ESP32Servo/LCD libraries.
4. Select the isolated/spare controller's USB port under **Tools → Port**. Click **Verify** first. A complete Arduino board/library build has not been performed in this task; the software formatter itself was compiled and checked separately.
5. Only after physical isolation and port verification, upload the test yourself. No upload is authorized/performed by this preparation task.
6. Open **Tools → Serial Monitor**, choose **115200 baud**. No typed commands are required; the line-ending setting is immaterial. Reset the isolated board if the initial message was missed.
7. Tap one physical card, remove it completely from the field, wait about a second, then tap it again. Repeat at least five times with the **same** card. Halting a selected card intentionally requires removal/re-presentation for another reading.
8. Compare both `UID bytes` and every character of `UID` on each tap. All readings of that card should match, with exactly two uppercase hex characters per byte and no separators. Copy the output exactly; never trim or guess zeros. If results differ, stop assignment and verify wiring, supply, board selection and card type. Distinguish a second card from a repeat scan.

Expected boot line:

```text
Serial-only RFID test. Remove and tap the same card again to repeat.
```

## Formatter software results and expected scan format

The following are **synthetic byte samples**, not scans of your physical card:

```text
UID bytes: 4
UID: 0001A20F

UID bytes: 7
UID: 00040AB00100FF

UID bytes: 10
UID: 00010203040506070809
```

Inputs respectively: `00 01 A2 0F`; `00 04 0A B0 01 00 FF`; `00 01 02 03 04 05 06 07 08 09`. The formatter also rejects unsupported lengths, null input and an undersized buffer. An unsupported physical UID prints its byte count and an unsupported-length message rather than an assignable UID.

The exact shared C++ formatter is tested with compile-time assertions in `tests/rfid-uid-formatter.test.cpp`. The installed ESP32 C++ compiler passed:

```powershell
& "$env:LOCALAPPDATA\Arduino15\packages\esp32\tools\esp-x32\2601\bin\xtensa-esp32-elf-g++.exe" -std=c++17 -fsyntax-only tests/rfid-uid-formatter.test.cpp
```

Run from the repository root; adjust the compiler version/path if using a different installed core. This compiles the real formatter/assertions without linking, flashing or running MCU code. It does not test MFRC522 communication, wiring or the complete Arduino build.

## Compatibility and deferred integration

Master Reservations calls `SharedReservations.normalizeRfidUid` in `js/shared-reservations.js`: it accepts 4/7/10 full bytes, stores uppercase concatenated hex (8/14/20 characters), and preserves leading zeros. `scripts/check-in-verifier.cjs` requires this already-canonical UID plus matching `byteCount` and exact assigned-card equality. The Serial output uses that same canonical representation.

Production `checkNFC()` currently concatenates `String(byte, HEX)` without padding, so `00 01 A2 0F` becomes ambiguous `01A2F`. It writes `/diorama/nfc/lastUid` and a separate uptime `lastScan=millis()`, displays a welcome, writes `gate/target=open`, calls `openGatesSlowly()`, and writes `/diorama/guest/checkedIn=true`. This legacy bypass is untouched and must be addressed in a later trusted integration task. Disabling live web check-in does not disable that independent production behavior.

Serial text is bench evidence only. It supplies no authenticated reader ingress, immutable event identity, trusted timestamp or replay protection. Live RFID check-in and guest hardware controls remain disabled. Physical verification is pending until you provide the repeated-card Serial output; do not use the sample UIDs as a substitute.
