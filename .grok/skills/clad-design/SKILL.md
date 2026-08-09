---
name: clad-design
description: >
  CladFacts visual design and UX skill. Soft Neutral Card system, mobile-first
  16–24 audience, restrained newsroom UI. Use when designing UI, CSS, components,
  Clad Studio packets, marketing surfaces, admin chrome, or when the user mentions
  design, look and feel, colors, layout, spacing, dark mode, or /clad-design.
---

# Clad design

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

## Home surfaces (common)

Fixed top (never reorder/hide): feature-highlight → breaking → front-page → lean.  
Flexible: calendar, topics, politicians, election-map, grades, today-history, human-spotlight, discover, good-news, quips, more-feed.  
Source: `src/lib/homeLayout.ts`.

## Implementation rules

- Use CSS variables — never hardcode random hex.
- Match neighboring section spacing (`--section-gap`, `--gutter`, `--card-pad`).
- Video: `.video-facade` until click.
- Today in history full-bleed: Commons only (not YouTube posters).
- Post tiles: own YouTube still or `/generated/` only.
- Honor `prefers-reduced-motion`.

## Clad Studio packets

- Implement annotations in clad-web with design-system tokens.
- Mac companion implement cwd: `~/clad-web`; Grok flags: `--prompt-file` only.

## After design decisions

Update `docs/design-system.md` and this skill (clad-knowledge-maintain).
