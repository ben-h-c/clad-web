/**
 * Home calendar events — all news, not just elections.
 *
 * Sources merged in buildCalendarEvents():
 *  1) Static editorial anchors
 *  2) Race-board vote days (midterms)
 *  3) Live feed from calendar-scanner agent (KV) — upcoming + historical
 *  4) Optional extras (homepage can attach recent Clad reports as day links)
 *
 * Past and future both show. UI defaults to the current month.
 */
import { MIDTERMS_2026_GENERAL, MIDTERMS_2026_RACES } from "./elections/midterms-2026.ts";
import { isVoteDateTbd, type RaceDef, type RaceVoteKind } from "./races.ts";

function voteKindLabel(kind: RaceVoteKind | string | undefined): string {
  switch (kind) {
    case "primary":
      return "Primary";
    case "runoff":
      return "Runoff";
    case "special":
      return "Special";
    case "general":
      return "General";
    case "party-process":
      return "Party process";
    case "undecided":
      return "TBD";
    default:
      return "";
  }
}

/** Broad news taxonomy — elections are one slice, not the whole board. */
export type CalendarEventKind =
  | "election"
  | "primary"
  | "runoff"
  | "special"
  | "general"
  | "party-process"
  | "politics"
  | "speech"
  | "launch"
  | "science"
  | "markets"
  | "conflict"
  | "disaster"
  | "court"
  | "diplomacy"
  | "culture"
  | "sports"
  | "deadline"
  | "clad"
  /** Private-to-user markers (e.g. their birthday) — only injected server-side for that user. */
  | "personal"
  | "other";

export const CALENDAR_EVENT_KINDS: CalendarEventKind[] = [
  "election",
  "primary",
  "runoff",
  "special",
  "general",
  "party-process",
  "politics",
  "speech",
  "launch",
  "science",
  "markets",
  "conflict",
  "disaster",
  "court",
  "diplomacy",
  "culture",
  "sports",
  "deadline",
  "clad",
  "personal",
  "other",
];

export interface CalendarEventLink {
  label: string;
  href: string;
}

export interface CalendarEvent {
  /** Stable id for list keys / merge / agent upserts. */
  id: string;
  /** Calendar day YYYY-MM-DD (civil date; no time zone shift). */
  date: string;
  /** Short title on the day cell / popup header. */
  title: string;
  /** Optional longer detail for the day popup. */
  body?: string;
  kind: CalendarEventKind;
  /** State postal if applicable. */
  state?: string;
  /** Deep links — ballot, map, report, external source, etc. */
  links?: CalendarEventLink[];
  /** Optional race board id when derived from RACE_MATCHUPS. */
  raceId?: string;
  /** Origin for debugging / merge priority. */
  source?: "static" | "race" | "agent" | "post" | "extra";
  /** When the agent last confirmed this event (ISO). */
  updatedAt?: string;
}

export interface CalendarDayBucket {
  date: string;
  events: CalendarEvent[];
}

/** Live KV payload written by calendar-scanner. */
export interface CalendarEventsLive {
  updatedAt: string;
  summary?: string;
  events: CalendarEvent[];
}

