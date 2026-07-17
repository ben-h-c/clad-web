/**
 * Campus / 16–24 explainer content. Public, ungated, plain language —
 * no slang-chasing, no invented programs. Used by /students, /learn/*, OG cards.
 */

export interface GradeBand {
  grade: string;
  title: string;
  plain: string;
}

/** What each letter means — the thing first-time readers need in 5 seconds. */
export const GRADE_BANDS: GradeBand[] = [
  {
    grade: "A+",
    title: "Exceptional",
    plain: "High accuracy, primary sources, fair framing. Minor nits only.",
  },
  {
    grade: "A / A−",
    title: "Strong",
    plain: "Claims hold up. Small gaps or light framing issues.",
  },
  {
    grade: "B+ / B / B−",
    title: "Mostly solid",
    plain: "Mostly accurate with a few missing-context or soft spots.",
  },
  {
    grade: "C+ / C / C−",
    title: "Mixed",
    plain: "Real problems mixed with real facts. Check the key moments.",
  },
  {
    grade: "D+ / D / D−",
    title: "Weak",
    plain: "Significant factual issues, heavy spin, or unsourced load-bearing claims.",
  },
  {
    grade: "F",
    title: "Fails",
    plain: "Pervasive misinformation or propaganda-level distortion.",
  },
];

export interface ClaimTagExplainer {
  tag: string;
  plain: string;
}

export const CLAIM_TAGS: ClaimTagExplainer[] = [
  {
    tag: "verified",
    plain: "Matched primary sources — the bill, the data, the transcript, the study.",
  },
  {
    tag: "disputed",
    plain: "Credible sources contradict it. Don't take the airtime version as settled.",
  },
  {
    tag: "missing context",
    plain: "Technically true, but leaves out something that changes the meaning (base rate, time frame, who paid).",
  },
  {
    tag: "unsupported",
    plain: "No good evidence either way. Treat as unproven, not as a secret truth.",
  },
];

export interface LearnPage {
  slug: string;
  title: string;
  /** Short for cards / OG */
  kicker: string;
  description: string;
  /** Share caption (Discord / TikTok / group chat) */
  shareCaption: string;
  body: string[];
  /** Optional section for the letter-grade table */
  showGradeBands?: boolean;
  showClaimTags?: boolean;
  /** OG card: bordered chip row between description and CTA (omit for the plain layout). */
  cardChips?: string[];
  /** OG card: eyebrow line above the title (defaults to a neutral FIELD GUIDE label). */
  cardEyebrow?: string;
}

