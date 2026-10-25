(function () {
  const LOG_PREFIX = "[Twitch DVR]";
  const origFetch = window.fetch.bind(window);

  function requestUrl(input) {
    if (typeof input === "string") return input;
    if (input instanceof Request) return input.url;
    return String(input);
  }

  const GQL_QUERIES_TO_MODIFY = [
    "ChannelRoot_AboutPanel",
    "TopNav_CurrentUser",
    "DVRVideoIDQuery",
    "DVRAvailabilityQuery",
  ];

  const keysToForceEnable = new Set(["hasActiveTurbo"]);

  let isExtensionEnabled = true;
  let enableInIncognitoMode = true;
  let preventHomeAutoplay = false;

  try {
    isExtensionEnabled = localStorage.getItem("twitch_rewind_enabled") !== "false";
    enableInIncognitoMode = localStorage.getItem("twitch_rewind_enable_in_incognito_mode") !== "false";
    preventHomeAutoplay = localStorage.getItem("twitch_rewind_prevent_home_autoplay") === "true";
  } catch (e) { }

  function getChannelFromUrl() {
    const parts = window.location.pathname.split("/").filter(Boolean);
    if (!parts.length) return "";
    const first = parts[0].toLowerCase();
    const reserved = ["directory", "videos", "p", "settings", "friends", "subscriptions", "inventory", "wallet", "messages"];
    if (reserved.includes(first)) return "";
    return first;
  }

  let currentChannel = getChannelFromUrl();

  function broadcastStatus() {
    try {
      if (globalThis.vodCreatedAt) {
        document.documentElement.dataset.twitchDvrCreatedAt = globalThis.vodCreatedAt;
      }
    } catch (e) { }
    window.dispatchEvent(
      new CustomEvent("TWITCH_REWIND_STATUS_UPDATE", {
        detail: {
          channel: currentChannel || getChannelFromUrl(),
          vodId: globalThis.vodID || null,
          vodCreatedAt: globalThis.vodCreatedAt || null,
          hasDvr: Boolean(globalThis.vodID),
          enabled: isExtensionEnabled,
        },
      })
    );
  }

  function handleUrlChange() {
    const newChannel = getChannelFromUrl();
    if (newChannel && newChannel !== currentChannel) {
      currentChannel = newChannel;
      globalThis.vodID = null;
      globalThis.vodCreatedAt = null;
      try {
        delete document.documentElement.dataset.twitchDvrCreatedAt;
      } catch (e) { }
      broadcastStatus();
    }
  }

  window.addEventListener("popstate", handleUrlChange);

  window.addEventListener("message", (event) => {
    if (event.source === window && event.data?.type === "TWITCH_REWIND_CONFIG") {
      if (typeof event.data.enabled === "boolean") isExtensionEnabled = event.data.enabled;
      if (typeof event.data.enableInIncognitoMode === "boolean") enableInIncognitoMode = event.data.enableInIncognitoMode;
      if (typeof event.data.preventHomeAutoplay === "boolean") preventHomeAutoplay = event.data.preventHomeAutoplay;
    } else if (event.source === window && event.data?.type === "TWITCH_REWIND_REQUEST_STATUS") {
      broadcastStatus();
    }
  });

  // -------------------------------------------------------------
  // Prevent Video Autoplay on Twitch Homepage (Fixed)
  // -------------------------------------------------------------
  function isTwitchHomepage() {
    const p = window.location.pathname;
    return p === "/" || p === "";
  }

  function isHomepageCarouselVideo(videoEl) {
    if (!isTwitchHomepage()) return false;
    if (!videoEl || !(videoEl instanceof Element)) return false;
    return Boolean(
      videoEl.closest(
        '[data-test-selector="featured-item-video"], [data-test-selector="featured-item-experiment-video-wrapper"], [data-a-target="channel-home-carousel"], [data-a-target="frontpage-carousel"], .featured-content-carousel, .channel-root__player--home-carousel, [data-test-selector="carousel-player"]'
      )
    );
  }

  document.addEventListener(
    "click",
    (e) => {
      if (!isExtensionEnabled || !preventHomeAutoplay || !isTwitchHomepage()) return;
      const target = e.target;
      if (!target || !(target instanceof Element)) return;
      const playerContainer = target.closest(
        '[data-test-selector="featured-item-video"], [data-test-selector="featured-item-experiment-video-wrapper"], [data-a-target="channel-home-carousel"], [data-a-target="frontpage-carousel"], .featured-content-carousel, [data-test-selector="video-player__video-layout"], .video-player'
      );
      if (playerContainer) {
        const video = playerContainer.querySelector("video");
        if (video) video.__twitch_rewind_user_play__ = true;
      }
    },
    true
  );

  const origPlay = HTMLMediaElement.prototype.play;
  HTMLMediaElement.prototype.play = function (...args) {
    if (
      isExtensionEnabled &&
      preventHomeAutoplay &&
      isTwitchHomepage() &&
      this instanceof HTMLVideoElement &&
      !this.__twitch_rewind_user_play__ &&
      isHomepageCarouselVideo(this)
    ) {
      try { this.pause(); } catch (err) { }
      const rejectedPromise = Promise.reject(
        new DOMException("Homepage autoplay prevented by Twitch DVR", "AbortError")
      );
      rejectedPromise.catch(() => { });
      return rejectedPromise;
    }
    return origPlay.apply(this, args);
  };

  document.addEventListener(
    "play",
    (e) => {
      const video = e.target;
      if (
        isExtensionEnabled &&
        preventHomeAutoplay &&
        isTwitchHomepage() &&
        video instanceof HTMLVideoElement &&
        !video.__twitch_rewind_user_play__ &&
        isHomepageCarouselVideo(video)
      ) {
        try { video.pause(); } catch (err) { }
      }
    },
    true
  );

  // -------------------------------------------------------------
  // Webpack Hooks for DVR Injection
  // -------------------------------------------------------------
  const DVR_HOOK_TAG = Symbol("twitch_rewind_dvr_checked");
  const dvrCallbackCache = new WeakMap();
  const reactProxyCache = new WeakMap();

  function checkAndWrapDvrCallback(cb) {
    if (typeof cb !== "function") return cb;
    try {
      const cached = cb[DVR_HOOK_TAG];
      if (cached !== undefined) return cached || cb;
    } catch (e) { }

    const mapCached = dvrCallbackCache.get(cb);
    if (mapCached !== undefined) return mapCached || cb;

    let isTarget = false;
    try {
      const fnStr = Function.prototype.toString.call(cb);
      if (fnStr.includes("dvrVideoID")) isTarget = true;
    } catch (e) { }

    let resultCb = cb;
    if (isTarget) {
      const origCb = cb;
      resultCb = function (...args) {
        const content = origCb.apply(this, args);
        if (content && typeof content === "object") {
          attachDvrGetter(content);
        }
        return content;
      };
      try { resultCb[DVR_HOOK_TAG] = resultCb; } catch (e) { }
      dvrCallbackCache.set(resultCb, resultCb);
      try { cb[DVR_HOOK_TAG] = resultCb; } catch (e) { }
      dvrCallbackCache.set(cb, resultCb);
    } else {
      try { cb[DVR_HOOK_TAG] = false; } catch (e) { }
      dvrCallbackCache.set(cb, false);
    }
    return resultCb;
  }

  function getOrCreateReactProxy(reactInstance) {
    if (reactProxyCache.has(reactInstance)) return reactProxyCache.get(reactInstance);

    let cachedHookedUseCallback = null;
    const proxy = new Proxy(reactInstance, {
      get(target, prop, receiver) {
        if (prop === "useCallback") {
          if (!cachedHookedUseCallback) {
            cachedHookedUseCallback = function hookedUseCallback(cb, deps) {
              const finalCb = checkAndWrapDvrCallback(cb);
              return target.useCallback.call(this === receiver ? target : this, finalCb, deps);
            };
          }
          return cachedHookedUseCallback;
        }
        if (prop === "default" && target.default && typeof target.default === "object") {
          return getOrCreateReactProxy(target.default);
        }
        return Reflect.get(target, prop, receiver);
      },
    });

    reactProxyCache.set(reactInstance, proxy);
    return proxy;
  }

  const DVR_ATTACHED_TAG = Symbol("twitch_rewind_dvr_attached");

  function attachDvrGetter(obj) {
    if (!obj || typeof obj !== "object" || obj[DVR_ATTACHED_TAG]) return;
    try {
      obj[DVR_ATTACHED_TAG] = true;
      const desc = Object.getOwnPropertyDescriptor(obj, "dvrVideoID");
      if (desc && desc.get) return;
      if (desc && !desc.configurable) return;

      Object.defineProperty(obj, "dvrVideoID", {
        get() {
          if (!isExtensionEnabled || !enableInIncognitoMode) return undefined;
          return globalThis.vodID || undefined;
        },
        set(val) {
          if (val) {
            Object.defineProperty(obj, "dvrVideoID", {
              value: val,
              writable: true,
              enumerable: true,
              configurable: true,
            });
          }
        },
        enumerable: true,
        configurable: true,
      });
    } catch (e) { }
  }

  function patchModulesForDvr(modules) {
    if (!modules || typeof modules !== "object") return;
    if (!isExtensionEnabled || !enableInIncognitoMode) return;

    for (const moduleId in modules) {
      if (!Object.prototype.hasOwnProperty.call(modules, moduleId)) continue;
      const origFn = modules[moduleId];
      if (typeof origFn !== "function" || origFn.__twitch_rewind_wrapped__) continue;

      let fnStr;
      try {
        fnStr = origFn.toString();
      } catch (e) { continue; }

      if (!fnStr.includes("dvrVideoID")) continue;
      origFn.__twitch_rewind_wrapped__ = true;

      if (fnStr.includes("isDVR")) {
        modules[moduleId] = function (module, exports, require) {
          const res = origFn.apply(this, arguments);
          if (exports && typeof exports === "object") {
            for (const key of Object.keys(exports)) {
              try {
                const desc = Object.getOwnPropertyDescriptor(exports, key);
                if (desc && typeof desc.value === "function") {
                  if (/^class\s/.test(Function.prototype.toString.call(desc.value))) continue;
                  const origVal = desc.value;
                  exports[key] = function (content, ...args) {
                    if (content && typeof content === "object") attachDvrGetter(content);
                    return origVal.call(this, content, ...args);
                  };
                } else if (desc && typeof desc.get === "function") {
                  const origGetter = desc.get;
                  Object.defineProperty(exports, key, {
                    get() {
                      const fn = origGetter.call(this);
                      if (typeof fn !== "function" || /^class\s/.test(Function.prototype.toString.call(fn))) return fn;
                      return function (content, ...args) {
                        if (content && typeof content === "object") attachDvrGetter(content);
                        return fn.call(this, content, ...args);
                      };
                    },
                    enumerable: desc.enumerable,
                    configurable: true,
                  });
                }
              } catch (e) { }
            }
          }
          return res;
        };
      } else {
        modules[moduleId] = function (module, exports, require) {
          const wrappedRequire = new Proxy(require, {
            apply(target, thisArg, argArray) {
              const imported = Reflect.apply(target, thisArg, argArray);
              if (!imported || typeof imported !== "object") return imported;
              if (typeof imported.useCallback === "function") {
                return getOrCreateReactProxy(imported);
              }
              return imported;
            },
            construct(target, argArray, newTarget) {
              return Reflect.construct(target, argArray, newTarget);
            },
          });
          return origFn.call(this, module, exports, wrappedRequire);
        };
      }
    }
  }

  function hookWebpackGlobal(globalName) {
    function installHook(arr) {
      if (!arr || arr.__twitch_rewind_hooked__) return;
      arr.__twitch_rewind_hooked__ = true;

      if (Array.isArray(arr)) {
        for (const chunk of arr) {
          if (Array.isArray(chunk) && chunk[1]) {
            patchModulesForDvr(chunk[1]);
          }
        }
      }

      let currentPush = arr.push.bind(arr);
      try {
        Object.defineProperty(arr, "push", {
          configurable: true,
          enumerable: true,
          get() { return currentPush; },
          set(newPush) {
            currentPush = function (...chunks) {
              for (const chunk of chunks) {
                try {
                  if (Array.isArray(chunk) && chunk[1]) patchModulesForDvr(chunk[1]);
                } catch (e) { }
              }
              return newPush.apply(this, chunks);
            };
          },
        });
      } catch (e) {
        const fallbackPush = arr.push.bind(arr);
        arr.push = function (...chunks) {
          for (const chunk of chunks) {
            try {
              if (Array.isArray(chunk) && chunk[1]) patchModulesForDvr(chunk[1]);
            } catch (err) { }
          }
          return fallbackPush.apply(this, chunks);
        };
      }
    }

    let chunkArr = window[globalName];
    if (chunkArr && Array.isArray(chunkArr)) installHook(chunkArr);

    try {
      Object.defineProperty(window, globalName, {
        configurable: true,
        get() { return chunkArr; },
        set(val) {
          chunkArr = val;
          if (Array.isArray(val)) installHook(val);
        },
      });
    } catch (e) { }
  }

  hookWebpackGlobal("webpackChunktwitch_twilight");
  hookWebpackGlobal("webpackChunkclient_web_root");

  function shouldModifyRequest(args) {
    if (!isExtensionEnabled) return false;
    try {
      const input = args[0];
      const body = args[1]?.body || "";
      const href = requestUrl(input);
      const u = new URL(href, location.href);
      return (
        u.pathname.includes("/gql") &&
        GQL_QUERIES_TO_MODIFY.some((q) => body.includes(q))
      );
    } catch {
      return false;
    }
  }

  // Exact robust GQL parsing from original extension that guarantees Twitch DVR activates
  window.fetch = async function (...args) {
    const response = await origFetch(...args);
    if (!shouldModifyRequest(args)) return response;

    const text = await response.text();
    let vodChanged = false;
    let parsed;
    try {
      parsed = JSON.parse(text, (_, val) => {
        if (val?.__typename === "VideoConnection") {
          const edge = val?.edges?.[0]?.node;
          const newId = edge?.status === "RECORDING" ? edge.id : null;
          vodChanged = globalThis.vodID !== newId;
          globalThis.vodID = newId;
          if (edge?.createdAt) {
            globalThis.vodCreatedAt = edge.createdAt;
            try {
              document.documentElement.dataset.twitchDvrCreatedAt = edge.createdAt;
            } catch (e) { }
          }
        }
        return val;
      });
    } catch {
      return new Response(text, {
        status: response.status,
        statusText: response.statusText,
        headers: response.headers,
      });
    }

    if (vodChanged) {
      broadcastStatus();
    }

    const body = JSON.stringify(parsed, (key, val) =>
      keysToForceEnable.has(key)
        ? true
        : key === "vodID"
          ? globalThis.vodID || ""
          : val
    );

    const headers = new Headers(response.headers);
    headers.set("Content-Type", "application/json; charset=utf-8");

    return new Response(body, {
      status: response.status,
      statusText: response.statusText,
      headers,
    });
  };
})();
