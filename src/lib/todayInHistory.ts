/**
 * "Today in history" — fun desk facts for the homepage.
 * Generated daily by the today-in-history agent; stored in AGENTS KV.
 * No outbound links in the UI — informational only.
 */

export interface TodayInHistoryItem {
  /** Year the event occurred (e.g. 1969). */
  year: number;
  /** Short headline. */
  title: string;
  /** One or two sentences of context. */
  body: string;
  /**
   * Optional Wikimedia Commons thumbnail URL (upload.wikimedia.org/wikipedia/commons/…).
   * Resolved by the agent runner from a Wikipedia title when available.
   */
  imageUrl?: string | null;
  /** Optional YouTube video id (11 chars) for an embedded explainer / archival clip. */
  videoId?: string | null;
}

export interface TodayInHistoryPayload {
  /** MM-DD in America/New_York. */
  dateKey: string;
  /** Human label e.g. "July 16". */
  dateLabel: string;
  generatedAt: string;
  items: TodayInHistoryItem[];
}

/** MM-DD for the Clad desk clock. */
export function historyDateKey(now = new Date()): string {
  try {
    const parts = new Intl.DateTimeFormat("en-US", {
      timeZone: "America/New_York",
      month: "2-digit",
      day: "2-digit",
    }).formatToParts(now);
    const m = parts.find((p) => p.type === "month")?.value;
    const d = parts.find((p) => p.type === "day")?.value;
    if (m && d) return `${m}-${d}`;
  } catch {
    /* fall through */
  }
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const d = String(now.getDate()).padStart(2, "0");
  return `${m}-${d}`;
}

export function historyDateLabel(now = new Date()): string {
  try {
    return new Intl.DateTimeFormat("en-US", {
      timeZone: "America/New_York",
      month: "long",
      day: "numeric",
    }).format(now);
  } catch {
    return historyDateKey(now);
  }
}

export function normalizeHistoryItem(raw: unknown): TodayInHistoryItem | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  const year = Math.round(Number(r.year));
  if (!Number.isFinite(year) || year < 1 || year > 2100) return null;
  const title = String(r.title || "").trim().slice(0, 140);
  if (!title) return null;
  const body = String(r.body || "").trim().slice(0, 400);
  if (!body) return null;
  let imageUrl: string | null = null;
  if (r.imageUrl) {
    const u = String(r.imageUrl).trim();
    // Only accept Commons HTTPS thumbs — validated again at store time.
    if (u.startsWith("https://upload.wikimedia.org/wikipedia/commons/")) {
      imageUrl = u.slice(0, 500);
    }
  }
  let videoId: string | null = null;
  if (r.videoId) {
    const v = String(r.videoId).trim();
    if (/^[\w-]{11}$/.test(v)) videoId = v;
  }
  return { year, title, body, imageUrl, videoId };
}

export function normalizeHistoryPayload(raw: unknown): TodayInHistoryPayload | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  const dateKey = String(r.dateKey || "").trim();
  if (!/^\d{2}-\d{2}$/.test(dateKey)) return null;
  const items = (Array.isArray(r.items) ? r.items : [])
    .map(normalizeHistoryItem)
    .filter((x): x is TodayInHistoryItem => x != null)
    .slice(0, 5);
  if (!items.length) return null;
  return {
    dateKey,
    dateLabel: String(r.dateLabel || dateKey).slice(0, 40),
    generatedAt: String(r.generatedAt || new Date().toISOString()).slice(0, 40),
    items,
  };
}
