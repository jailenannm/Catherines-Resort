# ESP32 #1 — integrated V4 safe manual-servo review

Ang baseline nito ay ang **user-modified V4**, kasama ang working RFID, LCD, Wi-Fi at pathway code. Ang bagong sketch ay `ESP1_V4_Safe_Servos.ino`. Ihanda at i-Verify muna. Ang upload at physical movement ay operator steps pagkatapos ng approval.

## Original at files

- Baseline attachment `6754160d-852f-4118-a14a-3ee2d05ed2d4/Pasted text.txt`.
- Bagong attachment `69f85ed6-a852-4891-8afa-64afdbb43f0f/Pasted text.txt` ay byte-identical sa baseline.
- SHA-256 `1522e9a55cbee637d99b93daa3ef328c71590787b0999977686399479dc73c87`.
- Private original backup `.local/esp1-v4-backup/2026-11-17T19-24-56-041Z/V4-user-original.ino`.
- Kasamang `UidFormatter.h` ay copy ng existing formatter. Ilagay ang **sarili ninyong existing, tested `bench-secrets.h`** sa bagong folder. Panatilihin ang values nito at itago sa Git/chat.

V4 lang ang laman ng supplied attachments. Ang observations tungkol sa V5.1/V6 ay galing sa inyong report. Kailangan ang mismong diagnostic sources para ma-review ang eksaktong measurement method nila.

## Mga nakita sa V4

1. `REQUIRE_SERIAL_ARM=false` kaya enabled ang gate buttons pagkatapos ng reset, kahit may startup message na DISARMED.
2. Sa unang button hold, parehong servo agad ang ina-attach at sinusulatan ng assumed CLOSED angles: RIGHT30degrees at LEFT150degrees. Hindi pa calibrated ang mga iyon para sa permanently attached mechanisms.
3. `servosAttached=true` agad kahit walang individual attachment check. Ang library return value/channel0 ay puwedeng valid, kaya hindi tama ang simpleng check na `attachResult > 0`.
4. Ang LEFT direction at closing endpoint ay nakaasa sa fixed angle assumptions. Magkaiba ang mounting/orientation ng dalawang gates, kaya kailangan independent endpoints.
5. May synchronous HTTP calls sa main loop. Kahit gumagana ang background button sampler, puwedeng ma-delay ang main-loop motion/Serial handling habang naghihintay sa network.
6. Valid PWM-capable GPIOs ang14/27 sa classic ESP32, at parehong50Hz ang V4 setup. Ang installed ESP32Servo3.2.1 ay may automatic channel allocation. Walang ebidensiya na ang kawalan ng manual `allocateTimer()` ang sanhi ng RIGHT failure.

Ang software findings ay hindi pa physical diagnosis ng RIGHT servo. Posibleng may problema sa expansion-board signal path, pin contact, servo cable, supply under load, common ground, mechanical binding, o servo mismo. Ang compilation at library attachment ay software evidence lang.

## Mga pagbabago

| V4 behavior | Bagong behavior |
| --- | --- |
|Auto-arm flag false|Laging disarmed at detached pagkatapos ng reset|
|Attach both on button hold|Explicit PREPARE plus CONFIRM_ATTACH|
|Assumed30/150degree starts|Operator-supplied starting pulse per servo|
|Fixed mirrored angles|Independent measured OPEN/CLOSED pulses|
|One shared attachment flag|Individual attachment check and RIGHT/LEFT logs|
|Angle steps|2microsecond steps,60ms between manual button steps|
|Unbounded first range assumptions|Initial calibration window max80microseconds, electrical bounds1000..2000microseconds|
|Unclear attach result|Channel, last commanded pulse and classic-core3 LEDC configuration report|
|Network work during motion|RFID/HTTP polling deferred during attached/pending manual sessions|

Calibration commands `NUDGE +` and `NUDGE -` issue one2microsecond change. Minimum200ms ang pagitan para hindi maging instant multi-command sweep. `MARK_OPEN` at `MARK_CLOSED` ay operator confirmation ng observed position. RAM-only ang calibration at kailangan i-enter/review ulit pagkatapos ng reset.

Ang optional `LIMITS` command ay para lang sa previously measured endpoint notes. Walang default endpoint values. Ang1000..2000microsecond electrical cap ay galing sa range ng V4. Hindi nito ginagarantiya na mechanically safe ang buong range.

**Initial attachment may move either gate**, kahit maliit ang configured calibration window. Walang position sensor ang ordinary SG90 interface. Hindi mababasa ng `Servo.read()` ang tunay na angle. Walang software-only way para garantiyang walang initial jump kapag unknown ang physical position/pulse.

`STOP` / `DISARM_GATE` removes pulses. Maaaring gumalaw/back-drive ang mechanism kapag nawala ang holding torque. Releasing a button stops further target increments; the servo can still finish moving to the last target. Keep a physical servo-power cutoff accessible.

