'use strict';
// One non-preemptive authority. This is a simulation default, not an approved live priority.
function audioManager({ catalog, now, policy }) {
    const track = id => { const t = catalog.tracks.find(t => t.id === id && t.verified); if (!t) throw Error('TRACK_UNAVAILABLE'); return t; };
    const position = a => a.state === 'playing' ? Math.max(0, a.positionMs + now() - a.changedAt) : a.positionMs;
    function stop(a) { a.state = 'stopped'; a.owner = null; a.trackId = null; a.positionMs = 0; a.revision++; a.changedAt = now(); }
    function start(a, item) { a.owner = item.reference; a.category = item.category; a.trackId = item.trackId; a.queue = item.queue || [item.trackId]; a.index = item.index || 0; a.state = 'playing'; a.positionMs = 0; a.changedAt = now(); a.startedAt = now(); a.expiresAt = now() + 30000; a.revision++; }
    return {
        track, position, stop,
        apply(a, reference, input, category) {
            if (policy !== 'nonpreemptive-fifo') throw Error('AUDIO_POLICY_UNAPPROVED');
            if (input.action === 'play') {
                const t = track(input.trackId); if (t.category !== category) throw Error('TRACK_CATEGORY_DENIED');
                if (a.owner && a.owner !== reference) throw Error('AUDIO_BUSY');
                const queue = input.queue || [t.id];
                if (!Array.isArray(queue) || queue.length < 1 || queue.length > 32 || !queue.includes(t.id) || queue.some(id => track(id).category !== category)) throw Error('INVALID_QUEUE');
                start(a, { reference, category, trackId: t.id, queue, index: queue.indexOf(t.id) }); return;
            }
            if (a.owner !== reference) throw Error('AUDIO_NOT_OWNER');
            if (input.action === 'stop') stop(a);
            else if (input.action === 'pause') { a.positionMs = position(a); a.state = 'paused'; a.changedAt = now(); a.revision++; }
            else if (input.action === 'resume') { if (a.state !== 'paused') throw Error('INVALID_PLAYER_STATE'); a.state = 'playing'; a.changedAt = now(); a.revision++; }
            else if (['next', 'previous'].includes(input.action)) { const index = a.index + (input.action === 'next' ? 1 : -1); if (index < 0 || index >= a.queue.length) throw Error('QUEUE_BOUNDARY'); start(a, { reference, category, trackId: a.queue[index], queue: a.queue, index }); }
            else if (input.action === 'volume') { if (!Number.isInteger(input.volume) || input.volume < 0 || input.volume > 30) throw Error('INVALID_VOLUME'); a.positionMs = position(a); a.changedAt = now(); a.volume = input.volume; a.revision++; }
            else if (input.action !== 'renew') throw Error('INVALID_AUDIO_ACTION');
            if (a.owner) a.expiresAt = now() + 30000;
        },
        reconcile(a, valid, hallReady) {
            a.pending = (a.pending || []).filter(item => item.category === 'checkout' ? valid(item.reference, 'checkout') : valid(item.reference, item.category));
            if (a.owner && (!valid(a.owner, a.category) || a.category === 'ktv' && !hallReady || now() >= a.expiresAt)) stop(a);
            if (a.state === 'playing' && track(a.trackId).durationMs && position(a) >= track(a.trackId).durationMs) stop(a);
            if (!a.owner && a.pending.length && policy === 'nonpreemptive-fifo') start(a, a.pending.shift());
        }
    };
}
module.exports = { audioManager };
