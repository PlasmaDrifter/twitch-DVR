// Minimal MV3 background script for Twitch DVR
chrome.runtime.onInstalled.addListener(async (details) => {
  const current = await chrome.storage.local.get({
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
  });

  await chrome.storage.local.set(current);
});

async function fetchServerDvrClip(channel, durationSec, knownVodId, playheadInfo, isRecording = false) {
  const GQL_CLIENT_ID = "kimne78kx3ncx6brgo4mv6wki5h1ko";
  const cleanChannel = (channel || "").toLowerCase().trim();
  let vodId = knownVodId;

  console.log("[Twitch DVR] fetchServerDvrClip requested:", {
    channel: cleanChannel,
    durationSec,
    knownVodId,
    playheadInfo,
    isRecording,
  });

  // 1. Resolve VOD ID if not already provided
  if (!vodId) {
    const vodRes = await fetch("https://gql.twitch.tv/gql", {
      method: "POST",
      headers: {
        "Client-Id": GQL_CLIENT_ID,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        query: "query($login:String!){user(login:$login){stream{id archiveVideo{id status}} videos(first:5,sort:TIME,type:ARCHIVE){edges{node{id status createdAt}}}}}",
        variables: { login: cleanChannel },
      }),
    });
    if (!vodRes.ok) throw new Error("GQL VOD query failed");
    const vodData = await vodRes.json();
    const liveArchiveId = vodData?.data?.user?.stream?.archiveVideo?.id;
    if (liveArchiveId) {
      vodId = liveArchiveId;
    } else {
      const edges = vodData?.data?.user?.videos?.edges || [];
      const recordingEdge = edges.find((e) => e?.node?.status === "RECORDING");
      if (recordingEdge?.node?.id) {
        vodId = recordingEdge.node.id;
      }
    }
  }

  if (!vodId) {
    throw new Error("No active recording VOD archive found for this channel");
  }

  // 2. Query Playback Access Token
  const tokenRes = await fetch("https://gql.twitch.tv/gql", {
    method: "POST",
    headers: {
      "Client-Id": GQL_CLIENT_ID,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      query: 'query($vodID:ID!){videoPlaybackAccessToken(id:$vodID,params:{platform:"web",playerBackend:"mediaplayer",playerType:"site"}){value signature}}',
      variables: { vodID: vodId },
    }),
  });
  if (!tokenRes.ok) throw new Error("Playback token query failed");
  const tokenData = await tokenRes.json();
  const tok = tokenData?.data?.videoPlaybackAccessToken;
  if (!tok?.value || !tok?.signature) throw new Error("Missing token signature");

  // 3. Fetch Usher Master Playlist
  const usherUrl = `https://usher.ttvnw.net/vod/${vodId}.m3u8?nauth=${encodeURIComponent(tok.value)}&nauthsig=${tok.signature}&allow_source=true&player=twitchweb`;
  const usherRes = await fetch(usherUrl);
  if (!usherRes.ok) throw new Error(`Usher request failed (${usherRes.status})`);
  const masterM3u8 = await usherRes.text();

  // 4. Select absolute highest quality variant playlist (e.g. 1080p60 Source / maximum bitrate)
  const masterLines = masterM3u8.split("\n");
  const variants = [];
  for (let i = 0; i < masterLines.length; i++) {
    const line = masterLines[i].trim();
    if (line.startsWith("#EXT-X-STREAM-INF:")) {
      let bw = 0;
      const bwMatch = line.match(/BANDWIDTH=(\d+)/);
      if (bwMatch) bw = parseInt(bwMatch[1], 10);
      const nextLine = masterLines[i + 1]?.trim();
      if (nextLine && nextLine.startsWith("https://") && nextLine.includes(".m3u8")) {
        variants.push({ bw, url: nextLine });
      }
    }
  }

  let variantUrl = null;
  if (variants.length > 0) {
    variants.sort((a, b) => b.bw - a.bw);
    variantUrl = variants[0].url;
  } else {
    for (const line of masterLines) {
      const trimmed = line.trim();
      if (trimmed.startsWith("https://") && trimmed.includes(".m3u8")) {
        variantUrl = trimmed;
        break;
      }
    }
  }
  if (!variantUrl) throw new Error("No variant playlist found in master");

  // 5. Fetch Variant Playlist
  const variantRes = await fetch(variantUrl);
  if (!variantRes.ok) throw new Error("Failed to fetch variant playlist");
  const variantM3u8 = await variantRes.text();

  // 6. Parse segments and calculate target window
  const lines = variantM3u8.split("\n");
  const segments = [];
  let initMapUrl = null;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (line.startsWith("#EXT-X-MAP:URI=")) {
      const match = line.match(/URI="([^"]+)"/);
      if (match) initMapUrl = match[1];
    } else if (line.startsWith("#EXTINF:")) {
      const durMatch = line.match(/#EXTINF:([0-9.]+)/);
      const dur = durMatch ? parseFloat(durMatch[1]) : 10.0;
      const nextLine = lines[i + 1]?.trim();
      if (nextLine && !nextLine.startsWith("#")) {
        segments.push({ dur, file: nextLine });
      }
    }
  }

  if (segments.length === 0) throw new Error("No segments found in DVR playlist");

  const totalPlaylistDur = segments.reduce((sum, s) => sum + s.dur, 0);
  const isRewound = Boolean(playheadInfo?.isRewound);

  // If rewound in timeline, determine playhead target end time
  let targetEndTime = totalPlaylistDur;
  if (isRewound && typeof playheadInfo?.currentTime === "number" && playheadInfo.currentTime > 0) {
    targetEndTime = Math.min(totalPlaylistDur, playheadInfo.currentTime);
  } else if (isRewound && typeof playheadInfo?.offsetFromLive === "number" && playheadInfo.offsetFromLive > 4) {
    targetEndTime = Math.max(0, totalPlaylistDur - playheadInfo.offsetFromLive);
  }

  // Find the segment where targetEndTime falls
  let cum = 0;
  let endIdx = segments.length - 1;
  for (let i = 0; i < segments.length; i++) {
    cum += segments[i].dur;
    if (cum >= targetEndTime) {
      endIdx = i;
      break;
    }
  }

  const targetDur = Math.max(2, durationSec || 120);
  const chosenSegments = [];
  let accumulatedDur = 0;

  for (let i = endIdx; i >= 0; i--) {
    chosenSegments.unshift(segments[i]);
    accumulatedDur += segments[i].dur;
    if (accumulatedDur >= targetDur) break;
  }

  const baseUrl = variantUrl.substring(0, variantUrl.lastIndexOf("/") + 1);
  const segmentUrls = chosenSegments.map((seg) => new URL(seg.file, baseUrl).href);
  const fullInitMapUrl = initMapUrl ? new URL(initMapUrl, baseUrl).href : null;

  const isMp4 = Boolean(initMapUrl) || (chosenSegments[0]?.file && chosenSegments[0].file.endsWith(".mp4"));
  const ext = isMp4 ? "mp4" : "ts";
  const mimeType = isMp4 ? "video/mp4" : "video/mp2t";

  function formatTimeLabel(sec) {
    if (!sec || !isFinite(sec)) return "0s";
    const h = Math.floor(sec / 3600);
    const m = Math.floor((sec % 3600) / 60);
    const s = Math.floor(sec % 60);
    if (h > 0) return `${h}h${m.toString().padStart(2, "0")}m`;
    if (m > 0) return `${m}m${s.toString().padStart(2, "0")}s`;
    return `${s}s`;
  }

  const timestamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
  const durLabel = targetDur >= 60 ? `${Math.round(targetDur / 60)}m` : `${targetDur}s`;
  const filePrefix = isRecording ? "Recording" : "Clip";
  const posLabel = isRecording ? "" : (isRewound ? `_at_${formatTimeLabel(targetEndTime)}` : `_Last_${durLabel}`);
  const filename = `TwitchDVR_${channel}_${filePrefix}_${durLabel}${posLabel}_${timestamp}.${ext}`;

  console.log("[Twitch DVR] fetchServerDvrClip prepared metadata:", {
    segmentCount: segmentUrls.length,
    accumulatedDur: Math.round(accumulatedDur),
    targetEndTime: Math.round(targetEndTime),
    isRewound,
    isRecording,
    filename,
  });

  return {
    success: true,
    segmentUrls,
    initMapUrl: fullInitMapUrl,
    filename,
    mimeType,
    ext,
    actualDuration: Math.round(accumulatedDur),
    channel,
    isRewound,
    targetEndTime: Math.round(targetEndTime),
    isRecording: Boolean(isRecording),
  };
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message && message.type === "FETCH_DVR_CLIP") {
    fetchServerDvrClip(message.channel, message.durationSeconds, message.vodId, message.playheadInfo, message.isRecording)
      .then((res) => sendResponse(res))
      .catch((err) => {
        console.error("[Twitch DVR] fetchServerDvrClip error:", err);
        sendResponse({ success: false, error: err?.message || String(err), fallback: true });
      });
    return true; // keep channel open for async response
  }

  if (message && message.type === "DOWNLOAD_MEDIA" && message.url) {
    chrome.downloads.download(
      {
        url: message.url,
        filename: message.filename || "twitch-recording.webm",
        saveAs: false,
      },
      (downloadId) => {
        sendResponse({ success: Boolean(downloadId), downloadId });
      }
    );
    return true;
  }
});
