// player-controls.js
// Twitch DVR - In-player controls:
// - All DVR controls (<< 10s, << 30s, Speed, and Live badge) centered in the bottom popup player controls bar
// - Compact speed control with popup flyout
// - Clean LIVE / GO LIVE badge without timestamps
(function () {
  let settings = {
    enabled: true,
    enablePlayerButtons: true,
    enableHotkeys: true,
    seekStepSeconds: 10,
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
        enableHotkeys: true,
        seekStepSeconds: 10,
      },
      (res) => {
        settings = { ...settings, ...res };
        if (!settings.enabled || !settings.enablePlayerButtons) {
          removeInjectedControls();
        } else {
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
      if (video.buffered && video.buffered.length > 0) {
        const bufEnd = video.buffered.end(video.buffered.length - 1);
        if (isFinite(bufEnd) && bufEnd > 0 && bufEnd < 1e7) return bufEnd;
      }
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

  function showHud(text) {
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
    hudTimeout = setTimeout(() => {
      hud.classList.remove("visible");
    }, 1100);
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
  function seekRelative(deltaSeconds) {
    const isRewound = Boolean(document.querySelector('button[aria-label="Skip to Live"]'));
    const video = getActiveVideo();

    if (isRewound && video && isFinite(video.currentTime)) {
      // Already in DVR mode: direct relative seek
      const liveEdge = getLiveEdge(video);
      const maxTime = liveEdge && isFinite(liveEdge) ? liveEdge : (isFinite(video.duration) && video.duration < 1e7 ? video.duration : video.currentTime);
      video.currentTime = Math.max(0, Math.min(maxTime, video.currentTime + deltaSeconds));
      setTimeout(() => updateLiveBadge(video), 50);

      const symbol = deltaSeconds < 0 ? "«" : "»";
      showHud(`${symbol} ${Math.abs(deltaSeconds)}s`);
      return;
    }

    // At live edge: transition Twitch player into DVR mode at the live edge, then apply delta
    const seekbar = getSeekbarElement();
    if (seekbar) {
      const rect = seekbar.getBoundingClientRect();
      const clientX = Math.round(rect.right - 1);
      const clientY = Math.round(rect.top + rect.height / 2);
      const hit = document.elementFromPoint(clientX, clientY) || seekbar;
      const opts = { bubbles: true, cancelable: true, composed: true, view: window, clientX, clientY, button: 0, buttons: 1 };
      try {
        hit.dispatchEvent(new PointerEvent("pointerdown", { ...opts, pointerId: 1, pointerType: "mouse", isPrimary: true }));
        hit.dispatchEvent(new MouseEvent("mousedown", opts));
        hit.dispatchEvent(new PointerEvent("pointerup", { ...opts, buttons: 0 }));
        hit.dispatchEvent(new MouseEvent("mouseup", { ...opts, buttons: 0 }));
        hit.dispatchEvent(new MouseEvent("click", { ...opts, buttons: 0 }));
      } catch (e) { }

      setTimeout(() => {
        const vid = getActiveVideo();
        if (vid && isFinite(vid.currentTime)) {
          vid.currentTime = Math.max(0, vid.currentTime + deltaSeconds);
          updateLiveBadge(vid);
        }
      }, 250);

      const symbol = deltaSeconds < 0 ? "«" : "»";
      showHud(`${symbol} ${Math.abs(deltaSeconds)}s`);
      return;
    }

    if (video && isFinite(video.currentTime)) {
      video.currentTime = Math.max(0, video.currentTime + deltaSeconds);
      const symbol = deltaSeconds < 0 ? "«" : "»";
      showHud(`${symbol} ${Math.abs(deltaSeconds)}s`);
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
      'button[aria-label="Skip to Live"], [data-a-target="player-live-badge"], .live-indicator, .video-player__live-indicator'
    );
    if (nativeSkipBtn) {
      try { nativeSkipBtn.click(); } catch (e) { }
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
  }

  function updateLiveBadge(video) {
    const liveBtn = document.getElementById("tdvr-live-badge");
    if (!liveBtn) return;

    if (!video) {
      if (liveBtn.style.display !== "none") liveBtn.style.display = "none";
      return;
    }

    if (liveBtn.style.display !== "inline-flex") liveBtn.style.display = "inline-flex";

    let isRewound = Boolean(document.querySelector('button[aria-label="Skip to Live"]'));
    if (!isRewound) {
      const liveEdge = getLiveEdge(video);
      if (liveEdge && isFinite(liveEdge)) {
        const latency = liveEdge - video.currentTime;
        isRewound = isFinite(latency) && latency > 4 && latency < 86400;
      } else if (isFinite(video.duration) && video.duration > 0 && video.duration < 1e7) {
        const latency = video.duration - video.currentTime;
        isRewound = isFinite(latency) && latency > 4;
      }
    }

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

      const step = settings.seekStepSeconds || 10;

      // 1. Rewind Button 1 (<< 10s)
      const btn1 = document.createElement("button");
      btn1.type = "button";
      btn1.className = "tdvr-icon-btn";
      btn1.title = `Rewind ${step}s (J or Left Arrow)`;

      const svg1 = createSvgElement("svg", {
        width: "13",
        height: "13",
        viewBox: "0 0 24 24",
        fill: "none",
        stroke: "currentColor",
        "stroke-width": "2.4",
        "stroke-linecap": "round",
        "stroke-linejoin": "round",
      });
      const poly1a = createSvgElement("polygon", { points: "11 19 2 12 11 5 11 19" });
      const poly1b = createSvgElement("polygon", { points: "22 19 13 12 22 5 22 19" });
      svg1.append(poly1a, poly1b);

      const label1 = document.createElement("span");
      label1.className = "tdvr-btn-label";
      label1.textContent = `${step}s`;
      btn1.append(svg1, label1);

      btn1.addEventListener("click", (e) => {
        e.stopPropagation();
        seekRelative(-step);
      });

      // 2. Rewind Button 2 (<< 30s)
      const btn2 = document.createElement("button");
      btn2.type = "button";
      btn2.className = "tdvr-icon-btn";
      btn2.title = "Rewind 30s (Shift + Left Arrow)";

      const svg2 = createSvgElement("svg", {
        width: "13",
        height: "13",
        viewBox: "0 0 24 24",
        fill: "none",
        stroke: "currentColor",
        "stroke-width": "2.4",
        "stroke-linecap": "round",
        "stroke-linejoin": "round",
      });
      const poly2a = createSvgElement("polygon", { points: "11 19 2 12 11 5 11 19" });
      const poly2b = createSvgElement("polygon", { points: "22 19 13 12 22 5 22 19" });
      svg2.append(poly2a, poly2b);

      const label2 = document.createElement("span");
      label2.className = "tdvr-btn-label";
      label2.textContent = "30s";
      btn2.append(svg2, label2);

      btn2.addEventListener("click", (e) => {
        e.stopPropagation();
        seekRelative(-30);
      });

      // 3. Compact Speed Trigger Button
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

      // 4. Live / Go Live Badge
      const liveBadge = document.createElement("button");
      liveBadge.type = "button";
      liveBadge.id = "tdvr-live-badge";
      renderLiveBadgeDOM(liveBadge, false);
      liveBadge.addEventListener("click", (e) => {
        e.stopPropagation();
        jumpToLive();
      });

      // Centered layout: << 10s -> << 30s -> Live -> Speed (1x)
      centerWrap.appendChild(btn1);
      centerWrap.appendChild(btn2);
      centerWrap.appendChild(liveBadge);
      centerWrap.appendChild(speedTrigger);

      controlsRow.appendChild(centerWrap);
      lastRewoundState = null;
    }

    if (video) updateLiveBadge(video);
  }

  // Keyboard Shortcuts Handler
  window.addEventListener(
    "keydown",
    (e) => {
      if (!settings.enabled || !settings.enableHotkeys) return;

      const activeEl = document.activeElement;
      if (
        activeEl &&
        (activeEl.tagName === "INPUT" ||
          activeEl.tagName === "TEXTAREA" ||
          activeEl.isContentEditable ||
          activeEl.getAttribute("role") === "textbox")
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
      }
    },
    true
  );

  window.addEventListener("popstate", scheduleInjection);
  setInterval(() => {
    if (!document.getElementById("tdvr-center-controls")) {
      scheduleInjection();
    }
  }, 1500);

  scheduleInjection();
})();
