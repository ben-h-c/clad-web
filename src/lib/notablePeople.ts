/**
 * Named people in graded coverage — not only officeholders.
 * Used by People in the news. Not a politician tagger — non-officeholders
 * never get /politicians/[slug] report cards.
 *
 * Deterministic (no xAI). Headline/summary proper names, filtered hard.
 */
import { slugify } from "./slug.ts";

export interface NotablePersonTag {
  name: string;
  slug: string;
}

/** Shared by the matcher (so we don't capture "President Donald") and the stripper. */
const HONORIFIC_ALT =
  "Rep|Sen|Gov|Pres|President|Dr|Mr|Mrs|Ms|Gen|Capt|Rev|Prof|Sgt|Lt|Col|Adm|Amb|Sec|Secretary|Speaker|Judge|Justice|Mayor|Reps|Director|CEO|Host|Chair|Chairman|Chairwoman|Commissioner|Minister|Reporter|Official|Ambassador|Governor|Senator|Congressman|Congresswoman|Representative";

const HONORIFIC = new RegExp(`^(?:${HONORIFIC_ALT})\\.?\\s+`, "i");

const PARTICLE = "van|von|de|da|del|della|di|du|le|la|bin|al|el|dos|st|saint";

/** First token cannot be these (sentence starters, geographies, institutions). */
const STOP_FIRST = new Set(
  `
  a an the this that these those some many most last next first second third
  in on at to of for from with after before during while since until
  new united north south east west federal national official public private
  american british israeli iranian chinese russian ukrainian mexican canadian
  house white supreme state county city lake mount fort port san los las
  how why what when where who whom whose which
  fox cnn bbc cbs nbc abc pbs npr ap
  today tonight tomorrow monday tuesday wednesday thursday friday saturday sunday
  january february march april june july august september october november december
  high low world super air prime deputy acting former late
  defense operation secretary director host guest president
  royal daily truth social chair commissioner minister reporter official
  assistant spokesman spokeswoman ambassador congress senate house
  space swarm aeronautics democracy summer winter spring autumn
  lebanese palestinian israeli iranian ukrainian russian chinese
  california texas florida ohio china russia iran israel mexico india
  virginia georgia alabama arizona colorado minnesota wisconsin
  michigan pennsylvania maryland missouri oregon washington
  reuters bloomberg forbes youtube tesla rivian google apple meta
  `.split(/\s+/).filter(Boolean)
);

/** Last token cannot be these (verbs, orgs, places, headline leftovers). */
const STOP_LAST = new Set(
  `
  news times post house states york court street bank cup bowl kitchen
  farms records pictures studios university college department committee
  party force one flats canal corridor plants target day speech games
  olympics island city county district agency administration commission
  council board group team club league season series show live tonight
  today morning evening weekly daily journal gazette tribune herald
  report reports response rules prices update updates purchase bids
  crowds chants restrictions returns takeover anniversary earthquake
  quake war deal plan bill act vote election fest festival
  state park river lake beach school hospital church parish
  announces questions rejects defends vows highlights predicts sets
  calls criticizes recounts discusses addresses launches advances
  pushes marks guide gives faces says tells asks hits wins loses
  makes takes gets goes comes sees knows thinks wants needs looks
  seems becomes remains continues starts stops opens closes joins
  leaves meets speaks talks warns urges backs slams blasts blames
  praises mocks draws pulls criticises
  america america's states kingdom republic federation
  event buzz biopic framework segment rally conference birthday
  purchase sale stake magazine foundation estate doll barbie
  meeting commerce prime subcommittee era forge road forward
  war hearing subcommittee commissioner minister reporter
  square garden plaza center centre airport bridge stadium
  safety awful hate islamophobia islands secretary
  `.split(/\s+/).filter(Boolean)
);

