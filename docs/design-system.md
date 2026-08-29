# CladFacts design system

**Source of truth for tokens:** `src/styles/global.css`  
**Human summary for agents:** this file  
**Rollback tag:** `pre-soft-redesign` (clad-web + cladfacts-ios)

Update this file whenever tokens or major UI patterns change. Keep `.grok/skills/clad-design/SKILL.md` in sync.

**Home lead (Cover, production):** first Breaking story is a full-bleed plate — phone `min-height: 16.25rem` (grade + 4-line headline), `min-height: max(15rem, 40svh)` from 700px up — headline + grade only; Today tape sits in even **1.45rem** paper (shell `1.1rem` + masthead `0.35rem` above; matching margin below the tape); later strips stay carousels. The plate mute-loops a same-origin native `<video>` of a **full-frame landscape** source only (never a phone/Shorts video). Website Cover is a 16:9 card in the page column. The only shade is the text-readability gradient behind the headline. Tap opens the article. Reduced motion keeps the still. Do not crop/veil the player to hide chrome. CSS lives in `theme-skins.css` as the default (not `data-skin`). Staging Skin row is hidden until a new experiment is added (`STAGE_SKINS`). Old `?skin=cover` cookies fall back to this Current.

---

## Brand principles

1. Soft modern newsroom — elevated cards on calm paper, not tech-startup neon.
2. Grade is the hook — scannable accuracy + lean in seconds on mobile.
3. Credibility over virality — no clickbait chrome, no outrage UI.
4. Mobile-first (audience is phone-native).
5. Dark-friendly: default dark for guests; light is an explicit choice.

## Email (digest / weekly / welcome)

Same Soft Neutral dark cards as the site (`src/lib/emailTheme.ts`). Each story: still, grade + lean, headline, meta, **Open report**. Mail hrefs are `https://mail.cladfacts.com/posts/{id}/` — never the apex host. Mail/Yahoo treat `cladfacts.com` as the iOS app and open home. Never put quoted font names inside `style=""`. Welcome letter is copy + CTA only — no CLAD / From Ben / Welcome kicker.

---

## Color tokens (light)

| Token | Value | Use |
|-------|--------|-----|
| `--paper` | `#f7f5f0` | Page background (parchment) |
| `--paper-deep` | `#f0ede6` | Nested page depth |
| `--desk` / `--desk-edge` | `#ebe8e1` / `#e4e0d8` | Desk surfaces |
| `--ink` | `#1c1c1e` | Primary text |
| `--muted-ink` | `#6b6b6b` | Secondary text |
| `--accent` | `#5b9a8b` | Soft teal — links, focus, CTAs |
| `--accent-soft` | `rgba(91, 154, 139, 0.12)` | Soft fills |
| `--red-ink` | `#c45c52` | Emphasis / danger-adjacent |
| `--card` | `#ffffff` | Elevated cards |
| Grades | pastel washes (good green / mid amber / bad rose) | Letter grades |
| Lean | blue / gray / red pastels | Political lean |

## Color tokens (dark)

| Token | Value | Use |
|-------|--------|-----|
| `--paper` | `#1c1c1e` | Charcoal page |
| `--ink` | `#f5f5f7` | Light text |
| `--muted-ink` | `#a1a1a6` | Secondary |
| `--accent` | `#6fb5a4` | Soft teal (slightly brighter) |
| `--card` | elevated dark surfaces | Cards |

Admin paths force dark via `data-force-theme="dark"`.

---

## Type

- **Sans system UI stack:** SF Pro / system UI (`--font-sans`).
- Display/masthead currently share the sans stack (soft redesign).
- Reading measure: `--measure` ~70ch; page column `--measure-page: min(40rem, 100%)`.

---

## Shape & elevation

| Token | Value |
|-------|--------|
| `--radius-stock` | `18px` (cards) |
| `--radius-control` | `12px` |
| `--radius-chip` | pill |
| `--shadow-sm/md/lg` | soft layered shadows |
| `--card-pad` | `1.15rem` |
| `--section-gap` | `2.1rem` |
| `--gutter` | `1.25rem` |

---

## Motion

- `--ease-out: cubic-bezier(0.2, 0.9, 0.25, 1)`
- `--dur-card: 0.18s`
- Respect `prefers-reduced-motion` (disable non-essential animation).