## Preserved integration at manual-mode interlock

The existing V4 functions for HMAC signing, scan IDs, UID formatting, `/health`, `/diagnostic`, `/scan`, retries, guest-name extraction, accepted-check-in pathway ON and LCD welcome remain source-identical. Existing relay active-low setting, GPIOs, endpoint macros and private credentials are inherited from V4 and the existing private header.

Habang attached ang alinmang servo o may pending attachment confirmation, LCD shows `SERVO CALIBRATE` or `MANUAL GATES`, then `RFID/HTTP PAUSED`. Button monitoring at Serial commands ang priority. After `STOP` or `DISARM_GATE`, existing Wi-Fi/backend/RFID and normal LCD servicing resume. The ESP32 Wi-Fi stack remains running during the pause. Huwag mag-tap para sa check-in habang manual session ang display.

Existing V4 welcome timings are2600ms and8500ms. Existing name scrolling is byte-based, so Unicode rendering still depends on the LCD ROM. Existing V4 `LOCAL_CHECKOUT` is a local operator action, and V4 has no automatic website-checkout subscription. These are existing integration limitations to review separately. IR and car-motor code remain unused.

## Arduino IDE preparation

1. Duplicate the whole original V4 folder, kasama ang private headers, sa Laptop2. Keep that known-working copy.
2. Open `ESP1_V4_Safe_Servos.ino` in its matching folder. Copy **your working `bench-secrets.h`** into this new folder. Do not copy a build-test credential file from `.local/esp1-v4-tools`.
3. Retain the actual board profile used by your working classic ESP32. Compilation here targets `esp32:esp32:esp32` / ESP32 Dev Module with Espressif core3.3.12. Confirm your physical module before choosing another target.
4. Required libraries are ESP32Servo3.2.1, MFRC5221.4.12 and LiquidCrystal I2C1.1.2 for the tested build. SPI, Wire, Wi-Fi, HTTPClient, mbedTLS and FreeRTOS come with the core. Check IDE verbose output to confirm which ESP32Servo installation is selected.
5. Run Verify. Upload only after approval and the electrical/mechanical checks below. This preparation has performed compilation only.

## Step-by-step Taglish testing

### A. Electrical inspection, power OFF

1. I-off lahat ng power bago humawak ng plugs. Panatilihing nakakabit ang horns/mechanisms. Puwedeng i-unplug electrically ang servo connectors para sa signal-only check.
2. Confirm actual RIGHT signal goes to native ESP32 GPIO14, LEFT to27, OPEN to25, CLOSE to32. Confirm no old TB6612 wire remains on25/32.
3. Sa expansion board, verify `S` is signal, `V` is the actual supply rail and `G` is ground. Huwag umasa lang sa row position, wire color, o label na katabi. Kailangan ang exact board model/manual or clear labels plus power-off continuity measurements.
4. With power OFF, check continuity from native GPIO14 to S14, native GPIO27 to S27 and native GPIO34 to S34. Check G-row continuity to ESP32 GND. A qualified operator should verify the V rail voltage separately using a meter without shorting adjacent pins.
5. Servo V+ uses the existing regulated external5V buck, with common ground. Keep servo5V away from ESP32 GPIO/3V3 and the RC522 supply. Check the buck rating and voltage under load before powering both servos.

### B. First boot and button check

1. For the first approved upload/boot, keep both servo connectors electrically unplugged and the relay/load supply isolated. Use the verified ESP32 USB bench power arrangement. This prevents an incidental pulse from moving the permanently attached gates during initial software checks.
2. Open Serial Monitor at115200, Newline. Expected startup includes `Gate DISARMED on boot` and `outputs detached`. Merely pressing a button should log the input while servo outputs remain detached.
3. Type `STATUS`, then `BUTTON_TEST` if needed. V4's12second raw-button test is retained. It pauses application network/LCD work and leaves gate outputs detached.

### C. RIGHT and LEFT software/PWM check, connectors unplugged

With both servo connectors still electrically unplugged, these concrete commands test the library/PWM configuration without driving a gate:

```text
PREPARE RIGHT 1500 1480 1520
CONFIRM_ATTACH
STATUS
STOP
PREPARE LEFT 1500 1480 1520
CONFIRM_ATTACH
STATUS
STOP
```

The1500us example is **only for the electrically disconnected check**. Never treat it as a safe seed for an attached gate.

Expected messages identify RIGHT GPIO14 or LEFT GPIO27, library attachment and commanded pulse. Classic ESP32 core3 also reports configured50Hz and a nonzero duty count. Channel0 can be valid. Different one-at-a-time tests may reuse a channel.

Kung may scope/logic analyzer at qualified operator, measure at the verified S terminal relative to common GND. Expect about20ms period and about1.5ms HIGH for this disconnected example. Internal LEDC readback does not measure the expansion header, wire, servo electronics or motion.

