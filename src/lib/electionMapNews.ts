/**
 * Pick recent graded reports relevant to the Midterms 2026 map:
 * candidate coverage, race chatter, election process, forecasts/poll framing.
 */
import type { CollectionEntry } from "astro:content";
import type { RaceCardLive } from "./bracket.ts";

export type ElectionNewsKind = "candidate" | "race" | "election" | "forecast";

export interface ElectionNewsItem {
  post: CollectionEntry<"posts">;
  kind: ElectionNewsKind;
  kindLabel: string;
  matchedNames: string[];
  score: number;
}

export interface RaceWatchItem {
  raceId: string;
  office: string;
  state: string;
  tier: string;
  heat: number;
  voteDateLabel: string;
  daysToVote: number;
  aName: string;
  bName: string;
  note: string | null;
  href: string;
}

const KIND_LABEL: Record<ElectionNewsKind, string> = {
  candidate: "Candidate",
  race: "Race",
  election: "Election",
  forecast: "Outlook",
};

/** Clean a board / tag name for the desk chip (drop middles, junk). */
function displayCandidateName(name: string): string {
  return name
    .trim()
    .replace(/\s*\([^)]*\)\s*/g, " ") // drop "(FL)" style notes
    .replace(/\s+[A-Z]\.\s+/g, " ") // middle initial
    .replace(/\s+/g, " ")
    .trim();
}

/** Badge text: show board candidate names instead of the generic "Candidate" chip. */
function deskKindLabel(kind: ElectionNewsKind, matchedNames: string[]): string {
  if (kind === "candidate" && matchedNames.length > 0) {
    const seen = new Set<string>();
    const labels: string[] = [];
    for (const raw of matchedNames) {
      const label = displayCandidateName(raw);
      if (!label || isPlaceholderName(label)) continue;
      const key = label.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      labels.push(label);
      if (labels.length >= 2) break;
    }
    if (labels.length) return labels.join(" · ");
  }
  return KIND_LABEL[kind];
}

/** US midterm / process signals (not bare "election" — that pulls foreign races). */
const ELECTION_RE =
  /\b(midterm|midterms|2026\s+election|class\s*ii|u\.?s\.?\s+senate|senate\s+race|senate\s+seat|governor(?:ial)?\s+race|gubernatorial|special\s+election|primary\s+(?:day|election|voters?)|runoff|ballot\s+board|congressional\s+race|house\s+race|redistrict|gerrymander|voting\s+rights|voter\s+id|save\s+act|election\s+integrity|election\s+day|general\s+election)\b/i;

const FORECAST_RE =
  /\b(poll(?:s|ing)?|forecast|toss[- ]?up|lean\s+(?:dem|gop|republican|democratic)|likely\s+(?:dem|gop)|solid\s+(?:blue|red)|cook\s+political|538|fivethirtyeight|prediction\s+market|odds\s+on|favored\s+to\s+win|path\s+to)\b/i;

/** Soft demote pure foreign/uk politics unless a board candidate also matches. */
const FOREIGN_RE =
  /\b(burnham|starmer|keir|labour\s+party|tory|conservatives?\s+party|makerfield|westminster|uk\s+pm|british\s+pm|hungary|orban|netanyahu|knesset|carney|ottawa|parliament\s+hill|macron|bundestag)\b/i;

function escapeRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function isPlaceholderName(name: string): boolean {
  const n = name.trim().toLowerCase();
  if (!n) return true;
  if (
    /\b(field|tbd|nominee|primary|gop field|dem field|democratic nominee|republican nominee|term[- ]?limited|open seat|unopposed|no candidate|vacant|to be determined)\b/.test(
      n
    )
  ) {
    return true;
  }
  // "Term-limited / open (FL)", "Open (MI)", bare state codes, etc.
  if (/\bopen\b/.test(n) && (n.includes("/") || /\([a-z]{2}\)/.test(n) || n.length < 18)) {
    return true;
  }
  // "Dem primary (X / Y)" style placeholders
  if (/^(dem|gop|democratic|republican)\b/i.test(n) && n.includes("(")) return true;
  // Not a person name
  if (/^term[- ]?limited\b/.test(n)) return true;
  return false;
}

/** Last-name-ish tokens for matching (skip short noise). */
function nameNeedles(name: string): string[] {
  if (isPlaceholderName(name)) return [];
  const parts = name
    .replace(/[()]/g, " ")
    .split(/[\s/]+/)
    .map((p) => p.trim())
    .filter((p) => p.length >= 4)
    .filter((p) => !/^(jr|sr|iii|ii|iv|the|and|for|from)$/i.test(p));
  // Prefer full name + last token
  const out = new Set<string>();
  if (name.trim().length >= 5 && !isPlaceholderName(name)) out.add(name.trim());
  const last = parts[parts.length - 1];
  if (last) out.add(last);
  return [...out];
}

function matchesNeedle(haystack: string, needle: string): boolean {
  const n = needle.trim();
  if (!n) return false;
  if (/\s/.test(n)) return haystack.includes(n.toLowerCase());
  return new RegExp(`\\b${escapeRe(n)}\\b`, "i").test(haystack);
}

function blob(p: CollectionEntry<"posts">): string {
  const d = p.data;
  return [d.headline, d.summary, ...(d.topics ?? []), d.section ?? "", d.sourceTitle ?? ""]
    .join(" \n ")
    .toLowerCase();
}

function taggedPoliticians(p: CollectionEntry<"posts">): { name: string; slug: string }[] {
  return (p.data.politicians ?? []).map((x) => ({ name: x.name, slug: x.slug }));
}

