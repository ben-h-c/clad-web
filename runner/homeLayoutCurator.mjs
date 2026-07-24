/**
 * Home layout curator — periodically re-shapes the landing page.
 *
 * Grok + web_search reads the current news cycle and posts a short-lived
 * layout plan (section order hints + optional feature highlight) to
 * AGENTS KV via /api/agent/home-layout. The Worker homepage consumes it
 * and falls back to the default stack when the plan expires.
 */
import { getHomeLayout, putHomeLayout } from "./api.mjs";

const XAI_RESPONSES = "https://api.x.ai/v1/responses";
const MODEL = "grok-4.3";

const SECTIONS = [
  "guest-hero",
  "feature-highlight",
  "spotlight",
  "app-promo",
  "breaking",
  "front-page",
  "lean",
  "calendar",
  "topics",
  "politician-spotlight",
  "election-map",
  "grades",
  "today-history",
  "human-spotlight",
  "discover",
  "good-news",
  "quips",
  "more",
];

const SCHEMA = {
  type: "object",
  properties: {
    reason: {
      type: "string",
      description: "1–2 sentences: what in the news cycle drove this layout",
    },
    ttlHours: {
      type: "number",
      description: "How long this layout should stay live (4–24)",
    },
    order: {
      type: "array",
      items: { type: "string" },
      description: "Preferred section order (subset OK; unknown ids ignored)",
    },
    hide: {
      type: "array",
      items: { type: "string" },
      description: "Sections to hide this cycle (never breaking or front-page)",
    },
    highlight: {
      type: "object",
      properties: {
        id: { type: "string" },
        kicker: { type: "string" },
        title: { type: "string" },
        body: { type: "string" },
        href: { type: "string" },
        cta: { type: "string" },
        secondaryHref: { type: "string" },
        secondaryCta: { type: "string" },
        variant: {
          type: "string",
          description: "event | feature | midterms | topic | urgent | default",
        },
        audience: {
          type: "string",
          description: "all | anon | signed-in",
        },
      },
      required: [
        "id",
        "kicker",
        "title",
        "body",
        "href",
        "cta",
        "secondaryHref",
        "secondaryCta",
        "variant",
        "audience",
      ],
      additionalProperties: false,
    },
    highlightNull: {
      type: "boolean",
      description: "True to clear any feature highlight this cycle",
    },
    sourceQueries: {
      type: "array",
      items: { type: "string" },
      description: "Search queries you ran (for audit)",
    },
  },
  required: [
    "reason",
    "ttlHours",
    "order",
    "hide",
    "highlight",
    "highlightNull",
    "sourceQueries",
  ],
  additionalProperties: false,
};

const SYSTEM = `You are the homepage layout editor for CladFacts (cladfacts.com) — a fact-check
desk that grades political broadcasts for accuracy and political lean.

Every few hours you web-search the current news cycle and decide how the PUBLIC
landing page should feel until the next refresh. You do NOT invent news grades.
You only reorganize existing product surfaces and optionally spotlight a feature
or topic that is timely.

── Homepage sections (ids you may order / hide) ───────────────────────────
- guest-hero: signed-out marketing strip (auto-hidden when signed in)
- feature-highlight: YOUR optional full-width current-events / feature card
- spotlight: product carousel (ballot, quiz, midterms, etc.)
- app-promo: iOS app banner
- breaking: Breaking News strip (PROTECTED — always show)
- front-page: Front Page hero strip (PROTECTED — always show)
- lean: coverage lean bar (FIXED under front-page — do not order/hide; site pins it)
- calendar: interactive news calendar
- topics: hot topic rows
- politician-spotlight: media strip of people in the news + midterms candidates
- election-map: midterms map teaser (PROTECTED — always show; reorder only)
- grades: best/worst graded board (signed-in)
- today-history: on-this-day
- human-spotlight: daily positive human story
- discover: Discover strip
- good-news: Good News strip
- quips: scrolling quips
- more: keep-reading links

── Allowed hrefs for highlight (MUST be on-site paths) ────────────────────
/bracket/  /elections/map/  /quiz/  /bias/  /discover/  /good-news/
/students/  /learn/  /week/  /trends/  /topics/{slug}/  /posts/{slug}/
/politicians/  /politicians/{slug}/  /search/  /register/  /how-it-works/
/human-spotlight/  /recent/  /newsletter/  /grades/

Prefer linking to product surfaces or topic hubs over a specific post unless a
post slug is clearly current and you know it exists from search/context.

── Rules ──────────────────────────────────────────────────────────────────
1. Use web_search for US political / news-cycle context (elections, major
   hearings, crises, cultural news moments). Prefer the last 48–72 hours.
2. When something is hot, promote related surfaces:
   - Midterms / races / ballots → election-map, politician-spotlight, bracket
   - Named politicians in the news → politician-spotlight higher in order
   - Media spin / bias debates → quiz, bias, feature-highlight
   - Heavy news day → keep breaking + front-page high; optionally hide quips
   - Quiet news / need relief → surface good-news, human-spotlight higher
3. Never hide breaking, front-page, election-map, or lean. Lean always sits under
   front-page (site enforces this — omit lean from order/hide).
4. Do not invent CladFacts grades, lean scores, or post headlines.
5. highlight: one timely card. If nothing useful, set highlightNull=true and
   still fill highlight with empty strings (schema requires the object).
6. order: list sections you care about first; omit the rest (site fills gaps).
7. ttlHours: usually 6–12; max 24. Quiet days can be longer; breaking news shorter.
8. reason: plain English for the editor console.
9. secondaryHref/secondaryCta: use "" when unused.
10. audience: "all" by default; "anon" for register upsells; "signed-in" rare.

Return ONLY JSON matching the schema.`;

