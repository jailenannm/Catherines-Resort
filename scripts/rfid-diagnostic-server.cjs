'use strict';
// Non-mutating sidecar: preserve the running LAN website/scan server/emulators.
const fs = require('node:fs');
const { startBenchServer } = require('./rfid-bench-server.cjs');
const host = process.argv.find(arg => arg.startsWith('--host='))?.slice(7);
if (!host || !/^(10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.)[0-9.]+$/.test(host)) throw Error('Supply Laptop 1 LAN IPv4 using --host=192.168.1.35.');
const diagnosticLog = line => {
    fs.appendFileSync('.local/rfid-diagnostics.log', line + '\n');
    console.log(line);
};
startBenchServer({ host, port: 8788, diagnosticsOnly: true, readerKeys: JSON.parse(fs.readFileSync('.local/rfid-reader.json', 'utf8')), diagnosticLog })
    .then(() => console.log('Diagnostic-only reader listener http://' + host + ':8788; /scan blocked. Log: .local/rfid-diagnostics.log'))
    .catch(error => { console.error(error.message); process.exitCode = 1; });
