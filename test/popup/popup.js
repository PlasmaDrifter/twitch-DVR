document.addEventListener("DOMContentLoaded", async () => {
  const toggle = document.getElementById("toggle-enabled");
  const toggleIncognitoMode = document.getElementById("toggle-incognito-mode");
  const incognitoModeCard = document.getElementById("incognito-mode-card");
  const togglePlayerButtons = document.getElementById("toggle-player-buttons");
  const playerButtonsCard = document.getElementById("player-buttons-card");
  const toggleHotkeys = document.getElementById("toggle-hotkeys");
  const hotkeysCard = document.getElementById("hotkeys-card");
  const seekStepCard = document.getElementById("seek-step-card");
  const stepChips = document.querySelectorAll(".step-chip");
  const toggleHomeAutoplay = document.getElementById("toggle-prevent-home-autoplay");
  const homeAutoplayCard = document.getElementById("home-autoplay-card");
  const reloadBtn = document.getElementById("reload-tab-btn");

  const statusDot = document.getElementById("status-dot");
  const statusChannel = document.getElementById("status-channel");
  const statusSubtext = document.getElementById("status-subtext");

  let activeTwitchTabId = null;
  let isInitialized = false;

  function updateDependencies(isEnabled) {
    const cards = [incognitoModeCard, playerButtonsCard, hotkeysCard, seekStepCard, homeAutoplayCard];
    const inputs = [toggleIncognitoMode, togglePlayerButtons, toggleHotkeys, toggleHomeAutoplay];

    cards.forEach((c) => {
      if (isEnabled) c.classList.remove("disabled");
      else c.classList.add("disabled");
    });

    inputs.forEach((inp) => {
      inp.disabled = !isEnabled;
    });

    stepChips.forEach((chip) => {
      chip.disabled = !isEnabled;
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

  // 1. Load stored state
  const res = await chrome.storage.local.get({
    enabled: true,
    enableInIncognitoMode: true,
    preventHomeAutoplay: false,
    enablePlayerButtons: true,
    enableHotkeys: true,
    seekStepSeconds: 10,
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
  toggleHotkeys.checked = res.enableHotkeys !== false;
  toggleHomeAutoplay.checked = res.preventHomeAutoplay === true;

  const currentStep = res.seekStepSeconds || 10;
  setSelectedStep(currentStep);

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
});