/** Static editorial anchors — fixed national daybook dates (expand freely). */
export const STATIC_CALENDAR_EVENTS: CalendarEvent[] = [
  {
    id: "clad-midterms-general-2026",
    date: MIDTERMS_2026_GENERAL,
    title: "Election Day — Midterms 2026",
    body: "U.S. House, Class II Senate seats, and most midterm governors. Fill your ballot board and watch races get called.",
    kind: "general",
    source: "static",
    links: [
      { label: "Ballot board", href: "/bracket/" },
      { label: "Election map", href: "/elections/map/" },
    ],
  },
  {
    id: "clad-ballot-lock-hint",
    date: "2026-11-03",
    title: "Lock midterms picks",
    body: "Lock your ballot sheet to share and join the community tally before results land.",
    kind: "clad",
    source: "static",
    links: [
      { label: "Your ballot", href: "/bracket/" },
      { label: "Community votes", href: "/bracket/votes/" },
    ],
  },
  // ── Civic / federal daybook anchors (2026–2027) ─────────────────────────
  {
    id: "static-labor-day-2026",
    date: "2026-09-07",
    title: "Labor Day",
    body: "Federal holiday. Traditional kickoff of the fall political calendar ahead of the midterms.",
    kind: "culture",
    source: "static",
  },
  {
    id: "static-constitution-day-2026",
    date: "2026-09-17",
    title: "Constitution Day",
    body: "Anniversary of the 1787 signing of the U.S. Constitution — civic education and federal observance.",
    kind: "culture",
    source: "static",
  },
  {
    id: "static-scotus-term-open-2026",
    date: "2026-10-05",
    title: "Supreme Court term opens",
    body: "First Monday in October — the Court begins its new term. Watch for high-stakes arguments and emergency dockets.",
    kind: "court",
    source: "static",
    links: [{ label: "Search court coverage", href: "/search/?q=Supreme+Court" }],
  },
  {
    id: "static-columbus-indigenous-2026",
    date: "2026-10-12",
    title: "Columbus Day / Indigenous Peoples’ Day",
    body: "Federal holiday observed as Columbus Day; many states and cities mark Indigenous Peoples’ Day.",
    kind: "culture",
    source: "static",
  },
  {
    id: "static-halloween-2026",
    date: "2026-10-31",
    title: "Halloween",
    body: "Major U.S. cultural observance — often a soft deadline for late October political ads and GOTV pushes.",
    kind: "culture",
    source: "static",
  },
  {
    id: "static-veterans-day-2026",
    date: "2026-11-11",
    title: "Veterans Day",
    body: "Federal holiday honoring U.S. military veterans. National ceremonies and presidential remarks typical.",
    kind: "culture",
    source: "static",
  },
  {
    id: "static-thanksgiving-2026",
    date: "2026-11-26",
    title: "Thanksgiving",
    body: "Federal holiday. Post-election rest stop on the national calendar; markets closed Thursday.",
    kind: "culture",
    source: "static",
  },
  {
    id: "static-black-friday-2026",
    date: "2026-11-27",
    title: "Black Friday",
    body: "Major consumer shopping day — closely watched retail and economy signal after Thanksgiving.",
    kind: "markets",
    source: "static",
  },
  {
    id: "static-christmas-2026",
    date: "2026-12-25",
    title: "Christmas Day",
    body: "Federal holiday. Markets closed; year-end legislative and news slowdown typically begins around this week.",
    kind: "culture",
    source: "static",
  },
  {
    id: "static-new-years-2027",
    date: "2027-01-01",
    title: "New Year’s Day",
    body: "Federal holiday. Start of the new Congress session cycle after the 2026 midterms.",
    kind: "culture",
    source: "static",
  },
  {
    id: "static-mlk-day-2027",
    date: "2027-01-18",
    title: "Martin Luther King Jr. Day",
    body: "Federal holiday honoring Dr. King — national service events and civil-rights commemorations.",
    kind: "culture",
    source: "static",
  },
  {
    id: "static-inauguration-watch-2027",
    date: "2027-01-03",
    title: "New Congress convenes",
    body: "The 120th Congress is sworn in after the 2026 midterms — House speakership and leadership fights often land here.",
    kind: "politics",
    source: "static",
    links: [
      { label: "Politicians", href: "/politicians/" },
      { label: "Ballot board", href: "/bracket/" },
    ],
  },
  {
    id: "static-presidents-day-2027",
    date: "2027-02-15",
    title: "Presidents’ Day",
    body: "Federal holiday (Washington’s Birthday observed). Mid-winter civic break on the national calendar.",
    kind: "culture",
    source: "static",
  },
  {
    id: "static-memorial-day-2027",
    date: "2027-05-31",
    title: "Memorial Day",
    body: "Federal holiday honoring fallen service members. Unofficial start of summer; markets closed.",
    kind: "culture",
    source: "static",
  },
  {
    id: "static-juneteenth-2027",
    date: "2027-06-19",
    title: "Juneteenth National Independence Day",
    body: "Federal holiday commemorating the end of slavery in the United States.",
    kind: "culture",
    source: "static",
  },
  {
    id: "static-independence-day-2027",
    date: "2027-07-04",
    title: "Independence Day",
    body: "Federal holiday marking the Declaration of Independence — national celebrations and markets closed.",
    kind: "culture",
    source: "static",
  },
];

