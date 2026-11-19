# RFID bench preparation and shorter public header

The production ESP1 sketch and all existing local edits were preserved. No upload, live check-in, guest device command or Firebase deployment was performed.

## RFID deliverables

Open `esp32_firmware/RFID_Serial_Test/RFID_Serial_Test.ino` in Arduino IDE. Its adjacent README contains the full pin audit, isolation/upload implications, IDE instructions, **115200 baud** setting, expected output and repeated-card procedure. The separate `UidFormatter.h` prints uppercase two-digit bytes without separators, matching Master Reservations and the check-in verifier.

Software verification: the actual C++ formatter passed compiled static assertions for 4-, 7- and 10-byte samples with leading zeros, plus invalid length/null/buffer rejection. Expected canonical samples: `0001A20F`, `00040AB00100FF`, `00010203040506070809`. The production reader's lossy formatting and gate/checkedIn bypass are documented for later work and unchanged.

Physical wiring, repeated scans and a complete Arduino/MFRC522 board build are pending. SS5/RST22 are explicit production definitions; SCK18/MISO19/MOSI23 were confirmed against the installed classic ESP32 core defaults. No separate detailed supplied wiring diagram was available to reconcile with the physical controller.

## Header changes

Only `css/public-header.css` changes the production public header:

- Desktop minimum inner height reduced from 104px to 72px, vertical padding from 16px to 8px. Actual header including its border measures **73px**, excluding the teal information strip.
- Existing oval logo increased from 48px to **88px desktop / 68px mobile**, with natural aspect ratio retained. Canvas inspection of the existing 1625×650 asset found visible width approximately 87.95/88px, so cropping or asset changes were unnecessary.
- Catherine's name remains 26px and subtitle 14px. Existing mobile two-row arrangement stays intact (about 126px total at 390px width), retaining 44px account/menu targets and readable booking links.
- Sticky positioning, links, booking/account behavior and teal strip remain unchanged. Anchor padding uses a 72px fallback and the existing ResizeObserver's measured header height at runtime, including the larger mobile arrangement.

## Checks actually run

1. C++ compiler `-std=c++17 -fsyntax-only tests/rfid-uid-formatter.test.cpp`: all assertions passed. No MCU upload/execution.
2. `node tests/public-header-sizing.test.cjs`: **12 page/viewport combinations passed** using actual Home/Reservation/My Reservation HTML/CSS/header with isolated Auth doubles, no Firebase/device SDKs. Checked 1440/1280/390/320px at 100% zoom, logo size/aspect/visible bounds, unchanged brand fonts, consistent heights, non-overlapping header controls, mobile/account menu operation, sticky behavior and anchor clearance. Generated desktop/mobile screenshots were reviewed. At 320px the Reservation page's existing progress-step content overflows independently of the header; no page-content change was made. Header fit passes there; full-page overflow checks pass at 390px and desktop.
3. Auth/RTDB emulator `public-navigation` regression suite: **6 groups passed**, covering owned booking links, signed-in/out account entry and login return, admin routing, normal account menu, sticky/mobile/anchor behavior and reservation-only device-route/script denial. No `/diorama` writes, live Firebase/email/device requests or page errors.
4. JavaScript syntax and diff whitespace checks passed.

The emulator regression used private ports via the existing isolated adapter, leaving the running 5000 preview untouched. To repeat after setting up the existing Node/Java emulator toolchain:

```powershell
node tests/public-header-sizing.test.cjs
& .\node_modules\.bin\firebase.cmd emulators:exec --only auth,database --project demo-catherines-reservations --config firebase.facility-tests.json 'node --require ./tests/isolated-facility-ports.cjs tests/public-guest-regression.cjs public-navigation'
```

## Exact files changed in this task

- New `esp32_firmware/RFID_Serial_Test/RFID_Serial_Test.ino`, `UidFormatter.h`, `README.md`.
- New `tests/rfid-uid-formatter.test.cpp` and `tests/public-header-sizing.test.cjs`.
- `css/public-header.css`.
- `tests/isolated-facility-ports.cjs`: adds public-navigation test/private-port mapping; no production configuration changes.
- New `RFID-AND-PUBLIC-HEADER.md` (this report).

Hard refresh is sufficient for the header on ports 5000/5001. No server restart, rules publication, firmware upload or live account creation is needed for these web changes.
