# Twitch DVR

**Rewind live Twitch streams, use dedicated in-player playback speed controls, quick-rewind buttons, and force DVR availability without requiring a login.**

[![Firefox Add-on](https://img.shields.io/badge/Firefox-WebExtension%20MV3-FF7139?logo=firefox-browser&logoColor=white)](https://addons.mozilla.org)
[![Version](https://img.shields.io/badge/version-v1.0-38BDF8)](https://github.com/PlasmaDrifter/twitch-DVR/releases)
[![License](https://img.shields.io/badge/license-MIT-22C55E)](LICENSE)
[![Twitch](https://img.shields.io/badge/Twitch-Supported-9146FF?logo=twitch&logoColor=white)](https://twitch.tv)

---

## Overview

**Twitch DVR** is a fast, lightweight WebExtension for Firefox and Zen Browser that brings DVR functionality to live Twitch streams. It injects clean player controls directly into Twitch's native video control bar, allowing you to rewind live broadcasts, watch at custom playback speeds (0.5x–2x), and return to the live edge instantly.

Unlike standard Twitch playback which restricts live scrubbing to Turbo subscribers on select partner channels, Twitch DVR unlocks client-side DVR controls across all supported streams without requiring a Twitch Turbo subscription or user account login.

---

## Key Features

- **Live Stream DVR Rewinding**: Scrub backward and forward through hours of live broadcast history directly on the player timeline.
- **Dedicated Quick-Rewind Controls**: Centered in-player `« 10s` and `« 30s` buttons for rapid, buffer-free replay.
- **Reliable Live-Edge Transition**: Seamlessly transitions from live stream playback into DVR mode without stalling or stuttering.
- **Interactive Live / Go Live Badge**: Displays current sync status. When rewound behind live, clicking `GO LIVE` immediately snaps playback back to the live broadcast.
- **Integrated Speed Multiplier**: Compact speed flyout supporting `0.5x`, `0.75x`, `1.0x`, `1.25x`, `1.5x`, `1.75x`, and `2.0x` speeds, with automatic reset to 1.0x upon catching up to the live edge.
- **Twitch Settings Menu Integration**: Adds a native `Playback Speed (DVR)` row directly inside Twitch's player settings gear menu.
- **Zero-Login DVR Access**: Unlocks DVR capabilities even when logged out or browsing in incognito mode.
- **Single-Page Application Channel Navigation**: Clears and resets stream state automatically when navigating between channels without leaking past broadcast IDs across streamers.
- **Frontpage Carousel Autoplay Blocker**: Optionally stops the Twitch homepage carousel from auto-playing video and sound without affecting sidebar channel previews or hover previews.
- **Full Keyboard Shortcut Support**:
  - `J` or `Left Arrow`: Rewind primary step (configurable: 5s, 10s, 15s, 30s).
  - `L` or `Right Arrow`: Fast-forward primary step.
  - `Shift + Left Arrow`: Rewind 30s.
  - `Shift + Right Arrow`: Fast-forward 30s.
  - `Shift + L` or `0`: Jump to live edge.
  - `[` / `]`: Decrease / increase playback speed.

---

## Project Structure

```text
twitch-DVR/
├── README.md
├── LICENSE
├── release/
│   ├── manifest.json
│   ├── background.js
│   ├── build.sh
│   ├── AMO_DESCRIPTION.md
│   ├── AMO_RELEASE_NOTES.md
│   ├── icons/
│   ├── content/
│   │   ├── gql-hook.js
│   │   ├── content-bridge.js
│   │   ├── player-controls.js
│   │   └── player-controls.css
│   └── popup/
│       ├── popup.html
│       └── popup.js
└── test/
    ├── manifest.json
    ├── background.js
    ├── build.sh
    ├── icons/
    ├── content/
    └── popup/
```

---

## Building and Packaging

### 1. Build Production Release (AMO Package)
```bash
cd release
./build.sh
```
This generates:
- `release/twitch-dvr-v1.0.zip` (clean archive for AMO upload)
- `release/twitch-dvr.xpi` (local testing file)

### 2. Build Testing Package
```bash
cd test
./build.sh
```
This generates:
- `test/twitch-dvr-test-v1.0.zip`
- `test/twitch-dvr-test.xpi`

---

## Privacy & Security

- Zero analytics, zero trackers, zero telemetry, and zero remote dependencies.
- No user credentials, tokens, or personal identifiers are stored or transmitted.
- All configuration options are stored strictly inside your browser's sandboxed local extension storage.

---

## License

MIT License. See [LICENSE](LICENSE) for details.
