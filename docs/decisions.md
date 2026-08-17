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

## 2026-08-16 — Cover lead is headline only, shorter plate

**Status:** accepted  
**Context:** Ben on the iPhone staging app: Cover still showed article text on the still; wanted header only and a bit less height.  
**Decision:** Cover-only. Hide `.report-card__summary` on the lead plate (stored summary unchanged — article, Current, iOS widgets still have it). Plate `min-height` is `max(15rem, 40svh)` (was `48svh`). Overlay padding tightened. Do not restore the five-line dek unless asked.  
**Consequences:** `theme-skins.css` only. Current skin untouched.

## 2026-08-16 — Staging review can request another change

**Status:** accepted  
**Context:** After Approve shipped to staging, Clad Studio only offered **Push to production**. Ben wanted the same **Request changes** path he gets on the first proposal.  
**Decision:** On `shipped`, the design loop shows both **Push to production** and **Request changes**. Changes re-run the proposal job as a follow-up on the staging work (do not start over). Production stays a separate confirm. Cannot request changes while a production push is in flight.  
**Consequences:** Studio 1.3.0 (11); `DesignLoopView` `promoteActions`; companion `changes` from `shipped`; Worker lastNote from staging.

## 2026-08-16 — Cover ticker even gutters; dek is five lines

**Status:** superseded (dek now hidden — see “Cover lead is headline only”)  
**Context:** Clad Studio ticket `ticket-20260816-213454-clad--grading-content--exposing-` (poet/philosopher): yellow mark on the Today tape (uneven sandwich vs the Cover plate); X over the Colombia recap (full summary dumped on the still).  
**Decision:** Cover-only. Today tape sits in **0.9rem** air above and below (below matches existing masthead-side paper). Cover lead recap was clamped to **5 lines**; later hidden entirely. Stored `summary` is unchanged.  
**Consequences:** Gutters still stand. Dek rule replaced same day.

## 2026-08-16 — Cover lead is half-viewport; Cover is the only staging skin

**Status:** accepted  
**Context:** Clad Studio ticket `ticket-20260816-213304-clad--grading-content--exposing-` (poet/philosopher): yellow stroke at mid-cover; get rid of the other skins and work off Cover.  
**Decision:** Cover plate started at `min-height: max(18rem, 48svh)`; later shortened to `max(15rem, 40svh)` with headline-only overlay. `STAGE_SKINS` is `["cover"]` only. ThemeSkinBar keeps Current + Cover. Packed, Folio, Broadsheet, Gazette, Cinema, Matrix, and Wire are retired (CSS deleted; old `?skin=` / cookies fall back to Current). Matrix rain include removed.  
**Consequences:** Restore retired skins from git if a later experiment needs them. Production stays Current until an explicit push to prod.

## 2026-08-16 — Cover skin is Current plus one full-bleed lead

**Status:** accepted  
**Context:** Clad Studio ticket `ticket-20260816-102405-clad--grading-content--exposing-` (poet/philosopher): keep Current, put one gazette-format full-page article at the top of home.  
**Decision:** Staging skin `cover`. First breaking story is a full-bleed plate (image + overlay type). Masthead, Today tape, remaining Breaking cards, and every later section stay Soft Neutral Current, including carousels. No token restyle.  
**Consequences:** `STAGE_SKINS`, `ThemeSkinBar`, `BreakingStrip` `leadCover`, `theme-skins.css`. Production stays Current until an explicit push to prod.

## 2026-08-16 — Masthead Menu opens as four chapters

**Status:** accepted  
**Context:** Clad Studio ticket `ticket-20260816-100934-clad--grading-content--exposing-` (poet/philosopher): marks sat on the four group labels — Read, Coverage, Play, About. First open of Menu should show those chapters, then unfold each on its own. Revises the same-day flattened-directory decision.  
**Decision:** Menu first paint is a four-name table of contents. Each group is a nested `<details class="masthead__menu-fold">`. Independent expand (not exclusive). Closing Menu resets every chapter. Current destination keeps the teal left rule; the chapter that contains it gets the same mark on its name. Account / Sign in stays the last row. Search stays the magnifier. Guests keep See grades free above the list. Footer IA unchanged. No chips or counts.  
**Consequences:** `Masthead.astro` + `.masthead__menu-fold*` in `global.css`. Staging skins inherit. Do not auto-open the current chapter.

## 2026-08-16 — Coming up is a three-day daybook, not articles

