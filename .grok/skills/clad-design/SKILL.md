---
name: clad-design
description: >
  CladFacts visual design and UX skill. Soft Neutral Card system, mobile-first
  16–24 audience, restrained newsroom UI. Use when designing UI, CSS, components,
  Clad Studio packets, marketing surfaces, admin chrome, or when the user mentions
  design, look and feel, colors, layout, spacing, dark mode, or /clad-design.
---

# Clad design

## Staging skins (not production)

Staging may run **layout experiments** (`html[data-skin]`) that change structure, type, density, and chrome — not just color. Production stays Soft Neutral until Ben picks one skin and says push to prod. Prototypes do not need to be feature-complete. Recolor-only skins have already been rejected.

## Before any visual work

1. Read `docs/design-system.md` and tokens in `src/styles/global.css`.
2. Prefer **reuse** of existing patterns over new components.
3. One recommended direction that matches Soft Neutral Card — variants only if asked.
4. Skim `docs/platform-brief.md` §12 if new to the repo.

## Non-negotiables

- Audience ~16–24; grade scannable in <5s on a phone.
- Soft teal accent (`--accent` `#5b9a8b` light / `#6fb5a4` dark), parchment/dark paper — **no neon second brand**.
- Soft cards (`--radius-stock: 18px`), calm shadows.
- Dark default for public guests; admin always dark (`data-force-theme`).
- No full-screen blockers for long background work (Clad Studio lesson).
- Copy: clear, direct, not slangy; credibility over virality.
- **Email (digest / weekly):** same Soft Neutral dark report-card format as the site — 16:9 still, CLAD masthead, grade + lean. Not a text dump (`emailTheme.ts`).

## Home surfaces (common)

Fixed top (never reorder/hide): feature-highlight → breaking → front-page → lean.  
Flexible: calendar, topics, politicians, election-map, grades, today-history, human-spotlight, discover, good-news, quips, more-feed.  
Source: `src/lib/homeLayout.ts`.

- **Today (`feature-highlight`):** thin title bar (`HomeFeatureHighlight variant="titles"`) — ticker only (no visible Today / Full day head; visually hidden heading remains), full titles + optional desk/daybook kickers, CSS auto-ticker (pause on hover/focus, reduced-motion → manual scroll), no Live pill, no media heroes. Breaking / Front Page: section name only — no see-more, no Graded as it airs / Desk picks. `/recent/` is retired (301 home). Breaking is first large visual focus.
- **Home lead stack:** Today → Breaking → Front Page sit tighter than later sections (Current / Soft Neutral only; adjacent-sibling CSS). Do not collapse Discover / Good News / People unless asked.
- **People in the news:** still large media-hero strip (`variant` default / `home-features--politicians`). Includes anyone notable in current graded coverage. Politician cards (grade + “Open report card” + `/politicians/`) only for officeholders; others are story cards.
- **Broadcast article (`/posts/[slug]/`):** title → source video → grade card → share → why. Embed / disagree stay below the why. Non-broadcast unchanged.

## Implementation rules

- Use CSS variables — never hardcode random hex.
- Match neighboring section spacing (`--section-gap`, `--gutter`, `--card-pad`).
- Video: `.video-facade` until click.
- Today in history full-bleed: Commons only (not YouTube posters).
- Post tiles: own YouTube still or `/generated/` only.
- Honor `prefers-reduced-motion`.

## Report-card & strip media (always-image)

- Every strip/report card must show a **16:9 image** — never leave empty “Hold for preview” voids.
- Pipeline: vision `stillQuality` pass|weak|**fail**; **fail → owned illustration** under `/generated/` (`mediaStyle: overlay`), not hide-photo.
- Editor may switch Use photo / Use illustration / Force show; design work assumes art is always present.
- Legal surfaces: own YT still or `/generated/` only.

## Patterns to reuse (see also design-system.md)

- **Topic media tiles (`TopicRow`):** dual-layer stills — `.topic-row__bg-bloom` (cover + heavy blur + scale) under `.topic-row__bg-subject` (cover + mild zoom + `thumbFocus*`). Kills letterbox gutters without new art. Solo home inserts (`.topic-rows--solo`) = taller cinematic min-heights.
- **Human Spotlight:** monogram underlay when no valid Commons portrait; `onerror` removes broken img.
- **History cards:** drop media layer on image error — no broken-image glyph.

## Clad Studio packets

- Implement annotations in clad-web with design-system tokens.
- Mac companion implement cwd: `~/clad-web`; Grok flags: `--prompt-file` only.

## After design decisions

Update `docs/design-system.md` and this skill (clad-knowledge-maintain).

## Clad Studio design lens

Packets may include a **Design lens** (Settings on iPad; default poet/philosopher). When proposing or implementing Studio work, honor that lens for tone/density/copy while keeping Soft Neutral tokens and annotation geometry. See packet `lens.md` / `context.json` → `lens`.
