/**
 * Campaign Studio — owner marketing desk.
 * Feature catalog, Grok copy generation, normalizer, KV persistence.
 * Text only in generate; illustration / Bluesky are separate deferred actions.
 */
import { clip } from "./ogCard.ts";

// ── Feature catalog (server-owned; client sends keys only) ───────────────

export const CAMPAIGN_FEATURES = [
  { key: "ballot", name: "Ballot Board", url: "/bracket/", blurb: "Make your Senate/governor picks and lock them in." },
  { key: "votes", name: "Community Votes", url: "/bracket/votes/", blurb: "See how the crowd is calling the races." },
  { key: "map", name: "Interactive Election Map", url: "/elections/map/", blurb: "Click every state; watch the map move." },
  { key: "quiz", name: "Morning Quiz", url: "/quiz/", blurb: "Five questions on what actually happened." },
  { key: "week", name: "Week in Grades", url: "/week/", blurb: "The week's broadcasts, graded." },
  { key: "trends", name: "News Trends", url: "/trends/", blurb: "What the networks covered, and how it held up." },
  { key: "politicians", name: "Politician Report Cards", url: "/politicians/", blurb: "Claim records, graded and sourced." },
  { key: "bias", name: "Check Your Bias", url: "/bias/", blurb: "A short, honest read on your own lean." },
  { key: "learn", name: "Explainers", url: "/learn/", blurb: "Plain-language background on the story." },
  { key: "students", name: "For Students", url: "/students/", blurb: "Media-literacy tools for the classroom." },
  { key: "app", name: "iOS App", url: "/app/", blurb: "Grade the news from your pocket." },
  { key: "core", name: "Graded TV-news report cards", url: "/", blurb: "Every broadcast, fact-checked and graded." },
] as const;

export type CampaignFeatureKey = (typeof CAMPAIGN_FEATURES)[number]["key"];

export const CAMPAIGN_PLATFORMS = ["x", "threads", "bluesky", "linkedin", "instagram"] as const;
export type CampaignPlatform = (typeof CAMPAIGN_PLATFORMS)[number];

const PLATFORM_LIMITS: Record<string, number> = {
  x: 280,
  bluesky: 300,
  threads: 500,
  linkedin: 1300,
  instagram: 2200,
};

const PLATFORM_SET = new Set<string>(CAMPAIGN_PLATFORMS);
const FEATURE_KEYS = new Set<string>(CAMPAIGN_FEATURES.map((f) => f.key));

// ── CTA URL validator (scrubStoredLinks discipline) ──────────────────────

export function safeCtaUrl(raw: unknown): string {
  const href = String(raw ?? "").trim().slice(0, 500);
  if (!href.startsWith("/") || href.startsWith("//") || href.includes("://")) return "/";
  if (href.startsWith("/api/") || href.startsWith("/admin")) return "/";
  return href;
}

/**
 * Primary CTA path from selected feature keys (catalog order).
 * Prefers a concrete feature over "core" (/) when both are selected.
 */
export function ctaUrlFromHighlights(keys: readonly string[]): string {
  const selected = CAMPAIGN_FEATURES.filter((f) => keys.includes(f.key));
  if (!selected.length) return "/";
  const nonCore = selected.filter((f) => f.key !== "core");
  const pick = nonCore[0] ?? selected[0];
  return safeCtaUrl(pick.url);
}

/** Feature name for the derived CTA (for UI labels). */
export function ctaFeatureFromHighlights(
  keys: readonly string[]
): (typeof CAMPAIGN_FEATURES)[number] | null {
  const selected = CAMPAIGN_FEATURES.filter((f) => keys.includes(f.key));
  if (!selected.length) return null;
  const nonCore = selected.filter((f) => f.key !== "core");
  return nonCore[0] ?? selected[0] ?? null;
}

// ── Types ────────────────────────────────────────────────────────────────

export interface CampaignInput {
  brief: string;
  platforms: string[];
  tone: string;
  audience: string;
  campaignType: string;
  highlights: string[];
  ctaUrl: string;
  ctaLabel?: string;
  pegToNews: boolean;
}

