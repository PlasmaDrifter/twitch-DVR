// Minimal MV3 background script for Twitch Rewind
chrome.runtime.onInstalled.addListener(async (details) => {
  const current = await chrome.storage.local.get({
    enabled: true,
    enableInIncognitoMode: true,
    preventHomeAutoplay: false,
    enablePlayerButtons: true,
    enableSpeedButton: true,
    enableHotkeys: true,
    seekStepSeconds: 10,
    rewindButtons: { "30s": false, "1m": true, "3m": false, "5m": true, "10m": false, "30m": false },
    forwardButtons: { "30s": false, "1m": true, "3m": false, "5m": true, "10m": false, "30m": false },
  });

  await chrome.storage.local.set(current);
});
