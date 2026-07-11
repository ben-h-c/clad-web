/**
 * Worker-side Good News fallback. The /good-news page normally renders the
 * Grok-curated collections the Good News Curator writes to KV, but the curator
 * runs on the Mac runner. So the page never depends on it: when KV is empty
 * (curator hasn't run, or the runner is down), this builds a solid page of its
 * own from the published content collection, bucketed into simple themed
 * sections.
 *
 * The bar is deliberately high: a story qualifies only if it carries a genuine
 * POSITIVE/exciting signal AND clears every downbeat gate (politics, tragedy,
 * plain-negative business/legal/sports news, and dry panel/opinion segments).
 * "Not obviously bad" is not enough — the page should read as actively good
 * news, so neutral or merely-not-tragic items are excluded on purpose.
 *
 * HEAVY_POLITICS/TRAGEDY are copied from runner/newsroom.mjs's heuristic (that
 * module can't be pulled into the Worker bundle); the other gates are specific
 * to this page. Kept in sync by hand.
 */
import type { CollectionEntry } from "astro:content";
import type { GoodNewsSection } from "./agents.ts";

type Post = CollectionEntry<"posts">;

const HEAVY_POLITICS =
  /\b(?:trump|biden|obama|harris|vance|newsom|desantis|pence|gowdy|warnock|schiff|clinton|mamdani|starmer|presiden\w*|congress\w*|senat\w*|lawmaker\w*|legislat\w*|filibuster|shutdown|impeach\w*|administration|white house|cabinet|governor|mayor\w*|attorney general|election\w*|midterm\w*|primary|primaries|ballot\w*|voter\w*|caucus\w*|campaign\w*|polls?|democrat\w*|republican\w*|gop|bipartisan|doj|fbi|cia|dhs|supreme court|scotus|federal court|lawsuit\w*|indict\w*|ruling|subpoena\w*|immigrat\w*|immigrant\w*|border|deport\w*|visa|migrant\w*|asylum|abortion|guns?|firearm\w*|iran\w*|israel\w*|gaza|hamas|hezbollah|idf|netanyahu|ukrain\w*|russia\w*|putin|zelensky|kremlin|china|chinese|taiwan|beijing|tariff\w*|sanction\w*|federal reserve|inflation|recession|nato|g7|g20|summit|foreign policy|diplomac\w*|geopolit\w*|wars?|military|missile\w*|airstrike\w*|troops|nuclear|genocide|protest\w*|riot\w*|terror\w*|coup|regime|parliament\w*|prime minister|dni|nominat\w*|hearing|probe|policy|policies|regulat\w*|agenc\w*|oversight|forest service|national forest\w*|mining|federal)\b/i;
const TRAGEDY =
  /\b(?:crash\w*|dead|dies|died|death\w*|deadly|fatal\w*|kill\w*|homicide|shoot\w*|gunman|gunmen|massacre|stabbing|stabbed|wildfire\w*|flood\w*|hurricane\w*|tornado\w*|earthquake\w*|tsunami|disaster\w*|catastroph\w*|victim\w*|tragedy|tragic|collaps\w*|explos\w*|bomb\w*|injur\w*|wound\w*|casualt\w*|outbreak\w*|pandemic|epidemic|overdose\w*|missing|manhunt|abduct\w*|kidnap\w*|assault\w*)\b/i;

// Additional political / civic terms the newsroom list misses but that keep
// slipping onto the Good News page (ministers, pay disputes, guilty pleas,
// classified-docs sagas, royals-as-politics, etc.).
const POLITICS_EXTRA =
  /\b(?:minister\w*|secretary|\bmp\b|\bmps\b|commissioner|councill?or|guilty|plea\w*|classified|espionage|treason|scandal|corruption|bribery|whistleblow\w*|fauci|covid|lockdown\w*|vaccine mandate|monarch\w*|royal\w*|\bking\b|\bqueen\b|prince\w*|princess|duke|duchess|harry|meghan|epstein|verdict|acquit\w*|sentenc\w*|prosecut\w*|testif\w*|testimony|nominee|confirmation|referendum|coalition|resign\w*|ousted|impeachment|devolution|downing|no\.? ?10|number 10|navy|naval|warship\w*|air force|\barmy\b|combat|militi\w*)\b/i;
