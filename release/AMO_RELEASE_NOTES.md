# Twitch DVR v1.0 - AMO Release Notes

What's New in Version 1.0 (Initial Release):

- Live Stream DVR Rewinding:
  Enables full timeline scrub and rewinding on live Twitch broadcasts without requiring Turbo or user login.

- Customizable In-Player Quick-Seek Buttons:
  Configure which quick-seek buttons appear in your player controls (30s, 1m, 3m, 5m, 10m, and 30m for both rewind and forward).

- Proactive VOD Manifest Discovery:
  Automatic GraphQL background lookup discovers active broadcast IDs on channel load, activating the DVR seekbar reliably.

- Reliable Live-Edge Seek:
  Seamless transition from live stream playback into DVR mode without stalling, dropping buffer, or requiring manual timeline clicks.

- Instant Return to Live:
  Clicking "GO LIVE" immediately returns playback to the live broadcast edge cleanly.

- Playback Speed Multipliers (0.5x to 2x):
  Choose between 0.5x, 0.75x, 1x, 1.25x, 1.5x, 1.75x, and 2x speeds with automatic 1x reset upon reaching the live edge.

- Dedicated Speed Button Toggle:
  Optionally hide or show the in-player speed button and flyout directly from the extension popup.

- Muted Native Twitch Styling:
  Refined dark slate surfaces and platinum icons designed to blend seamlessly with Twitch's native player aesthetic without fluorescent glows or neon pulses.

- Configurable Keyboard Hotkeys:
  Full hotkey support for seeking (J / L / Arrows), jumping to live (Shift+L / 0), and speed adjustments ([ / ]).

- Homepage Autoplay Prevention:
  Optionally blocks unwanted autoplay on the Twitch homepage carousel while keeping stream previews intact.
