'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const header = path.resolve('esp32_firmware/shared/DeviceOutputLease.h').replaceAll('\\','/');
assert.equal(fs.readFileSync(header,'utf8'), fs.readFileSync('esp32_firmware/ESP1_Reservation_Sync/DeviceOutputLease.h','utf8'));
assert.equal(fs.readFileSync('esp32_firmware/shared/ReservationDeviceSync.h','utf8'), fs.readFileSync('esp32_firmware/ESP1_Reservation_Sync/ReservationDeviceSync.h','utf8'));
fs.mkdirSync('.local/backend-second-pass/lease-test',{recursive:true});
const source = `#include "${header}"
constexpr bool test() {
 DeviceOutputLease s;
 if(s.desired(0)) return false;
 if(!s.accept(1,true,10000,100)) return false;
 if(!s.desired(10099) || s.desired(10100)) return false;
 if(s.accept(0,true,10000,10100) || s.desired(10101)) return false;
 if(!s.accept(2,false,10000,10101) || s.desired(10102)) return false;
 if(!s.accept(3,true,10000,0xfffffff0)) return false;
 if(!s.desired(0x10) || s.desired(uint32_t(0xfffffff0u+10000u))) return false;
 return !s.accept(4,true,10001,0) && !s.accept(4,true,0,0);
}
static_assert(test(), "Lease startup, expiry, rollback, OFF, wrap and bounds");`;
fs.writeFileSync('.local/backend-second-pass/lease-test/test.cpp',source);
const compiler=path.join(process.env.LOCALAPPDATA,'Arduino15/packages/esp32/tools/esp-x32/2601/bin/xtensa-esp32-elf-g++.exe');
execFileSync(compiler,['-std=c++17','-c','.local/backend-second-pass/lease-test/test.cpp','-o','.local/backend-second-pass/lease-test/test.o'],{stdio:'pipe'});
console.log('PASS: actual firmware lease class compile-time assertions for startup OFF, bounded lease expiry, lower-version rejection, checkout OFF, millis wrap and TTL bounds; shared/copy headers identical. No board accessed.');
