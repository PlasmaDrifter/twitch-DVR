document.addEventListener("DOMContentLoaded", async () => {
  const toggle = document.getElementById("toggle-enabled");
  const toggleIncognitoMode = document.getElementById("toggle-incognito-mode");
  const incognitoModeCard = document.getElementById("incognito-mode-card");
  const togglePlayerButtons = document.getElementById("toggle-player-buttons");
  const playerButtonsCard = document.getElementById("player-buttons-card");
  const toggleSpeedButton = document.getElementById("toggle-speed-button");
  const speedButtonCard = document.getElementById("speed-button-card");
  const toggleHotkeys = document.getElementById("toggle-hotkeys");
  const hotkeysCard = document.getElementById("hotkeys-card");
  const seekStepCard = document.getElementById("seek-step-card");
  const stepChips = document.querySelectorAll(".step-chip");
  const rewindButtonsCard = document.getElementById("rewind-buttons-card");
  const rewindInputs = document.querySelectorAll("#rewind-buttons-card input");
  const forwardButtonsCard = document.getElementById("forward-buttons-card");
  const forwardInputs = document.querySelectorAll("#forward-buttons-card input");
  const shortcutsCard = document.getElementById("shortcuts-card");
  const toggleHomeAutoplay = document.getElementById("toggle-prevent-home-autoplay");
  const homeAutoplayCard = document.getElementById("home-autoplay-card");
  const reloadBtn = document.getElementById("reload-tab-btn");

  // Tabs
  const tabBtnControls = document.getElementById("tab-btn-controls");
  const tabBtnRecordings = document.getElementById("tab-btn-recordings");
  const tabBtnShortcuts = document.getElementById("tab-btn-shortcuts");
  const tabControls = document.getElementById("tab-controls");
  const tabRecordings = document.getElementById("tab-recordings");
  const tabShortcuts = document.getElementById("tab-shortcuts");

  // Recording & Clips Elements
  const toggleClipButton = document.getElementById("toggle-clip-button");
  const clipButtonCard = document.getElementById("clip-button-card");
  const clipDurationCard = document.getElementById("clip-duration-card");
  const clipChips = document.querySelectorAll("#clip-duration-card .clip-chip");
  const bitrateChips = document.querySelectorAll("#record-bitrate-chips .clip-chip");
  const btnSaveClipNow = document.getElementById("btn-save-clip-now");
  const saveClipBtnText = document.getElementById("save-clip-btn-text");

  const toggleRecordButton = document.getElementById("toggle-record-button");
  const recordButtonCard = document.getElementById("record-button-card");
  const recordActionCard = document.getElementById("record-action-card");
  const btnToggleRecordNow = document.getElementById("btn-toggle-record-now");
  const recordBtnText = document.getElementById("record-btn-text");
  const popupRecDot = document.getElementById("popup-rec-dot");
  const recordStatusRow = document.getElementById("record-status-row");
  const recordTimerText = document.getElementById("record-timer-text");

  const statusDot = document.getElementById("status-dot");
  const statusChannel = document.getElementById("status-channel");
  const statusSubtext = document.getElementById("status-subtext");

  let activeTwitchTabId = null;
  let isInitialized = false;
  let currentClipSec = 120;

  function switchTab(tabName) {
    const tabs = [
      { btn: tabBtnControls, panel: tabControls, name: "controls" },
      { btn: tabBtnRecordings, panel: tabRecordings, name: "recordings" },
      { btn: tabBtnShortcuts, panel: tabShortcuts, name: "shortcuts" },
    ];

    tabs.forEach((t) => {
      if (t.name === tabName) {
        t.btn?.classList.add("active");
        t.panel?.classList.add("active");
      } else {
        t.btn?.classList.remove("active");
        t.panel?.classList.remove("active");
      }
    });
  }

  if (tabBtnControls) tabBtnControls.addEventListener("click", () => switchTab("controls"));
  if (tabBtnRecordings) tabBtnRecordings.addEventListener("click", () => switchTab("recordings"));
  if (tabBtnShortcuts) tabBtnShortcuts.addEventListener("click", () => switchTab("shortcuts"));

  function updateDependencies(isEnabled) {
    const cards = [
      incognitoModeCard,
      playerButtonsCard,
      speedButtonCard,
      rewindButtonsCard,
      forwardButtonsCard,
      clipButtonCard,
      clipDurationCard,
      recordButtonCard,
      recordActionCard,
      hotkeysCard,
      seekStepCard,
      homeAutoplayCard,
      shortcutsCard,
    ];
    const inputs = [
      toggleIncognitoMode,
      togglePlayerButtons,
      toggleSpeedButton,
      toggleClipButton,
      toggleRecordButton,
      toggleHotkeys,
      toggleHomeAutoplay,
    ];

    cards.forEach((c) => {
      if (c) {
        if (isEnabled) c.classList.remove("disabled");
        else c.classList.add("disabled");
      }
    });

    inputs.forEach((inp) => {
      if (inp) inp.disabled = !isEnabled;
    });

    stepChips.forEach((chip) => {
      chip.disabled = !isEnabled;
    });

    clipChips.forEach((chip) => {
      chip.disabled = !isEnabled;
    });

    if (btnSaveClipNow) btnSaveClipNow.disabled = !isEnabled;
    if (btnToggleRecordNow) btnToggleRecordNow.disabled = !isEnabled;

    rewindInputs.forEach((inp) => {
      inp.disabled = !isEnabled;
    });

    forwardInputs.forEach((inp) => {
      inp.disabled = !isEnabled;
    });
  }

  function markNeedsReload() {
    if (!isInitialized) return;
    reloadBtn.classList.add("highlight");
    if (!reloadBtn.disabled) {
      reloadBtn.title = "Reload Twitch tab to apply changes";
    }
  }

  function clearNeedsReload() {
    reloadBtn.classList.remove("highlight");
    if (!reloadBtn.disabled) {
      reloadBtn.title = "Reload Twitch Tab";
    }
  }

  function renderStatus(status) {
    if (status && status.channel) {
      statusChannel.textContent = `Channel: ${status.channel}`;
      if (status.hasDvr) {
        statusDot.className = "status-dot active";
        statusSubtext.textContent = `Twitch DVR Ready (VOD #${status.vodId || "active"})`;
      } else {
        statusDot.className = "status-dot warn";
        statusSubtext.textContent = "Live stream detected (VOD archiving disabled by streamer)";
      }
    } else {
      statusDot.className = "status-dot";
      statusChannel.textContent = "No Live Stream Active";
      statusSubtext.textContent = "Open a live Twitch channel to use DVR & speeds";
    }
  }

  function setSelectedStep(step) {
    stepChips.forEach((chip) => {
      if (parseInt(chip.dataset.step, 10) === step) {
        chip.classList.add("active");
      } else {
        chip.classList.remove("active");
      }
    });
  }

  function setSelectedClipDuration(sec) {
    clipChips.forEach((chip) => {
      if (parseInt(chip.dataset.clipSec, 10) === sec) {
        chip.classList.add("active");
      } else {
        chip.classList.remove("active");
      }
    });
    const label = sec >= 60 ? `${Math.round(sec / 60)}m` : `${sec}s`;
    if (saveClipBtnText) {
      saveClipBtnText.textContent = `Save Last ${label} Clip Now`;
    }
  }

  function setSelectedBitrate(bps) {
    bitrateChips.forEach((chip) => {
      if (parseInt(chip.dataset.bitrate, 10) === bps) {
        chip.classList.add("active");
      } else {
        chip.classList.remove("active");
      }
    });
  }

  function updatePopupRecordingUI(isRecording, elapsed) {
    if (isRecording) {
      btnToggleRecordNow.classList.add("recording");
      if (recordBtnText) recordBtnText.textContent = "Stop & Save Recording";
      if (popupRecDot) popupRecDot.style.display = "inline-block";
      if (recordStatusRow) recordStatusRow.style.display = "flex";
      if (recordTimerText) recordTimerText.textContent = `Recording: ${elapsed || "00:00"}`;
    } else {
      btnToggleRecordNow.classList.remove("recording");
      if (recordBtnText) recordBtnText.textContent = "Start Live Recording";
      if (popupRecDot) popupRecDot.style.display = "none";
      if (recordStatusRow) recordStatusRow.style.display = "none";
    }
  }

  // 1. Load stored state
  const res = await chrome.storage.local.get({
    enabled: true,
    enableInIncognitoMode: true,
    preventHomeAutoplay: false,
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
    streamStatus: null,
  });

  toggle.checked = res.enabled !== false;
  toggleIncognitoMode.checked =
    res.enableInIncognitoMode !== undefined
      ? res.enableInIncognitoMode
      : res.workWithoutLogin !== undefined
        ? res.workWithoutLogin === true
        : true;
  togglePlayerButtons.checked = res.enablePlayerButtons !== false;
  toggleSpeedButton.checked = res.enableSpeedButton !== false;
  toggleClipButton.checked = res.enableClipButton !== false;
  toggleRecordButton.checked = res.enableRecordButton !== false;
  toggleHotkeys.checked = res.enableHotkeys !== false;
  toggleHomeAutoplay.checked = res.preventHomeAutoplay === true;

  const currentStep = res.seekStepSeconds || 10;
  setSelectedStep(currentStep);

  currentClipSec = res.clipDurationSeconds || 120;
  setSelectedClipDuration(currentClipSec);

  const currentBitrate = res.recordingBitrate || 8500000;
  setSelectedBitrate(currentBitrate);

  const savedRewind = res.rewindButtons || { "30s": false, "1m": true, "3m": false, "5m": true, "10m": false, "30m": false };
  rewindInputs.forEach((inp) => {
    const stepKey = inp.dataset.step;
    inp.checked = savedRewind[stepKey] === true;
  });

  const savedForward = res.forwardButtons || { "30s": false, "1m": true, "3m": false, "5m": true, "10m": false, "30m": false };
  forwardInputs.forEach((inp) => {
    const stepKey = inp.dataset.step;
    inp.checked = savedForward[stepKey] === true;
  });

  updateDependencies(toggle.checked);
  renderStatus(res.streamStatus);
  isInitialized = true;

  // 2. Event Listeners
  toggle.addEventListener("change", async () => {
    const isEnabled = toggle.checked;
    updateDependencies(isEnabled);
    await chrome.storage.local.set({ enabled: isEnabled });
    markNeedsReload();
  });

  toggleIncognitoMode.addEventListener("change", async () => {
    await chrome.storage.local.set({ enableInIncognitoMode: toggleIncognitoMode.checked });
    markNeedsReload();
  });

  togglePlayerButtons.addEventListener("change", async () => {
    await chrome.storage.local.set({ enablePlayerButtons: togglePlayerButtons.checked });
  });

  toggleSpeedButton.addEventListener("change", async () => {
    await chrome.storage.local.set({ enableSpeedButton: toggleSpeedButton.checked });
  });

  toggleClipButton.addEventListener("change", async () => {
    await chrome.storage.local.set({ enableClipButton: toggleClipButton.checked });
  });

  clipChips.forEach((chip) => {
    chip.addEventListener("click", async () => {
      const sec = parseInt(chip.dataset.clipSec, 10);
      currentClipSec = sec;
      setSelectedClipDuration(sec);
      await chrome.storage.local.set({ clipDurationSeconds: sec });
    });
  });

  bitrateChips.forEach((chip) => {
    chip.addEventListener("click", async () => {
      const bps = parseInt(chip.dataset.bitrate, 10);
      setSelectedBitrate(bps);
      await chrome.storage.local.set({ recordingBitrate: bps });
    });
  });

  btnSaveClipNow.addEventListener("click", async () => {
    if (!activeTwitchTabId) return;
    try {
      btnSaveClipNow.disabled = true;
      if (saveClipBtnText) saveClipBtnText.textContent = "Capturing Clip...";
      await chrome.tabs.sendMessage(activeTwitchTabId, {
        type: "TDVR_TRIGGER_CLIP",
        duration: currentClipSec,
      });
      setTimeout(() => {
        btnSaveClipNow.disabled = false;
        setSelectedClipDuration(currentClipSec);
      }, 1500);
    } catch (e) {
      btnSaveClipNow.disabled = false;
      setSelectedClipDuration(currentClipSec);
    }
  });

  toggleRecordButton.addEventListener("change", async () => {
    await chrome.storage.local.set({ enableRecordButton: toggleRecordButton.checked });
  });

  btnToggleRecordNow.addEventListener("click", async () => {
    if (!activeTwitchTabId) return;
    try {
      await chrome.tabs.sendMessage(activeTwitchTabId, {
        type: "TDVR_TOGGLE_RECORD",
      });
    } catch (e) { }
  });

  rewindInputs.forEach((inp) => {
    inp.addEventListener("change", async () => {
      const stepKey = inp.dataset.step;
      const data = await chrome.storage.local.get({
        rewindButtons: { "30s": false, "1m": true, "3m": false, "5m": true, "10m": false, "30m": false },
      });
      const current = data.rewindButtons || { "30s": false, "1m": true, "3m": false, "5m": true, "10m": false, "30m": false };
      current[stepKey] = inp.checked;
      await chrome.storage.local.set({ rewindButtons: current });
    });
  });

  forwardInputs.forEach((inp) => {
    inp.addEventListener("change", async () => {
      const stepKey = inp.dataset.step;
      const data = await chrome.storage.local.get({
        forwardButtons: { "30s": false, "1m": true, "3m": false, "5m": true, "10m": false, "30m": false },
      });
      const current = data.forwardButtons || { "30s": false, "1m": true, "3m": false, "5m": true, "10m": false, "30m": false };
      current[stepKey] = inp.checked;
      await chrome.storage.local.set({ forwardButtons: current });
    });
  });

  toggleHotkeys.addEventListener("change", async () => {
    await chrome.storage.local.set({ enableHotkeys: toggleHotkeys.checked });
  });

  stepChips.forEach((chip) => {
    chip.addEventListener("click", async () => {
      const stepVal = parseInt(chip.dataset.step, 10);
      setSelectedStep(stepVal);
      await chrome.storage.local.set({ seekStepSeconds: stepVal });
    });
  });

  toggleHomeAutoplay.addEventListener("change", async () => {
    await chrome.storage.local.set({ preventHomeAutoplay: toggleHomeAutoplay.checked });
    markNeedsReload();
  });

  // 3. Detect active Twitch tab
  async function findTwitchTab() {
    try {
      const activeTabs = await chrome.tabs.query({ active: true, currentWindow: true });
      if (activeTabs && activeTabs[0]?.url?.includes("twitch.tv")) {
        return activeTabs[0].id;
      }

      const winTabs = await chrome.tabs.query({ currentWindow: true, url: "*://*.twitch.tv/*" });
      if (winTabs && winTabs.length > 0) return winTabs[0].id;

      const allTabs = await chrome.tabs.query({ url: "*://*.twitch.tv/*" });
      if (allTabs && allTabs.length > 0) return allTabs[0].id;

      if (activeTabs && activeTabs[0]?.id) return activeTabs[0].id;
    } catch (e) { }
    return null;
  }

  activeTwitchTabId = await findTwitchTab();
  if (activeTwitchTabId) {
    reloadBtn.disabled = false;
    reloadBtn.title = "Reload Twitch Tab";

    // Query active tab for recording status
    try {
      chrome.tabs.sendMessage(activeTwitchTabId, { type: "TDVR_GET_RECORD_STATUS" }, (resp) => {
        if (resp && typeof resp.isRecording === "boolean") {
          updatePopupRecordingUI(resp.isRecording, resp.elapsed);
        }
      });
    } catch (e) { }
  } else {
    reloadBtn.disabled = true;
    reloadBtn.title = "No Twitch tab found";
  }

  // 4. Reload Button Handler
  function doReload(tabId) {
    chrome.tabs.reload(tabId);
    clearNeedsReload();

    reloadBtn.disabled = true;
    reloadBtn.textContent = "";

    const spinSvg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    spinSvg.setAttribute("class", "spin-icon");
    spinSvg.setAttribute("width", "14");
    spinSvg.setAttribute("height", "14");
    spinSvg.setAttribute("viewBox", "0 0 24 24");
    spinSvg.setAttribute("fill", "none");
    spinSvg.setAttribute("stroke", "currentColor");
    spinSvg.setAttribute("stroke-width", "2.5");
    spinSvg.setAttribute("stroke-linecap", "round");
    spinSvg.setAttribute("stroke-linejoin", "round");

    const spinPath = document.createElementNS("http://www.w3.org/2000/svg", "path");
    spinPath.setAttribute("d", "M21.5 2v6h-6M21.34 15.57a10 10 0 1 1-.57-8.38l5.67-5.67");
    spinSvg.appendChild(spinPath);
    reloadBtn.appendChild(spinSvg);

    setTimeout(() => {
      reloadBtn.textContent = "";
      const checkSvg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
      checkSvg.setAttribute("width", "14");
      checkSvg.setAttribute("height", "14");
      checkSvg.setAttribute("viewBox", "0 0 24 24");
      checkSvg.setAttribute("fill", "none");
      checkSvg.setAttribute("stroke", "#10b981");
      checkSvg.setAttribute("stroke-width", "2.5");
      checkSvg.setAttribute("stroke-linecap", "round");
      checkSvg.setAttribute("stroke-linejoin", "round");

      const polyline = document.createElementNS("http://www.w3.org/2000/svg", "polyline");
      polyline.setAttribute("points", "20 6 9 17 4 12");
      checkSvg.appendChild(polyline);
      reloadBtn.appendChild(checkSvg);

      setTimeout(() => {
        reloadBtn.textContent = "";
        const reloadSvg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
        reloadSvg.setAttribute("class", "reload-icon");
        reloadSvg.setAttribute("width", "14");
        reloadSvg.setAttribute("height", "14");
        reloadSvg.setAttribute("viewBox", "0 0 24 24");
        reloadSvg.setAttribute("fill", "none");
        reloadSvg.setAttribute("stroke", "currentColor");
        reloadSvg.setAttribute("stroke-width", "2.3");
        reloadSvg.setAttribute("stroke-linecap", "round");
        reloadSvg.setAttribute("stroke-linejoin", "round");

        const reloadPath = document.createElementNS("http://www.w3.org/2000/svg", "path");
        reloadPath.setAttribute("d", "M21.5 2v6h-6M21.34 15.57a10 10 0 1 1-.57-8.38l5.67-5.67");
        reloadSvg.appendChild(reloadPath);
        reloadBtn.appendChild(reloadSvg);
        reloadBtn.disabled = false;
      }, 800);
    }, 450);
  }

  reloadBtn.addEventListener("click", async () => {
    if (!activeTwitchTabId) {
      activeTwitchTabId = await findTwitchTab();
    }
    if (activeTwitchTabId) {
      doReload(activeTwitchTabId);
    }
  });

  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === "local" && changes.streamStatus) {
      renderStatus(changes.streamStatus.newValue);
    }
  });

  chrome.runtime.onMessage.addListener((msg) => {
    if (msg?.type === "TDVR_RECORD_STATUS") {
      updatePopupRecordingUI(msg.isRecording, msg.elapsed);
    }
  });
});