---

## UI patterns to reuse

- **Cards / modules:** existing home modules, `media-hero`, category rails with `.category__more`.
- **Home “Today” title bar:** compact horizontal title links (`.home-features--titles` / `.today-title-bar`), not media heroes. No visible **Today** / **Full day →** head — ticker sits first under the masthead with a visually hidden heading. Full titles (no ellipsis), mid-dot separators, optional short kickers for desk/daybook only, seamless CSS auto-ticker when 2+ items (pause on hover/focus-within; `prefers-reduced-motion` → static + manual overflow). No Live badge. Soft edge fade. People in the news stays media heroes (`HomeFeatureHighlight` default). Breaking / Front Page keep their section names and “see more” links; no **Graded as it airs** or **Desk picks** eyebrows. Breaking is the first large visual focus after the thin bar.
- **Home lead stack:** Today → Breaking → Front Page is a tighter stack than the rest of the page (adjacent-sibling rules only). Later sections keep `--section-gap` / `.hero { margin-top: 1.75rem }`. Staging skins keep their own density.
- **Coming up (home calendar):** daybook only — hearings, votes, scheduled news for today through today+2. Not graded articles. Uncapped. Closed bar shows a muted count (`4 scheduled` / `Quiet for three days`); open state a small-caps **Next three days** line. Do not inject report cards into this accordion.
- **Masthead Menu:** four chapters first — Read / Coverage / Play / About as independent folds (`masthead__menu-fold`). First open shows only those names (plus Account). Tap a chapter to reveal its links. Closing Menu resets folds. Current page is a thin teal left rule; the chapter that contains it gets the same mark on its name. Account is a quiet last row (never the display name). Search stays the magnifier. Guests keep **See grades free** above the directory.
- **Footer:** About · Privacy · Terms plus a quiet ©. No product/explore/org directories, no play notes, no method essays. Menu is the directory.
- **Topic media tiles (`TopicRow`):** dual-layer stills — `.topic-row__bg-bloom` (cover + heavy blur + scale) under `.topic-row__bg-subject` (cover + mild zoom + `thumbFocus*`). Kills letterbox gutters without new art. Solo home inserts (`.topic-rows--solo`) use taller cinematic min-heights; multi-col grids keep density.
- **Always-image report/strip cards:** every card shows 16:9 art (YT still or owned `/generated/` illustration). Do not design empty media voids; hide-photo is not a product option. See `docs/decisions.md` + clad-design skill.
- **Spotlight monogram:** when no valid Commons portrait, show monogram underlay (not broken-image icon).
- **Grades:** pastel grade chips / scoreboard patterns already on post cards.
- **Admin:** `.admin`, `.stat-grid`, `.stat-table`, `AdminNav` grouped desk.
- **Auth:** `.auth-form`, soft status messages — not heavy modals unless needed.
- **Video:** click-to-load facade (`.video-facade`) — no third-party until play.
- **Broadcast article order:** title (kicker, headline, byline; correction banners if any) → source video → grade card → share/save → Why this grade / Why this lean → embed, disagree, topics, summary, and the rest. Non-broadcast posts keep share under the byline.
- **Progress:** non-blocking banners / queues (Clad Studio lessons: never trap the user on a full-screen spinner).
- **iPhone App Store card:** slim Soft Neutral card under the masthead (`IosAppBanner`) on iPhone Safari/Chrome only — App Store CTA + × dismiss (localStorage). Hidden in the native app and on iPad. Do not stack Apple’s smart banner on iPhone.

---

## Do / don’t

**Do**

- Use CSS variables; extend tokens if a new color is truly needed.
- Match spacing rhythm from neighboring sections.
- Design for one-handed phone first.
- Keep OG / share cards grade-aware and clean.

**Don’t**

- Introduce a second accent family (purple/neon) without an explicit decision log entry.
- Dense dashboard chrome on reader surfaces.
- Full-screen blocking loaders for multi-minute Mac/Grok work.
- “Fellow kids” copy or meme typography.

---

## Related surfaces

- iOS: align with soft redesign (same rollback tag).
- Clad Studio: packets should reference these tokens; implementers read this file first.