export interface CampaignPost {
  platform: string;
  text: string;
  altText: string;
}

export interface CampaignCard {
  kicker: string;
  headline: string;
  subhead: string;
  statLine: string;
  ctaLabel: string;
  ctaUrl: string;
}

export interface CampaignCitation {
  title: string;
  url: string;
}

export interface CampaignDraft {
  posts: CampaignPost[];
  card: CampaignCard;
  citations: CampaignCitation[];
  illustrationPrompt: string;
}

export interface Campaign extends CampaignDraft {
  id: string;
  title: string;
  input: CampaignInput;
  illustrationPath?: string;
  createdAt: string;
  updatedAt: string;
}

// ── Grok contract ────────────────────────────────────────────────────────

const SEARCH_MODEL = "grok-4.3";

const SYSTEM_PROMPT = `You are the marketing desk of "CladFacts," a one-editor fact-checking publication that grades TV-news broadcasts for accuracy and political bias. You write the publication's OWN promotional material. Given a brief, produce (a) ready-to-post social copy for each requested platform and (b) copy for a share card. Return a single JSON object matching the provided schema. Return ONLY the JSON — no markdown fence, no commentary.

VOICE — restrained modern editorial. This is the through-line of everything you write:
- No exclamation marks. No hashtags. No emoji. No slang, no trend-chasing, no "you won't believe," no imperatives that beg ("click," "smash," "don't miss").
- Adjectives describe evidence and substance ("documented," "sourced," "graded"), not hype.
- Lead with the single most concrete thing: a real feature, a real number, a real stake. A careful, literate reader should be proud to repost it.
- Do NOT repeat the same sentence across platforms — adapt length and rhythm to each.

WHAT YOU MAY SAY: This is the publication's OWN promotion, not anonymous editorial. You MAY name features, describe what they do, mention that broadcasts are graded, cite letter grades in the abstract ("we grade every broadcast"), and include a call to action with a link. The rule that hides grades from anonymous readers does NOT apply to the owner's own marketing.

HARD FACTUAL RULES:
- Promote ONLY the features named in the user message, using their EXACT names and the cladfacts.com URLs given. Do not invent features, pages, prices, or URLs.
- Do NOT fabricate statistics. Do not claim user counts, accuracy percentages, rankings, or awards unless the user's brief states them. If you have no real number, write copy that needs none.
- Every citation must be a real, working URL you actually found. If the campaign is not news-pegged and you did no search, return an empty citations array — never fake sources.
- When the campaign IS pegged to current news, use web search and ground the copy in what is actually happening now (real races, real dates, real events).

KNOWLEDGE-CUTOFF GUARDRAIL: Do not declare that a real event, race, candidate, product, or organization "does not exist" merely because it is unfamiliar or postdates your training. Elections and news move fast. If you cannot confirm something, treat it as plausible and write copy that does not hinge on a claim you cannot stand behind — never assert as fact a specific outcome, tally, or result you have not verified.

PER-PLATFORM COPY:
- x: <= 280 characters, including the CTA link. One tight, quotable sentence or two.
- threads: <= 500 characters. Slightly more room; still spare.
- bluesky: <= 300 characters. Conversational and restrained; the link renders as a card, so you need not spell the URL.
- linkedin: <= 1300 characters. A short professional note — what the tool is and why it is useful; still no hype.
- instagram: <= 2200 characters but keep it to ~3-5 short lines; this is a caption under the share card.
For every post also write alt_text: a plain, literal description of the share card image for screen-reader users (<= 1000 chars), describing the card's text and layout, NOT marketing copy.

SHARE CARD COPY (the OG image):
- kicker: a short small-caps eyebrow, <= 30 chars (e.g. "MIDTERMS 2026", "FACT-CHECK THE NEWS").
- headline: the card's large headline line, <= 90 chars. Restrained, concrete, active. No exclamation.
- subhead: one supporting line, <= 120 chars.
- stat_line: one line carrying the single most concrete fact or the feature's plainest promise, <= 80 chars. If you have no real number, use a concrete descriptor, never a fabricated figure.
- cta_label: <= 24 chars (e.g. "Fill your ballot", "Grade the news").
- cta_url: the cladfacts.com path for the primary CTA (relative, e.g. "/bracket/").

illustration_prompt: a one-paragraph prompt for an optional owned editorial illustration in a clean, restrained style (soft neutral palette, dignified, neutral). Describe subject matter only. It MUST contain no text, words, lettering, or logos. This is a prompt only; no image is generated from your response.`;

