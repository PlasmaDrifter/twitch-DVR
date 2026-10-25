// Minimal MV3 background script for Twitch Rewind
chrome.runtime.onInstalled.addListener(async (details) => {
  const current = await chrome.storage.local.get({
    enabled: true,
    enableInIncognitoMode: true,
    preventHomeAutoplay: false,
    enablePlayerButtons: true,
    enableHotkeys: true,
    seekStepSeconds: 10,
  });

  await chrome.storage.local.set(current);
});
