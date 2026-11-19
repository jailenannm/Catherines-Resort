const http = require('node:http');
const fs = require('node:fs/promises');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
// Cloud-test pages cannot load any device connector, even through a redirect.
const cloudPages = new Set(['/index.html', '/login.html', '/register.html', '/reservation.html', '/my-reservation.html', '/admin-reservations.html', '/components/footer.html']);
const cloudScripts = new Set(['index.js', 'database.js', 'footer.js', 'login.js', 'register.js', 'reservation.js', 'reservation-calendar.js', 'my-reservation.js', 'admin-reservations.js', 'admin-layout.js', 'shared-reservations-config.js', 'shared-reservations.js', 'public-header.js', 'booking-slots.js'].map(name => '/js/' + name));
function startServer(port = 5000, { cloudTest = false, host = '127.0.0.1', lanDemo = false, authPort = 9099, databasePort = 9000, deviceSyncEnabled = false, facilitiesV2Enabled = false } = {}) {
    return new Promise((resolve, reject) => {
        const server = http.createServer(async (req, res) => {
            try {
                let pathname = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
                if (pathname === '/') pathname = '/index.html';
                if (lanDemo && ['/js/firebase-config.js', '/js/diorama-link.js'].includes(pathname)) {
                    res.writeHead(403).end('Live device transport is unavailable in the LAN demo.'); return;
                }
                if (lanDemo && pathname === '/js/shared-reservations-config.js') {
                    res.writeHead(200, { 'Content-Type': 'text/javascript', 'Cache-Control': 'no-store' });
                    res.end('window.SHARED_RESERVATIONS_CONFIG = {mode:"emulator",cloudTest:false,emulatorProjectId:"demo-catherines-reservations",authEmulatorUrl:"http://"+location.hostname+":'+authPort+'",databaseEmulatorUrl:"http://"+location.hostname+":'+databasePort+'",confirmationEmailEnabled:false,facilitiesV2Enabled:'+Boolean(facilitiesV2Enabled)+',deviceSyncEnabled:'+Boolean(deviceSyncEnabled)+'};');
                    return;
                }
                if (lanDemo && /^\/vendor\/firebase\/(firebase-app-compat|firebase-auth-compat|firebase-database-compat)\.js$/.test(pathname)) {
                    res.writeHead(200, { 'Content-Type': 'text/javascript' });
                    res.end(await fs.readFile(path.join(root, 'node_modules/firebase', path.basename(pathname))));
                    return;
                }
                if (cloudTest) {
                    if (pathname === '/admin-dashboard.html') {
                        res.writeHead(302, { Location: '/admin-reservations.html' }).end(); return;
                    }
                    if (!cloudPages.has(pathname) && !cloudScripts.has(pathname) && !pathname.startsWith('/css/') && !pathname.startsWith('/assets/')) {
                        res.writeHead(403).end('This cloud-test server serves reservation pages only.'); return;
                    }
                    res.setHeader('Cache-Control', 'no-store');
                }
                if (lanDemo && !/^\/(?:[a-z0-9-]+\.html|js\/[a-z0-9-]+\.js|css\/[a-z0-9-]+\.css|components\/footer\.html|assets\/)/i.test(pathname)) {
                    res.writeHead(403).end(); return;
                }
                const file = path.resolve(root, '.' + pathname);
                if (!file.startsWith(root + path.sep) || pathname.split('/').some(part => part.startsWith('.')) || pathname.startsWith('/node_modules/') || pathname.startsWith('/tests/')) {
                    res.writeHead(403).end(); return;
                }
                const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.jpg': 'image/jpeg', '.svg': 'image/svg+xml', '.ttf': 'font/ttf' };
                res.setHeader('Content-Type', types[path.extname(file)] || 'application/octet-stream');
                let content = await fs.readFile(file);
                if (lanDemo && pathname.endsWith('.html')) content = content.toString('utf8').replaceAll('https://www.gstatic.com/firebasejs/12.6.0/', '/vendor/firebase/');
                if (lanDemo) res.setHeader('Cache-Control', 'no-store');
                res.end(content);
            } catch { res.writeHead(404).end(); }
        });
        server.once('error', reject);
        server.listen(port, host, () => resolve(server));
    });
}
module.exports = { startServer };
if (require.main === module) {
    const cloudTest = process.argv.includes('--cloud');
    const port = cloudTest ? 5001 : 5000;
    startServer(port, { cloudTest }).then(() => console.log(cloudTest
        ? 'CLOUD reservation test: http://127.0.0.1:5001/login.html (real Auth/booking writes only when you submit)'
        : 'Local emulator app: http://127.0.0.1:5000'));
}
