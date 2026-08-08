/**
 * CladFacts privacy-first analytics (first-party, cookieless).
 * - No advertising IDs, no fingerprinting, no third-party pixels
 * - sessionStorage random id for same-tab session counts only
 * - Honors DNT / GPC; skips prerender and admin paths
 */
(function () {
  "use strict";

  try {
    if (window.__cladAnalyticsBooted) return;
    window.__cladAnalyticsBooted = true;
  } catch (e) {
    return;
  }

  function optedOut() {
    try {
      if (navigator.globalPrivacyControl === true) return true;
      if (navigator.doNotTrack === "1" || window.doNotTrack === "1") return true;
    } catch (e) {}
    return false;
  }

  if (optedOut()) return;

  var path = location.pathname || "/";
  if (
    path.indexOf("/admin") === 0 ||
    path.indexOf("/api/") === 0 ||
    path.indexOf("/account") === 0 ||
    path.indexOf("/login") === 0 ||
    path.indexOf("/register") === 0
  ) {
    return;
  }

  try {
    if (document.prerendering) return;
  } catch (e) {}

  function sessionId() {
    try {
      var k = "clad_aid";
      var v = sessionStorage.getItem(k);
      if (v && /^[a-zA-Z0-9_-]{8,64}$/.test(v)) return v;
      v =
        (crypto.randomUUID && crypto.randomUUID().replace(/-/g, "")) ||
        Math.random().toString(36).slice(2) + Date.now().toString(36);
      v = String(v).slice(0, 32);
      sessionStorage.setItem(k, v);
      return v;
    } catch (e) {
      return "anon" + String(Date.now()).slice(-8);
    }
  }

  var sid = sessionId();
  var endpoint = "/api/analytics/collect";
  var engagedSent = 0;
  var maxEngage = 30 * 60; // cap 30 minutes per page
  var visibleSince = document.visibilityState === "visible" ? Date.now() : null;
  var accumulated = 0;
  var videoState = null; // { id, started, lastTick, milestones: Set }

  function send(payload) {
    payload.s = sid;
    payload.p = path;
    var body = JSON.stringify(payload);
    try {
      if (navigator.sendBeacon) {
        var blob = new Blob([body], { type: "application/json" });
        if (navigator.sendBeacon(endpoint, blob)) return;
      }
    } catch (e) {}
    try {
      fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: body,
        keepalive: true,
        credentials: "omit",
        mode: "same-origin",
      }).catch(function () {});
    } catch (e2) {}
  }

  // --- pageview ---
  send({
    e: "pageview",
    r: document.referrer || "",
  });

  // --- engaged time (visibility-aware) ---
  function flushEngage(force) {
    var now = Date.now();
    if (visibleSince != null) {
      accumulated += Math.max(0, (now - visibleSince) / 1000);
      visibleSince = document.visibilityState === "visible" ? now : null;
    }
    var total = Math.floor(accumulated);
    if (total <= engagedSent) return;
    var delta = total - engagedSent;
    if (!force && delta < 5) return;
    // send in chunks of at most 30s so server caps stay sane
    while (delta > 0 && engagedSent < maxEngage) {
      var chunk = Math.min(30, delta, maxEngage - engagedSent);
      if (chunk < 1) break;
      send({ e: "engage", d: chunk });
      engagedSent += chunk;
      delta -= chunk;
    }
  }

  document.addEventListener(
    "visibilitychange",
    function () {
      if (document.visibilityState === "hidden") {
        flushEngage(true);
        flushVideo(true);
      } else if (document.visibilityState === "visible") {
        visibleSince = Date.now();
      }
    },
    { passive: true }
  );

  window.addEventListener(
    "pagehide",
    function () {
      flushEngage(true);
      flushVideo(true);
    },
    { capture: true }
  );

  setInterval(function () {
    if (document.visibilityState === "visible") flushEngage(false);
    flushVideo(false);
  }, 15000);

  // --- video: facade clicks + focused-time estimate after play ---
  function youtubeIdFromEmbed(src) {
    if (!src) return null;
    try {
      var m = String(src).match(
        /(?:youtube\.com\/embed\/|youtube-nocookie\.com\/embed\/)([\w-]{11})/
      );
      return m ? m[1] : null;
    } catch (e) {
      return null;
    }
  }

  function startVideo(id) {
    if (!id || !/^[\w-]{11}$/.test(id)) return;
    if (videoState && videoState.id === id) return;
    videoState = {
      id: id,
      started: Date.now(),
      focused: 0,
      lastTick: Date.now(),
      visible: document.visibilityState === "visible",
      milestones: { play: true },
    };
    send({ e: "video", v: id, m: "play", d: 0 });
  }

  function flushVideo(force) {
    if (!videoState) return;
    var now = Date.now();
    if (videoState.visible && document.visibilityState === "visible") {
      videoState.focused += Math.max(0, (now - videoState.lastTick) / 1000);
    }
    videoState.lastTick = now;
    videoState.visible = document.visibilityState === "visible";

    var sec = Math.floor(videoState.focused);
    var marks = [15, 30, 60, 120, 300];
    for (var i = 0; i < marks.length; i++) {
      var m = marks[i];
      if (sec >= m && !videoState.milestones[m]) {
        videoState.milestones[m] = true;
        send({ e: "video", v: videoState.id, m: String(m), d: 15 });
      }
    }
    if (force) {
      // no-op beyond milestones; heartbeats already sent
    }
  }

  // Auto-wire common facades
  document.addEventListener(
    "click",
    function (e) {
      var t = e.target;
      if (!t || !t.closest) return;
      var box =
        t.closest(".video-facade") ||
        t.closest("[data-hist-video]") ||
        t.closest("[data-clad-video]");
      if (!box) return;
      var embed =
        box.getAttribute("data-embed") ||
        (box.querySelector &&
          box.querySelector("[data-embed]") &&
          box.querySelector("[data-embed]").getAttribute("data-embed")) ||
        "";
      var id =
        box.getAttribute("data-video-id") ||
        youtubeIdFromEmbed(embed) ||
        youtubeIdFromEmbed(box.getAttribute("data-src") || "");
      // history panel may set embed later; try panel attr
      if (!id) {
        var panel = box.querySelector("[data-hist-video-panel], .video-embed");
        if (panel) {
          id =
            youtubeIdFromEmbed(panel.getAttribute("data-embed") || "") ||
            youtubeIdFromEmbed(panel.getAttribute("data-src") || "");
        }
      }
      if (id) startVideo(id);
    },
    true
  );

  // Public hook for page scripts
  window.__cladTrackVideo = function (videoId) {
    startVideo(videoId);
  };
})();
