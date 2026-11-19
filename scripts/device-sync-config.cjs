'use strict';
const fs = require('node:fs');
function deviceSyncConfig(host, webPort = 5000) {
    if (process.env.CATHERINES_DEVICE_SYNC !== '1') return null;
    // LAN HTTP is opt-in for the isolated demo network. Never use this config on public Wi-Fi.
    if (process.env.CATHERINES_TRUSTED_DEMO_LAN !== '1') throw Error('Confirm trusted isolated demo LAN before enabling device sync.');
    const devices = JSON.parse(fs.readFileSync('.local/reservation-devices.json', 'utf8'));
    if (!devices.esp1 || !devices.esp2) throw Error('Provision both unique device identities first.');
    if (devices.esp1.key === devices.esp2.key) throw Error('Device keys must be unique.');
    let facilitiesV2;
    if (process.env.CATHERINES_FACILITIES_V2 === '1') {
        // No physical capabilities enabled. Simulation can only run on the separate test emulators.
        const simulation = process.env.CATHERINES_FACILITIES_SIMULATION === '1';
        if (simulation && process.env.FIREBASE_DATABASE_EMULATOR_HOST !== '127.0.0.1:19000') throw Error('Facilities simulation requires isolated test emulators.');
        facilitiesV2 = { catalog: require('./song-catalog.cjs').loadCatalog('config/sd-song-catalog.json'), simulation, audioPolicy: simulation ? 'nonpreemptive-fifo' : null, loadLyrics: require('./song-catalog.cjs').readLyrics };
    }
    return { devices, webOrigin: 'http://' + host + ':' + webPort, facilitiesV2 };
}
module.exports = { deviceSyncConfig };
