'use strict';
const { spawn } = require('node:child_process');
const path = require('node:path');
const host = process.argv.find(argument => argument.startsWith('--host='))?.slice(7);
if (!host || !/^(10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.)\d{1,3}(?:\.\d{1,3}){1,2}$/.test(host)) {
    console.error('Use --host=192.168.1.35 with Laptop 1 current LAN address.');
    process.exitCode = 1;
} else {
    const cli = path.resolve('node_modules/firebase-tools/lib/bin/firebase.js');
    const child = spawn(process.execPath, [cli, 'emulators:exec', '--only', 'auth,database', '--project', 'demo-catherines-reservations', '--config', 'firebase.lan-demo.json', 'node scripts/lan-demo.cjs --host=' + host], { stdio: 'inherit' });
    child.on('error', error => { console.error(error.message); process.exitCode = 1; });
    child.on('exit', code => { process.exitCode = code || 0; });
}