**Status:** accepted  
**Context:** Clad Studio ticket `ticket-20260816-100349-clad--grading-content--exposing-` asked how many articles the home **Coming up** accordion can show.  
**Decision:** None — it is not an article list. It lists every civic daybook event for today through today+2 (Eastern), uncapped. Closed bar: muted count (`N scheduled` / `Quiet for three days`). Open: small-caps **Next three days**. Graded reports stay on the day dialog (`topPerDay: 2` + full day).  
**Consequences:** `HomeCalendar.astro` + `.home-cal__coming-meta`. Do not pass `eventsFromPosts` into this card.

## 2026-08-16 — Email: app if installed, browser if not

**Status:** accepted  
**Context:** Ben: a tap on iOS with the app installed should open the app to that article; browser only when the app is not there. Apex Universal Links opened the shipped app at home. Moving links to mail.cladfacts.com opened Safari every time.  
**Decision:** Keep email hrefs on `mail.cladfacts.com`. That host serves the real page (no-app / non-iOS). On iOS Safari, a small handoff navigates to `cladfacts://post/{slug}`, which the App Store app already routes to the article. Next iOS build adds `applinks:mail.cladfacts.com` and loads https Universal Links / cold-start pending URLs so the hop can go away. Apex AASA stays unclaimed so the old binary does not steal `cladfacts.com` taps onto home.  
**Consequences:** `BaseLayout.astro` mail-host handoff. `DeepLinkRouter` + entitlements on iOS. Do not put digest links back on the apex until the new binary is installed.

## 2026-08-16 — Email links live on mail.cladfacts.com, not the apex

**Status:** accepted  
**Context:** `/go/` on cladfacts.com still opened the iOS app at home. Apple’s AASA CDN already excluded `/go/*`. Mail/Yahoo treat the whole apex host as the app and ignore path excludes. The App Store binary still drops https Universal Links.  
**Decision:** Email hrefs use `https://mail.cladfacts.com/posts/{id}/` (same Worker, not in `applinks:cladfacts.com`). Do not 301 that host onto the apex. AASA no longer includes `/*`.  
**Consequences:** `wrangler.jsonc` custom domain `mail.cladfacts.com`. `emailTheme.emailHref`. Old `/go/` rewrites remain.

## 2026-08-16 — Email links must not Universal-Link into the app at home

**Status:** accepted  
**Context:** Tapping a digest card or welcome “How grading works” opened the CladFacts iOS app on the home feed, not the article / how-it-works page. AASA claimed `/*`. Mail handed the app an `https` URL; the app only handled `cladfacts://` and loaded home.  
**Decision:** (1) All mail hrefs use `/go/...`. AASA excludes `/go` and `/go/*`. Middleware rewrites those paths in place — never 302 to `/posts/` (that would re-claim the link). (2) iOS loads `https` Universal Links and cold-start `NSUserActivity` into the webview.  
**Consequences:** `emailTheme.emailHref`, `middleware.ts` AASA + `destFromGoPath`. iOS: `DeepLinkRouter.webURL`, `RootView.handleDeepLink`, `AppDelegate` continue/open. In-app routing needs an App Store binary; `/go/` works in Safari without it.

## 2026-08-16 — Email cards must link to the article; welcome has no masthead

**Status:** accepted  
**Context:** Test digest/weekly in Yahoo: headline/image clicks did not open the report. Layout still read as a text dump. Welcome showed “CLAD / From Ben / Welcome” above the letter.  
**Decision:** (1) Email CSS is attribute-safe — no quoted font names in `style=""`. (2) Every story card uses `postHref(id)` on the still, the headline, and a visible **Open report** button. (3) Welcome is the founder letter only (`brand: false`). Shared builders stay in `emailTheme.ts`.  
**Consequences:** `emailTheme.ts`, `welcomeLetter.ts`, `digest.ts`, `newsletter.ts`. Preview script asserts attributes are intact.

## 2026-08-16 — Masthead Menu is a flattened directory

**Status:** accepted  
**Context:** Clad Studio ticket `ticket-20260815-153658-clad--grading-content--exposing-` (poet/philosopher): open Menu mixed wrapping Product chips with Explore / Play / Utility accordions.  
**Decision:** Flatten to one-column rows in four groups — **Read** (Home, Discover, Topics, Good news, Week in Grades), **Coverage** (Election map, People, News Trends, Archive), **Play** (Morning quiz, Ballot board, Community votes, Check your bias), **About** (How it works, New to the news?, Students, Newsletter, About, Press). Current page: teal left rule. Account: quiet last row labeled Account / Sign in — not the preview name. Search stays the magnifier. Footer IA unchanged.  
**Consequences:** `Masthead.astro` + `.masthead__menu-*` in `global.css`. Same destinations, no nested `details`.

