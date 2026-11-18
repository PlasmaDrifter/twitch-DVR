# Twitch DVR v1.2 - Release Notes

What's New in Version 1.2:

- Memory Leak Fix for Continuous & Overnight Playback:
  Eliminated the 24/7 background MediaRecorder and video captureStream pipeline. Twitch DVR now runs with zero background buffer allocation while watching live streams, keeping memory usage completely flat even during multi-day or continuous overnight viewing sessions.

- On-Demand Server DVR Optimization:
  Quick Clip and Live Recording operate on-demand directly via Twitch's server CDN archives, preserving 1080p60 source fidelity with zero CPU/GPU overhead.
  For live recording on channels without VOD archives, dedicated local recording is only initialized when the user clicks REC and is cleanly torn down immediately upon stopping.

---

Previous Changes (v1.1):
- Lossless Server DVR live recording ([REC] button) in pristine 1080p60 MP4.
- Quick Clip button ([Clip 2m]) with playhead-aware clipping.
- Centered player controls layout with balanced group spacing.
- Real-time download progress HUD feedback.
- Enhanced Twitch CDN host permissions for high-speed multi-threaded downloads.

Previous Changes (v1.0):
- Live stream DVR timeline scrubbing and rewinding without requiring Turbo or user login.
- In-player quick-seek buttons (30s, 1m, 3m, 5m, 10m, and 30m).
- Proactive GraphQL VOD manifest discovery.
- Playback speed multipliers (0.5x to 2x) with auto-reset upon reaching the live edge.
- Dedicated speed button toggle and native Twitch settings gear menu integration.
- Keyboard shortcuts for seeking, jumping to live, and speed control.
- Homepage carousel autoplay prevention.
