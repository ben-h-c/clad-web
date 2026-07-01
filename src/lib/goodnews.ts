/**
 * Worker-side Good News fallback. The /good-news page normally renders the
 * Grok-curated collections the Good News Curator writes to KV, but the curator
 * runs on the Mac runner. So the page never depends on it: when KV is empty
 * (curator hasn't run, or the runner is down), this builds a solid page of its
 * own from the published content collection — the same "lighthearted" heuristic
 * the runner's newsroom classifier falls back to (positive / uplifting /
 * interesting, never politics or tragedy), bucketed into simple themed sections.
 *
 * The regexes here are a deliberate copy of runner/newsroom.mjs's heuristic —
 * that module imports the runner's HTTP client and can't be pulled into the
 * Worker bundle, so the two are kept in sync by hand.
 */
import type { CollectionEntry } from "astro:content";
import type { GoodNewsSection } from "~/lib/agents";

type Post = CollectionEntry<"posts">;

const HEAVY_POLITICS =
  /\b(?:trump|biden|obama|harris|vance|newsom|desantis|pence|gowdy|warnock|schiff|clinton|mamdani|starmer|presiden\w*|congress\w*|senat\w*|lawmaker\w*|legislat\w*|filibuster|shutdown|impeach\w*|administration|white house|cabinet|governor|mayor\w*|attorney general|election\w*|midterm\w*|primary|primaries|ballot\w*|voter\w*|caucus\w*|campaign\w*|polls?|democrat\w*|republican\w*|gop|bipartisan|doj|fbi|cia|dhs|supreme court|scotus|federal court|lawsuit\w*|indict\w*|ruling|subpoena\w*|immigrat\w*|immigrant\w*|border|deport\w*|visa|migrant\w*|asylum|abortion|guns?|firearm\w*|iran\w*|israel\w*|gaza|hamas|hezbollah|idf|netanyahu|ukrain\w*|russia\w*|putin|zelensky|kremlin|china|chinese|taiwan|beijing|tariff\w*|sanction\w*|federal reserve|inflation|recession|nato|g7|g20|summit|foreign policy|diplomac\w*|geopolit\w*|wars?|military|missile\w*|airstrike\w*|troops|nuclear|genocide|protest\w*|riot\w*|terror\w*|coup|regime|parliament\w*|prime minister|dni|nominat\w*|hearing|probe|policy|policies|regulat\w*|agenc\w*|oversight|forest service|national forest\w*|mining|federal)\b/i;
const TRAGEDY =
  /\b(?:crash\w*|dead|dies|died|death\w*|deadly|fatal\w*|kill\w*|homicide|shoot\w*|gunman|gunmen|massacre|stabbing|stabbed|wildfire\w*|flood\w*|hurricane\w*|tornado\w*|earthquake\w*|tsunami|disaster\w*|catastroph\w*|victim\w*|tragedy|tragic|collaps\w*|explos\w*|bomb\w*|injur\w*|wound\w*|casualt\w*|outbreak\w*|pandemic|epidemic|overdose\w*|missing|manhunt|abduct\w*|kidnap\w*|assault\w*)\b/i;

function blob(p: Post): string {
  return `${(p.data.topics ?? []).join(" ")} ${p.data.headline ?? ""} ${p.data.section ?? ""}`;
}

/** Positive / uplifting / interesting, never political or tragic. */
export function isPositive(p: Post): boolean {
  const b = blob(p);
  return !HEAVY_POLITICS.test(b) && !TRAGEDY.test(b);
}

// Themed buckets, in priority order. A positive post lands in the first bucket
// whose pattern it matches; the trailing catch-all sweeps up anything left so
// the page always has a "bright spots" section to show.
const BUCKETS: { title: string; blurb: string; re: RegExp }[] = [
  {
    title: "Liftoff",
    blurb: "Rockets, launches, and the latest from space.",
    re: /\b(?:space|spacex|falcon|starlink|starship|nasa|rocket\w*|launch\w*|satellite\w*|orbit\w*|mars|moon|lunar|astronaut\w*|cosmic|telescope|galaxy|asteroid)\b/i,
  },
  {
    title: "Bright Ideas",
    blurb: "AI, chips, gadgets, and the tech worth knowing about.",
    re: /\b(?:ai|a\.i\.|artificial intelligence|chip\w*|nvidia|gpu|semiconductor\w*|robot\w*|software|app\b|gadget\w*|openai|anthropic|grok|gemini|llm|quantum|algorithm\w*|startup\w*)\b/i,
  },
  {
    title: "Discoveries",
    blurb: "Science, research, and genuine breakthroughs.",
    re: /\b(?:science|scientific|research\w*|stud(?:y|ies)|discover\w*|breakthrough\w*|fossil\w*|species|dna|genome|physics|biology|climate tech|medicine|vaccine|cure\w*|telescope)\b/i,
  },
  {
    title: "Big Moves",
    blurb: "Markets, deals, and business milestones.",
    re: /\b(?:ipo\w*|stock\w*|market\w*|earnings|revenue|profit\w*|trillion\w*|billion\w*|merger\w*|acquisition\w*|deal\w*|valuation\w*|nasdaq|s&p|dow|bond\w*|buyback\w*)\b/i,
  },
  {
    title: "Game On",
    blurb: "Wins, comebacks, and the world of sport.",
    re: /\b(?:game\w*|match\w*|championship\w*|\bcup\b|league\w*|nba|nfl|nhl|mlb|world cup|olympic\w*|\bgoal\w*|tournament\w*|playoff\w*|\bdraft\b|medal\w*|record\w*|champion\w*|final\w*)\b/i,
  },
  {
    title: "Culture & Curiosities",
    blurb: "Film, music, art, and human-interest bright spots.",
    re: /\b(?:film\w*|movie\w*|music\w*|album\w*|celebrit\w*|festival\w*|\bart\b|artist\w*|award\w*|actor\w*|actress\w*|singer\w*|museum\w*|wedding\w*|rescue\w*|reunit\w*|kindness|hero(?:es|ic)?|heartwarming|inspir\w*)\b/i,
  },
  {
    title: "More Bright Spots",
    blurb: "A little of everything on the lighter side of the news.",
    re: /.*/,
  },
];

/**
 * Build a Good News page directly from the published posts (newest-first),
 * bucketed into themed sections. Only returns sections with at least 2 posts.
 */
export function buildGoodNewsSections(posts: Post[], perSection = 6, maxPool = 300): GoodNewsSection[] {
  const positive = posts
    .filter((p) => !p.data.draft && isPositive(p))
    .sort((a, b) => b.data.publishedAt.getTime() - a.data.publishedAt.getTime())
    .slice(0, maxPool);

  const used = new Set<string>();
  const sections: GoodNewsSection[] = [];
  for (const bucket of BUCKETS) {
    const ids: string[] = [];
    for (const p of positive) {
      if (used.has(p.id)) continue;
      if (bucket.re.test(blob(p))) {
        used.add(p.id);
        ids.push(p.id);
        if (ids.length >= perSection) break;
      }
    }
    if (ids.length >= 2) sections.push({ title: bucket.title, blurb: bucket.blurb, ids });
  }
  return sections.slice(0, 8);
}