## 2026-08-16 — Digest emails match the app report cards

**Status:** accepted  
**Context:** Ben: daily and weekly digest emails “look horrible.” They were a text list with tiny thumbs.  
**Decision:** Rebuild email chrome as the dark Soft Neutral app: CLAD masthead, stacked 16:9 report cards, letter-grade + lean, weekly stat chips + best/worst board. Shared builders in `emailTheme.ts`.  
**Consequences:** `digest.ts`, `newsletter.ts`, `emailTheme.ts`. Staging first.

## 2026-08-16 — Welcome email after email verification

**Status:** accepted  
**Context:** Ben wanted an automated thank-you for new accounts: why Clad exists (news, not propaganda; call out bias, missing context, and misleading headlines) and what to do next. Copy approved as drafted. Send after they verify, not at signup.  
**Decision:** `afterEmailVerification` sends the founder welcome (`src/lib/welcomeEmail.ts`). Google/Apple accounts that arrive already verified get it on create. Once per user (AGENTS KV `welcome-sent:{id}`). Failures never block auth.  
**Consequences:** `auth-server.ts`. Staging first.

## 2026-08-15 — People in the news is anyone notable; report cards are politicians only

**Status:** accepted  
**Context:** The home strip only scored officeholders tagged from the politician roster, so celebrities, CEOs, and other names in current reports never appeared. A first extract pass still ranked by mention volume, then minted `/politicians/[slug]` cards for everyone — including Luigi Mangione (on trial for murder). Ben: if they are not a politician they should not have a politician report card.  
**Decision:** Extract notable people for the home strip. Rank by recency with an officeholder cap. **Politician report cards stay on the officeholder roster (and ballot sides) only.** Non-politicians open the graded report *about them* (headline/topic match), not the newest wrap that names them once. CTA “Open report,” no person grade/lean. `/politicians/[slug]` for a non-roster name 302s to that story. Publish tagging is roster-only so new posts do not write Luigi-style tags.  
**Consequences:** `src/lib/notablePeople.ts`, `homePoliticians.ts`, `politicians.ts` tagger + index, `[slug].astro`. Portraits still use the Commons proxy. No xAI. Guest/locked still hides grades.

## 2026-08-15 — Broadcast articles: source, then grade

**Status:** accepted  
**Context:** Clad Studio ticket `ticket-20260815-153038-mark-cudmore-predicts-10-year-yi` (poet/philosopher): marks asked to rearrange the report after the title — video, then grade, then share, then the why.  
**Decision:** Broadcast `/posts/[slug]/` reads title → source video → grade card (or lock panel) → share/save → Why this grade / Why this lean → embed, disagree, and the rest. Non-broadcast posts stay as they are.  
**Consequences:** `src/pages/posts/[slug].astro`, `global.css` report spacing. iOS not in this packet.

## 2026-08-15 — Clad Studio browses staging as signed-in

**Status:** accepted  
**Context:** Studio’s default target is staging, with no Better Auth session on `workers.dev`. Every card tap hit the guest register wall. Studio also set `__cladNative`, which is the reader-app flag.  
**Decision:** Clad Studio UA / first load uses staging `view=signed` (full product). Guest remains a bar toggle. Do not inject `__cladNative` from Studio.  
**Consequences:** `src/middleware.ts`; Studio `StudioTargets.browseURL`, `StudioWebController`. Production still requires a real login if the designer switches to cladfacts.com.

## 2026-08-15 — No “See all breaking” / “Full front page”

**Status:** accepted  
**Context:** Both home links opened the same `/recent/` dump. Ben: remove the buttons and that page.  
**Decision:** Breaking and Front Page heads are the section name only. `/recent/` 301s to home. Masthead “Grades & reports” and footer “Latest reports” (aliases of the same dump) are gone.  
**Consequences:** `BreakingStrip.astro`, `index.astro` Front Page `HeroStrip`, `recent.astro` redirect, `Masthead.astro`, `BaseLayout.astro`.

## 2026-08-15 — Staging notice lives in the bottom bar