const STOP_FULL = new Set(
  [
    "united states",
    "white house",
    "supreme court",
    "new york",
    "los angeles",
    "san francisco",
    "wall street",
    "fox news",
    "prime minister",
    "federal reserve",
    "world bank",
    "world cup",
    "super bowl",
    "air force",
    "air force one",
    "taylor farms",
    "pizza kitchen",
    "independence day",
    "mount vernon",
    "red sea",
    "west bank",
    "white house",
    "house speaker",
    "attorney general",
    "secretary of",
    "state department",
    "justice department",
    "homeland security",
    "social security",
    "health care",
    "climate change",
    "middle east",
    "north korea",
    "south korea",
    "saudi arabia",
    "hong kong",
    "puerto rico",
    "new jersey",
    "new hampshire",
    "new mexico",
    "south carolina",
    "north carolina",
    "west virginia",
    "rhode island",
    "great britain",
    "european union",
    "united nations",
    "united kingdom",
    "al jazeera",
    "defense secretary",
    "defence secretary",
    "operation epic",
    "president trump",
    "vice president",
    "prime minister",
    "attorney general",
    "truth social",
    "daily wire",
    "meidas touch",
    "george washington",
    "abraham lincoln",
    "thomas jefferson",
    "benjamin franklin",
    "james madison",
    "alexander hamilton",
    "madison square",
    "madison square garden",
    "flock safety",
    "hallaniyat islands",
    "uss abraham lincoln",
    "abraham lincoln",
  ].map((s) => s.toLowerCase())
);

function titleCaseName(raw: string): string {
  return raw
    .replace(HONORIFIC, "")
    .trim()
    .split(/\s+/)
    .map((w, i) => {
      const lower = w.toLowerCase();
      if (i > 0 && new RegExp(`^(?:${PARTICLE})$`, "i").test(lower)) return lower;
      if (/^[A-Z]\.$/.test(w)) return w.toUpperCase();
      return w.charAt(0).toUpperCase() + w.slice(1);
    })
    .join(" ");
}

