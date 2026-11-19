# Approved browser karaoke media

No approved backing audio or timed-lyrics assets were found in this checkout. `catalog.json` is intentionally empty. The old `js/ktv-songs.js` contains sample song metadata/lyrics, not working audio files or evidence of approved backing media. No copyrighted song or test tone was installed here.

Provide an approved instrumental backing file and matching lyrics file, for example:

```text
assets/ktv/approved-test-001/backing.wav
assets/ktv/approved-test-001/lyrics.json
```

MP3, WAV or another browser-supported audio format can be used. Provide the title, artist/credit, approval to use it, audio duration, and the timestamps aligned to that exact audio edit. Lyrics are UTF-8 JSON with seconds measured from the audio file's start:

```json
[
  {"start": 0, "end": 3.5, "text": "Approved lyric line"},
  {"start": 3.5, "end": 7, "text": "Next approved lyric line"}
]
```

Cues must be ordered, non-overlapping, finite and positive-length. Gaps are allowed. Text is rendered as text, never HTML. Add a corresponding catalog entry only when actual approved files exist:

```json
[
  {
    "id": "approved-test-001",
    "title": "Approved test title",
    "artist": "Approved credit",
    "audio": "/assets/ktv/approved-test-001/backing.wav",
    "lyrics": "/assets/ktv/approved-test-001/lyrics.json"
  }
]
```

Only same-origin files under `/assets/ktv/` are accepted. Serve audio with the correct media type and byte-range support for reliable seeking/resume. The automated test serves a generated, muted WAV tone and synthetic cue text via test-only routes; those fixtures are never part of this catalog.

Media alone does not enable playback. The browser also requires owned, verified Checked In KTV eligibility and a short-lived response from a trusted same-origin `POST /api/ktv-preview-readiness` service. That endpoint is deliberately not deployed or enabled in the static preview. Its adapter must verify the Firebase bearer token, read the current shared booking server-side, and obtain authenticated fresh Hall and shared-audio-owner state. Unknown/missing/stale state blocks Play. The implemented server policy core is `scripts/facility-command-service.cjs`; no browser-supplied readiness flags are accepted by it.

Playback is browser-only. No physical speaker selection, mic mixing, GPIO audio, volume switching, TFT lyrics or Firebase playback command is implied.
