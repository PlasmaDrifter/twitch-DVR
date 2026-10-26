// player-controls.js
// Twitch DVR - In-player controls:
// - All DVR controls (Rewind buttons, Live badge, Forward buttons, Speed) centered in player controls bar
// - Compact speed control with popup flyout
// - Clean LIVE / GO LIVE badge without timestamps
(function () {
  const REWIND_INTERVALS = [
    { key: "30s", seconds: 30, label: "30s", title: "30s" },
    { key: "1m", seconds: 60, label: "1m", title: "1 min" },
    { key: "3m", seconds: 180, label: "3m", title: "3 min" },
    { key: "5m", seconds: 300, label: "5m", title: "5 min" },
    { key: "10m", seconds: 600, label: "10m", title: "10 min" },
    { key: "30m", seconds: 1800, label: "30m", title: "30 min" },
  ];

  const FORWARD_INTERVALS = [
    { key: "30s", seconds: 30, label: "30s", title: "30s" },
    { key: "1m", seconds: 60, label: "1m", title: "1 min" },
    { key: "3m", seconds: 180, label: "3m", title: "3 min" },
    { key: "5m", seconds: 300, label: "5m", title: "5 min" },
    { key: "10m", seconds: 600, label: "10m", title: "10 min" },
    { key: "30m", seconds: 1800, label: "30m", title: "30 min" },
  ];

  let settings = {
    enabled: true,
    enablePlayerButtons: true,
    enableSpeedButton: true,
    enableClipButton: true,
    enableRecordButton: true,
    clipDurationSeconds: 120,
    recordingBitrate: 8500000,
    enableHotkeys: true,
    seekStepSeconds: 10,
    rewindButtons: { "30s": false, "1m": true, "3m": false, "5m": true, "10m": false, "30m": false },
    forwardButtons: { "30s": false, "1m": true, "3m": false, "5m": true, "10m": false, "30m": false },
  };

  let targetSpeed = 1.0;
  let hudTimeout = null;
  let lastRewoundState = null;
  const SPEED_OPTIONS = [0.5, 0.75, 1.0, 1.25, 1.5, 1.75, 2.0];

  function refreshSettings() {
    chrome.storage.local.get(
      {
        enabled: true,
        enablePlayerButtons: true,
        enableSpeedButton: true,
        enableClipButton: true,
        enableRecordButton: true,
        clipDurationSeconds: 120,
        recordingBitrate: 8500000,
        enableHotkeys: true,
        seekStepSeconds: 10,
        rewindButtons: { "30s": false, "1m": true, "3m": false, "5m": true, "10m": false, "30m": false },
        forwardButtons: { "30s": false, "1m": true, "3m": false, "5m": true, "10m": false, "30m": false },
      },
      (res) => {
        settings = { ...settings, ...res };
        if (!settings.enabled || !settings.enablePlayerButtons) {
          removeInjectedControls();
        } else {
          removeInjectedControls();
          scheduleInjection();
        }
      }
    );
  }

  refreshSettings();
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === "local") refreshSettings();
  });

  function getActiveVideo() {
    return document.querySelector(".video-player video, [data-a-target='video-player'] video, video");
  }

  function getLiveEdge(video) {
    if (!video) return null;
    try {
      if (video.seekable && video.seekable.length > 0) {
        const end = video.seekable.end(video.seekable.length - 1);
        if (isFinite(end) && end > 0 && end < 1e7) return end;
      }
      if (isFinite(video.duration) && video.duration > 0 && video.duration < 1e7) {
        return video.duration;
      }
    } catch (e) { }
    return null;
  }

  const SVG_NS = "http://www.w3.org/2000/svg";

  function createSvgElement(tag, attrs = {}) {
    const el = document.createElementNS(SVG_NS, tag);
    for (const [key, val] of Object.entries(attrs)) {
      el.setAttribute(key, val);
    }
    return el;
  }

  function showHud(text, durationMs) {
    let hud = document.getElementById("twitch-dvr-hud");
    if (!hud) {
      hud = document.createElement("div");
      hud.id = "twitch-dvr-hud";
      hud.className = "twitch-dvr-hud";
      const targetContainer =
        document.querySelector(".video-player, [data-a-target='video-player']") || document.body;
      targetContainer.appendChild(hud);
    }

    hud.textContent = text;
    hud.classList.add("visible");

    if (hudTimeout) clearTimeout(hudTimeout);
    const timeout = durationMs || (text.includes("failed") || text.includes("unavailable") ? 3500 : 1800);
    hudTimeout = setTimeout(() => {
      hud.classList.remove("visible");
    }, timeout);
  }

  function getSeekbarElement() {
    const selectors = [
      '[data-test-selector="seekbar-interaction-area__interactionArea"]',
      '[data-a-target="player-seekbar"]',
      '.video-player [role="slider"]',
      '.player-seek-bar',
    ];
    for (const sel of selectors) {
      const el = document.querySelector(sel);
      if (el) {
        const r = el.getBoundingClientRect();
        if (r.width > 10 && r.height > 0) return el;
      }
    }
    return (
      document.querySelector('[data-a-target="player-seekbar"]') ||
      document.querySelector('[data-test-selector="seekbar-interaction-area__interactionArea"]') ||
      document.querySelector('.video-player [role="slider"]')
    );
  }

  /**
   * Seek backward or forward relative to the current playback position.
   *
   * In Twitch's player architecture:
   * 1. When already rewound (DVR mode active), Twitch exposes the recording buffer
   *    and setting video.currentTime directly jumps backwards/forwards cleanly.
   * 2. When at the live edge, the HTML <video> currentTime is near 0s (tracking the live window).
   *    Attempting to set video.currentTime < 0 or to an unbuffered time will stall or be ignored.
   *    To transition cleanly into DVR mode without stalling or jumping too far back:
   *    We simulate a single interaction on the seekbar at (right - 1px). This signals Twitch's
   *    internal player engine to switch from live playback mode to DVR recording mode at the live
   *    edge. After a short 250ms tick, video.currentTime is updated by deltaSeconds.
   *
   * @param {number} deltaSeconds - Number of seconds to seek (negative to rewind, positive to skip forward)
   */
  function formatDeltaText(deltaSeconds) {
    const symbol = deltaSeconds < 0 ? "«" : "»";
    const abs = Math.abs(deltaSeconds);
    if (abs >= 60 && abs % 60 === 0) {
      return `${symbol} ${abs / 60}m`;
    }
    return `${symbol} ${abs}s`;
  }

  function checkIfRewound(video) {
    if (
      document.querySelector('button[aria-label="Skip to Live"]') ||
      document.querySelector('button[data-a-target="player-skip-to-live-button"]') ||
      document.querySelector('button[data-a-target="player-live-button"]') ||
      document.querySelector('.live-indicator-container button')
    ) {
      return true;
    }
    if (video && isFinite(video.currentTime)) {
      const liveEdge = getLiveEdge(video);
      if (liveEdge && isFinite(liveEdge)) {
        return (liveEdge - video.currentTime) > 4;
      }
      if (isFinite(video.duration) && video.duration > 0 && video.duration < 1e7) {
        return (video.duration - video.currentTime) > 4;
      }
    }
    return false;
  }

  function seekRelative(deltaSeconds) {
    const video = getActiveVideo();
    const isRewound = checkIfRewound(video);

    if (isRewound && video && isFinite(video.currentTime)) {
      // Already in DVR mode: direct relative seek
      const liveEdge = getLiveEdge(video);
      const maxTime = liveEdge && isFinite(liveEdge) ? liveEdge : (isFinite(video.duration) && video.duration < 1e7 ? video.duration : null);

      // If forward seek reaches or exceeds live boundary: jump cleanly to live
      if (deltaSeconds > 0 && maxTime && video.currentTime + deltaSeconds >= maxTime - 2) {
        jumpToLive();
        return;
      }

      const clampMax = maxTime || (video.currentTime + Math.max(0, deltaSeconds));
      video.currentTime = Math.max(0, Math.min(clampMax, video.currentTime + deltaSeconds));
      setTimeout(() => updateLiveBadge(video), 50);

      showHud(formatDeltaText(deltaSeconds));
      return;
    }

    // Seeking forward when already at live edge: show Live HUD and stay live
    if (deltaSeconds > 0) {
      showHud("Live");
      return;
    }

    // At live edge and seeking backward:
    // Interact with Twitch's seekbar at the target position to transition into DVR mode cleanly
    const seekbar = getSeekbarElement();
    if (seekbar) {
      const rect = seekbar.getBoundingClientRect();
      let streamDuration = null;

      // 1. Check createdAt dataset attribute set by gql-hook (stream elapsed time)
      const createdAt = document.documentElement.dataset.twitchDvrCreatedAt;
      if (createdAt) {
        const startMs = new Date(createdAt).getTime();
        if (!isNaN(startMs) && startMs > 0) {
          const elSec = (Date.now() - startMs) / 1000;
          if (elSec > 10) streamDuration = elSec;
        }
      }

      // 2. Fallbacks for stream duration
      if (!streamDuration) {
        const liveEdge = getLiveEdge(video);
        if (liveEdge && isFinite(liveEdge) && liveEdge > 10) {
          streamDuration = liveEdge;
        } else if (video && isFinite(video.duration) && video.duration > 10 && video.duration < 1e7) {
          streamDuration = video.duration;
        }
      }

      let clientX;
      if (streamDuration && streamDuration > 10) {
        const targetTime = Math.max(0, streamDuration + deltaSeconds);
        const fraction = Math.max(0.01, Math.min(0.999, targetTime / streamDuration));
        clientX = Math.round(rect.left + fraction * rect.width);
      } else {
        // Fallback: proportional offset from right edge
        const pxOffset = Math.min(rect.width * 0.8, Math.max(25, Math.abs(deltaSeconds) * 2));
        clientX = Math.round(rect.right - pxOffset);
      }

      const clientY = Math.round(rect.top + rect.height / 2);
      const opts = { bubbles: true, cancelable: true, composed: true, view: window, clientX, clientY, button: 0, buttons: 1 };
      try {
        seekbar.dispatchEvent(new PointerEvent("pointerdown", { ...opts, pointerId: 1, pointerType: "mouse", isPrimary: true }));
        seekbar.dispatchEvent(new MouseEvent("mousedown", opts));
        seekbar.dispatchEvent(new PointerEvent("pointerup", { ...opts, buttons: 0 }));
        seekbar.dispatchEvent(new MouseEvent("mouseup", { ...opts, buttons: 0 }));
        seekbar.dispatchEvent(new MouseEvent("click", { ...opts, buttons: 0 }));
      } catch (e) { }

      setTimeout(() => {
        const vid = getActiveVideo();
        if (vid && isFinite(vid.currentTime)) {
          updateLiveBadge(vid);
        }
      }, 300);

      showHud(formatDeltaText(deltaSeconds));
      return;
    }

    if (video && isFinite(video.currentTime)) {
      video.currentTime = Math.max(0, video.currentTime + deltaSeconds);
      showHud(formatDeltaText(deltaSeconds));
    }
  }

  function renderLiveBadgeDOM(btn, isRewound) {
    btn.textContent = "";
    if (isRewound) {
      btn.className = "tdvr-live-badge rewound";
      const icon = document.createElement("span");
      icon.className = "tdvr-live-icon";
      icon.textContent = "↺";
      const label = document.createElement("span");
      label.className = "tdvr-live-label";
      label.textContent = "GO LIVE";
      btn.append(icon, label);
      btn.title = "Behind live stream. Click to jump to live edge!";
    } else {
      btn.className = "tdvr-live-badge in-sync";
      const dot = document.createElement("span");
      dot.className = "tdvr-radar-dot";
      const label = document.createElement("span");
      label.className = "tdvr-live-label";
      label.textContent = "LIVE";
      btn.append(dot, label);
      btn.title = "Live Edge (In Sync)";
    }
  }

  function jumpToLive() {
    // Click Twitch's native "Skip to Live" button
    const nativeSkipBtn = document.querySelector(
      'button[aria-label="Skip to Live"], [data-a-target="player-live-badge"], [data-a-target="player-skip-to-live-button"], [data-a-target="player-live-button"], .live-indicator-container button, .live-indicator, .video-player__live-indicator'
    );
    if (nativeSkipBtn) {
      try { nativeSkipBtn.click(); } catch (e) { }
    } else {
      const seekbar = getSeekbarElement();
      if (seekbar) {
        const rect = seekbar.getBoundingClientRect();
        const clientX = Math.round(rect.right - 1);
        const clientY = Math.round(rect.top + rect.height / 2);
        const opts = { bubbles: true, cancelable: true, composed: true, view: window, clientX, clientY, button: 0, buttons: 1 };
        try {
          seekbar.dispatchEvent(new PointerEvent("pointerdown", { ...opts, pointerId: 1, pointerType: "mouse", isPrimary: true }));
          seekbar.dispatchEvent(new MouseEvent("mousedown", opts));
          seekbar.dispatchEvent(new PointerEvent("pointerup", { ...opts, buttons: 0 }));
          seekbar.dispatchEvent(new MouseEvent("mouseup", { ...opts, buttons: 0 }));
          seekbar.dispatchEvent(new MouseEvent("click", { ...opts, buttons: 0 }));
        } catch (e) { }
      }
    }

    setPlaybackSpeed(1.0);

    const liveBtn = document.getElementById("tdvr-live-badge");
    if (liveBtn) {
      renderLiveBadgeDOM(liveBtn, false);
    }

    showHud("Live");
  }

  function setPlaybackSpeed(speed) {
    targetSpeed = speed;
    const video = getActiveVideo();
    if (video) {
      video.playbackRate = speed;
    }

    const triggerText = document.getElementById("tdvr-speed-trigger-text");
    if (triggerText) {
      triggerText.textContent = `${speed}x`;
    }

    document.querySelectorAll(".tdvr-speed-menu-item").forEach((item) => {
      const s = parseFloat(item.dataset.speed);
      if (Math.abs(s - speed) < 0.05) {
        item.classList.add("active");
      } else {
        item.classList.remove("active");
      }
    });

    const twitchMenuItemVal = document.getElementById("tdvr-twitch-settings-speed-val");
    if (twitchMenuItemVal) {
      twitchMenuItemVal.textContent = `${speed}x`;
    }

    showHud(`Speed: ${speed}x`);
  }

  function bindVideoEvents(video) {
    if (!video || video.__twitch_dvr_bound__) return;
    video.__twitch_dvr_bound__ = true;

    video.addEventListener("ratechange", () => {
      if (targetSpeed !== 1.0 && video.playbackRate !== targetSpeed) {
        const liveEdge = getLiveEdge(video);
        if (liveEdge && liveEdge - video.currentTime < 2) {
          setPlaybackSpeed(1.0);
        } else {
          video.playbackRate = targetSpeed;
        }
      }
    });

    let lastUpdateTick = 0;
    video.addEventListener("timeupdate", () => {
      const now = performance.now();
      if (now - lastUpdateTick < 1000) return;
      lastUpdateTick = now;
      updateLiveBadge(video);
    });

    video.addEventListener("playing", () => {
      if (settings.enabled && settings.enableClipButton !== false) {
        ensureStreamRecorder(video);
      }
    });
  }

  function updateLiveBadge(video) {
    const liveBtn = document.getElementById("tdvr-live-badge");
    if (!liveBtn) return;

    if (!video) {
      if (liveBtn.style.display !== "none") liveBtn.style.display = "none";
      return;
    }

    if (liveBtn.style.display !== "inline-flex") liveBtn.style.display = "inline-flex";

    const isRewound = checkIfRewound(video);

    if (isRewound !== lastRewoundState) {
      lastRewoundState = isRewound;
      renderLiveBadgeDOM(liveBtn, isRewound);
    }
  }

  function removeInjectedControls() {
    const centerControls = document.getElementById("tdvr-center-controls");
    if (centerControls) centerControls.remove();

    const speedMenu = document.getElementById("tdvr-speed-flyout");
    if (speedMenu) speedMenu.remove();

    const settingsRow = document.getElementById("tdvr-twitch-settings-speed-row");
    if (settingsRow) settingsRow.remove();

    const hud = document.getElementById("twitch-dvr-hud");
    if (hud) hud.remove();

    lastRewoundState = null;
  }

  // -------------------------------------------------------------
  // Speed Popup Flyout
  // -------------------------------------------------------------
  function closeSpeedFlyout() {
    const flyout = document.getElementById("tdvr-speed-flyout");
    if (flyout) flyout.classList.remove("visible");
  }

  function toggleSpeedFlyout(e) {
    if (e) e.stopPropagation();
    let flyout = document.getElementById("tdvr-speed-flyout");
    if (!flyout) {
      flyout = createSpeedFlyout();
      document.body.appendChild(flyout);
    }

    const triggerBtn = document.getElementById("tdvr-speed-trigger-btn");
    if (triggerBtn) {
      const rect = triggerBtn.getBoundingClientRect();
      flyout.style.left = `${Math.max(10, rect.left + rect.width / 2 - 85)}px`;
      flyout.style.bottom = `${window.innerHeight - rect.top + 8}px`;
    }

    flyout.classList.toggle("visible");
  }

  function createSpeedFlyout() {
    const flyout = document.createElement("div");
    flyout.id = "tdvr-speed-flyout";
    flyout.className = "tdvr-speed-flyout";

    const header = document.createElement("div");
    header.className = "tdvr-flyout-header";
    const headerTitle = document.createElement("span");
    headerTitle.textContent = "Playback Speed";
    const closeBtn = document.createElement("span");
    closeBtn.className = "tdvr-flyout-close";
    closeBtn.textContent = "×";
    closeBtn.addEventListener("click", closeSpeedFlyout);
    header.append(headerTitle, closeBtn);
    flyout.appendChild(header);

    const list = document.createElement("div");
    list.className = "tdvr-flyout-list";

    SPEED_OPTIONS.forEach((spd) => {
      const item = document.createElement("button");
      item.type = "button";
      item.className = `tdvr-speed-menu-item ${Math.abs(spd - targetSpeed) < 0.05 ? "active" : ""}`;
      item.dataset.speed = String(spd);
      const textSpan = document.createElement("span");
      textSpan.className = "tdvr-speed-text";
      textSpan.textContent = spd === 1.0 ? "Normal (1x)" : `${spd}x`;
      const checkSpan = document.createElement("span");
      checkSpan.className = "tdvr-speed-check";
      checkSpan.textContent = "✓";
      item.append(textSpan, checkSpan);
      item.addEventListener("click", (e) => {
        e.stopPropagation();
        setPlaybackSpeed(spd);
        closeSpeedFlyout();
      });
      list.appendChild(item);
    });

    flyout.appendChild(list);
    return flyout;
  }

  document.addEventListener("click", (e) => {
    if (!e.target.closest("#tdvr-speed-flyout") && !e.target.closest("#tdvr-speed-trigger-btn")) {
      closeSpeedFlyout();
    }
  });

  document.addEventListener(
    "click",
    (e) => {
      const gearBtn = e.target.closest('[data-a-target="player-settings-button"], .player-settings-button');
      if (gearBtn) {
        setTimeout(injectIntoTwitchSettingsMenu, 60);
      }
    },
    true
  );

  function injectIntoTwitchSettingsMenu() {
    if (settings.enableSpeedButton === false) return;
    const twitchMenu = document.querySelector('[data-a-target="player-settings-menu"], .player-settings-menu');
    if (!twitchMenu || document.getElementById("tdvr-twitch-settings-speed-row")) return;

    if (twitchMenu.querySelector('[data-a-target="player-settings-menu-item-speed"]')) return;

    const speedRow = document.createElement("div");
    speedRow.id = "tdvr-twitch-settings-speed-row";
    speedRow.className = "tdvr-twitch-menu-row";

    const menuBtn = document.createElement("div");
    menuBtn.className = "tdvr-twitch-menu-btn";

    const menuLeft = document.createElement("div");
    menuLeft.className = "tdvr-twitch-menu-left";

    const clockSvg = createSvgElement("svg", {
      width: "15",
      height: "15",
      viewBox: "0 0 24 24",
      fill: "none",
      stroke: "currentColor",
      "stroke-width": "2",
      "stroke-linecap": "round",
      "stroke-linejoin": "round",
    });
    const circle = createSvgElement("circle", { cx: "12", cy: "12", r: "10" });
    const polyline = createSvgElement("polyline", { points: "12 6 12 12 16 14" });
    clockSvg.append(circle, polyline);

    const titleSpan = document.createElement("span");
    titleSpan.textContent = "Playback Speed (DVR)";
    menuLeft.append(clockSvg, titleSpan);

    const menuRight = document.createElement("div");
    menuRight.className = "tdvr-twitch-menu-right";

    const valSpan = document.createElement("span");
    valSpan.id = "tdvr-twitch-settings-speed-val";
    valSpan.textContent = `${targetSpeed}x`;

    const chevronSvg = createSvgElement("svg", {
      width: "14",
      height: "14",
      viewBox: "0 0 24 24",
      fill: "none",
      stroke: "currentColor",
      "stroke-width": "2",
    });
    const chevronPolyline = createSvgElement("polyline", { points: "9 18 15 12 9 6" });
    chevronSvg.append(chevronPolyline);

    menuRight.append(valSpan, chevronSvg);
    menuBtn.append(menuLeft, menuRight);
    speedRow.appendChild(menuBtn);

    speedRow.addEventListener("click", (e) => {
      e.stopPropagation();
      toggleSpeedFlyout(e);
    });

    const qualityItem = twitchMenu.querySelector('[data-a-target="player-settings-menu-item-quality"]')?.parentElement;
    if (qualityItem && qualityItem.parentElement) {
      qualityItem.parentElement.insertBefore(speedRow, qualityItem.nextSibling);
    } else {
      twitchMenu.appendChild(speedRow);
    }
  }

  // -------------------------------------------------------------
  // Stream Recording & Quick Clip Engine (Unified & Retrospective)
  // -------------------------------------------------------------
  let activeMediaRecorder = null;
  let activeRecordedStream = null;
  let webmHeaderBytes = null;
  let rollingMediaChunks = []; // [{ time: number, data: Blob }]
  let recordingStartTime = 0;
  let recordingTimerInterval = null;
  let isRecordingLive = false;

  function getChannelName() {
    const parts = window.location.pathname.split("/").filter(Boolean);
    if (!parts.length) return "twitch";
    const reserved = ["directory", "videos", "p", "settings", "friends", "subscriptions", "inventory", "wallet", "messages"];
    if (reserved.includes(parts[0].toLowerCase())) return "twitch";
    return parts[0].toLowerCase();
  }

  function getVideoStream(video) {
    if (!video) return null;
    // Capture at stable 30fps to guarantee smooth hardware/software encoding without dropping frames in Firefox
    if (typeof video.captureStream === "function") {
      try {
        return video.captureStream(30);
      } catch (e) { }
    }
    if (typeof video.mozCaptureStream === "function") {
      try {
        return video.mozCaptureStream(30);
      } catch (e) { }
    }
    return null;
  }

  function getSupportedMimeType() {
    // Prioritize clean, widely supported codecs in Firefox
    const types = [
      "video/webm;codecs=vp8,opus",
      "video/webm;codecs=h264,opus",
      "video/webm",
      "video/mp4",
    ];
    for (const t of types) {
      if (typeof MediaRecorder !== "undefined" && MediaRecorder.isTypeSupported(t)) {
        return t;
      }
    }
    return "";
  }

  function getRecordingElapsedText() {
    if (!recordingStartTime) return "REC";
    const elapsedSec = Math.floor((Date.now() - recordingStartTime) / 1000);
    const mins = String(Math.floor(elapsedSec / 60)).padStart(2, "0");
    const secs = String(elapsedSec % 60).padStart(2, "0");
    return `${mins}:${secs}`;
  }

  function broadcastRecordingStatus(isRecording, elapsed) {
    try {
      chrome.runtime.sendMessage({
        type: "TDVR_RECORD_STATUS",
        isRecording,
        elapsed: elapsed || getRecordingElapsedText(),
      });
    } catch (e) { }
  }

  function updateRecButtonState() {
    const recBtn = document.getElementById("tdvr-record-button");
    const recText = document.getElementById("tdvr-rec-text");
    if (!recBtn || !recText) return;

    if (isRecordingLive) {
      recBtn.classList.add("recording");
      recBtn.title = "Stop Live Recording";
      recText.textContent = getRecordingElapsedText();
    } else {
      recBtn.classList.remove("recording");
      recBtn.title = "Start Live Recording";
      recText.textContent = "REC";
    }
  }

  function cleanupStreamRecorder() {
    if (activeMediaRecorder && activeMediaRecorder.state !== "inactive") {
      try { activeMediaRecorder.stop(); } catch (e) { }
    }
    activeMediaRecorder = null;

    if (activeRecordedStream) {
      try {
        activeRecordedStream.getTracks().forEach((t) => t.stop());
      } catch (e) { }
      activeRecordedStream = null;
    }

    webmHeaderBytes = null;
    rollingMediaChunks = [];
  }

  // -------------------------------------------------------------
  // Dedicated Live Session Recorder (Fallback for unarchived streams)
  // -------------------------------------------------------------
  let liveSessionRecorder = null;
  let liveSessionChunks = [];
  let liveSessionStream = null;

  function startDedicatedLiveRecorder(video) {
    cleanupDedicatedLiveRecorder();
    const v = video || getActiveVideo();
    if (!v) return;

    const stream = getVideoStream(v);
    if (!stream) return;
    liveSessionStream = stream;

    const mime = getSupportedMimeType();
    const videoBps = settings.recordingBitrate || 6000000;
    const options = {
      videoBitsPerSecond: videoBps,
      audioBitsPerSecond: 160000,
    };
    if (mime) options.mimeType = mime;

    try {
      liveSessionRecorder = new MediaRecorder(stream, options);
    } catch (e) {
      try {
        liveSessionRecorder = new MediaRecorder(stream);
      } catch (err) {
        liveSessionRecorder = null;
        return;
      }
    }

    liveSessionChunks = [];
    liveSessionRecorder.ondataavailable = (e) => {
      if (e.data && e.data.size > 0) {
        liveSessionChunks.push(e.data);
      }
    };
    liveSessionRecorder.start(1000);
  }

  function cleanupDedicatedLiveRecorder() {
    if (liveSessionRecorder && liveSessionRecorder.state !== "inactive") {
      try { liveSessionRecorder.stop(); } catch (e) { }
    }
    liveSessionRecorder = null;
    if (liveSessionStream) {
      try {
        liveSessionStream.getTracks().forEach((t) => t.stop());
      } catch (e) { }
      liveSessionStream = null;
    }
    liveSessionChunks = [];
  }

  function saveDedicatedLiveRecording(elapsedSec) {
    if (!liveSessionChunks || liveSessionChunks.length === 0) {
      showHud("Recording empty");
      cleanupDedicatedLiveRecorder();
      return;
    }

    const durLabel = elapsedSec >= 60 ? `${Math.round(elapsedSec / 60)}m` : `${elapsedSec}s`;
    const mime = liveSessionRecorder?.mimeType || getSupportedMimeType() || "video/webm";
    const blob = new Blob(liveSessionChunks, { type: mime });
    const url = URL.createObjectURL(blob);
    const channel = getChannelName();
    const timestamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
    const ext = mime.includes("mp4") ? "mp4" : "webm";
    const filename = `TwitchDVR_${channel}_Recording_${durLabel}_${timestamp}.${ext}`;

    downloadMediaBlob(url, filename);
    showHud(`Saved ${durLabel} Recording`);
    cleanupDedicatedLiveRecorder();
  }

  function downloadMediaBlob(url, filename) {
    chrome.runtime.sendMessage(
      {
        type: "DOWNLOAD_MEDIA",
        url: url,
        filename: filename,
      },
      (res) => {
        if (!res?.success) {
          const a = document.createElement("a");
          a.href = url;
          a.download = filename;
          document.body.appendChild(a);
          a.click();
          a.remove();
        }
      }
    );
  }

  async function parseWebmHeader(firstBlob) {
    try {
      const buffer = await firstBlob.arrayBuffer();
      const bytes = new Uint8Array(buffer);
      // Search for WebM Cluster marker: 0x1F, 0x43, 0xB6, 0x75
      for (let i = 0; i <= bytes.length - 4; i++) {
        if (bytes[i] === 0x1f && bytes[i + 1] === 0x43 && bytes[i + 2] === 0xb6 && bytes[i + 3] === 0x75) {
          webmHeaderBytes = bytes.slice(0, i);
          return firstBlob.slice(i);
        }
      }
      webmHeaderBytes = bytes;
      return null;
    } catch (e) {
      webmHeaderBytes = firstBlob;
      return null;
    }
  }

  function ensureStreamRecorder(video) {
    const v = video || getActiveVideo();
    if (!v) return null;
    if (activeMediaRecorder && activeMediaRecorder.state === "recording") {
      return activeMediaRecorder;
    }

    cleanupStreamRecorder();

    const stream = getVideoStream(v);
    if (!stream) return null;
    activeRecordedStream = stream;

    const mime = getSupportedMimeType();
    const videoBps = settings.recordingBitrate || 6000000;
    const options = {
      videoBitsPerSecond: videoBps,
      audioBitsPerSecond: 160000,
    };
    if (mime) options.mimeType = mime;

    try {
      activeMediaRecorder = new MediaRecorder(stream, options);
    } catch (e) {
      try {
        activeMediaRecorder = new MediaRecorder(stream);
      } catch (err) {
        return null;
      }
    }

    webmHeaderBytes = null;
    rollingMediaChunks = [];

    activeMediaRecorder.ondataavailable = async (e) => {
      if (!e.data || e.data.size === 0) return;
      const now = Date.now();

      if (!webmHeaderBytes) {
        const cluster0 = await parseWebmHeader(e.data);
        if (cluster0 && cluster0.size > 0) {
          rollingMediaChunks.push({ time: now, data: cluster0 });
        }
        return;
      }

      rollingMediaChunks.push({ time: now, data: e.data });

      // Retain window: max clip duration + safety margin (up to 330 seconds)
      // If manual recording is currently active, do not discard chunks recorded since recordingStartTime
      const maxClipSec = Math.max(settings.clipDurationSeconds || 120, 300);
      const clipCutoff = now - (maxClipSec + 30) * 1000;
      const retainCutoff = (isRecordingLive && recordingStartTime > 0)
        ? Math.min(clipCutoff, recordingStartTime)
        : clipCutoff;

      while (rollingMediaChunks.length > 0 && rollingMediaChunks[0].time < retainCutoff) {
        rollingMediaChunks.shift();
      }
    };

    activeMediaRecorder.start(1000);
    return activeMediaRecorder;
  }

  function triggerLocalBufferClip(durSec) {
    const durLabel = durSec >= 60 ? `${Math.round(durSec / 60)}m` : `${durSec}s`;
    const v = getActiveVideo();
    if (!activeMediaRecorder || activeMediaRecorder.state !== "recording") {
      ensureStreamRecorder(v);
      showHud("Buffering clip... try again in a moment");
      return;
    }

    if (!webmHeaderBytes || rollingMediaChunks.length === 0) {
      showHud("Buffering clip... stream history starting");
      return;
    }

    const now = Date.now();
    const cutoff = now - (durSec * 1000);
    const selected = rollingMediaChunks.filter((item) => item.time >= cutoff);

    if (selected.length === 0) {
      showHud("Not enough stream history buffered yet");
      return;
    }

    const actualSec = Math.round(selected.length);
    const actualLabel = actualSec >= 60 ? `${Math.round(actualSec / 60)}m` : `${actualSec}s`;
    const mime = activeMediaRecorder.mimeType || getSupportedMimeType() || "video/webm";
    const chunks = [webmHeaderBytes, ...selected.map((item) => item.data)];
    const blob = new Blob(chunks, { type: mime });
    const url = URL.createObjectURL(blob);
    const channel = getChannelName();
    const timestamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
    const filename = `TwitchDVR_${channel}_Clip_Last_${actualLabel}_${timestamp}.webm`;

    downloadMediaBlob(url, filename);
    showHud(`Saved Last ${actualLabel} Clip`);
  }

  function formatTimeLabel(sec) {
    if (!sec || !isFinite(sec)) return "0s";
    const h = Math.floor(sec / 3600);
    const m = Math.floor((sec % 3600) / 60);
    const s = Math.floor(sec % 60);
    if (h > 0) return `${h}h${m.toString().padStart(2, "0")}m`;
    if (m > 0) return `${m}m${s.toString().padStart(2, "0")}s`;
    return `${s}s`;
  }

  window.addEventListener("message", (e) => {
    if (e.source !== window || !e.data) return;
    if (e.data.type === "TDVR_CLIP_PROGRESS") {
      const label = e.data.isRecording ? "recording" : "clip";
      showHud(`Downloading ${label}: ${e.data.percent}%`);
    } else if (e.data.type === "TDVR_CLIP_COMPLETE") {
      const durSec = e.data.actualDuration || settings.clipDurationSeconds || 120;
      const durLabel = durSec >= 60 ? `${Math.round(durSec / 60)}m` : `${durSec}s`;
      if (e.data.isRecording) {
        showHud(`Saved ${durLabel} Recording`);
      } else if (e.data.isRewound && e.data.targetEndTime) {
        showHud(`Saved ${durLabel} Clip at ${formatTimeLabel(e.data.targetEndTime)}`);
      } else {
        showHud(`Saved Last ${durLabel} Clip`);
      }
    } else if (e.data.type === "TDVR_CLIP_ERROR") {
      showHud(`Download failed: ${e.data.error || "Download error"}`, 4000);
    }
  });

  function triggerQuickClip(durationSeconds) {
    const durSec = durationSeconds || settings.clipDurationSeconds || 120;
    const durLabel = durSec >= 60 ? `${Math.round(durSec / 60)}m` : `${durSec}s`;
    const channel = getChannelName();
    const vodId = document.documentElement.dataset.twitchDvrVodId;

    const video = getActiveVideo();
    const isRewound = checkIfRewound(video);
    const liveEdge = getLiveEdge(video);
    const curr = (video && isFinite(video.currentTime)) ? video.currentTime : null;

    let offsetFromLive = null;
    if (curr !== null && liveEdge !== null && isFinite(liveEdge)) {
      offsetFromLive = Math.max(0, liveEdge - curr);
    } else if (curr !== null && video && isFinite(video.duration) && video.duration > 0 && video.duration < 1e7) {
      offsetFromLive = Math.max(0, video.duration - curr);
    }

    const playheadInfo = {
      isRewound,
      currentTime: curr,
      liveEdge,
      offsetFromLive,
    };

    console.log("[Twitch DVR] triggerQuickClip requested:", {
      channel,
      vodId,
      durSec,
      playheadInfo,
    });

    if (isRewound && curr !== null && curr > 0) {
      showHud(`Clipping ${durLabel} at ${formatTimeLabel(curr)}...`);
    } else {
      showHud(`Clipping last ${durLabel}...`);
    }

    chrome.runtime.sendMessage(
      {
        type: "FETCH_DVR_CLIP",
        channel: channel,
        vodId: vodId || undefined,
        durationSeconds: durSec,
        playheadInfo: playheadInfo,
      },
      (res) => {
        if (chrome.runtime.lastError) {
          console.error("[Twitch DVR] Runtime error fetching DVR clip:", chrome.runtime.lastError);
        }

        console.log("[Twitch DVR] FETCH_DVR_CLIP response:", res);

        if (res && res.success && Array.isArray(res.segmentUrls) && res.segmentUrls.length > 0) {
          // Delegate fetching and downloading to MAIN world (gql-hook.js) with Twitch origin to satisfy CORS
          window.postMessage(
            {
              type: "TDVR_DOWNLOAD_SERVER_CLIP",
              clipData: res,
            },
            "*"
          );
          return;
        }

        // Only fallback to local rolling buffer if we actually have at least 80% of requested duration buffered!
        const minRequiredChunks = Math.floor(durSec * 0.8);
        if (rollingMediaChunks.length >= minRequiredChunks) {
          showHud(`Server archive unavailable; saving local buffer (${durLabel})...`);
          triggerLocalBufferClip(durSec);
        } else {
          const errDetail = res?.error ? `Clip unavailable: ${res.error}` : "Stream archive unavailable on Twitch";
          showHud(errDetail, 4000);
        }
      }
    );
  }

  function startLiveRecording() {
    if (isRecordingLive) return;

    const v = getActiveVideo();
    isRecordingLive = true;
    recordingStartTime = Date.now();
    updateRecButtonState();

    // Start dedicated local recorder in background as fallback
    startDedicatedLiveRecorder(v);

    if (recordingTimerInterval) clearInterval(recordingTimerInterval);
    recordingTimerInterval = setInterval(() => {
      if (!isRecordingLive) return;
      updateRecButtonState();
      broadcastRecordingStatus(true, getRecordingElapsedText());
    }, 1000);

    broadcastRecordingStatus(true, "00:00");
    showHud("Live Recording Started");
  }

  function stopLiveRecording() {
    if (!isRecordingLive) return;

    const startTime = recordingStartTime;
    const elapsedSec = Math.max(1, Math.round((Date.now() - startTime) / 1000));
    const durLabel = elapsedSec >= 60 ? `${Math.round(elapsedSec / 60)}m` : `${elapsedSec}s`;

    isRecordingLive = false;
    recordingStartTime = 0;

    if (recordingTimerInterval) {
      clearInterval(recordingTimerInterval);
      recordingTimerInterval = null;
    }

    updateRecButtonState();
    broadcastRecordingStatus(false, "00:00");

    // Stop dedicated recorder to finalize data chunks
    if (liveSessionRecorder && liveSessionRecorder.state === "recording") {
      try { liveSessionRecorder.stop(); } catch (e) { }
    }

    const channel = getChannelName();
    const vodId = document.documentElement.dataset.twitchDvrVodId;

    const video = getActiveVideo();
    const isRewound = checkIfRewound(video);
    const liveEdge = getLiveEdge(video);
    const curr = (video && isFinite(video.currentTime)) ? video.currentTime : null;

    let offsetFromLive = null;
    if (curr !== null && liveEdge !== null && isFinite(liveEdge)) {
      offsetFromLive = Math.max(0, liveEdge - curr);
    } else if (curr !== null && video && isFinite(video.duration) && video.duration > 0 && video.duration < 1e7) {
      offsetFromLive = Math.max(0, video.duration - curr);
    }

    const playheadInfo = {
      isRewound,
      currentTime: curr,
      liveEdge,
      offsetFromLive,
    };

    showHud(`Saving ${durLabel} Recording...`);

    chrome.runtime.sendMessage(
      {
        type: "FETCH_DVR_CLIP",
        channel: channel,
        vodId: vodId || undefined,
        durationSeconds: elapsedSec,
        playheadInfo: playheadInfo,
        isRecording: true,
      },
      (res) => {
        if (chrome.runtime.lastError) {
          console.error("[Twitch DVR] Runtime error fetching DVR recording:", chrome.runtime.lastError);
        }

        if (res && res.success && Array.isArray(res.segmentUrls) && res.segmentUrls.length > 0) {
          cleanupDedicatedLiveRecorder();
          window.postMessage(
            {
              type: "TDVR_DOWNLOAD_SERVER_CLIP",
              clipData: res,
            },
            "*"
          );
          return;
        }

        // Fallback to local dedicated recorder if server DVR was unavailable
        saveDedicatedLiveRecording(elapsedSec);
      }
    );
  }

  // -------------------------------------------------------------
  // Centered Controls Injection
  // -------------------------------------------------------------
  let injectionScheduled = false;

  function scheduleInjection() {
    if (injectionScheduled) return;
    injectionScheduled = true;
    setTimeout(() => {
      injectionScheduled = false;
      injectControls();
    }, 300);
  }

  function injectControls() {
    if (!settings.enabled || !settings.enablePlayerButtons) return;

    const video = getActiveVideo();
    if (video) bindVideoEvents(video);

    // Find the bottom player controls row container
    const leftGroup = document.querySelector(".player-controls__left-control-group");
    const controlsRow =
      leftGroup?.parentElement ||
      document.querySelector('[data-a-target="player-controls"]') ||
      document.querySelector(".player-controls");

    if (controlsRow && !document.getElementById("tdvr-center-controls")) {
      // Ensure the controls row is position: relative so absolute center works
      if (getComputedStyle(controlsRow).position === "static") {
        controlsRow.style.position = "relative";
      }

      const centerWrap = document.createElement("div");
      centerWrap.id = "tdvr-center-controls";
      centerWrap.className = "tdvr-center-controls";

      // Dynamic In-Player Rewind Buttons (defaults: 1m and 5m, plus any checked in popup)
      const rewindConfig = settings.rewindButtons || { "1m": true, "5m": true };
      const activeIntervals = REWIND_INTERVALS.filter((item) => rewindConfig[item.key]);

      activeIntervals.forEach((item) => {
        const btn = document.createElement("button");
        btn.type = "button";
        btn.className = "tdvr-icon-btn";
        btn.title = `Rewind ${item.title}`;

        const svg = createSvgElement("svg", {
          width: "13",
          height: "13",
          viewBox: "0 0 24 24",
          fill: "none",
          stroke: "currentColor",
          "stroke-width": "2.4",
          "stroke-linecap": "round",
          "stroke-linejoin": "round",
        });
        const polyA = createSvgElement("polygon", { points: "11 19 2 12 11 5 11 19" });
        const polyB = createSvgElement("polygon", { points: "22 19 13 12 22 5 22 19" });
        svg.append(polyA, polyB);

        const label = document.createElement("span");
        label.className = "tdvr-btn-label";
        label.textContent = item.label;
        btn.append(svg, label);

        btn.addEventListener("click", (e) => {
          e.stopPropagation();
          seekRelative(-item.seconds);
        });

        centerWrap.appendChild(btn);
      });

      // Live / Go Live Badge
      const liveBadge = document.createElement("button");
      liveBadge.type = "button";
      liveBadge.id = "tdvr-live-badge";
      renderLiveBadgeDOM(liveBadge, false);
      liveBadge.addEventListener("click", (e) => {
        e.stopPropagation();
        jumpToLive();
      });

      // Dynamic In-Player Forward Buttons (defaults: 1m and 5m, plus any checked in popup)
      const forwardConfig = settings.forwardButtons || { "1m": true, "5m": true };
      const activeForward = FORWARD_INTERVALS.filter((item) => forwardConfig[item.key]);

      const forwardButtons = [];
      activeForward.forEach((item) => {
        const btn = document.createElement("button");
        btn.type = "button";
        btn.className = "tdvr-icon-btn";
        btn.title = `Forward ${item.title}`;

        const label = document.createElement("span");
        label.className = "tdvr-btn-label";
        label.textContent = item.label;

        const svg = createSvgElement("svg", {
          width: "13",
          height: "13",
          viewBox: "0 0 24 24",
          fill: "none",
          stroke: "currentColor",
          "stroke-width": "2.4",
          "stroke-linecap": "round",
          "stroke-linejoin": "round",
        });
        const polyA = createSvgElement("polygon", { points: "13 19 22 12 13 5 13 19" });
        const polyB = createSvgElement("polygon", { points: "2 19 11 12 2 5 2 19" });
        svg.append(polyB, polyA);

        btn.append(label, svg);

        btn.addEventListener("click", (e) => {
          e.stopPropagation();
          seekRelative(item.seconds);
        });

        forwardButtons.push(btn);
      });

      // Compact Speed Trigger Button
      const speedTrigger = document.createElement("button");
      speedTrigger.type = "button";
      speedTrigger.id = "tdvr-speed-trigger-btn";
      speedTrigger.className = "tdvr-speed-trigger";
      speedTrigger.title = "Playback Speed. Click to choose multiplier (0.5x - 2x).";

      const speedSvg = createSvgElement("svg", {
        width: "14",
        height: "14",
        viewBox: "0 0 24 24",
        fill: "none",
        stroke: "currentColor",
        "stroke-width": "2.2",
        "stroke-linecap": "round",
        "stroke-linejoin": "round",
      });
      const speedCircle = createSvgElement("circle", { cx: "12", cy: "12", r: "10" });
      const speedPoly = createSvgElement("polyline", { points: "12 6 12 12 16 14" });
      speedSvg.append(speedCircle, speedPoly);

      const speedText = document.createElement("span");
      speedText.id = "tdvr-speed-trigger-text";
      speedText.textContent = `${targetSpeed}x`;
      speedTrigger.append(speedSvg, speedText);

      speedTrigger.addEventListener("click", toggleSpeedFlyout);

      // Centered layout:
      // [Rewind Buttons] -> [LIVE Badge] -> [Forward Buttons] -> <50px Gap> -> [Clip Button] -> [REC Button] -> <50px Gap> -> [Speed Trigger]
      centerWrap.appendChild(liveBadge);
      forwardButtons.forEach((btn) => centerWrap.appendChild(btn));

      // Quick Clip Button
      const clipButton = document.createElement("button");
      clipButton.type = "button";
      clipButton.id = "tdvr-clip-button";
      clipButton.className = "tdvr-clip-btn";
      const clipDurSec = settings.clipDurationSeconds || 120;
      const clipDurLabel = clipDurSec >= 60 ? `${Math.round(clipDurSec / 60)}m` : `${clipDurSec}s`;
      clipButton.title = `Quick Clip: Save last ${clipDurLabel}`;

      const clipSvg = createSvgElement("svg", {
        width: "12",
        height: "12",
        viewBox: "0 0 24 24",
        fill: "none",
        stroke: "currentColor",
        "stroke-width": "2.2",
        "stroke-linecap": "round",
        "stroke-linejoin": "round",
      });
      const clipPath1 = createSvgElement("path", { d: "M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" });
      const clipPath2 = createSvgElement("polyline", { points: "7 10 12 15 17 10" });
      const clipPath3 = createSvgElement("line", { x1: "12", y1: "15", x2: "12", y2: "3" });
      clipSvg.append(clipPath1, clipPath2, clipPath3);

      const clipText = document.createElement("span");
      clipText.id = "tdvr-clip-text";
      clipText.textContent = `Clip ${clipDurLabel}`;
      clipButton.append(clipSvg, clipText);

      clipButton.addEventListener("click", (e) => {
        e.stopPropagation();
        triggerQuickClip(settings.clipDurationSeconds || 120);
      });

      // Live Record Button
      const recordButton = document.createElement("button");
      recordButton.type = "button";
      recordButton.id = "tdvr-record-button";
      recordButton.className = isRecordingLive ? "tdvr-rec-btn recording" : "tdvr-rec-btn";
      recordButton.title = isRecordingLive ? "Stop Live Recording" : "Start Live Recording";

      const recDot = document.createElement("span");
      recDot.className = "tdvr-rec-dot";

      const recText = document.createElement("span");
      recText.id = "tdvr-rec-text";
      recText.textContent = isRecordingLive ? getRecordingElapsedText() : "REC";
      recordButton.append(recDot, recText);

      recordButton.addEventListener("click", (e) => {
        e.stopPropagation();
        if (isRecordingLive) {
          stopLiveRecording();
        } else {
          startLiveRecording();
        }
      });

      // Capture Group: Apply 50px gap (size of 1x button) to first visible capture button
      let firstCaptureButton = null;
      if (settings.enableClipButton !== false) {
        firstCaptureButton = clipButton;
        centerWrap.appendChild(clipButton);
      }
      if (settings.enableRecordButton !== false) {
        if (!firstCaptureButton) firstCaptureButton = recordButton;
        centerWrap.appendChild(recordButton);
      }
      if (firstCaptureButton) {
        firstCaptureButton.classList.add("tdvr-group-gap");
      }

      // Compact Speed Trigger Button (placed to the right of record button with matching 50px gap)
      if (settings.enableSpeedButton !== false) {
        speedTrigger.classList.add("tdvr-group-gap");
        centerWrap.appendChild(speedTrigger);
      }

      controlsRow.appendChild(centerWrap);
      lastRewoundState = null;
    }

    if (video) {
      updateLiveBadge(video);
      if (settings.enabled && settings.enableClipButton !== false) {
        ensureStreamRecorder(video);
      }
    }
  }

  // Keyboard Shortcuts Handler
  window.addEventListener(
    "keydown",
    (e) => {
      // NEVER intercept native browser shortcuts (Ctrl+R reload, Ctrl+W close tab, Alt+Left, etc.)
      if (e.ctrlKey || e.altKey || e.metaKey) return;
      if (!settings.enabled || !settings.enableHotkeys) return;

      const activeEl = document.activeElement;
      if (
        activeEl &&
        (activeEl.tagName === "INPUT" ||
          activeEl.tagName === "TEXTAREA" ||
          activeEl.isContentEditable ||
          activeEl.getAttribute("role") === "textbox" ||
          (activeEl.closest && activeEl.closest('[contenteditable="true"], [role="textbox"], .chat-input, [data-a-target="chat-input"]')))
      ) {
        return;
      }

      const step = settings.seekStepSeconds || 10;

      if (e.code === "KeyJ" || (!e.shiftKey && e.code === "ArrowLeft")) {
        e.preventDefault();
        seekRelative(-step);
      } else if ((!e.shiftKey && e.code === "KeyL") || (!e.shiftKey && e.code === "ArrowRight")) {
        e.preventDefault();
        seekRelative(step);
      } else if (e.shiftKey && e.code === "ArrowLeft") {
        e.preventDefault();
        seekRelative(-30);
      } else if (e.shiftKey && e.code === "ArrowRight") {
        e.preventDefault();
        seekRelative(30);
      } else if ((e.shiftKey && e.code === "KeyL") || e.code === "Digit0") {
        e.preventDefault();
        jumpToLive();
      } else if (e.code === "BracketLeft") {
        e.preventDefault();
        let idx = SPEED_OPTIONS.indexOf(targetSpeed);
        if (idx === -1) idx = 2;
        const newSpeed = SPEED_OPTIONS[Math.max(0, idx - 1)];
        setPlaybackSpeed(newSpeed);
      } else if (e.code === "BracketRight") {
        e.preventDefault();
        let idx = SPEED_OPTIONS.indexOf(targetSpeed);
        if (idx === -1) idx = 2;
        const newSpeed = SPEED_OPTIONS[Math.min(SPEED_OPTIONS.length - 1, idx + 1)];
        setPlaybackSpeed(newSpeed);
      } else if (e.code === "KeyC") {
        e.preventDefault();
        triggerQuickClip(settings.clipDurationSeconds || 120);
      } else if (e.code === "KeyR") {
        e.preventDefault();
        if (isRecordingLive) {
          stopLiveRecording();
        } else {
          startLiveRecording();
        }
      }
    },
    true
  );

  // Runtime message handler from popup
  chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
    if (msg?.type === "TDVR_TRIGGER_CLIP") {
      triggerQuickClip(msg.duration || settings.clipDurationSeconds || 120);
      sendResponse({ success: true });
      return true;
    }
    if (msg?.type === "TDVR_TOGGLE_RECORD") {
      if (isRecordingLive) {
        stopLiveRecording();
      } else {
        startLiveRecording();
      }
      sendResponse({ success: true, isRecording: isRecordingLive });
      return true;
    }
    if (msg?.type === "TDVR_GET_RECORD_STATUS") {
      sendResponse({
        isRecording: isRecordingLive,
        elapsed: getRecordingElapsedText(),
      });
      return true;
    }
  });

  window.addEventListener("popstate", scheduleInjection);
  setInterval(() => {
    if (settings.enabled && settings.enablePlayerButtons && !document.getElementById("tdvr-center-controls")) {
      scheduleInjection();
    }
  }, 1500);

  scheduleInjection();
})();
