# CladFacts decision log

Append-only. Newest at top. One entry per settled decision so agents stop re-litigating.

Format:

```
## YYYY-MM-DD — short title
**Status:** accepted
**Context:** …
**Decision:** …
**Consequences:** …
```

---

## 2026-08-09 — Today in History images: Commons multi-fallback

**Status:** accepted  
**Context:** Spanish Armada (and occasional other items) lost full-bleed photos when wiki lead thumbs failed or packs skipped re-enrich for missing thumbs.  
**Decision:** Resolve images via wikiTitle + title variants + MediaWiki pageimages + Commons file search; re-enrich same-day packs missing thumbs (not only videos). Heroes remain Commons-only (no YouTube posters).  
**Consequences:** Higher thumb hit-rate; slightly more Wikimedia API calls per pack.

## 2026-08-08 — Continuous agent knowledge system

**Status:** accepted  
**Context:** Multi-session agents forget taste/process unless written down; analytics feature was wiped by redeploy because it was uncommitted.  
**Decision:** Maintain `AGENTS.md`, `docs/design-system.md`, this log, and `.grok/skills/clad-*` with mandatory same-turn updates when durable knowledge is learned. Enable Grok experimental Memory.  
**Consequences:** Slightly more write overhead; far fewer repeated design/process iterations.

## 2026-08-08 — Privacy-first first-party analytics

**Status:** accepted  
**Context:** Need product analytics without private user data / third-party cookies.  
**Decision:** Cookieless first-party aggregates (page path, engaged time, device class, referrer host, coarse country, video play milestones). Public `POST /api/analytics/collect`; admin `/admin/analytics/` with recommendations. DNT/GPC honored.  
**Consequences:** No per-user funnels; must keep collect on public middleware allowlist and commit assets to git.

## 2026-08-08 — YouTube scanner = channel playlists, not keywords

**Status:** accepted  
**Context:** Keyword search was expensive/noisy; Categories admin unused.  
**Decision:** Scanner watches allow-listed channel upload playlists (`src/lib/youtubeScannerPolicy.ts`). Removed Categories admin. Read-only criteria page `/admin/youtube-scanner/`. Expanded talk/digital politics channels (Colbert, Meyers, Kimmel, TYT, MeidasTouch, Breaking Points, Megyn Kelly, Shapiro, Daily Wire, Breakfast Club, Pod Save America, Bulwark, Timcast, Secular Talk, All-In).  
**Consequences:** More API units per run; draft cap still economy-limited; manual URL intake for off-list topics.

## 2026-08-08 — Soft Neutral Card visual system

**Status:** accepted  
**Context:** 2026 redesign for soft modern newsroom.  
**Decision:** Parchment paper, white elevated cards, soft teal accent, pastel grades; dark default for guests. Documented in `docs/design-system.md` / `global.css`.  
**Consequences:** New UI must reuse tokens; rollback tag `pre-soft-redesign`.

## 2026-07-07 — Hybrid access model

**Status:** accepted  
**Context:** Owner decision on paywall vs registration.  
**Decision:** Wall is registration, not payment. Signed-in accounts get full scoreboard; Premium is supporter tier. `src/lib/access.ts` single choke point.  
**Consequences:** Anon leak checks remain critical for grades/lean.

## Audience — 16–24 first news habit

**Status:** accepted  
**Context:** See `docs/daily-review.md`.  
**Decision:** All product/copy/design weighed for high-school and college readers; credibility over slang/clickbait.  
**Consequences:** Mobile-first, scannable grades, shareability, plain-language civics paths.