### D. Cautious physical calibration, one gate at a time

1. `STOP`, power OFF, then reconnect only the servo under review electrically. Keep the gate path clear and the physical servo-power cutoff ready. The other servo stays electrically disconnected for this individual check.
2. Establish an operator-known safe seed pulse for the **current physical gate position**. If unknown, stop and get hands-on assistance/measurement. Do not assume that V4's old30/150degree values,1500us, or the other gate's values are safe.
3. Enter `PREPARE RIGHT <known_seed> <reviewed_low> <reviewed_high>` or the LEFT version. Use actual numeric values from the reviewed calibration. The range must be within1000..2000us and at most80us wide. The seed must be inside it.
4. Read the Serial confirmation. Only when the initial-attachment risk is acceptable, type `CONFIRM_ATTACH` within30seconds. Both tactile buttons must be released. This is the point where PWM can start and movement can occur.
5. Type one `NUDGE +` or `NUDGE -`, wait, then observe. These mean increasing/decreasing pulse, not predetermined OPEN/CLOSE. Tiny steps can be below a servo's mechanical deadband. Avoid rapid repeated commands. Stop immediately on buzzing, strain, collision or supply drop.
6. At a visually confirmed safe endpoint with clearance margin, type `MARK_CLOSED` or `MARK_OPEN`. Write down the reported pulse. Avoid mechanical end stops/stall.
7. If a new narrow window is needed, `STOP`, review the last physical position and new seed, then PREPARE/confirm again. An attachment can move the gate every time. Do not expand blindly.
8. Complete each gate independently. The LEFT opening pulse may be lower than its closed pulse. The RIGHT opening pulse may be higher, or vice versa. The marked endpoints determine direction.

### E. Both gates with working buttons, after individual calibration

Use measured values only:

```text
STOP
LIMITS RIGHT <measured_closed> <measured_open>
LIMITS LEFT <measured_closed> <measured_open>
PREPARE_PAIR <known_current_right_seed> <known_current_left_seed>
CONFIRM_ATTACH
ARM_GATE
```

Pair attachment still requires a safe, known starting pulse for each current gate position. `ARM_GATE` requires both outputs attached, distinct calibrated endpoints and released buttons.

Hold OPEN to move both toward their respective OPEN pulses. Hold CLOSE only while supervising the whole clear path. Releasing the held button stops additional target steps. Both buttons pressed stops additional steps. `STOP` detaches both outputs; use the physical cutoff immediately if anything strains. IR remains disabled, so there is no sensor-based obstruction protection in this revision.

After `DISARM_GATE` or `STOP`, verify the normal RFID/LCD flow separately using the existing approved check-in procedure. The firmware preparation itself sends no scans and changes no backend records.

## Interpreting the earlier GPIO34 results

`LOW=5/5`, `HIGH=0/5` is consistent with a readback path stuck LOW, a wrong S/V/G connection, an unconnected/floating input, or another electrical issue. GPIO34 is input-only with no internal pull-up/down on the classic ESP32. A correctly connected direct3.3V logic signal can be read there, but the earlier expansion-board path and exact diagnostic code have not been verified.

A missing readback through that path does not establish servo failure. V6 intentionally disabled button-driven movement, as you reported. Avoid any new GPIO34 jumper test until the exact board mapping, disconnected IR wiring and safe signal voltage are confirmed.

## Software checks and hardware limits

`node tests/esp1-v4-safe-servos.test.cjs` compares16 preserved functions against your V4, verifies original/private file hashes, checks startup/attachment structure, and compiles actual calibration/stepping helpers with C++ static assertions. Cases include invalid windows, out-of-range seeds, reverse/mirrored travel and endpoint overshoot prevention.

Full Arduino builds use a private mirror and placeholder credentials. Tested target/libraries and final results are recorded in `BUILD-VERIFICATION.md`. The generic LiquidCrystal I2C package may print an AVR-architecture metadata warning even when compilation succeeds. Physical LCD behavior still needs bench confirmation with your installed working library.

Compilation and software checks cannot confirm PWM at the servo connector, correct expansion-board power routing, servo current capability or mechanical travel. Physical RIGHT/LEFT tests and exact expansion-board model remain pending.

## Sources checked

- [ESP32Servo upstream implementation](https://github.com/madhephaestus/ESP32Servo/blob/master/src/ESP32Servo.cpp), together with the installed3.2.1 source used for compilation.
- [ESP32Servo API/defaults](https://github.com/madhephaestus/ESP32Servo/blob/master/src/ESP32Servo.h).
- [Espressif classic ESP32 GPIO documentation](https://docs.espressif.com/projects/esp-idf/en/latest/esp32/api-reference/peripherals/gpio.html).
