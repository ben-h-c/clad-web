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

1. Read `docs/design-system.md` and the token block in `src/styles/global.css`.
2. Prefer **reuse** of existing patterns over new components.
3. One recommended direction that matches Soft Neutral Card — variants only if asked.

## Non-negotiables

- Audience ~16–24; grade scannable in <5s on a phone.
- Soft teal accent (`--accent`), parchment/dark paper — **no neon second brand**.
- Soft cards (`--radius-stock: 18px`), calm shadows.
- Dark default for public guests; admin always dark.
- No full-screen blockers for long background work.
- Copy: clear, direct, not slangy.

## Implementation rules

- Use CSS variables from `:root` / dark theme — never hardcode random hex.
- Match neighboring section spacing (`--section-gap`, `--gutter`, `--card-pad`).
- Video: facade until click.
- Honor `prefers-reduced-motion`.
- Topic media: dual-layer bloom + subject in `TopicRow` (not contain/letterbox). Solo home inserts taller; don’t invent height hacks on multi-col `.topic-rows`.

## Clad Studio packets

- Implement annotations in clad-web with design-system tokens.
- People-in-the-news / media-hero patterns already exist — extend them carefully.

## After design decisions

Update `docs/design-system.md` and this skill (clad-knowledge-maintain).