function kindFromRace(def: RaceDef): CalendarEventKind {
  switch (def.voteKind) {
    case "primary":
      return "primary";
    case "runoff":
      return "runoff";
    case "special":
      return "special";
    case "general":
      return "general";
    case "party-process":
      return "party-process";
    default:
      return "election";
  }
}

/** Derive calendar rows from the editorial race board (known next-vote days). */
export function eventsFromRaceBoard(races: RaceDef[] = MIDTERMS_2026_RACES): CalendarEvent[] {
  const out: CalendarEvent[] = [];
  for (const r of races) {
    const date = r.nextVoteDate;
    if (!date || isVoteDateTbd(date)) continue;
    const kindLabel = voteKindLabel(r.voteKind) || "Vote";
    const a = r.a.name;
    const b = r.b.name;
    out.push({
      id: `race-${r.id}-${date}`,
      date,
      title: `${r.office} · ${kindLabel}`,
      body: `${a} vs ${b}${r.note ? ` — ${r.note}` : ""}`,
      kind: kindFromRace(r),
      state: r.state,
      raceId: r.id,
      source: "race",
      links: [
        { label: "Ballot board", href: "/bracket/" },
        { label: "Election map", href: `/elections/map/#state-${r.state}` },
      ],
    });
  }
  return out;
}

const ISO_DAY = /^\d{4}-\d{2}-\d{2}$/;

/**
 * True for same-origin CladFacts app paths only.
 * Blocks http(s) external URLs and protocol-relative //…
 */
export function isCladPlatformPath(href: string): boolean {
  const h = String(href || "").trim();
  if (!h.startsWith("/")) return false;
  if (h.startsWith("//")) return false;
  if (h.includes("://")) return false;
  // Keep dig-ins on product surfaces, not API/admin.
  if (h.startsWith("/api/") || h.startsWith("/admin")) return false;
  return true;
}

export function normalizeCalendarKind(raw: unknown): CalendarEventKind {
  const k = String(raw || "")
    .trim()
    .toLowerCase()
    .replace(/_/g, "-");
  if ((CALENDAR_EVENT_KINDS as string[]).includes(k)) return k as CalendarEventKind;
  // Loose aliases from the agent
  if (k === "war" || k === "military") return "conflict";
  if (k === "space" || k === "spacex" || k === "rocket") return "launch";
  if (k === "tech") return "science";
  if (k === "stock" || k === "finance" || k === "economy") return "markets";
  if (k === "address" || k === "rally") return "speech";
  if (k === "scotus" || k === "legal") return "court";
  if (k === "vote" || k === "midterm") return "election";
  return "other";
}