**Status:** accepted  
**Context:** Clad Studio ticket `ticket-20260815-090105-clad--grading-content--exposing-` (poet/philosopher): the olive top **Staging** ribbon covered the CLAD masthead and Today ticker.  
**Decision:** Remove the fixed top ribbon. Production warning and **Allow xAI spend (this tab)** live in the first row of the bottom preview bar. Masthead returns to `top: 0`. Broadsheet/Gazette static nameplates no longer pad for a ribbon. Spend checkbox id `clad-allow-spend` and the fetch-header interceptor stay.  
**Consequences:** `ThemeSkinBar.astro`, `BaseLayout.astro`, `global.css`, `theme-skins.css`, `docs/staging.md`. Production unchanged.

## 2026-08-15 — Clad Studio: staging first, then optional push to prod

**Status:** accepted  
**Context:** Approve already deployed staging, but the iPad loop ended there with no first-class way to promote. Ben wants review on staging, then a separate tap for production.  
**Decision:** Approve / implement still run `npm run deploy:staging` and land in `shipped` (on staging). The design loop then shows **Push to production** with a confirm dialog. That action is `promote` → companion `CONFIRM_PROD=1 npm run deploy` → `live`. Production never runs from Approve. A successful `wrangler deploy` is the ship — zone cache purge is best-effort. Missing `CLOUDFLARE_ZONE_ID` / `CLOUDFLARE_API_TOKEN` must not flip the ticket back to “failed, still on staging.”  
**Consequences:** Companion `run-job.mjs` phase `promote` sets `PURGE_OPTIONAL=1`; `scripts/deploy-prod.mjs` continues to smoke after a purge skip. iPad 1.3.0 (7)+; Worker `/api/studio/ticket/:id/decision` accepts `promote`.

## 2026-08-15 — Staging “Refresh from production” button

**Status:** accepted  
**Context:** Staging KV drifts from prod; editors wanted a click, not a CLI script.  
**Decision:** Staging-only control on the preview bar. POST `/api/admin/sync-staging` copies allowlisted AGENTS keys from production KV (`AGENTS_PROD` binding) into staging `AGENTS`. Never writes prod. Never copies drafts, flags, seen-ledger, URL queue, or D1 users.  
**Consequences:** `deploy-staging.mjs` injects `AGENTS_PROD`. Admin basic-auth required.

## 2026-08-15 — Quiet home section chrome

**Status:** accepted  
**Context:** Clad Studio ticket `ticket-20260812-163735-clad--grading-content--exposing-` (poet/philosopher lens): yellow marks on Today / Full day, Breaking’s **Graded as it airs**, and Front Page’s **Desk picks** — chrome that spent height without adding meaning.  
**Decision:** Titles-variant Today strip hides the visible section head and double rule; keep a visually hidden “Today” heading. Remove Breaking’s eyebrow. Stop defaulting Front Page’s eyebrow to Desk picks (explicit `eyebrow` still renders). Discover / Good News / People in the news unchanged. Day archive remains via calendar and menu.  
**Consequences:** `HomeFeatureHighlight.astro` (`variant="titles"`), `BreakingStrip.astro`, `HeroStrip.astro`, `.home-features--titles` spacing in `global.css`.

## 2026-08-15 — Queue “Submit all” means the full pending list

**Status:** accepted  
**Context:** Admin Submit all only queued the 40 drafts rendered on the page (`QUEUE_PAGE_SIZE`). Editors had to click several times to drain a backlog.  
**Decision:** `bulk-start` with `all: true` enqueues every draft from `listDrafts`. After the claimed list empties, one leftover sweep (plus one retry of transient failures) picks up anything still pending. Status polls process 4 at a time.  
**Consequences:** `queue.astro` + `src/pages/api/admin/queue.ts`. Keep the page render cap at 40.

## 2026-08-15 — Staging does not auto-spend xAI tokens

**Status:** accepted  
**Context:** Staging had the production xAI key and full-power dial, so incidental admin/publish/vision on staging could burn tokens.  
**Decision:** Staging is spend-dark unless explicitly opted in (`X-Clad-Allow-Spend`, `?spend=1`, `allowSpend: true`, or the staging banner checkbox). Runner against a staging base skips automatic ticks; only `--force=<kind>` or Run-now. Production spend is unchanged.  
**Consequences:** `src/lib/spendGuard.ts`, `runner/stagingGuard.mjs`. Approving a draft on staging without the checkbox skips vision/Imagine.

## 2026-08-15 — xAI spend mode is full power

