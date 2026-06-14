/**
 * Best-effort YouTube transcript fetch from the Mac's residential IP. Returns
 * the caption text, or null if unavailable. Never throws — a miss just means
 * the report falls back to the web_search path.
 *
 * Method: load the watch page, pull `ytInitialPlayerResponse`, find an English
 * caption track, fetch its json3 timedtext, and concatenate the segments.
 */
const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 " +
  "(KHTML, like Gecko) Chrome/124.0 Safari/537.36";

export async function fetchTranscript(videoId, timeoutMs = 15000) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const watch = await fetch(`https://www.youtube.com/watch?v=${videoId}&hl=en`, {
      headers: {
        "User-Agent": UA,
        "Accept-Language": "en-US,en;q=0.9",
        Cookie: "CONSENT=YES+1",
      },
      signal: ctrl.signal,
    });
    if (!watch.ok) return null;
    const html = await watch.text();

    const m = html.match(/ytInitialPlayerResponse\s*=\s*(\{.+?\})\s*;\s*(?:var |<\/script>)/s);
    if (!m) return null;
    let pr;
    try {
      pr = JSON.parse(m[1]);
    } catch {
      return null;
    }

    const tracks =
      pr?.captions?.playerCaptionsTracklistRenderer?.captionTracks;
    if (!Array.isArray(tracks) || tracks.length === 0) return null;

    const pick =
      tracks.find((t) => t.languageCode?.startsWith("en") && t.kind !== "asr") ||
      tracks.find((t) => t.languageCode?.startsWith("en")) ||
      tracks[0];
    if (!pick?.baseUrl) return null;

    const ttUrl = pick.baseUrl + (pick.baseUrl.includes("?") ? "&" : "?") + "fmt=json3";
    const tt = await fetch(ttUrl, {
      headers: { "User-Agent": UA, "Accept-Language": "en-US,en;q=0.9" },
      signal: ctrl.signal,
    });
    if (!tt.ok) return null;
    const data = await tt.json().catch(() => null);
    if (!data?.events) return null;

    const text = data.events
      .flatMap((e) => (e.segs || []).map((s) => s.utf8 || ""))
      .join("")
      .replace(/\n+/g, " ")
      .replace(/\s{2,}/g, " ")
      .trim();

    return text.length >= 80 ? text : null;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}