/** Sanitize one event for storage / UI. Returns null if unusable. */
export function normalizeCalendarEvent(raw: unknown, source?: CalendarEvent["source"]): CalendarEvent | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  const date = String(r.date || "").trim().slice(0, 10);
  if (!ISO_DAY.test(date)) return null;
  const title = String(r.title || "").trim().slice(0, 160);
  if (!title) return null;
  const idRaw = String(r.id || "").trim().toLowerCase().replace(/[^a-z0-9_-]+/g, "-");
  const id = (idRaw || `evt-${date}-${title.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`).slice(0, 120);
  const linksIn = Array.isArray(r.links) ? r.links : [];
  const links: CalendarEventLink[] = linksIn
    .map((l: unknown) => {
      const o = l as Record<string, unknown>;
      const label = String(o?.label || "").trim().slice(0, 80);
      const href = String(o?.href || "").trim().slice(0, 500);
      if (!label || !href) return null;
      // Calendar dig-ins: CladFacts platform paths only — never external URLs.
      if (!isCladPlatformPath(href)) return null;
      return { label, href };
    })
    .filter((x): x is CalendarEventLink => x != null)
    .slice(0, 6);

  return {
    id,
    date,
    title,
    body: r.body ? String(r.body).trim().slice(0, 800) : undefined,
    kind: normalizeCalendarKind(r.kind),
    state: r.state ? String(r.state).trim().toUpperCase().slice(0, 4) : undefined,
    links: links.length ? links : undefined,
    raceId: r.raceId ? String(r.raceId).slice(0, 80) : undefined,
    source: source || (r.source as CalendarEvent["source"]) || undefined,
    updatedAt: r.updatedAt ? String(r.updatedAt).slice(0, 40) : undefined,
  };
}

/**
 * Merge static + race-board + agent live feed + extras.
 * Priority on same id: agent > extra > race > static (later sources win).
 * Sort: date asc, then title.
 */
export function buildCalendarEvents(opts?: {
  races?: RaceDef[];
  live?: CalendarEvent[] | null;
  extra?: CalendarEvent[];
}): CalendarEvent[] {
  const merged = new Map<string, CalendarEvent>();
  const put = (e: CalendarEvent | null | undefined) => {
    if (!e?.id || !ISO_DAY.test(e.date)) return;
    merged.set(e.id, e);
  };
  for (const e of STATIC_CALENDAR_EVENTS) put(e);
  for (const e of eventsFromRaceBoard(opts?.races)) put(e);
  for (const e of opts?.extra ?? []) put(e);
  for (const e of opts?.live ?? []) put(e);
  return [...merged.values()].sort(
    (a, b) => a.date.localeCompare(b.date) || a.title.localeCompare(b.title)
  );
}

/** Group events by YYYY-MM-DD. */
export function eventsByDate(events: CalendarEvent[]): Map<string, CalendarEvent[]> {
  const map = new Map<string, CalendarEvent[]>();
  for (const e of events) {
    const list = map.get(e.date) ?? [];
    list.push(e);
    map.set(e.date, list);
  }
  return map;
}

/** Group events by YYYY-MM for month navigation bounds. */
export function eventsByMonth(events: CalendarEvent[]): Map<string, CalendarEvent[]> {
  const map = new Map<string, CalendarEvent[]>();
  for (const e of events) {
    const ym = e.date.slice(0, 7);
    const list = map.get(ym) ?? [];
    list.push(e);
    map.set(ym, list);
  }
  return map;
}

