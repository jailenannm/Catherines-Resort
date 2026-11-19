# Manual OPEN/CLOSE button test preparation

Open `Manual_Open_Close_Button_Test.ino` in this folder as its own Arduino sketch. The code samples GPIO25 and GPIO32 with INPUT_PULLUP, debounces each independently for30ms, and reports changes at115200baud. It reports the combined state after sampling both inputs and announces simultaneous presses and their release. Initial states reflect buttons held during startup. State messages appear on changes to avoid flooding Serial.

## Source protection and inspection

The actual latest verified firmware is on Laptop2 in Arduino IDE. It is unavailable from Laptop1. The following available references were inspected:

- `.local/esp32-ip-patch/20261117-132720-PHT/supplied-working-original/RFID_WiFi_Bench.ino`, plus its original supplied attachment `99167f7b-1278-499c-bd51-3b99f7be2fed/Pasted text.txt`. This is the last supplied working RFID/LCD snapshot.
- `esp32_firmware/RFID_WiFi_Bench/RFID_WiFi_Bench.ino`, the older local reference without the working LCD additions.
- `esp32_firmware/ESP1_Mechanics/ESP1_Mechanics.ino`, the legacy mechanics pin map.
- `esp32_firmware/RFID_WiFi_Bench/README.md` and `tests/rfid-bench-sketch.test.cjs` for the existing cross-compiler verification setup.
- Local `bench-secrets.h` and `UidFormatter.h` were copied and fingerprinted for backup without printing their contents.

Private backup directory:

```text
.local/manual-button-preparation/20261117-153508-PHT/
```

`lastSuppliedWorking.txt` is an exact copy of the supplied snapshot. `development-reference/RFID_WiFi_Bench.ino` is a separate, unmodified reference copy. `olderLocalSketch.ino`, `localPrivateConfig.h` and `localUidFormatter.h` preserve the available Laptop1 files with distinct labels. The manifest `verification.json` records source paths, SHA-256 hashes and software results. This directory is under the existing Git-ignored `.local` folder.

These files do not establish the latest Laptop2 baseline. Before a future upload/integration, privately duplicate the entire actual working Arduino sketch folder on Laptop2, including all tabs and local headers. Keep that original folder and its board/core/library settings. The standalone button sketch is the development/test version for this stage.

## GPIO review

| Function in supplied wiring | GPIO | Finding |
| --- | --- | --- |
|RC522 SS/SCK/MOSI/MISO/RST|5/18/23/19/22|Distinct from button inputs|
|LCD SDA/SCL|16/17|Distinct from button inputs; matches supplied LCD snapshot|
|Gate servo signals|14/27|Distinct from button inputs|
|IR receiver|34|Input-only GPIO; receiver output/polarity and bias require verification before integration|
|Manual OPEN/CLOSE|25/32|Suitable digital INPUT_PULLUP inputs on the classic ESP32|
|Pathway relay|33|Distinct from button inputs|

The supplied mapping has no duplicate GPIO assignments. The legacy mechanics sketch conflicts with it: motor AIN1 uses25, motor PWM uses32, the old gate button uses14, gate servo1 uses12, IR uses21 and Hall uses34. Its LCD also relies on default Wire initialization instead of the supplied explicit16/17 assignment. This is a source-map conflict to resolve against the actual latest Laptop2 sketch before integration.

