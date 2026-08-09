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

## 2026-08-08 — Commons thumbs: no invented widths + validate before store

**Status:** accepted  
**Context:** Human Spotlight and Today in history showed broken-image icons when runners rewrote Commons thumbs to arbitrary widths (440px / 640px). Many files return HTTP 400 at those sizes while 330/500/960 work. Name search could also attach a wrong-person portrait (historical namesake).  
**Decision:** Shared hygiene in `src/lib/commonsMedia.ts` + `runner/commonsMedia.mjs`: strip query params; never force unchecked widths; try safe width candidates (330→500→960) only with HEAD/GET validation before writing `imageUrl` to AGENTS KV. Re-enrich same-day packs when a stored URL fails validation (not only when null). Human Spotlight accepts Commons portraits only when the Wikipedia title clearly matches the person; otherwise `imageUrl = null` and UI monogram. UI: monogram underlay + `onerror` remove on spotlight; history cards drop media layer on image error (no `?` glyph).  
**Consequences:** Slightly more Wikimedia requests on enrich; monogram for private living people without free portraits; stale KV heals on next agent run.

## 2026-08-08 — Always image: still fail → owned illustration

**Status:** accepted (supersedes hide-art default from earlier same-day decision)  
**Context:** Designer rule: report cards must always show a 16:9 image. Hiding bad YouTube stills left empty “Hold for preview” tiles (e.g. FDA/Salmonella Chipotle post) next to full photo cards.  
**Decision:** Vision still scores `stillQuality` pass|weak|fail. **Fail → generate site-owned editorial art under `/generated/`**, set `mediaStyle: overlay`, keep `stillQuality: fail` + note as audit of the *broadcast* still. Editor controls: **Use photo** / **Use illustration** / **Force show** (YT still even on fail). Hide-photo is not a product option for strip cards. Generation failure falls back to YT still rather than empty void. Legal: only own YT still or `/generated/` (`docs/legal/image-claims.md`).  
**Consequences:** Approve may call xAI image + commit a binary; bulk/economy still skips vision (keeps still). Archive text-only posts are residual, not the forward path.

## 2026-08-08 — Pre-publish still quality gate

**Status:** superseded (see “Always image” above)  
**Context:** Homepage Breaking strip mixed clean talking-head stills with busy network graphics (chyron / split composites) that read as stretched or unprofessional in the 16:9 card band. Defect is suitability, not CSS (`object-fit: cover` is correct).  
**Decision (original):** Vision scores `stillQuality`; fail → `mediaStyle: text` unless force-show.  
**Superseded by:** fail → owned `/generated/` illustration (always-image).

## 2026-08-09 — Agent knowledge bootcamp + platform brief

**Status:** accepted  
**Context:** Need agents to open as platform experts without dozen full-site rescans.  
**Decision:** One structured bootcamp produced `docs/platform-brief.md` and fattened clad-* skills; ongoing learning via continuous-learning rules + clad-knowledge-maintain (not repeated whole-platform crawls).  
**Consequences:** Cold starts load brief → AGENTS → skill; update those files when reality changes.

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