function isJunkName(name: string): boolean {
  const parts = name.split(/\s+/);
  if (parts.length < 2 || parts.length > 4) return true;
  const first = parts[0]!.toLowerCase().replace(/\./g, "");
  const last = parts[parts.length - 1]!.toLowerCase().replace(/[.'’]/g, "");
  if (STOP_FIRST.has(first)) return true;
  if (STOP_LAST.has(last)) return true;
  if (STOP_FULL.has(name.toLowerCase())) return true;
  // Reject "Modi Announces" style: last token is a bare verb-like -s/-ed/-ing of 5+ letters
  if (/^[a-z]{5,}(?:es|ed|ing)$/i.test(parts[parts.length - 1]!)) return true;
  // Reject if any token is a single letter that isn't an initial with a period
  if (parts.some((p) => p.length === 1)) return true;
  if (/-(?:era|old|based|led|wide|style|like)$/i.test(parts[parts.length - 1]!)) return true;
  return false;
}

/** First Last, optional particle / initial / Jr-Sr. No third free word (avoids Title Case junk). */
const NAME_RE = new RegExp(
  String.raw`\b(?:(?:${HONORIFIC_ALT})\.?\s+)?` +
    String.raw`([A-Z][a-z]+(?:['’-][A-Z]?[a-z]+)?` +
    String.raw`(?:\s+[A-Z]\.)?` +
    String.raw`(?:\s+(?:${PARTICLE}))?` +
    String.raw`\s+[A-Z][a-z]+(?:['’-][A-Z]?[a-z]+)?` +
    String.raw`(?:\s+(?:Jr|Sr|II|III|IV)\.?)?)` +
    String.raw`\b`,
  "g"
);

/** Common given names — required when the only mention is a Title Case headline. */
const GIVEN = new Set(
  `
  aaron abigail adam adrian aisha alan albert alec alex alexander alexandra alfred alice
  alicia allen allison alyssa amanda amber amy andrea andrew angela anita ann anna anne
  anthony antonio april arthur ashley audrey austin
  barbara barry ben benjamin betty beverly bill billy bob bobby bradley brandon brenda
  brian bruce bryan
  caleb calvin cameron camille candace carl carlos carol caroline carolyn casey
  cassandra catherine cathy cecilia chad charles charlie charlotte cheryl chris
  christian christina christine christopher cindy claire clara clarence clark
  claudia clayton clifford clinton clyde cole colin colleen connie conor
  constance corey cory courtney craig crystal curtis cynthia
  daisy dale dallas damon dan dana daniel danielle danny darrell darren darryl
  dave david dean deanna debbie deborah debra denise dennis derek diana diane
  donald donna doris dorothy doug douglas drew duane dwayne dylan
  earl eddie edgar edith edmund edward edwin eileen elaine eleanor elena eli
  elias elijah elisa elisabeth elise eliza elizabeth ella ellen elliott ellis
  elon elsa elsie emily emma eric erica erik erin ernest ethan eugene eva evan
  evelyn
  faith felicia felix fernando fiona florence floyd forrest frances francis
  frank franklin fred frederick
  gail garrett gary gavin gene geoffrey george georgia gerald gina gladys
  glenn gloria gordon grace grant greg gregory gretchen
  hallie hamilton hank hannah harold harry hasan hayden heather heidi helen
  henry herbert holly howard hugh hunter
  ian ida ira isaac isabel isabella isiah ivan
  jack jackie jacob jacqueline jade jake james jamie jane janet janice jared
  jasmine jason jay jean jeanette jeff jefferson jeffrey jenna jennifer jenny
  jeremy jerome jerry jesse jessica jessie jesus jill jim jimmy jo joan joanna
  joanne jodi joe joel joey johann johanna john johnny jon jonathan jordan
  jorge jose joseph josephine josh joshua joyce juan judith judy julia julian
  julie june justin
  kara karen kari karla kate katelyn katherine kathleen kathryn kathy katie
  katrina kay kayla keith kelly ken kendall kenneth kenny kent kerry kevin
  khalil kim kimberly kirk kristen kristin kristina kurt kyle
  lacey lance larry laura lauren laurie lawrence leah lee leila lena leo leon
  leonard leroy leslie levi lewis liam lillian lily linda lindsay lisa liz
  logan lois lola loren loretta lori lorraine louis louise lucas lucy luis
  luke lydia lyle lynn
  mabel macy madison mae maggie malcolm mandel manuel marc marcia marcus
  margaret maria marianne marie marilyn mario marion marisa marjorie mark
  marlene marsha marshall martha martin marvin mary mason mathew matt matthew
  maureen maurice max maxine maya megan meghan melanie melissa melvin mia
  michael michele michelle mickey miguel mike mildred millie milton mitch
  mitchell mohamed mohammad mohammed mollie molly monica morgan morris moses
  myra myron
  nadia nancy naomi natalie nathan nathaniel neil nelson nicholas nick nicolas
  nicole nigel nina noah noel nolan nora norman
  olive oliver olivia omar oscar otis otto owen
  paige pam pamela patricia patrick patsy patty paul paula pauline peggy
  penny perry pete peter phil philip phillip phyllis pierce preston
  quincy quinn
  rachel rafael ralph ramon randal randall randy raul ray raymond rebecca
  rebekah regina reginald renee ricardo richard rick ricky rita rob robbie
  robert robin robyn rocco rocky rod rodney roger roland ron ronald ronnie
  rosa rose rosemary ross roy ruben ruby rudy russell ruth ryan
  sabrina sally sam samantha samuel sandra sandy sara sarah savanna scott
  sean sebastian selena serena seth shannon shari sharon shaun shawn sheila
  shelley sherry shirley sidney sierra simon sonia sonya sophia sophie stacey
  stacy stanley stella stephanie stephen steve steven stewart stuart sue
  susan susanne susie suzanne sydney sylvia
  tabitha tamara tami tammie tammy tanya tara taylor ted teddy teresa terrance
  terrell terrence terri terry theodore theresa thomas tiffany tim timothy
  tina todd tom tommy tony tonya tracy travis trevor troy tyler tyrone tyson
  valerie vanessa vernon vicki vickie victor victoria vincent viola violet
  virginia vivek vivian
  wade wallace walter wanda warren wayne wendy wesley whitney will william
  willie wilson wendell
  xavier xi
  yasmin yolanda yvonne
  zach zachary zack zoe zoey
  antonio andy angela annie aoc bernie chuck cory dave deb dick elissa
  gavin gretchen hakeem jd jon josh kamala kari kathy keir marco mitch
  nikki pete raph rfk ron ted thom tim tina tony wes zohran
  megyn whitney katrina bourdain iger kushner infantino haddish shapiro
  banderas netanyahu zelenskyy putin jinping modi starmer farage
  luigi gianni dominic rishi pat jeanie skye nawaf mckenna
  `.split(/\s+/).filter(Boolean)
);

function scan(text: string, requireGiven: boolean, out: NotablePersonTag[], seen: Set<string>) {
  if (!text.trim()) return;
  NAME_RE.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = NAME_RE.exec(text))) {
    const name = titleCaseName((m[1] || "").replace(/['’]s$/i, ""));
    if (!name || isJunkName(name)) continue;
    if (requireGiven) {
      const first = name.split(/\s+/)[0]!.toLowerCase().replace(/\./g, "");
      if (!GIVEN.has(first)) continue;
    }
    const slug = slugify(name);
    if (!slug || slug.length < 5) continue;
    const canon = canonicalizePerson(slug, name);
    if (seen.has(canon.slug)) continue;
    seen.add(canon.slug);
    out.push(canon);
    if (out.length >= 10) break;
  }
}

/** Collapse honorific / nickname slugs onto the roster person. */
const CANONICAL_PERSON: Record<string, NotablePersonTag> = {
  "president-trump": { slug: "donald-trump", name: "Donald Trump" },
  "donald-j-trump": { slug: "donald-trump", name: "Donald Trump" },
  aoc: { slug: "alexandria-ocasio-cortez", name: "Alexandria Ocasio-Cortez" },
  "alexandria-ocasiocortez": {
    slug: "alexandria-ocasio-cortez",
    name: "Alexandria Ocasio-Cortez",
  },
  "j-d-vance": { slug: "jd-vance", name: "JD Vance" },
  "vice-president-vance": { slug: "jd-vance", name: "JD Vance" },
  "president-biden": { slug: "joe-biden", name: "Joe Biden" },
  "vice-president-harris": { slug: "kamala-harris", name: "Kamala Harris" },
};

export function canonicalizePerson(slug: string, name?: string): NotablePersonTag {
  const key = String(slug || "")
    .trim()
    .toLowerCase();
  const hit = CANONICAL_PERSON[key];
  if (hit) return { ...hit };
  return { slug: key, name: String(name || slug).trim() || key };
}

/** Extract notable person names from prose. Headlines are Title Case — gated. */
export function extractNotablePeopleFromText(parts: {
  headline?: string;
  summary?: string;
  assessment?: string;
  topics?: string[];
  keyMomentClaims?: string[];
}): NotablePersonTag[] {
  const out: NotablePersonTag[] = [];
  const seen = new Set<string>();
  const prose = [parts.summary ?? "", parts.assessment ?? "", ...(parts.keyMomentClaims ?? [])]
    .filter(Boolean)
    .join(" \n ");
  // Headline / topics first so the story subject wins the per-doc cap.
  // Always require a known given name — summaries are full of Title Case junk.
  if (parts.headline) scan(parts.headline, true, out, seen);
  if (parts.topics?.length) scan(parts.topics.join(" \n "), true, out, seen);
  scan(prose, true, out, seen);
  return out;
}

export function mergePersonTags(
  ...lists: Array<Iterable<{ name: string; slug: string }> | undefined>
): NotablePersonTag[] {
  const seen = new Set<string>();
  const out: NotablePersonTag[] = [];
  for (const list of lists) {
    if (!list) continue;
    for (const t of list) {
      const canon = canonicalizePerson(t.slug, t.name);
      if (!canon.slug || seen.has(canon.slug)) continue;
      seen.add(canon.slug);
      out.push(canon);
    }
  }
  return out;
}
