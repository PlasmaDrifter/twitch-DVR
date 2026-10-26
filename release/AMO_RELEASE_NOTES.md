# Twitch DVR v1.1 - Release Notes

What's New in Version 1.1:

- Lossless Server DVR Live Recording ([REC] Button):
  Directly downloads pristine, untouched 1080p60 MP4 broadcast segments from Twitch's server archives with zero re-encoding, zero CPU/GPU overhead, and bit-for-bit source fidelity.
  Includes a dedicated local session recorder fallback for channels without active VOD archives.

- Quick Clip Button ([Clip 2m]):
  One-click instant clipping of recent broadcast history (configurable 30s to 5m in popup settings).
  Fully playhead-aware: when rewound in the timeline, clips the window leading up to your current viewing position rather than the live broadcast edge.

- Centered Player Controls Layout:
  Reorganized bottom player controls with dedicated group gaps separating rewind/forward navigation, clipping/recording actions, and playback speed controls.

- Real-Time Download Progress Feedback:
  Live HUD status displaying segment download percentages and completion confirmation directly over the video player.

- Enhanced Twitch CDN Host Permissions:
  Added host permissions for Twitch CloudFront and Fastly CDN endpoints to guarantee seamless broadcast segment fetching and high-speed multi-threaded downloads.

---

Previous Changes (v1.0):
- Live stream DVR timeline scrubbing and rewinding without requiring Turbo or user login.
- In-player quick-seek buttons (30s, 1m, 3m, 5m, 10m, and 30m).
- Proactive GraphQL VOD manifest discovery.
- Playback speed multipliers (0.5x to 2x) with auto-reset upon reaching the live edge.
- Dedicated speed button toggle and native Twitch settings gear menu integration.
- Keyboard shortcuts for seeking, jumping to live, and speed control.
- Homepage carousel autoplay prevention.
