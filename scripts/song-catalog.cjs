'use strict';
const fs = require('node:fs');
function validateCatalog(input) {
    if (input?.version !== 1 || !['unverified', 'mp3-folder'].includes(input.indexing) || !Array.isArray(input.tracks) || input.tracks.length > 500) throw Error('INVALID_CATALOG');
    const ids = new Set();
    for (const t of input.tracks) {
        if (!Number.isInteger(t.id) || t.id < 1 || t.id > 9999 || ids.has(t.id) || !['welcome', 'event', 'ktv', 'checkout'].includes(t.category) ||
            !/^\d{4}\.mp3$/.test(t.file) || Number(t.file.slice(0, 4)) !== t.id || typeof t.verified !== 'boolean' ||
            !(t.title === null || typeof t.title === 'string' && t.title.length <= 120) || !(t.artist == null || typeof t.artist === 'string' && t.artist.length <= 100) ||
            !(t.durationMs === null || Number.isInteger(t.durationMs) && t.durationMs > 0 && t.durationMs <= 7200000) ||
            !(t.lyrics == null || /^\d{4}\.lrc$/.test(t.lyrics) && Number(t.lyrics.slice(0,4)) === t.id) || !Number.isInteger(t.offsetMs) || Math.abs(t.offsetMs) > 30000) throw Error('INVALID_TRACK');
        if (t.verified && (input.indexing !== 'mp3-folder' || t.folder !== 'MP3' || !t.title)) throw Error('UNVERIFIED_INDEXING');
        ids.add(t.id);
    }
    return structuredClone(input);
}
const loadCatalog = file => validateCatalog(JSON.parse(fs.readFileSync(file, 'utf8')));
function parseLrc(text) {
    if (typeof text !== 'string' || Buffer.byteLength(text) > 65536) throw Error('LYRICS_TOO_LARGE');
    const cues = [];
    for (const line of text.split(/\r?\n/)) {
        const tags = [...line.matchAll(/\[(\d{1,2}):(\d{2})(?:\.(\d{1,3}))?\]/g)];
        const lyric = line.replace(/\[[^\]]*\]/g, '').trim();
        if (!tags.length || !lyric) continue;
        if (Buffer.byteLength(lyric) > 120) throw Error('LYRIC_LINE_TOO_LONG');
        for (const m of tags) { if (+m[2] > 59) throw Error('INVALID_LRC'); cues.push({ at: (+m[1] * 60 + +m[2]) * 1000 + Number((m[3] || '').padEnd(3, '0')), text: lyric }); }
    }
    if (cues.length > 512) throw Error('TOO_MANY_LYRIC_LINES');
    cues.sort((a, b) => a.at - b.at);
    if (cues.some((c, i) => i && c.at === cues[i - 1].at)) throw Error('AMBIGUOUS_LYRICS');
    return cues;
}
function readLyrics(name) {if(!/^\d{4}\.lrc$/.test(name))throw Error('INVALID_LYRICS_FILE');const file='config/lyrics/'+name;if(fs.statSync(file).size>65536)throw Error('LYRICS_TOO_LARGE');return fs.readFileSync(file,'utf8');}
module.exports = { validateCatalog, loadCatalog, parseLrc, readLyrics };
