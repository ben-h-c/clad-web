/**
 * Contextual “what next” destinations for discovery rails.
 * Keep lists short (3–4) so they guide without dumping the sitemap.
 */

export interface ExploreLink {
  href: string;
  kicker: string;
  title: string;
  blurb: string;
}

export type ExploreContext =
  | "home"
  | "post"
  | "midterms"
  | "quiz"
  | "account"
  | "search"
  | "analytics"
  | "default";

const L = {
  ballot: {
    href: "/bracket/",
    kicker: "Midterms",
    title: "Ballot board",
    blurb: "Pick winners and share your sheet.",
  },
  map: {
    href: "/elections/map/",
    kicker: "Midterms",
    title: "Election map",
    blurb: "Where coverage is loudest in 2026.",
  },
  politicians: {
    href: "/politicians/",
    kicker: "People",
    title: "Politician cards",
    blurb: "How each figure is graded on air.",
  },
  quiz: {
    href: "/quiz/",
    kicker: "Play",
    title: "Morning quiz",
    blurb: "Five claims — can you spot the spin?",
  },
  bias: {
    href: "/bias/",
    kicker: "You",
    title: "Check your bias",
    blurb: "See how the coverage you open leans.",
  },
  trends: {
    href: "/trends/",
    kicker: "Data",
    title: "News Trends",
    blurb: "Is coverage getting better or worse?",
  },
  week: {
    href: "/week/",
    kicker: "Desk",
    title: "Week in Grades",
    blurb: "Best, worst, and what got ignored.",
  },
  discover: {
    href: "/discover/",
    kicker: "Read",
    title: "Discover",
    blurb: "Curated stories worth your time.",
  },
  goodNews: {
    href: "/good-news/",
    kicker: "Read",
    title: "Good News",
    blurb: "Solid reporting, lighter load.",
  },
  search: {
    href: "/search/",
    kicker: "Find",
    title: "Search",
    blurb: "By topic, outlet, grade, or lean.",
  },
  learn: {
    href: "/learn/",
    kicker: "Learn",
    title: "New to the news?",
    blurb: "Short explainers, no jargon.",
  },
  students: {
    href: "/students/",
    kicker: "Campus",
    title: "For students",
    blurb: "How to read grades and share them.",
  },
  register: {
    href: "/register/",
    kicker: "Free",
    title: "Create account",
    blurb: "Unlock every grade — no card.",
  },
  how: {
    href: "/how-it-works/",
    kicker: "Method",
    title: "How Clad works",
    blurb: "From intake to letter grade.",
  },
} as const satisfies Record<string, ExploreLink>;

export function exploreLinks(ctx: ExploreContext, opts?: { locked?: boolean }): ExploreLink[] {
  const locked = opts?.locked ?? false;
  switch (ctx) {
    case "home":
      return [L.map, L.ballot, L.quiz, L.discover, L.bias, L.students];
    case "post":
      return locked
        ? [L.register, L.quiz, L.ballot, L.bias]
        : [L.quiz, L.ballot, L.bias, L.trends];
    case "midterms":
      return [L.ballot, L.map, L.politicians, L.quiz, L.learn];
    case "quiz":
      return [L.bias, L.ballot, L.trends, L.discover];
    case "account":
      return [L.ballot, L.quiz, L.bias, L.trends, L.search];
    case "search":
      return [L.trends, L.discover, L.politicians, L.quiz];
    case "analytics":
      return [L.week, L.bias, L.trends, L.politicians];
    default:
      return [L.discover, L.ballot, L.quiz, L.search];
  }
}

/** Compact footer product links (label only). */
export const FOOTER_PRODUCT_LINKS: { href: string; label: string }[] = [
  { href: "/bracket/", label: "Ballot" },
  { href: "/elections/map/", label: "Map" },
  { href: "/quiz/", label: "Quiz" },
  { href: "/discover/", label: "Discover" },
  { href: "/trends/", label: "Trends" },
  { href: "/bias/", label: "Bias check" },
  { href: "/politicians/", label: "Politicians" },
  { href: "/search/", label: "Search" },
  { href: "/newsletter/", label: "Newsletter" },
];