const CAMPAIGN_SCHEMA = {
  type: "object",
  properties: {
    posts: {
      type: "array",
      items: {
        type: "object",
        properties: {
          platform: { type: "string", enum: ["x", "threads", "bluesky", "linkedin", "instagram"] },
          text: { type: "string" },
          alt_text: { type: "string" },
        },
        required: ["platform", "text", "alt_text"],
        additionalProperties: false,
      },
    },
    card: {
      type: "object",
      properties: {
        kicker: { type: "string" },
        headline: { type: "string" },
        subhead: { type: "string" },
        stat_line: { type: "string" },
        cta_label: { type: "string" },
        cta_url: { type: "string" },
      },
      required: ["kicker", "headline", "subhead", "stat_line", "cta_label", "cta_url"],
      additionalProperties: false,
    },
    illustration_prompt: { type: "string" },
    citations: {
      type: "array",
      items: {
        type: "object",
        properties: { title: { type: "string" }, url: { type: "string" } },
        required: ["title", "url"],
        additionalProperties: false,
      },
    },
  },
  required: ["posts", "card", "illustration_prompt", "citations"],
  additionalProperties: false,
} as const;

/** Pull the assistant's text out of a /v1/responses payload. Copied from broadcast.ts. */
function extractResponsesText(data: any): string | null {
  if (typeof data?.output_text === "string" && data.output_text) return data.output_text;
  const output = Array.isArray(data?.output) ? data.output : [];
  for (const item of output) {
    const content = Array.isArray(item?.content) ? item.content : [];
    for (const c of content) {
      if ((c?.type === "output_text" || c?.type === "text") && typeof c?.text === "string") {
        return c.text;
      }
    }
  }
  return null;
}

async function callCampaign(
  apiKey: string,
  system: string,
  user: string,
  pegToNews: boolean
): Promise<string> {
  const body: Record<string, unknown> = {
    model: SEARCH_MODEL,
    input: [
      { role: "system", content: system },
      { role: "user", content: user },
    ],
    text: {
      format: {
        type: "json_schema",
        name: "campaign",
        schema: CAMPAIGN_SCHEMA,
        strict: true,
      },
    },
  };
  if (pegToNews) {
    body.tools = [{ type: "web_search", max_search_results: 6 }];
  }

  const res = await fetch("https://api.x.ai/v1/responses", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    signal: AbortSignal.timeout(120_000),
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    throw new Error(`xAI ${res.status}: ${(await res.text().catch(() => "")).slice(0, 400)}`);
  }
  const data: any = await res.json();
  const text = extractResponsesText(data);
  if (!text) throw new Error("xAI returned no output text.");
  return text;
}

