import type { APIRoute } from "astro";
import { env } from "cloudflare:workers";
import {
  buildCalendarEvents,
  kindLabel,
  normalizeCalendarEvent,
  todayIsoNy,
  type CalendarEvent,
} from "~/lib/calendarEvents";
import { getCalendarEventsStore } from "~/lib/agents";
import { DEFAULT_ELECTION_ID, getElectionWithPublishedDates } from "~/lib/elections";

export const prerender = false;

// The daybook as a subscribable calendar feed — what the "Add to calendar"
// action on the home calendar's Ahead view downloads.
//
// Public and grade-free by construction: this feed carries only scheduled
// events (elections, rulings, launches), never report grades or lean.
// All-day VEVENTs, so no timezone maths is needed on the client.

const MAX_EVENTS = 200;
const HORIZON_DAYS = 400;

/** RFC 5545 text escaping: backslash, semicolon, comma, newline. */
function esc(s: string): string {
  return String(s ?? "")
    .replace(/\\/g, "\\\\")
    .replace(/;/g, "\\;")
    .replace(/,/g, "\\,")
    .replace(/\r?\n/g, "\\n");
}

/** Fold lines at 75 octets as the spec requires; CRLF + a leading space. */
function fold(line: string): string {
  if (line.length <= 75) return line;
  const parts: string[] = [line.slice(0, 75)];
  let rest = line.slice(75);
  while (rest.length > 74) {
    parts.push(" " + rest.slice(0, 74));
    rest = rest.slice(74);
  }
  if (rest.length) parts.push(" " + rest);
  return parts.join("\r\n");
}

const compact = (d: string) => d.replace(/-/g, "");

function nextDay(date: string): string {
  const [y, m, d] = date.split("-").map(Number);
  return new Date(Date.UTC(y, (m || 1) - 1, (d || 1) + 1)).toISOString().slice(0, 10);
}

export const GET: APIRoute = async ({ request }) => {
  let events: CalendarEvent[] = [];
  try {
    const election = await getElectionWithPublishedDates(DEFAULT_ELECTION_ID, env.AGENTS);
    const store = await getCalendarEventsStore(env.AGENTS);
    const live = (store?.events ?? [])
      .map((e) => normalizeCalendarEvent(e, "agent"))
      .filter((e): e is CalendarEvent => e != null);
    events = buildCalendarEvents({ races: election?.races, live });
  } catch {
    // A KV hiccup should still yield a valid (static-only) calendar.
    events = buildCalendarEvents({});
  }

  const today = todayIsoNy();
  const horizon = new Date(Date.now() + HORIZON_DAYS * 86_400_000).toISOString().slice(0, 10);
  const upcoming = events
    .filter((e) => e.date >= today && e.date <= horizon)
    .sort((a, b) => a.date.localeCompare(b.date))
    .slice(0, MAX_EVENTS);

  // DTSTAMP must be a real UTC timestamp; the events themselves are all-day.
  const stamp = new Date().toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
  const origin = new URL(request.url).origin;

  const lines: string[] = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//CladFacts//Daybook//EN",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    "X-WR-CALNAME:CladFacts Daybook",
    "X-WR-CALDESC:Scheduled news events tracked by CladFacts",
  ];

  for (const e of upcoming) {
    const desc = [e.body, `${kindLabel(e.kind)}${e.state ? ` · ${e.state}` : ""}`]
      .filter(Boolean)
      .join("\n\n");
    lines.push(
      "BEGIN:VEVENT",
      `UID:${esc(e.id)}@cladfacts.com`,
      `DTSTAMP:${stamp}`,
      `DTSTART;VALUE=DATE:${compact(e.date)}`,
      `DTEND;VALUE=DATE:${compact(nextDay(e.date))}`,
      fold(`SUMMARY:${esc(e.title)}`),
      ...(desc ? [fold(`DESCRIPTION:${esc(desc)}`)] : []),
      fold(`URL:${origin}/day/${e.date}/`),
      `CATEGORIES:${esc(kindLabel(e.kind))}`,
      "TRANSP:TRANSPARENT",
      "END:VEVENT"
    );
  }
  lines.push("END:VCALENDAR");

  return new Response(lines.join("\r\n") + "\r\n", {
    headers: {
      "Content-Type": "text/calendar; charset=utf-8",
      "Content-Disposition": 'attachment; filename="cladfacts.ics"',
      // Public and grade-free, so it can sit on the shared cache.
      "Cache-Control": "public, max-age=900, s-maxage=3600",
    },
  });
};