/** Today as YYYY-MM-DD in America/New_York (Clad desk timezone). */
export function todayIsoNy(now = new Date()): string {
  try {
    const parts = new Intl.DateTimeFormat("en-US", {
      timeZone: "America/New_York",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).formatToParts(now);
    const y = parts.find((p) => p.type === "year")?.value;
    const m = parts.find((p) => p.type === "month")?.value;
    const d = parts.find((p) => p.type === "day")?.value;
    if (y && m && d) return `${y}-${m}-${d}`;
  } catch {
    /* fall through */
  }
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const d = String(now.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

export function monthLabel(ym: string): string {
  const [y, m] = ym.split("-").map(Number);
  if (!y || !m) return ym;
  const d = new Date(Date.UTC(y, m - 1, 1));
  return d.toLocaleDateString("en-US", { month: "long", year: "numeric", timeZone: "UTC" });
}

/** Shift YYYY-MM by delta months. */
export function shiftMonth(ym: string, delta: number): string {
  const [y, m] = ym.split("-").map(Number);
  const d = new Date(Date.UTC(y, m - 1 + delta, 1));
  const yy = d.getUTCFullYear();
  const mm = String(d.getUTCMonth() + 1).padStart(2, "0");
  return `${yy}-${mm}`;
}

export function kindLabel(kind: CalendarEventKind | string): string {
  switch (kind) {
    case "election":
      return "Election";
    case "primary":
      return "Primary";
    case "runoff":
      return "Runoff";
    case "special":
      return "Special election";
    case "general":
      return "General election";
    case "party-process":
      return "Party process";
    case "politics":
      return "Politics";
    case "speech":
      return "Speech";
    case "launch":
      return "Launch";
    case "science":
      return "Science & tech";
    case "markets":
      return "Markets";
    case "conflict":
      return "Conflict";
    case "disaster":
      return "Disaster";
    case "court":
      return "Court";
    case "diplomacy":
      return "Diplomacy";
    case "culture":
      return "Culture";
    case "sports":
      return "Sports";
    case "deadline":
      return "Deadline";
    case "clad":
      return "CladFacts";
    case "personal":
      return "Personal";
    default:
      return "News";
  }
}

/**
 * Private birthday marker — only on the day itself (America/New_York desk date).
 * Hidden every other day. Message is the Grok-written note (or a short fallback).
 * Never include user id or other PII in the payload.
 */
export function eventsFromUserBirthday(
  birthday: string | null | undefined,
  opts?: { message?: string | null; now?: Date }
): CalendarEvent[] {
  if (!birthday || !/^\d{4}-\d{2}-\d{2}$/.test(birthday)) return [];
  const mmdd = birthday.slice(5); // MM-DD
  if (!/^\d{2}-\d{2}$/.test(mmdd)) return [];
  const today = todayIsoNy(opts?.now);
  if (today.slice(5) !== mmdd) return []; // only the day of
  const year = Number(today.slice(0, 4));
  const message =
    (opts?.message && String(opts.message).trim().slice(0, 600)) ||
    "Happy birthday from the CladFacts desk — only you can see this. Enjoy the day.";
  return [
    {
      id: `my-birthday-${year}`,
      date: today,
      title: "Happy birthday!",
      body: message,
      kind: "personal" as const,
      source: "extra" as const,
    },
  ];
}

/** True when the desk calendar day matches the user's birthday MM-DD. */
export function isBirthdayToday(birthday: string | null | undefined, now = new Date()): boolean {
  if (!birthday || !/^\d{4}-\d{2}-\d{2}$/.test(birthday)) return false;
  return todayIsoNy(now).slice(5) === birthday.slice(5);
}

/**
 * Attach recent Clad reports as calendar markers on their publish day so past
 * coverage is clickable even before the scanner has a dedicated log entry.
 * Caps per day to avoid flooding.
 */
export function eventsFromPosts(
  posts: { id: string; data: { headline: string; publishedAt: Date; summary?: string } }[],
  opts?: { max?: number; maxPerDay?: number; daysBack?: number }
): CalendarEvent[] {
  const max = opts?.max ?? 40;
  const maxPerDay = opts?.maxPerDay ?? 3;
  const daysBack = opts?.daysBack ?? 45;
  const cutoff = Date.now() - daysBack * 86_400_000;
  const perDay = new Map<string, number>();
  const out: CalendarEvent[] = [];

  const sorted = [...posts]
    .filter((p) => p.data.publishedAt.valueOf() >= cutoff)
    .sort((a, b) => b.data.publishedAt.valueOf() - a.data.publishedAt.valueOf());

  for (const p of sorted) {
    if (out.length >= max) break;
    const date = todayIsoNy(p.data.publishedAt);
    // publishedAt may not be NY midnight — use ISO date in NY for that instant
    const n = perDay.get(date) ?? 0;
    if (n >= maxPerDay) continue;
    perDay.set(date, n + 1);
    out.push({
      id: `post-${p.id}`,
      date,
      title: p.data.headline.slice(0, 160),
      body: p.data.summary ? String(p.data.summary).slice(0, 400) : undefined,
      kind: "other",
      source: "post",
      links: [{ label: "Read report", href: `/posts/${p.id}/` }],
    });
  }
  return out;
}
