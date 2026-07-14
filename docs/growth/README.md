# CladFacts growth kit — wired into this repo

Source kit (Claude): `~/Downloads/clad-kit` and `clad-growth-kit.zip`.
This document is the **adapted** wiring plan for `clad-web` — not a second
pipeline. Strategy still holds: grade → share card → clip → posts → push →
digest, peaking around the 2026 midterms (Nov 3).

## What shipped in Stream C (repo)

| Piece | Location | Notes |
|-------|----------|--------|
| Announce script | `scripts/announce.mjs` | Real frontmatter (`letterGrade`, `factualityScore`, `keyMoments`) |
| Distribute workflow | `.github/workflows/distribute.yml` | On post push; dry-runs without BSKY secrets |
| Methodology URL | `/methodology/` → 301 → `/how-it-works/` | E-E-A-T / press checklist alias |
| Politician pages | `/politicians/`, `/politicians/[slug]/` | Seeds + FM tags; search/groups; OG cards |
| Coverage bracket | `/bracket/` | March Madness-style midterm field (live seeds) |
| Agent politician tags | `postBuild` + `publish` | `tagPoliticiansFromText` → FM `politicians[]` |
| Launch kit | `docs/launch/` | Day-of checklist + social templates |
| Press page | `/press/` | Public boilerplate + links |
| Pipeline QA (Track C) | `src/lib/draftQuality.ts`, runner video check | Quality gates, event types, queue sort |
| Campus / 16–24 (Track D) | `/students/`, `/learn/*`, `src/lib/campus.ts` | Explainers, grade key, share pack |
| This playbook | `docs/growth/` | Operating notes |

## Already existed (do not duplicate)

- OG cards: `/og/[slug].png` (+ story / quiz / week)
- Newsletter: Resend + `NewsletterSignup` (not Buttondown)
- YouTube ingest: `runner/youtubeScanner.mjs` + admin queue
- Org + NewsArticle + ClaimReview JSON-LD in layout/post pages
- Smart App Banner + App Store badge (gated live)
- Corrections / about / how-it-works

## Secrets (GitHub → Settings → Secrets → Actions)

| Secret | Required? | Purpose |
|--------|-----------|---------|
| `SITE_URL` | optional | Default `https://cladfacts.com` |
| `BSKY_HANDLE` | for live Bluesky | e.g. `cladfacts.bsky.social` |
| `BSKY_APP_PASSWORD` | for live Bluesky | App password, not account password |
| `ANNOUNCE_DRY_RUN` | optional | Set `1` to force print-only |

Without BSKY_*, every publish still logs paste-ready text in the Actions run.

## Manual checklist (accounts — only you)

- [ ] Reserve @cladfacts (or brand handle) on X, Bluesky, Threads, TikTok, YouTube, Instagram
- [ ] Bluesky app password → GitHub secrets above; starter pack + custom feed (kit social playbook)
- [ ] F5Bot keyword alerts (manual Reddit — never auto-reply)
- [ ] Google Search Console / Bing / Publisher Center (if not already)
- [ ] ASC metadata paste from kit `aso/app-store-metadata.md` when submitting the binary
- [ ] Press pitches: kit `press/press-kit.md` during press week

## Explicitly not wired (by design)

- Second YouTube ingest cron (use existing runner)
- Buttondown digest (use existing Resend newsletter)
- Cloudflare Web Analytics beacon (privacy posture: no analytics SDKs; revisit only with owner OK)
- Kit OG redesign (keep production workers-og cards)

## Guardrails

- Human sign-off on every verdict before publish (admin queue).
- Corrections get their own post + `/corrections/` — never silent edits.
- No automated Reddit/reply activity.
- Election-night claims: slower and right beats fast and wrong.

## Calendar

See `fall-2026-calendar.md` in this folder (from the kit). Phase 1 plumbing is
partially complete via Streams A–C; debate blitz still depends on editorial
cadence and social handles.