export const LEARN_PAGES: LearnPage[] = [
  {
    slug: "grades",
    title: "What does a C− mean?",
    kicker: "Letter grades, decoded",
    description:
      "Clad letter grades (A+ to F) score the broadcast’s accuracy — not the politician, not your team. Here’s the plain-language key.",
    shareCaption:
      "What does a C− mean on CladFacts? Letter grades for news coverage, decoded — not for the candidate, for the broadcast.",
    showGradeBands: true,
    cardChips: ["A", "B", "C", "D", "F"],
    body: [
      "The letter grade is for the coverage you watched: how its claims held up, whether load-bearing facts were sourced, and whether the framing matched the evidence.",
      "It is not a grade for the politician, the party, or the story’s “importance.” A hard-hitting segment can earn an A if it’s careful. A flattering segment can earn a C if it leaves out what you needed to know.",
      "When you’re skimming on your phone: read the grade first, then the one-line rationale, then open the key moments if it matters to you.",
    ],
  },
  {
    slug: "lean",
    title: "How to read the lean meter",
    kicker: "Left · Center · Right",
    description:
      "Political lean (−100 to +100) is about framing and who got airtime — separate from whether the facts are true.",
    shareCaption:
      "Lean ≠ accuracy. A segment can lean hard and still be careful with facts — CladFacts scores both.",
    cardChips: ["LEFT", "CENTER", "RIGHT"],
    body: [
      "Lean runs from −100 (strongly left framing) through 0 (centered) to +100 (strongly right). It tracks word choice, guest mix, and what got left out — not whether you agree.",
      "Critical rule: lean is not a fact-check. A right-leaning piece can be meticulously sourced. A “centered” piece can still get numbers wrong. Always read lean next to the letter grade and factuality score.",
      "If a number is near zero, we often label it Centered. Small swings are noise; big ones are the signal.",
    ],
  },
  {
    slug: "claim-tags",
    title: "Verified, disputed, missing context",
    kicker: "Claim tags",
    description:
      "The four claim tags Clad uses on load-bearing statements — especially “missing context,” where most spin lives.",
    shareCaption:
      "Most spin isn’t flat-out false — it’s missing context. CladFacts claim tags, in plain English.",
    showClaimTags: true,
    body: [
      "Each report picks a handful of load-bearing claims from the segment and tags them. You’re not supposed to memorize the rubric — you’re supposed to get faster at noticing when a line on TV is doing work.",
      "Missing context is the tag worth learning first. A true-sounding number with the base rate stripped out is how a lot of political media actually operates.",
    ],
  },
  {
    slug: "sources",
    title: "Why every report lists sources",
    kicker: "Receipts",
    description:
      "Clad links primary sources so you can check the work — for papers, group chats, and your own BS detector.",
    shareCaption:
      "Don’t take a fact-checker’s word for it either. CladFacts lists the sources behind every grade.",
    body: [
      "Reports aim for several citations, favoring primary documents (bills, data, transcripts, studies) over pure re-reporting.",
      "If you’re writing for class: open the sources, quote them, and cite them — Clad is a map to the evidence, not a substitute for it.",
      "If a grade feels wrong, free accounts can flag it. Corrections are public.",
    ],
  },
  {
    slug: "spin",
    title: "How to spot spin in 30 seconds",
    kicker: "Patterns",
    description:
      "Loaded language, selective stats, one-sided guests, fake urgency — a short field guide for watching political TV.",
    shareCaption:
      "Field guide: loaded words, selective stats, one-sided guests, fake urgency. Slow down and check.",
    cardChips: ["LOADED LANGUAGE", "SELECTIVE STATS", "ONE-SIDED GUESTS", "FAKE URGENCY"],
    cardEyebrow: "FOUR TELLS · THIRTY SECONDS",
    body: [
      "Loaded language (“slammed,” “gutted,” “caved”) tells you how to feel before you know what happened.",
      "Selective statistics: a real number missing the base rate, time window, or comparison.",
      "One-sided sourcing: every expert agrees with the segment’s frame.",
      "Fake urgency: certainty about a story that’s still moving. None of these prove a claim is false — they mean check before you share.",
    ],
  },
  {
    slug: "first-vote",
    title: "Reading the news before your first vote",
    kicker: "Civics, no lecture",
    description:
      "Three habits for first-time voters: read the claim not the headline, notice who’s speaking, and double-check what makes you furious.",
    shareCaption:
      "First-time voter kit: claim > headline, notice who is speaking, double-check what makes you mad.",
    body: [
      "Read the claim, not the headline. Headlines are written to travel; nuance falls off in the feed.",
      "Notice who is speaking: campaign surrogate ≠ independent analyst ≠ anonymous official. Different jobs, different weight.",
      "When a story spikes your anger, that’s when to open a second source. Outrage is cheap to manufacture and expensive to undo once you’ve reshared it.",
      "Clad grades whether the coverage told you the truth. What you do with that truth — including how you vote — is yours.",
    ],
  },
];

export function getLearnPage(slug: string): LearnPage | undefined {
  return LEARN_PAGES.find((p) => p.slug === slug);
}

/** Discord / iMessage / Instagram story paste pack. */
export const CAMPUS_SHARE_LINES = [
  "CladFacts grades TV news A+–F with sources you can open. Free account unlocks every grade.",
  "Missing context ≠ false. It’s how a lot of spin works. Short explainer: cladfacts.com/learn/claim-tags/",
  "Lean is not a fact-check. Read grade + lean together: cladfacts.com/learn/lean/",
  "What does a C− mean? Letter grades decoded: cladfacts.com/learn/grades/",
  "Morning quiz — five real claims, build a streak: cladfacts.com/quiz/",
];
