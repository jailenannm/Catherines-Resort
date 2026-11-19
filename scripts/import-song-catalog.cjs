'use strict';
// Offline manifest import only; does not provision, scan DFPlayer SD or change Firebase.
const fs = require('node:fs');
const path = require('node:path');
const { loadCatalog } = require('./song-catalog.cjs');
if (require.main === module) {
    try {
        const input = process.argv[2], output = path.resolve(process.argv[3] || 'config/sd-song-catalog.json');
        if (!input || !output.startsWith(path.resolve('config') + path.sep)) throw Error('Usage: node scripts/import-song-catalog.cjs INPUT.json config/OUTPUT.json');
        const catalog = loadCatalog(input);
        if (fs.existsSync(output)) fs.copyFileSync(output, output + '.' + Date.now() + '.bak');
        fs.writeFileSync(output, JSON.stringify(catalog, null, 2) + '\n');
        console.log('Validated manifest saved. This does not verify physical SD content or audio.');
    } catch (e) { console.error(e.message); process.exitCode = 1; }
}