**Status:** accepted  
**Context:** Token usage had been on economy (`XAI_ECONOMY=economy` on the runner; code default economy when unset) to save Grok spend at low traffic.  
**Decision:** Run **full** quality/volume. Default unset → full. Set `XAI_ECONOMY=economy` only to throttle. Flip is `runner/.env` + Worker `XAI_ECONOMY` + `src/lib/xaiEconomy.ts`.  
**Consequences:** Higher YouTube draft caps, vision on publish, reasoning curators, X search on sentiment, no minHoursBetweenRuns gate. Revert with `XAI_ECONOMY=economy` + runner restart.

## 2026-08-13 — Sign in with Apple must be the system button in the iOS app

**Status:** accepted  
**Context:** App Review rejected 1.03 (5) on iPad Air 11" (M3) — Guideline 4: the Sign in with Apple button used logo artwork not from Apple Design Resources. The control Review saw was the clad-web HTML `Continue with Apple` social button inside the WKWebView.  
**Decision:** In the CladFacts iOS app, SIWA is only `ASAuthorizationAppleIDButton` (type Continue, style White) on `/login` and `/register`. The site’s custom Apple button is hidden in-app via injected CSS (`.auth-social__btn--app-only`). Do not draw an Apple mark, use SF Symbols `apple.logo`, or Font Awesome for SIWA. Auth still hands off through `NativeAuth` / Better Auth. Do not hide that CSS on production until this binary is live — older binaries still use the HTML button.  
**Consequences:** `cladfacts-ios` 1.0.5 (6)+. Review reply: system button, no custom artwork.

## 2026-08-12 — Clad Studio defaults to staging

**Status:** accepted  
**Context:** Studio browsed cladfacts.com and the Mac companion ran `npm run deploy` after Approve — which is now blocked without `CONFIRM_PROD=1`, so ships never landed on a reviewable site.  
**Decision:** Clad Studio target site defaults to staging (`clad-web-staging.benjaminharriscody.workers.dev`). Existing installs that still have the production URL are migrated once. Approve/implement deploys with `npm run deploy:staging` only. Cloud relay stays on cladfacts.com (packet transport). Production remains a Settings preset and an explicit “push to prod.”  
**Consequences:** iPad 1.3.0 (6)+; `StudioTargets.swift`; `run-job.mjs` deploy:staging. Do not revert the companion to unguarded prod deploy.

## 2026-08-12 — Staging skins are different products, not recolors

**Status:** accepted  
**Context:** First staging skins (Tight / Folio / Broadsheet / Matrix) only changed color, radius, and a little type. Ben: they are too alike; he needs drastic skins to toggle, plus a logged-in vs guest toggle, knowing only one skin will later go to prod.  
**Decision:** Staging bottom bar has **Account** (Live / Guest / Signed-in) and **Skin** (Current + Packed, Folio, Broadsheet, Cinema, Matrix, Wire). Skins must change layout and chrome (grid vs carousel, magazine lead, newspaper nameplate, stacked film frames, CRT, all-text wire). `?view=` / `?skin=` persist in cookies. Production stays Soft Neutral until he picks one and says push to prod. Prototypes do not need to be production-complete.  
**Consequences:** `src/styles/theme-skins.css` is allowed to be aggressive and incomplete. Do not ship `data-skin` on cladfacts.com. Guest/signed preview uses ALS in `access.ts` and is staging-only.

## 2026-08-10 — Home Today → thin title bar

**Status:** accepted  
**Context:** Clad Studio ticket `ticket-20260810-200406-clad--grading-content--exposing-`: large Today media-hero strip owned ~half the first viewport; annotation asked for a minimal scrolling title bar so Breaking is first focus.  
**Decision:** `HomeFeatureHighlight` gains `variant="titles"` for home Today only. Presentation: section head + ~40–48px bar of title links (mid-dot separators, optional short kickers for non-post desk/daybook items, Live pill, right-edge fade, manual pan-x). Data still from `buildHomeFeatureItems()` (max 12). People in the news keeps media heroes. No iOS change; no auto-marquee.  
**Consequences:** First screen shows Breaking sooner on phone/tablet; desk/agent highlight images unused on home Today (still available elsewhere). CSS: `.home-features--titles` / `.today-title-bar` in `global.css`.

## 2026-08-09 — Pass 2 site UX: lock chips, CTA system, anon home density