// Plain-negative, non-tragedy downbeat news — market slumps, layoffs, recalls,
// bans, feuds, criticism, climate/heat and housing stress. Not "tragedy", but
// definitely not good news.
const NEGATIVE =
  /\b(?:selloff|sell-off|tumbl\w*|plung\w*|plummet\w*|slump\w*|sink\w*|slid\w*|slip\w*|\bfell\b|\bfalls?\b|drop\w*|declin\w*|downturn|down\b|cuts?\b|layoff\w*|job cuts|fire[ds]\b|fired|recall\w*|\bsued\b|\bsues\b|ban\b|bans\b|banned|suspend\w*|suspension|fine[ds]?\b|penalt\w*|warn\w*|delay\w*|shortage\w*|hike\w*|slash\w*|slam\w*|blast\w*|mock\w*|criticiz\w*|criticis\w*|controvers\w*|backlash|feud\w*|dispute\w*|tension\w*|crisis|woes|struggl\w*|fears?|concern\w*|risks?|threat\w*|loss\w*|\bmiss\w*|weak\w*|slowdown|halt\w*|scrap\w*|boycott\w*|strike\w*|outage\w*|breach\w*|hack\w*|scam\w*|fraud\w*|bankrupt\w*|default\w*|downgrad\w*|glut|heat ?wave\w*|heat-related|scorching|sweltering|drought\w*|famine|foreclosur\w*|evict\w*|affordability)\b/i;
// Dry panel / opinion / recap / fact-check-meta formats — commentary about
// coverage, not an exciting event.
const COMMENTARY =
  /\b(?:discuss\w*|interview\w*|panel\w*|roundtable|op-?ed|opinion\w*|analy[sz]\w*|outlook|weighs? in|reacts?|reaction|breaks? down|explain\w*|debate\w*|commentar\w*|preview\w*|recap\w*|slams?|weigh\w* in|sit[s]? down|examin\w*|holds? up|accurate\w*|inaccurate\w*|misleading|fact-?check\w*|debunk\w*)\b/i;
// Genuine positive / exciting signal — at least one is required to qualify.
const POSITIVE =
  /\b(?:breakthrough\w*|discover\w*|milestone\w*|record\w*|first-ever|first ever|historic\w*|unveil\w*|debut\w*|launch\w*|reveal\w*|introduc\w*|premiere\w*|wins?|\bwon\b|victor\w*|champion\w*|title\w*|gold\b|medal\w*|triumph\w*|comeback\w*|celebrat\w*|reunit\w*|rescue\w*|saved|restor\w*|reviv\w*|soar\w*|surg\w*|boom\w*|boost\w*|thriv\w*|achievement\w*|award\w*|honou?r\w*|prize\w*|inspir\w*|heartwarming|uplifting|kindness|generou\w*|donat\w*|charit\w*|miracle\w*|hope\w*|wonder\w*|stunning|remarkable|success\w*|landmark|groundbreaking|pioneer\w*|innovat\w*|mission\w*|rover\w*|telescope\w*|spacewalk\w*|\bcure\w*|lifesaving|recover\w*|rebound\w*|hits? record|reaches?|breaks? record|new (?:record|species|era|era of|home|era)|feat\b)\b/i;

function blob(p: Post): string {
  return `${(p.data.topics ?? []).join(" ")} ${p.data.headline ?? ""} ${p.data.section ?? ""}`;
}

/**
 * Actively good news: carries a positive/exciting signal and clears every
 * downbeat gate. Deliberately strict — "not tragic" alone does not qualify.
 */
export function isPositive(p: Post): boolean {
  const b = blob(p);
  if (HEAVY_POLITICS.test(b) || POLITICS_EXTRA.test(b)) return false;
  if (TRAGEDY.test(b) || NEGATIVE.test(b)) return false;
  if (COMMENTARY.test(b)) return false;
  return POSITIVE.test(b);
}

// Themed buckets, in priority order. A positive post lands in the first bucket
// whose pattern it matches; the trailing catch-all sweeps up anything left so
// the page always has a "bright spots" section to show.
const BUCKETS: { title: string; blurb: string; re: RegExp }[] = [
  {
    title: "Liftoff",
    blurb: "Rockets, launches, and the latest from space.",
    // Deliberately no bare "launch"/"satellite" terms: product/ETF/gadget
    // "launches" must not land in the space bucket. Launch coverage comes via
    // space-specific compounds only.
    re: /\b(?:space|spacex|falcon|starlink|starship|nasa|rocket\w*|orbit\w*|mars|moon|lunar|astronaut\w*|cosmic|telescope|galaxy|asteroid|rocket launch\w*|space launch\w*|satellite launch\w*|launch pad)\b/i,
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
