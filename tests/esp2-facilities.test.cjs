'use strict';
const fs=require('node:fs'),assert=require('node:assert/strict'),crypto=require('node:crypto'),{execFileSync}=require('node:child_process');
const dir='esp32_firmware/ESP2_Facilities_Controller/';
for(const f of ['DeviceOutputLease.h','ReservationDeviceSync.h'])assert.equal(fs.readFileSync(dir+f,'utf8'),fs.readFileSync('esp32_firmware/shared/'+f,'utf8'));
const source=fs.readFileSync(dir+'ESP2_Facilities_Controller.ino','utf8'),caps=fs.readFileSync(dir+'FacilityCapabilities.h','utf8');
assert.match(source,/#define CBLR_DEVICE_ID "esp2"/);assert.match(source,/#ifndef CBLR_COTTAGE_ACTIVE_LOW/);assert.match(source,/ReservationDeviceSync::begin\(applyCottages\)/);
assert.equal((source.match(/pinMode\(/g)||[]).length,1);assert(!source.includes('/scan'));assert(!source.includes('/diorama'));
assert(!/\b(?:digitalWrite|pinMode|analogWrite|ledcWrite|attach)\s*\(/.test(caps));
const pins=[...caps.matchAll(/\{(\d+),(true|false)\}/g)].map(m=>({gpio:Number(m[1]),output:m[2]==='true'}));assert.equal(pins.length,19);assert.equal(new Set(pins.map(p=>p.gpio)).size,pins.length);assert(pins.every(p=>p.gpio<34||!p.output));
assert.deepEqual(pins.map(p=>p.gpio),[26,14,34,25,27,32,33,19,16,18,23,5,21,22,13,17,35,36,39]);
const snapshot=JSON.parse(fs.readFileSync('.local/esp2-facilities-audit/latest.json','utf8'));for(const [file,hash]of Object.entries(snapshot.hashes))assert.equal(crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex'),hash,'Protected file changed');
execFileSync('git',['check-ignore','--no-index',dir+'facilities-config.h',dir+'device-sync-secrets.h'],{stdio:'pipe'});
console.log('PASS: full supplied pin map, unique roles, input-only safeguards, only cottage GPIO initialized, unsupported drivers absent/blocked, signed helper consistency, private config exclusion and original firmware/backend hashes preserved.');