**Status:** accepted  
**Context:** Visual site review (Pass 2) recommended Soft Neutral treatments for anon grade hooks, nav IA, and home density. Branch `feat/pass2-site-review-ux` for clean rollback.  
**Decision:** Implement R01–R12: lock chips say “Grade” (not “Unlock free”); primary CTA “See grades free”; guest hero + register + paywall aligned; anon home caps Breaking/Front Page and swaps stacked rails for HomeExploreGrid; masthead Product/Explore/Play/Utility; footer Product/Explore/Org; how-it-works 3-step intro; newsletter secondary Soft Neutral; post lock panel; students path; section eyebrows. Shared copy in `src/lib/productCopy.ts`.  
**Consequences:** Anon HTML slightly shorter on home; signed-in layout unchanged for discover/good-news/spotlight. Rollback: `git checkout main` or revert the feature branch merge.

## 2026-08-09 — Knowledge maintain: media lessons into skills + memory

**Status:** accepted  
**Context:** Bootcamp left always-image and Commons hygiene mainly in this log; skills and project Grok Memory were thin.  
**Decision:** Fold those operational rules into `clad-web` / `clad-design` / `clad-test` / `clad-product` skills, `docs/platform-brief.md` §6, `docs/design-system.md` patterns, and seed `~/.grok/memory/clad-web-fb55f351/MEMORY.md`. Global memory points at cold-start + media bullets. No full-site rescan.  
**Consequences:** Cold starts should not re-litigate hide-photo vs illustration or invent Commons widths.

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

## 2026-08-10 — Clad Studio cloud relay

**Decision:** iPad ↔ Mac design loop can run over the internet via `/api/studio/*` on cladfacts.com (KV-backed, shared Bearer token). LAN Bonjour remains fallback.

**Why:** Bonjour only works on same Wi‑Fi; user needs cafe/hotspot ↔ home Mac.

**Setup:** `CLAD_STUDIO_RELAY_TOKEN` Worker secret + Mac `~/.cladstudio/relay-token` + iPad Settings cloud relay.


## 2026-08-11 — Clad Studio design-loop speed + status reliability

**Status:** accepted  
**Context:** Packet felt stuck on iPad ("received / Grok working") for a long time while Mac had proposed; implement phase ran long on leak-check and failed status pushes never retried (signature cached before HTTP success).  
**Decision:** Mac cloud-relay retries pushes, records success only after 200, resyncs open ticket status every ~6s, attaches preview base64 only at review. Implement agent verifies with `npm run build` only (no checkAnonLeak for pure UI); companion runs deploy after `shipped.json` and surfaces "Deploying…" on the loop.  
**Consequences:** iPad should track real progress; design-loop target under ~10 minutes to shipped for typical UI tickets.

## 2026-08-11 — Clad Studio configurable design lens

**Status:** accepted  
**Context:** Ben wants a configurable layer between designer prompts and Grok so each packet is framed for a sensibility/demographic (first: poet/philosopher; later e.g. Chinese farmer).  
**Decision:** iPad Settings → Design lens (catalog + Custom freeform). Default **poet-philosopher**. Snapshot into each packet (`context.json.lens`, `lens.md`, `prompt.md` section). Mac `run-job.mjs` injects Active design lens into proposal + implement prompts. Changing lens affects subsequent Sends only.  
**Consequences:** Proposals/ships should feel written *for* that audience; Soft Neutral still holds; annotations still win on what/where.

## 2026-08-12 — Dev-first: staging before production

**Status:** accepted  
**Context:** Ben wants every requested change to land in the non-prod environment automatically, with testing, and production only after he reviews and asks to push.  
**Decision:** Default ship path is `npm run deploy:staging`. Agents must not deploy cladfacts.com unless Ben says **push to prod** / **deploy production**. `npm run deploy` requires `CONFIRM_PROD=1`. Smoke staging before asking for approval.  
**Consequences:** Redesigns and fixes are visible at the staging Worker first. Prod stays frozen until an explicit second command.

## 2026-08-12 — Isolated staging Worker

**Status:** accepted  
**Context:** Need a non-prod environment for redesign/QA without touching cladfacts.com.  
**Decision:** Dedicated Worker `clad-web-staging` at https://clad-web-staging.benjaminharriscody.workers.dev (custom domain `staging.cladfacts.com` when DNS lands). Own KV (`AGENTS_STAGING`) and D1 (`clad-users-staging`). Deploy with `npm run deploy:staging` (`scripts/deploy-staging.mjs` patches Astro’s generated wrangler.json because the adapter drops `env.staging`). Staging is noindex and shows a banner. Prod remains `npm run deploy`.  
**Consequences:** Experimental UI ships to staging first. Never run `wrangler deploy --env staging` after `astro build` — that deploys production.

