'use strict';
const fs = require('node:fs/promises');
const path = require('node:path');
const pages = ['index.html', 'login.html', 'register.html', 'reservation.html', 'my-reservation.html', 'admin-reservations.html', 'components/footer.html'];
const scripts = ['index', 'database', 'footer', 'login', 'register', 'reservation', 'reservation-calendar', 'my-reservation', 'admin-reservations', 'admin-layout', 'shared-reservations-config', 'shared-reservations', 'public-header', 'booking-slots'];

(async () => {
    const stage = process.argv[2] || '.local/hosting-rfid';
    if (!['.local/hosting-rfid', 'hosting-public'].includes(stage)) throw Error('Use hosting-public or the existing private Hosting stage.');
    try { await fs.mkdir(stage, { recursive: false }); }
    catch (error) {
        if (error.code === 'EEXIST') throw Error('Hosting stage already exists. Review it, then rename it before staging a fresh directory.');
        if (error.code !== 'ENOENT') throw error;
        await fs.mkdir('.local', { recursive: true });
        await fs.mkdir(stage);
    }
    for (const file of [...pages, ...scripts.map(name => 'js/' + name + '.js')]) {
        const destination = path.join(stage, file);
        await fs.mkdir(path.dirname(destination), { recursive: true });
        await fs.copyFile(file, destination);
    }
    for (const directory of ['css', 'assets']) {
        await fs.cp(directory, path.join(stage, directory), {
            recursive: true,
            filter: async source => {
                const entry = await fs.lstat(source);
                if (entry.isSymbolicLink()) return false;
                if (entry.isDirectory()) return !path.basename(source).startsWith('.');
                return directory === 'css' ? path.extname(source) === '.css' : /\.(png|jpe?g|webp|svg|ico|ttf|woff2?)$/i.test(source);
            }
        });
    }
    await fs.appendFile(path.join(stage, 'js/shared-reservations-config.js'), '\n// First live RFID test uses the existing reservation-only navigation.\nSHARED_RESERVATIONS_CONFIG.cloudTest = true;\n');
    console.log('Reservation-only Hosting stage prepared in ' + stage + '.');
})().catch(error => { console.error(error.message); process.exitCode = 1; });