GPIO34 lacks internal pull-up/down circuitry on the classic ESP32. A later IR design must use a verified3.3V-compatible receiver output and suitable electrical bias for that receiver. [Espressif GPIO documentation](https://docs.espressif.com/projects/esp-idf/en/latest/esp32/api-reference/peripherals/gpio.html)

## Arduino IDE requirements

- Use Laptop2's existing working ESP32 board selection and Espressif Arduino core. Laptop1 has core3.3.12 installed. Confirm the exact physical module before selecting a different profile; ESP32 Dev Module is appropriate only when it matches the board.
- This test uses Arduino core Serial and GPIO APIs. It requires no additional libraries.
- Keep the `.ino` in the matching `Manual_Open_Close_Button_Test` folder. Do not paste it into the working RFID sketch or add it as another tab in that sketch.
- Arduino Verify can be run on Laptop2. Firmware upload requires separate explicit approval.

## Expected output

Initial released buttons:

```text
Manual OPEN/CLOSE button input test
GPIO25=OPEN, GPIO32=CLOSE; LOW=pressed, HIGH=released.
Independent 30 ms debounce. Initial sampled states:
OPEN=HIGH, CLOSE=HIGH
```

| Physical input | Debounced state |
| --- | --- |
|Neither pressed|`OPEN=HIGH, CLOSE=HIGH`|
|OPEN pressed|`OPEN=LOW, CLOSE=HIGH`|
|CLOSE pressed|`OPEN=HIGH, CLOSE=LOW`|
|Both pressed|`OPEN=LOW, CLOSE=LOW`|

Example sequence:

```text
OPEN GPIO25: PRESSED
OPEN=LOW, CLOSE=HIGH
CLOSE GPIO32: PRESSED
OPEN=LOW, CLOSE=LOW
SIMULTANEOUS: OPEN and CLOSE are both PRESSED.
CLOSE GPIO32: RELEASED
OPEN=LOW, CLOSE=HIGH
SIMULTANEOUS: cleared; at least one button was RELEASED.
OPEN GPIO25: RELEASED
OPEN=HIGH, CLOSE=HIGH
```

A pulse shorter than30ms may be filtered. A held button produces one press event and one release event. Press order may change the order of the individual messages. Both stable LOW readings trigger the simultaneous message.

## Bench procedure after explicit approval

1. Preserve the actual complete working Laptop2 sketch folder first. Prefer a spare ESP32 for this standalone test. Uploading it to installed ESP32 #1 temporarily replaces that board's running RFID program.
2. With power removed, isolate servo power, the pathway relay/load and the12V actuator/load supply. Use the already verified USB-powered bench arrangement. This sketch configures only25/32 as inputs; actuator isolation prevents incidental boot/floating-pin effects during a future test.
3. Verify each tactile switch connects its assigned GPIO to ESP32 GND when pressed and opens when released. For four-legged buttons, identify the switched contacts with power removed. An always-bridged pair can give a permanently LOW reading. Avoid applying external supply voltage to either input.
4. Open the standalone folder, retain the correct board/port settings, and run Verify. After separate approval, the operator can upload the test and open Serial Monitor at115200baud. Reset the test board if the initial messages were missed.
5. Check neither, OPEN only, CLOSE only, then both held. Release one while holding the other. Repeat in reverse order and check a button held during reset. Allow more than30ms for each stable state.
6. Record the observed lines and actual board model. A steady HIGH during a press suggests a contact/GND/pin issue. A steady LOW after release suggests a continuously grounded contact or other connected circuit. Investigate with power removed before changing wiring.

## Verification completed

The actual sketch was included by `tests/manual-button-debounce.test.cpp`. The installed ESP32 cross-compiler ran C++17 syntax checking with temporary Arduino API declarations and executed compile-time static assertions for press/release, bounce filtering, held input, independently debounced simultaneous states, held-at-boot initialization and32bit timer wraparound. A source check confirmed exactly two INPUT_PULLUP configurations and no device-output or network calls. Backup and original-file SHA-256 checks passed.

Full Arduino board/library compilation on Laptop2, button wiring measurements and physical Serial observations remain pending. No firmware upload or actuator test was performed.

## Later entrance integration handoff

Button confirmation and the actual Laptop2 source are needed before a gate-control patch. The supplied requirements call for debounced IR-triggered opening, OPEN priority, hold-to-close with release-to-stop behavior, and obstruction cancellation/reopening when sensor readings are reliable. One beam provides no evidence that the entire path is clear, so closing requires operator observation. A hobby servo's physical stop/holding behavior and each gate's calibrated limits also require bench verification with regulated servo power and common ground. Reserve the current GPIO map and independently calibrated servo directions/limits for that review.

The check-in/pathway/LCD timing, stay/checkout facility reset and main-switch entrance-light requirements remain recorded project requirements for later integration. This preparation adds no integration code. Audio and additional notification work require their own review.

Open clarification items are the exact ESP32 module, the latest complete Laptop2 sketch, whether motor-driver wiring still occupies25/32, and the receiver model/electrical output before any later IR/gate integration. For the current button test, confirm25/32 connect only to the two switches and GND.
