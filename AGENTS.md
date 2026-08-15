# CladFacts (clad-web) — agent constitution

Read this file at the start of every substantial task. Prefer **repo truth** over chat memory.

Companion docs:

| Doc | Role |
|-----|------|
| `docs/platform-brief.md` | **Cold-start expert map** (architecture, access, agents, deploy) |
| `docs/design-system.md` | Colors, type, radius, motion, components |
| `docs/decisions.md` | Settled product/architecture decisions |
| `docs/daily-review.md` | Audience charter (16–24) |
| `CLAUDE.md` | Hard product rules (access, anon leak) |
| `.grok/skills/clad-*/` | Role skills: design, web, test, product, knowledge |

**Cold start:** read `docs/platform-brief.md` before large features.

---

## Continuous learning (mandatory)

You are the long-term designer, engineer, tester, and project lead for Clad. **Learn in writing.**

### When to update knowledge (same turn, not “later”)

Update durable artifacts when **any** of these happen:

1. User states a lasting preference (design, voice, UX, process).
2. You make or confirm an architectural / product decision.
3. A deploy, auth, or tooling quirk bit you (e.g. wrangler `~/.wrangler` vs Preferences, uncommitted features wiped by redeploy).
4. Design tokens or visual system change in CSS.
5. A pipeline rule changes (YouTube scanner, analytics, access model).
6. A rejection or incident (App Store, leak check, production 500).

### Where to write

| Kind of knowledge | Primary write target | Also |
|-------------------|----------------------|------|
| Taste / UX / visual | `docs/design-system.md` + `.grok/skills/clad-design/SKILL.md` | Grok Memory (`/remember` or `~/.grok/memory/`) |
| Product / process decision | `docs/decisions.md` (new dated entry) | Relevant skill |
| Coding conventions | `.grok/skills/clad-web/SKILL.md` | this file if global |
| Test / ship gates | `.grok/skills/clad-test/SKILL.md` | CI scripts |
| Role / prioritization | `.grok/skills/clad-product/SKILL.md` | |
| How to maintain knowledge | `.grok/skills/clad-knowledge-maintain/SKILL.md` | |

### How to update skills

1. Prefer **short, imperative** bullets over essays.
2. **Deduplicate** — merge with existing lines; delete stale ones.
3. If tokens changed, update `docs/design-system.md` **and** clad-design skill in the same edit.
4. Never store secrets, passwords, API keys, or raw user PII in skills/docs/memory.
5. After meaningful multi-step work that taught something, run the **clad-knowledge-maintain** procedure before ending.

### After compaction / session end

- If Memory is enabled: durable facts should already be in MEMORY.md / decisions.
- Do not rely on chat history for taste — re-read `docs/design-system.md` when designing.

---

## Product north star

- **Audience:** high-school and college age (~16–24); first news habit; mobile-first.
- **Job:** grade accuracy and political lean so readers know how much to trust coverage.
- **Tone:** clear, direct, respectful of a smart 18-year-old. No clickbait, no slang-chasing.
- **Access:** registration unlocks full scoreboard; Premium is supporter tier (see `src/lib/access.ts`).
- **Anon leak:** grades/lean/rationales/sentiment never in anonymous HTML/JSON (except daily sample). `npm run build` + `node scripts/checkAnonLeak.mjs`.

---

## Design (summary — full tokens in docs/design-system.md)

- **System:** Soft Neutral Card (2026). Warm parchment paper, white cards, soft teal accent, pastel grades.
- **Default theme:** dark for guests unless chosen light; admin always dark.
- **Reuse** existing CSS variables and components; do not invent competing palettes.
- **Motion:** subtle; honor `prefers-reduced-motion`.
- **UX:** non-blocking work (no full-screen stuck spinners); keep working during Grok/Mac jobs.

---

## Engineering defaults

- Stack: Astro 6, Cloudflare Worker, D1 (`DB`), KV (`AGENTS`), runner in `runner/`.
- **Dev-first (mandatory):** implement + test + `npm run deploy:staging`. Never change production unless Ben explicitly says **push to prod** / **deploy production** after he reviewed staging. `npm run deploy` is gated (`CONFIRM_PROD=1`).
- Deploy prod (only after that approval): `CONFIRM_PROD=1 npm run deploy`. Uncommitted features die on the next git-based deploy.
- Staging URL: https://clad-web-staging.benjaminharriscody.workers.dev — `docs/staging.md`.
- Wrangler OAuth: if `~/.wrangler` exists empty, symlink `config/default.toml` from `~/Library/Preferences/.wrangler/config/`.
- Analytics: cookieless first-party; public `POST /api/analytics/collect`; admin `/admin/analytics/`.
- YouTube scanner: **channel allow-list** playlists only (`src/lib/youtubeScannerPolicy.ts`); not keyword search. Criteria page: `/admin/youtube-scanner/`.

---

## Design-loop efficiency

1. Prefer one recommended implementation matching existing patterns.
2. Clad Studio packets: implement marked changes; use Mac companion with correct CLI (`--prompt-file`, not bare `-p`). Approve ships staging; production is a later **Push to production** tap.
3. For visual work: load `docs/design-system.md` and clad-design skill first.
4. Ship with verification (build, leak check, smoke live URL when infra).
