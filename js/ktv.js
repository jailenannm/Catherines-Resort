"use strict";

/* =========================================================
   LIGHTHOUSE KTV
   Firebase paths used:
     ktv/target      "open" | "closed"   (web -> ESP 1 servo)
     ktv/hallOpen    true | false         (ESP 1 KY-003 -> web)
     ktv/song        index in KTV_SONGS
     ktv/playback    "playing" | "paused" | "stopped"
     ktv/startedAt   ms timestamp when current play began
     ktv/position    seconds elapsed when paused
     ktv/volume      0 - 30  (DFPlayer range)
     ktv/lightMode   "static" | "party" | "pulse" | "off"
     ktv/light       { r, g, b }
     beacon/on, beacon/rpm
========================================================= */

document.addEventListener("DOMContentLoaded", async () => {

    const Shell = window.ControlShell;
    if (await Shell.prepareFacility("ktv")) return;
    const Link = Shell.facilityLink();
    const SONGS = window.KTV_SONGS || [];

    Shell.init("ktv");

    const access = Shell.accessFor("ktv");
    if (!access.allowed) {
        Shell.renderLocked(document.getElementById("pageContent"), access);
        return;
    }

    const $ = id => document.getElementById(id);

    const el = {
        lighthouse: $("lighthouse"),
        beam: $("lhBeam"),
        room: $("lhRoom"),
        panelButton: $("ktvPanelButton"),
        panelTarget: $("panelTarget"),
        hallState: $("hallState"),
        hallChip: $("hallChip"),
        beaconSwitch: $("beaconSwitch"),
        beaconLabel: $("beaconLabel"),
        beaconSpeed: $("beaconSpeed"),
        lyrics: $("lyricsScreen"),
        progress: $("lyricsProgress"),
        playChip: $("playChip"),
        play: $("playButton"),
        stop: $("stopButton"),
        prev: $("prevButton"),
        next: $("nextButton"),
        volume: $("volumeRange"),
        volumeValue: $("volumeValue"),
        hint: $("ktvHint"),
        songList: $("songList"),
        lightModes: $("lightModes"),
        lightModeChip: $("lightModeChip")
    };

    let ktv = Link.get("ktv") || {};
    let beacon = Link.get("beacon") || {};

    // The old TFT status writes are not a working audio player or beacon motor.
    // Retain supported admin door/RGB diagnostics, but deny these unsupported
    // actions even when triggered programmatically. Local guest karaoke is separate.
    const unavailable = '#playButton,#stopButton,#prevButton,#nextButton,#volumeRange,#songList,#beaconSwitch,#beaconSpeed,[data-mode="pulse"]';
    for (const type of ['click','input','change']) document.addEventListener(type, event => {
        if (event.target.closest(unavailable)) { event.preventDefault(); event.stopImmediatePropagation(); }
    }, true);

    /* -----------------------------------------------------
       SONG LIST
    ----------------------------------------------------- */

    el.songList.innerHTML = SONGS.map((song, i) => `
        <li>
            <button type="button" data-song="${i}" id="song-${i}">
                <span class="num">${String(i + 1).padStart(2, "0")}</span>
                <span>
                    <strong>${Shell.escapeHtml(song.title)}</strong>
                    <small>${Shell.escapeHtml(song.artist)}</small>
                </span>
            </button>
        </li>
    `).join("");

    el.songList.addEventListener("click", e => {
        const btn = e.target.closest("[data-song]");
        if (!btn) return;
        loadSong(Number(btn.dataset.song), ktv.playback === "playing");
    });

    function loadSong(index, autoplay) {
        const count = SONGS.length;
        const i = ((index % count) + count) % count;
        Link.update("ktv", {
            song: i,
            position: 0,
            startedAt: autoplay ? Date.now() : 0,
            playback: autoplay ? "playing" : "stopped"
        });
        Link.log(`KTV song selected: ${SONGS[i].title}`);
    }

    /* -----------------------------------------------------
       PANEL & BEACON
    ----------------------------------------------------- */

    el.panelButton.addEventListener("click", () => {
        const opening = ktv.target !== "open";
        const changes = { target: opening ? "open" : "closed" };
        if (!opening) {
            changes.playback = "stopped";
            changes.position = 0;
        }
        Link.update("ktv", changes);
        Link.log(`KTV panel ${opening ? "opening" : "closing"}`);
        Shell.toast(opening ? "Opening the lighthouse KTV…" : "Closing the lighthouse KTV…");
    });

    el.beaconSwitch.addEventListener("click", () => {
        const on = !beacon.on;
        Link.set("beacon/on", on);
        Link.log(`Beacon ${on ? "ON" : "OFF"}`);
    });

    el.beaconSpeed.addEventListener("click", e => {
        const btn = e.target.closest("[data-rpm]");
        if (!btn) return;
        Link.set("beacon/rpm", Number(btn.dataset.rpm));
        Link.log(`Beacon speed ${btn.textContent.trim()}`);
    });

    /* -----------------------------------------------------
       TRANSPORT
    ----------------------------------------------------- */

    function elapsed() {
        if (ktv.playback === "playing" && ktv.startedAt) {
            return (Date.now() - ktv.startedAt) / 1000;
        }
        return Number(ktv.position) || 0;
    }

    el.play.addEventListener("click", () => {
        if (!ktv.hallOpen) return;
        if (ktv.playback === "playing") {
            Link.update("ktv", { playback: "paused", position: elapsed(), startedAt: 0 });
            Link.log("KTV paused");
        } else {
            const pos = ktv.playback === "paused" ? elapsed() : 0;
            Link.update("ktv", { playback: "playing", position: pos, startedAt: Date.now() - pos * 1000 });
            Link.log(`KTV playing: ${currentSong().title}`);
        }
    });

    el.stop.addEventListener("click", () => {
        Link.update("ktv", { playback: "stopped", position: 0, startedAt: 0 });
        Link.log("KTV stopped");
    });

    el.prev.addEventListener("click", () => loadSong((Number(ktv.song) || 0) - 1, ktv.playback === "playing"));
    el.next.addEventListener("click", () => loadSong((Number(ktv.song) || 0) + 1, ktv.playback === "playing"));

    let volumeTimer;
    el.volume.addEventListener("input", () => {
        el.volumeValue.textContent = el.volume.value;
        clearTimeout(volumeTimer);
        volumeTimer = setTimeout(() => Link.set("ktv/volume", Number(el.volume.value)), 150);
    });

    /* -----------------------------------------------------
       LIGHTING
    ----------------------------------------------------- */

    el.lightModes.addEventListener("click", e => {
        const btn = e.target.closest("[data-mode]");
        if (!btn) return;
        Link.set("ktv/lightMode", btn.dataset.mode);
        Link.log(`KTV lighting: ${btn.textContent.trim()}`);
    });

    document.querySelectorAll(".led").forEach(btn => {
        btn.addEventListener("click", () => {
            const key = btn.dataset.led;
            const light = Object.assign({ r: false, g: false, b: false }, ktv.light);
            light[key] = !light[key];
            Link.set("ktv/light", light);
            if (ktv.lightMode === "off") Link.set("ktv/lightMode", "static");
        });
    });

    /* -----------------------------------------------------
       RENDER
    ----------------------------------------------------- */

    function currentSong() {
        return SONGS[Number(ktv.song) || 0] || SONGS[0];
    }

    function renderLyrics() {
        el.lyrics.textContent = 'Physical audio/TFT karaoke lyrics unavailable. Use the local guest preview with approved media.';
    }

    function render() {
        const target = ktv.target === "open" ? "open" : "closed";
        const open = Boolean(ktv.hallOpen);
        const moving = (target === "open") !== open;

        el.lighthouse.classList.toggle("open", target === "open");
        el.panelButton.innerHTML = target === "open"
            ? `<i class="fa-solid fa-door-closed"></i> Close KTV`
            : `<i class="fa-solid fa-door-open"></i> Open KTV`;
        el.panelTarget.textContent = moving ? (target === "open" ? "Opening…" : "Closing…") : (open ? "Open" : "Closed");
        el.hallState.textContent = open ? "Magnet detected" : "No magnet";
        el.hallChip.className = `cs-chip ${open ? "on" : moving ? "warn" : "off"}`;
        el.hallChip.textContent = open ? "Fully open" : moving ? "Moving" : "Closed";

        const state = ktv.playback || "stopped";
        el.playChip.className = `cs-chip ${state === "playing" ? "on" : state === "paused" ? "warn" : "off"}`;
        el.playChip.textContent = state;
        el.play.innerHTML = state === "playing" ? `<i class="fa-solid fa-pause"></i>` : `<i class="fa-solid fa-play"></i>`;

        [el.play, el.stop, el.prev, el.next].forEach(b => { b.disabled = !open; });
        el.hint.textContent = 'Physical audio is unavailable. Hall readiness alone does not establish a working audio route; use the separate local guest preview with approved media.';

        if (document.activeElement !== el.volume) {
            el.volume.value = ktv.volume ?? 18;
            el.volumeValue.textContent = el.volume.value;
        }

        el.songList.querySelectorAll("[data-song]").forEach(b => {
            b.classList.toggle("active", Number(b.dataset.song) === (Number(ktv.song) || 0));
        });

        const mode = ktv.lightMode || "party";
        el.lightModes.querySelectorAll("button").forEach(b => b.classList.toggle("active", b.dataset.mode === mode));
        el.lightModeChip.textContent = mode;
        const light = ktv.light || {};
        document.querySelectorAll(".led").forEach(b => b.classList.toggle("on", mode !== "off" && Boolean(light[b.dataset.led])));

        const glow = mode === "off" ? "#2a2238"
            : `rgb(${light.r ? 230 : 40}, ${light.g ? 200 : 30}, ${light.b ? 255 : 60})`;
        el.room.style.setProperty("--ktv-glow", glow);

        el.lighthouse.classList.toggle("beacon-off", !beacon.on);
        el.beaconSwitch.classList.toggle("on", Boolean(beacon.on));
        el.beaconLabel.textContent = 'Stationary light — physical main switch; no web control';
        el.beam.style.setProperty("--sweep", `${60 / Math.max(1, beacon.rpm || 6)}s`);
        el.beaconSpeed.querySelectorAll("button").forEach(b => b.classList.toggle("active", Number(b.dataset.rpm) === Number(beacon.rpm)));

        document.querySelectorAll(unavailable).forEach(node => {
            if (node.matches('button,input')) node.disabled = true;
            node.querySelectorAll('button,input').forEach(control => control.disabled = true);
        });
        el.playChip.textContent = 'Unavailable';
        el.beam.style.animation = 'none';

        renderLyrics();
    }

    Link.on("ktv", value => { ktv = value || {}; render(); });
    Link.on("beacon", value => { beacon = value || {}; render(); });

    setInterval(renderLyrics, 250);
});
