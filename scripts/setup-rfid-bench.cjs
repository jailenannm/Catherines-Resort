'use strict';
const fs = require('node:fs/promises');
const { randomBytes } = require('node:crypto');
const { seed, project } = require('../tests/seed-emulator.cjs');

async function setup() {
    if (process.env.GCLOUD_PROJECT !== project || process.env.FIREBASE_DATABASE_EMULATOR_HOST !== '127.0.0.1:9000') throw Error('Running demo emulator on 9000 required.');
    await fs.mkdir('.local', { recursive: true });
    let keys;
    try { keys = JSON.parse(await fs.readFile('.local/rfid-reader.json', 'utf8')); }
    catch (error) {
        if (error.code !== 'ENOENT') throw error;
        keys = { 'esp1-bench': randomBytes(32).toString('hex') };
        await fs.writeFile('.local/rfid-reader.json', JSON.stringify(keys, null, 2), { flag: 'wx' });
    }
    try {
        await fs.writeFile('esp32_firmware/RFID_WiFi_Bench/bench-secrets.h',
            '#pragma once\n#define BENCH_WIFI_SSID ""\n#define BENCH_WIFI_PASSWORD ""\n#define BENCH_SERVER "http://192.168.1.35:8787"\n#define BENCH_READER_ID "esp1-bench"\n#define BENCH_READER_KEY "' + keys['esp1-bench'] + '"\n', { flag: 'wx' });
    } catch (error) { if (error.code !== 'EEXIST') throw error; }
    const accounts = await seed();
    const url = 'http://127.0.0.1:9000/sharedReservations.json?ns=' + project + '-default-rtdb';
    const headers = { Authorization: 'Bearer owner', 'Content-Type': 'application/json' };
    const response = await fetch(url, { headers });
    if (!response.ok) throw Error('Cannot read emulator reservations.');
    const existing = await response.json() || {};
    let reference;
    do { reference = 'CBLR-' + (100000 + randomBytes(4).readUInt32BE() % 900000); } while (existing[reference]);
    const booking = {
        reference, ownerUid: accounts['guest-a'].localId, submissionAttemptId: 'physical-bench-' + reference,
        checkinDate: '2026-12-27', staySlotId: 'day-retreat', duration: 'Day Retreat (8:00 AM – 6:00 PM)',
        adults: 2, children: 0, senior: 0, totalGuests: 2, honorific: 'Ms.', guestName: 'Physical RFID Bench Guest',
        mobile: '00000000000', email: 'guest-a@example.test', specialRequests: 'Synthetic bench booking. Physical tap Pending.',
        facilities: [{ value: 'event', name: 'Celebration Event Package', packageVersion: 2, price: 15000 }],
        prices: { subtotal: 15000, tourismTax: 250, serviceCharge: 1200, total: 16450 },
        status: 'Confirmed', rfidLinked: '', createdAt: new Date().toISOString()
    };
    const saved = await fetch(url.replace('sharedReservations.json', 'sharedReservations/' + reference + '.json'), { method: 'PUT', headers, body: JSON.stringify(booking) });
    if (!saved.ok) throw Error('Could not prepare bench booking.');
    await fs.writeFile('.local/rfid-bench-booking.json', JSON.stringify({ reference, status: 'Confirmed', physicalTap: 'Pending' }, null, 2));
    console.log('Confirmed / unassigned bench booking ' + reference);
    console.log('Admin http://127.0.0.1:5000/admin-reservations.html');
    console.log('Guest http://127.0.0.1:5000/my-reservation.html?reservation=' + reference);
    console.log('Credentials generated locally. Edit bench-secrets.h Wi-Fi fields. Physical tap Pending.');
}
setup().catch(error => { console.error(error.message); process.exitCode = 1; });