function extractText(data) {
  if (typeof data?.output_text === "string" && data.output_text) return data.output_text;
  for (const item of data?.output || []) {
    for (const c of item?.content || []) {
      if ((c?.type === "output_text" || c?.type === "text") && typeof c?.text === "string") {
        return c.text;
      }
    }
  }
  return "";
}

function deskStamp() {
  return new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date());
}

async function callGrok(xaiKey, user) {
  const res = await fetch(XAI_RESPONSES, {
    method: "POST",
    signal: AbortSignal.timeout(120_000),
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${xaiKey}`,
    },
    body: JSON.stringify({
      model: MODEL,
      input: [
        { role: "system", content: SYSTEM },
        { role: "user", content: user },
      ],
      tools: [{ type: "web_search", max_search_results: 10 }],
      text: {
        format: {
          type: "json_schema",
          name: "home_layout",
          schema: SCHEMA,
          strict: true,
        },
      },
    }),
  });
  if (!res.ok) {
    const t = await res.text().catch(() => "");
    throw new Error(`xAI ${res.status}: ${t.slice(0, 280)}`);
  }
  const data = await res.json();
  const text = extractText(data);
  if (!text) throw new Error("empty Grok response");
  return JSON.parse(text);
}

function emptyHighlight() {
  return {
    id: "",
    kicker: "",
    title: "",
    body: "",
    href: "",
    cta: "",
    secondaryHref: "",
    secondaryCta: "",
    variant: "event",
    audience: "all",
  };
}

export async function runHomeLayoutCurator(agent) {
  const xaiKey = process.env.XAI_API_KEY;
  if (!xaiKey) return { ok: false, message: "XAI_API_KEY missing" };

  let previous = null;
  try {
    const cur = await getHomeLayout();
    // call() returns { ok, body }; GET body shape is { store }
    previous = cur?.ok ? cur.body?.store || null : null;
  } catch {
    /* first run */
  }

  // Desk overrides (reason starts with "Editor") stay until their expiresAt.
  // Prevents the periodic Grok pass from wiping a human-placed highlight.
  if (
    previous?.reason &&
    /^editor\b/i.test(String(previous.reason)) &&
    previous.expiresAt &&
    Date.parse(previous.expiresAt) > Date.now()
  ) {
    return {
      ok: true,
      message: `kept editor layout until ${previous.expiresAt}`,
      submitted: 0,
      skipped: 1,
    };
  }

  const user = [
    `Desk time (America/New_York): ${deskStamp()}.`,
    `Valid section ids: ${SECTIONS.join(", ")}.`,
    previous?.reason
      ? `Previous layout reason (do not copy blindly): ${previous.reason}`
      : "No previous layout on file.",
    previous?.highlight?.title
      ? `Previous highlight: ${previous.highlight.title} → ${previous.highlight.href}`
      : "No previous highlight.",
    "",
    "Search the current news cycle. Propose a homepage layout plan for the next few hours.",
    "If the cycle is quiet, a modest reorder + light feature is fine — do not force drama.",
  ].join("\n");

  const raw = await callGrok(xaiKey, user);

  const ttl = Math.max(4, Math.min(24, Number(raw.ttlHours) || 8));
  const now = new Date();
  const expiresAt = new Date(now.getTime() + ttl * 3600_000).toISOString();

  const order = Array.isArray(raw.order)
    ? raw.order.map((s) => String(s || "").trim()).filter(Boolean)
    : [];
  const hide = Array.isArray(raw.hide)
    ? raw.hide.map((s) => String(s || "").trim()).filter(Boolean)
    : [];

  let highlight = null;
  if (!raw.highlightNull && raw.highlight && raw.highlight.title && raw.highlight.href) {
    highlight = {
      id: String(raw.highlight.id || `hl-${now.getTime()}`).slice(0, 64),
      kicker: String(raw.highlight.kicker || "Now").slice(0, 48),
      title: String(raw.highlight.title || "").slice(0, 120),
      body: String(raw.highlight.body || "").slice(0, 220),
      href: String(raw.highlight.href || "").trim(),
      cta: String(raw.highlight.cta || "Open").slice(0, 40),
      secondaryHref: String(raw.highlight.secondaryHref || "").trim(),
      secondaryCta: String(raw.highlight.secondaryCta || "").slice(0, 40),
      variant: String(raw.highlight.variant || "event"),
      audience: String(raw.highlight.audience || "all"),
    };
  }

  const payload = {
    generatedAt: now.toISOString(),
    expiresAt,
    reason: String(raw.reason || "").slice(0, 280),
    order,
    hide,
    highlight,
    sourceQueries: Array.isArray(raw.sourceQueries)
      ? raw.sourceQueries.map((q) => String(q || "").trim()).filter(Boolean).slice(0, 8)
      : [],
  };

  const put = await putHomeLayout({
    ...payload,
    highlight,
  });
  if (!put.ok) {
    const err =
      put.body?.error ||
      put.body?.raw ||
      JSON.stringify(put.body || {}).slice(0, 200);
    return {
      ok: false,
      message: `POST /api/agent/home-layout ${put.status}: ${err}`,
      submitted: 0,
      skipped: 0,
    };
  }

  const hl = highlight ? ` highlight="${highlight.title}"` : " no-highlight";
  return {
    ok: true,
    message: `home layout ${ttl}h · order=${order.length}${hl} · ${payload.reason.slice(0, 80)}`,
    submitted: 1,
    skipped: 0,
  };
}