export function normalizeCampaign(p: any, input: CampaignInput): CampaignDraft {
  const targeted = new Set(input.platforms);
  const posts = (Array.isArray(p?.posts) ? p.posts : [])
    .map((m: any) => {
      const platform = String(m?.platform ?? "").trim().toLowerCase();
      const limit = PLATFORM_LIMITS[platform];
      return {
        platform,
        text: clip(String(m?.text ?? "").replace(/\s+\n/g, "\n").trim(), limit ?? 500),
        altText: String(m?.alt_text ?? m?.altText ?? "")
          .trim()
          .slice(0, 1000),
      };
    })
    .filter(
      (m: CampaignPost) =>
        PLATFORM_LIMITS[m.platform] && targeted.has(m.platform) && m.text.length > 0
    );

  const card: CampaignCard = {
    kicker: String(p?.card?.kicker ?? "").trim().slice(0, 40),
    headline: String(p?.card?.headline ?? "").trim().slice(0, 120),
    subhead: String(p?.card?.subhead ?? "").trim().slice(0, 140),
    statLine: String(p?.card?.stat_line ?? p?.card?.statLine ?? "")
      .trim()
      .slice(0, 90),
    ctaLabel:
      String(p?.card?.cta_label ?? p?.card?.ctaLabel ?? "")
        .trim()
        .slice(0, 30) ||
      (input.ctaLabel ?? "Read at CladFacts"),
    ctaUrl: safeCtaUrl(p?.card?.cta_url ?? p?.card?.ctaUrl ?? input.ctaUrl),
  };

  // Ensure card is never empty after save
  if (!card.headline) {
    card.headline = clip(input.brief.trim() || "CladFacts", 90);
  }
  if (!card.kicker) card.kicker = "CLADFACTS";
  if (!card.ctaLabel) card.ctaLabel = "Read at CladFacts";

  const citations = (Array.isArray(p?.citations) ? p.citations : [])
    .map((c: any) => ({
      title: String(c?.title ?? "").trim(),
      url: String(c?.url ?? "").trim(),
    }))
    .filter((c: CampaignCitation) => c.title && /^https?:\/\//.test(c.url))
    .slice(0, 12);

  return {
    posts,
    card,
    citations,
    illustrationPrompt: String(p?.illustration_prompt ?? p?.illustrationPrompt ?? "")
      .trim()
      .slice(0, 600),
  };
}

export async function generateCampaign(
  apiKey: string,
  input: CampaignInput
): Promise<CampaignDraft> {
  const feats = input.highlights
    .map((k) => CAMPAIGN_FEATURES.find((f) => f.key === k))
    .filter((f): f is (typeof CAMPAIGN_FEATURES)[number] => !!f);

  const userMessage = [
    `Brief: ${input.brief.trim()}`,
    `Campaign type: ${input.campaignType}`,
    `Tone: ${input.tone}`,
    `Audience: ${input.audience}`,
    `Target platforms: ${input.platforms.join(", ")}`,
    feats.length ? "Features to promote (use ONLY these names and URLs):" : "",
    ...feats.map((f) => `  - ${f.name} — https://cladfacts.com${f.url} — ${f.blurb}`),
    input.ctaUrl && input.ctaUrl !== "/"
      ? `Primary CTA URL: https://cladfacts.com${input.ctaUrl}`
      : "",
    input.pegToNews
      ? "Peg this to CURRENT news: use web search to ground it in what is actually happening now."
      : "",
  ]
    .filter((l) => l !== "")
    .join("\n");

  const raw = await callCampaign(apiKey, SYSTEM_PROMPT, userMessage, input.pegToNews);
  let parsed: any;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error("xAI did not return valid JSON.");
  }
  return normalizeCampaign(parsed, input);
}

// ── Input sanitation (API edge) ──────────────────────────────────────────

export function sanitizeInput(p: any): CampaignInput {
  const platforms = (Array.isArray(p?.platforms) ? p.platforms : [])
    .map((x: unknown) => String(x ?? "").trim().toLowerCase())
    .filter((x: string) => PLATFORM_SET.has(x));
  const highlights = (Array.isArray(p?.highlights) ? p.highlights : [])
    .map((x: unknown) => String(x ?? "").trim())
    .filter((x: string) => FEATURE_KEYS.has(x));

  const brief = String(p?.brief ?? "").trim().slice(0, 4000);
  const tone = String(p?.tone ?? "Restrained").trim().slice(0, 80) || "Restrained";
  const audience =
    String(p?.audience ?? "General readers").trim().slice(0, 80) || "General readers";
  const campaignType =
    String(p?.campaignType ?? "Feature launch").trim().slice(0, 80) || "Feature launch";
  // Primary CTA is always derived from selected features (not free-typed).
  const ctaUrl = highlights.length
    ? ctaUrlFromHighlights(highlights)
    : safeCtaUrl(p?.ctaUrl);
  const ctaLabel = String(p?.ctaLabel ?? "").trim().slice(0, 30) || undefined;
  const pegToNews = Boolean(p?.pegToNews);

  return {
    brief,
    platforms: platforms.length ? platforms : ["x", "bluesky"],
    tone,
    audience,
    campaignType,
    highlights,
    ctaUrl,
    ctaLabel,
    pegToNews,
  };
}

