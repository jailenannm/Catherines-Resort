'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { createHash } = require('node:crypto');
const { execFileSync } = require('node:child_process');

const candidatePath = 'esp32_firmware/ESP1_V4_Safe_Servos/ESP1_V4_Safe_Servos.ino';
const manifest = JSON.parse(fs.readFileSync('.local/esp1-v4-tools/manifest.json', 'utf8'));
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const baseline = fs.readFileSync(manifest.baseline, 'utf8').replaceAll('\r\n', '\n');
const candidate = fs.readFileSync(candidatePath, 'utf8').replaceAll('\r\n', '\n');

function functionSource(source, name) {
    const signature = new RegExp('^[A-Za-z_][^\\n;]*\\b' + name + '\\([^;]*?\\)\\s*\\{', 'm').exec(source);
    assert(signature, 'Function missing: ' + name);
    const start = signature.index;
    let depth = 1;
    let state = 'code';
    for (let i = start + signature[0].length; i < source.length; i++) {
        const current = source[i], next = source[i + 1];
        if (state === 'line') { if (current === '\n') state = 'code'; continue; }
        if (state === 'block') { if (current === '*' && next === '/') { state = 'code'; i++; } continue; }
        if (state === '"' || state === "'") {
            if (current === '\\') { i++; continue; }
            if (current === state) state = 'code';
            continue;
        }
        if (current === '/' && next === '/') { state = 'line'; i++; continue; }
        if (current === '/' && next === '*') { state = 'block'; i++; continue; }
        if (current === '"' || current === "'") { state = current; continue; }
        if (current === '{') depth++;
        if (current === '}' && --depth === 0) return source.slice(start, i + 1);
    }
    throw Error('Unclosed function: ' + name);
}

assert.equal(hash(fs.readFileSync(manifest.baseline)), manifest.baselineSha256);
assert.equal(hash(fs.readFileSync(path.join(manifest.backup, 'V4-user-original.ino'))), manifest.baselineSha256);
for (const [file, fingerprint] of Object.entries(manifest.privateFingerprints)) {
    assert.equal(hash(fs.readFileSync(file)), fingerprint, 'Private file changed');
}
const preservedFunctions = ['guestNameFromScanResponse', 'fetchTimeAt', 'fetchServerTime', 'sendDiagnostic', 'sendScan',
    'beginWifiAttempt', 'serviceNetwork', 'serviceRFID', 'fit16', 'scroll16', 'lcdWrite', 'showLCDTemporary',
    'startWelcomeSequence', 'serviceLCD', 'setPathway', 'buttonSamplerTask'];
for (const name of preservedFunctions) assert.equal(functionSource(candidate, name), functionSource(baseline, name), 'V4 behavior changed: ' + name);
assert(!functionSource(candidate, 'setup').includes('.attach('));
assert(functionSource(candidate, 'setup').includes('gateArmed = false;'));
assert(!functionSource(candidate, 'serviceGate').includes('.attach('));
assert(functionSource(candidate, 'serviceGate').includes('(rawOpen && rawClose)'));
assert(functionSource(candidate, 'loop').includes('if (!servosAttached && pendingAttach == ATTACH_NONE)'));
assert(!fs.existsSync('esp32_firmware/ESP1_V4_Safe_Servos/bench-secrets.h'));

const constants = candidate.split('\n').filter(line => /^constexpr int (SERVO_MIN_US|SERVO_STEP_US)/.test(line)).join('\n');
const helpers = candidate.slice(candidate.indexOf('constexpr bool validPulse('), candidate.indexOf('bool limitsReady('));
const checks = `
static_assert(validPulse(1000) && validPulse(2000));
static_assert(!validPulse(999) && !validPulse(2001));
static_assert(validCalibrationWindow(1500, 1480, 1520));
static_assert(!validCalibrationWindow(1500, 1400, 1600));
static_assert(!validCalibrationWindow(1500, 1510, 1530));
static_assert(!validCalibrationWindow(1500, 1520, 1480));
static_assert(!validCalibrationWindow(999, 990, 1010));
static_assert(nextCommandPulse(1200, 1100) == 1198);
static_assert(nextCommandPulse(1200, 1300) == 1202);
static_assert(nextCommandPulse(1200, 1201) == 1201);
static_assert(nextCommandPulse(1200, 1199) == 1199);
static_assert(nextCommandPulse(1200, 1200) == 1200);
constexpr bool mirroredTravel() {
    int right = 1100, left = 1800;
    for (int i = 0; i < 200; i++) {
        right = nextCommandPulse(right, 1301);
        left = nextCommandPulse(left, 1499);
        if (right > 1301 || left < 1499) return false;
    }
    return right == 1301 && left == 1499;
}
static_assert(mirroredTravel());
`;
const folder = fs.mkdtempSync(path.join(os.tmpdir(), 'cblr-gate-guards-'));
const file = path.join(folder, 'guards.cpp');
fs.writeFileSync(file, constants + '\n' + helpers + checks);
const compiler = path.join(process.env.LOCALAPPDATA, 'Arduino15/packages/esp32/tools/esp-x32/2601/bin/xtensa-esp32-elf-g++.exe');
execFileSync(compiler, ['-std=c++17', '-fsyntax-only', file], { stdio: 'pipe' });
console.log('PASS: original/private-file fingerprints, 16 preserved V4 functions, disarmed startup, explicit attachment path, simultaneous-button guard and manual-network interlock.');
console.log('PASS: actual C++ calibration bounds and mirrored 2-us stepping compile-time tests, including endpoint overshoot prevention. Hardware results remain pending.');

const syncBefore = fs.readFileSync('.local/backend-second-pass/before/esp32_firmware/ESP1_Reservation_Sync/ESP1_Reservation_Sync.ino', 'utf8').replaceAll('\r\n', '\n');
const syncAfter = fs.readFileSync('esp32_firmware/ESP1_Reservation_Sync/ESP1_Reservation_Sync.ino', 'utf8').replaceAll('\r\n', '\n');
for (const name of preservedFunctions) assert.equal(functionSource(syncAfter, name), functionSource(syncBefore, name), 'Second-pass regression: ' + name);
console.log('PASS: all 16 RFID/signing/network/LCD/helper functions in the sync development sketch unchanged by the second pass.');
