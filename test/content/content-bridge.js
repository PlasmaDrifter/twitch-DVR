// content-bridge.js (ISOLATED world)
// Bridges chrome.storage to the MAIN world (gql-hook.js) and captures live status
(function () {
  const KEY_ENABLED = "twitch_rewind_enabled";
  const KEY_ENABLE_IN_INCOGNITO_MODE = "twitch_rewind_enable_in_incognito_mode";
  const KEY_PREVENT_HOME_AUTOPLAY = "twitch_rewind_prevent_home_autoplay";

  function syncConfig(res) {
    const isEnabled = res.enabled !== false;
    const enableInIncognitoMode =
      res.enableInIncognitoMode !== undefined
        ? res.enableInIncognitoMode !== false
        : res.workWithoutLogin !== undefined
          ? res.workWithoutLogin === true
          : true;
    const preventHomeAutoplay = res.preventHomeAutoplay === true;

    try {
      localStorage.setItem(KEY_ENABLED, String(isEnabled));
      localStorage.setItem(KEY_ENABLE_IN_INCOGNITO_MODE, String(enableInIncognitoMode));
      localStorage.setItem(KEY_PREVENT_HOME_AUTOPLAY, String(preventHomeAutoplay));
    } catch (e) { }

    window.postMessage(
      {
        type: "TWITCH_REWIND_CONFIG",
        enabled: isEnabled,
        enableInIncognitoMode: enableInIncognitoMode,
        workWithoutLogin: enableInIncognitoMode,
        preventHomeAutoplay: preventHomeAutoplay,
      },
      "*"
    );
  }

  // 1. Initial configuration sync
  chrome.storage.local.get(
    {
      enabled: true,
      enableInIncognitoMode: true,
      preventHomeAutoplay: false,
    },
    syncConfig
  );

  // 2. Listen ONLY for actual config changes (Strictly ignore streamStatus to prevent storage loops)
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== "local") return;
    if (!changes.enabled && !changes.enableInIncognitoMode && !changes.preventHomeAutoplay) {
      return;
    }

    chrome.storage.local.get(
      { enabled: true, enableInIncognitoMode: true, preventHomeAutoplay: false },
      syncConfig
    );
  });

  // 3. Listen for status broadcast from MAIN world only when status actually changes
  let lastSavedChannel = null;
  let lastSavedVodId = null;

  window.addEventListener("TWITCH_REWIND_STATUS_UPDATE", (e) => {
    if (!e.detail || typeof e.detail !== "object") return;
    const ch = e.detail.channel || "";
    const vId = e.detail.vodId || null;

    if (ch === lastSavedChannel && vId === lastSavedVodId) return;
    lastSavedChannel = ch;
    lastSavedVodId = vId;

    chrome.storage.local.set({
      streamStatus: {
        channel: ch,
        vodId: vId,
        hasDvr: Boolean(e.detail.hasDvr),
        updatedAt: Date.now(),
      },
    });
  });

  window.postMessage({ type: "TWITCH_REWIND_REQUEST_STATUS" }, "*");
})();