/**
 * Rank and return election-desk headlines for the map page.
 */
export function pickElectionMapNews(
  posts: CollectionEntry<"posts">[],
  cards: RaceCardLive[],
  opts?: { limit?: number; maxAgeDays?: number }
): ElectionNewsItem[] {
  const limit = opts?.limit ?? 10;
  const maxAgeDays = opts?.maxAgeDays ?? 45;
  const cutoff = Date.now() - maxAgeDays * 86_400_000;

  // Candidate needles from the live race board
  const candidateNames: { name: string; needles: string[] }[] = [];
  const officeNeedles: string[] = [];
  for (const c of cards) {
    for (const side of [c.a, c.b]) {
      if (isPlaceholderName(side.name)) continue;
      const needles = nameNeedles(side.name);
      if (needles.length) candidateNames.push({ name: side.name, needles });
    }
    // "Georgia Senate", "Ohio Governor" style
    const office = (c.def.office || "").trim();
    if (office.length >= 6) officeNeedles.push(office.toLowerCase());
    if (c.def.state) {
      officeNeedles.push(`${c.def.state.toLowerCase()} senate`);
      officeNeedles.push(`${c.def.state.toLowerCase()} governor`);
    }
  }

  const scored: ElectionNewsItem[] = [];

  for (const post of posts) {
    if (post.data.draft) continue;
    const published = post.data.publishedAt?.valueOf?.() ?? Date.parse(String(post.data.publishedAt));
    if (!Number.isFinite(published) || published < cutoff) continue;

    const text = blob(post);
    const ageDays = (Date.now() - published) / 86_400_000;
    let score = 0;
    let kind: ElectionNewsKind = "election";
    const matchedNames: string[] = [];

    // Explicit politician tags overlapping the board
    const tagged = taggedPoliticians(post);
    for (const t of tagged) {
      const hit = candidateNames.find(
        (c) =>
          c.name.toLowerCase() === t.name.toLowerCase() ||
          c.needles.some((n) => n.toLowerCase() === t.slug.replace(/-/g, " ") || matchesNeedle(t.name.toLowerCase(), n))
      );
      if (hit || candidateNames.some((c) => c.needles.some((n) => matchesNeedle(t.name, n)))) {
        score += 12;
        kind = "candidate";
        matchedNames.push(t.name);
      }
    }

    for (const c of candidateNames) {
      if (c.needles.some((n) => matchesNeedle(text, n))) {
        score += 10;
        kind = "candidate";
        if (!matchedNames.includes(c.name)) matchedNames.push(c.name);
      }
    }

    if (officeNeedles.some((o) => text.includes(o))) {
      score += 6;
      if (kind !== "candidate") kind = "race";
    }

    if (FORECAST_RE.test(text)) {
      score += 5;
      if (kind === "election") kind = "forecast";
    }

    if (ELECTION_RE.test(text)) {
      score += 7;
      if (kind === "election" && !FORECAST_RE.test(text)) kind = "election";
    }

    // Section Politics alone is weak — only a nudge if already somewhat relevant
    if (score > 0 && post.data.section === "Politics") score += 1;

    // Foreign noise without a board candidate → discard or heavy demote
    if (FOREIGN_RE.test(text) && matchedNames.length === 0) {
      score -= 12;
    }

    if (score < 6) continue;

    // Recency: newer wins ties
    score += Math.max(0, 8 - ageDays * 0.25);

    const names = matchedNames.slice(0, 3);
    scored.push({
      post,
      kind,
      kindLabel: deskKindLabel(kind, names),
      matchedNames: names,
      score,
    });
  }

  scored.sort((a, b) => b.score - a.score || b.post.data.publishedAt.valueOf() - a.post.data.publishedAt.valueOf());

  // Prefer diversity: don't fill the whole list with one candidate
  const out: ElectionNewsItem[] = [];
  const nameCounts = new Map<string, number>();
  for (const item of scored) {
    const key = item.matchedNames[0]?.toLowerCase() || item.post.id;
    const n = nameCounts.get(key) ?? 0;
    if (n >= 2 && out.length >= 4) continue;
    nameCounts.set(key, n + 1);
    out.push(item);
    if (out.length >= limit) break;
  }
  return out;
}

/**
 * Near-term / high-heat races for a "board watch" strip under the map.
 */
export function pickRaceWatch(cards: RaceCardLive[], limit = 6): RaceWatchItem[] {
  const ranked = [...cards]
    .filter((c) => c.heat > 0 || c.daysToVote <= 60 || c.def.tier === "marquee")
    .sort((a, b) => {
      // Soonest known vote, then heat, then marquee
      const aTbd = !Number.isFinite(a.daysToVote) || a.daysToVote > 400 ? 1 : 0;
      const bTbd = !Number.isFinite(b.daysToVote) || b.daysToVote > 400 ? 1 : 0;
      return (
        aTbd - bTbd ||
        a.daysToVote - b.daysToVote ||
        b.heat - a.heat ||
        a.def.office.localeCompare(b.def.office)
      );
    })
    .slice(0, limit);

  return ranked.map((c) => ({
    raceId: c.def.id,
    office: c.def.office,
    state: c.def.state,
    tier: c.def.tier,
    heat: c.heat,
    voteDateLabel: c.voteDateLabel || "Date TBD",
    daysToVote: c.daysToVote,
    aName: c.a.name,
    bName: c.b.name,
    note: c.def.note ?? null,
    href: "/bracket/",
  }));
}
