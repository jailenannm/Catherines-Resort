'use strict';
// Explicit operator command, never called by server startup or tests.
const fs = require('node:fs');
const { randomBytes } = require('node:crypto');
const destination = '.local/reservation-devices.json';
if (fs.existsSync(destination)) throw Error('Device registry already exists. Refusing to rotate existing keys.');
fs.mkdirSync('.local', { recursive: true });
fs.writeFileSync(destination, JSON.stringify({ esp1: { key: randomBytes(32).toString('hex') }, esp2: { key: randomBytes(32).toString('hex') } }, null, 2) + '\n', { flag: 'wx' });
console.log('Private device registry created at .local/reservation-devices.json. Copy values privately to reviewed device configs. Existing RFID keys were not changed.');