function titleFromBrief(brief: string): string {
  const t = brief.trim().replace(/\s+/g, " ");
  if (!t) return "Untitled campaign";
  return t.length <= 60 ? t : t.slice(0, 57).trimEnd() + "…";
}

/** Validate owner-edited draft + merge with existing campaign if id present. */
export async function buildCampaignFromClient(
  kv: KVNamespace,
  p: any
): Promise<Campaign> {
  const input = sanitizeInput(p?.input ?? p);
  const draft = normalizeCampaign(
    {
      posts: Array.isArray(p?.posts)
        ? p.posts.map((m: any) => ({
            platform: m?.platform,
            text: m?.text,
            alt_text: m?.altText ?? m?.alt_text,
          }))
        : [],
      card: {
        kicker: p?.card?.kicker,
        headline: p?.card?.headline,
        subhead: p?.card?.subhead,
        stat_line: p?.card?.statLine ?? p?.card?.stat_line,
        cta_label: p?.card?.ctaLabel ?? p?.card?.cta_label,
        cta_url: p?.card?.ctaUrl ?? p?.card?.cta_url,
      },
      citations: p?.citations,
      illustration_prompt: p?.illustrationPrompt ?? p?.illustration_prompt,
    },
    input
  );

  const existingId = String(p?.id ?? "").trim();
  const existing = existingId ? await getCampaign(kv, existingId) : null;
  const now = new Date().toISOString();
  const id = existing?.id || crypto.randomUUID();

  return {
    id,
    title: titleFromBrief(input.brief || existing?.title || draft.card.headline),
    input,
    posts: draft.posts,
    card: draft.card,
    citations: draft.citations,
    illustrationPrompt: draft.illustrationPrompt,
    illustrationPath: existing?.illustrationPath,
    createdAt: existing?.createdAt ?? now,
    updatedAt: now,
  };
}

// ── KV persistence ───────────────────────────────────────────────────────

const CAMPAIGNS_KEY = "campaigns:list";

function isCampaign(v: any): v is Campaign {
  return (
    v &&
    typeof v.id === "string" &&
    Array.isArray(v.posts) &&
    v.card &&
    typeof v.card === "object"
  );
}

export async function getCampaigns(kv: KVNamespace): Promise<Campaign[]> {
  const raw = await kv.get(CAMPAIGNS_KEY);
  if (!raw) return [];
  try {
    const v = JSON.parse(raw);
    return (Array.isArray(v) ? v : []).filter(isCampaign);
  } catch {
    return [];
  }
}

export async function getCampaign(kv: KVNamespace, id: string): Promise<Campaign | null> {
  if (!id) return null;
  return (await getCampaigns(kv)).find((c) => c.id === id) ?? null;
}

export async function putCampaign(kv: KVNamespace, c: Campaign): Promise<Campaign> {
  const list = await getCampaigns(kv);
  const next = { ...c, updatedAt: new Date().toISOString() };
  const i = list.findIndex((x) => x.id === c.id);
  if (i >= 0) list[i] = next;
  else list.unshift(next);
  await kv.put(CAMPAIGNS_KEY, JSON.stringify(list.slice(0, 50)));
  return next;
}

export async function deleteCampaign(kv: KVNamespace, id: string): Promise<void> {
  if (!id) return;
  const list = (await getCampaigns(kv)).filter((c) => c.id !== id);
  await kv.put(CAMPAIGNS_KEY, JSON.stringify(list));
}
