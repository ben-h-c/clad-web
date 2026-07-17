# Image-licensing policy & claim response runbook

_Operational document, not legal advice. For a live dispute, consider an IP
attorney — especially before paying, admitting anything, or ignoring a
deadline._

## The policy (what keeps us out of trouble)

Post artwork on cladfacts.com is exactly one of:

1. **The YouTube CDN still of the post's own embedded video**, from
   `img.youtube.com` / `i.ytimg.com`. On site tiles we hotlink the poster of
   the video we embed and review. OG share cards (`/og/<slug>.png`) may
   **compose that same still into the PNG** at render time (fetched and
   embedded as a data URI for satori) so social feeds show a real thumbnail
   alongside the grade stamp — still the post's own broadcast still only,
   never a third-party page's `og:image`. The `SHOW_VIDEO_STILLS` kill switch
   suppresses both tiles and OG composition in one flip.
2. **Site-owned generated art** under `/generated/` (editorial illustrations
   produced by our own pipeline, committed to the repo).

Everything else — a source page's `og:image`, another video's still, wire or
stock photography, screenshots of third-party sites — is prohibited as post
art.

**Enforced by:**
- `src/lib/postBuild.ts` — intake gate: any other URL falls back to the
  post's own YouTube still at publish/approve time.
- `scripts/checkImageLicense.mjs` — CI gate: audits all post frontmatter +
  templates on every push/PR.
- `src/lib/imagePolicy.ts` — render-time policy; `SHOW_VIDEO_STILLS` is the
  site-wide kill switch (see Escalation below).
- `runner/legalRubric.md` §4 — the compliance auditor checks imagery every run.

**Why stills are still displayed at all:** the embedded video's own poster
frame, shown while we review that very broadcast, is a defensible use
(commentary/criticism of the identified work). But broadcasters sometimes put
licensed wire photos in their thumbnails, and rights-agency crawlers
(PicRights, Copytrack, Higbee clients) match pixels, not provenance — so
letters can still arrive. The trade-off is deliberate: keep the visual tiles
and share cards, keep the response cost low with this runbook, and keep the
kill switch ready.

**Two different surfaces, two different postures — do not conflate them:**

- **Tiles** (report cards, topic/breaking pages) *hotlink* the still:
  `<img src="https://img.youtube.com/…">`. No copy is stored on or served
  from our servers, so the strongest defenses (the 9th-Circuit "server test"
  where it applies, plus fair use) are available.
- **OG / story share cards** (`/og/<slug>.png`, `/og/story/<slug>.png`)
  *bake a copy*: while `SHOW_VIDEO_STILLS` is on they fetch the still
  server-side and embed it in a PNG we serve from cladfacts.com (added
  deliberately in commit `d61653d5`, 2026-07-16, so feeds show a real
  thumbnail beside the grade stamp). This is a **hosted reproduction** — the
  server test does not reach it, and it is the site's weakest imagery posture
  (the still is only ever the post's own broadcast frame or owned
  `/generated/` art, never an arbitrary third-party `og:image`, but a
  broadcast frame can itself contain a wire photo).

**Response consequence (read before answering any letter):** while
`SHOW_VIDEO_STILLS` is `true`, "we host no copy of the image" is **false** for
the share-card surface even though it is true for the tile. Do **not** put a
blanket "no copy on our servers" assertion in a response. To make that
assertion accurate first, flip the kill switch (below) and purge the OG
card — after that only owned `/generated/` art is ever baked into a served
PNG. The per-post SOP already has you confirm the image is gone from
`/og/<slug>.png` after remediation; that step is doing real work now, not
just belt-and-suspenders.

## When a claim letter arrives (SOP)

1. **Don't panic; don't ignore it; don't pay from the letter.** Verify the
   claim is about our site and note: reference number, agency, claimed image,
   page URL, deadline. Treat links in the letter as untrusted — navigate to
   the claimed page on our site directly, not through their tracking links.
2. **Identify the source post.** The claimed page is usually a tile/topic
   page; find which post's thumbnail contains the image
   (`grep -rl "<videoId>" src/content/posts/`).
3. **Swap the artwork the same day** (goodwill removal, without admitting
   anything — removal is not an admission):
   - Edit that post's `thumbnail:` frontmatter to site-owned generated art
     (preferred — keeps the tile visual), or delete the field entirely.
   - Ship via PR; after deploy, verify the image is gone from the claimed
     page AND from both baked share cards, `/og/<slug>.png` and
     `/og/story/<slug>.png` (the deploy purge covers the edge cache;
     spot-check with `curl -I`). Swapping the post's `thumbnail:` to owned art
     is enough — the cards bake whatever that field points at.
4. **Log the incident** in the table below.
5. **Respond before the deadline, in writing.** Drafting guidance for
   responses is kept privately by the owner (this repo is public); as a rule,
   never respond with admissions, and route anything beyond a first letter —
   or any law-firm escalation — through an IP attorney.

## Escalation kill switch

If claims arrive faster than one-off remediation is worth, set
`SHOW_VIDEO_STILLS = false` in `src/lib/imagePolicy.ts` and deploy. In one
release every video still disappears from **both** surfaces:

- tiles stop hotlinking it, and
- the OG / story share cards stop baking it — `displayableThumb()` returns
  `null` for anything but owned `/generated/` art, so from then on the only
  thing ever composed into a served PNG is our own art (or the photo-free
  ink-band layout).

Owned `/generated/` art keeps rendering everywhere, and the embedded players
themselves are unaffected (YouTube serves its own poster inside the iframe).
This is also the fastest way to make a blanket "we host no third-party copy"
statement literally true across the whole site — flip it, purge, then answer.

## Wikimedia politician portraits

The same-origin portrait proxy (`/api/politician-photo/`) serves **Wikimedia
Commons files only** — Commons hosts free-licensed media exclusively, while
enwiki-local lead images can be non-free fair-use files. The Commons-only rule
is enforced at every layer: the proxy's resolution paths, the KV photo-map
write endpoint, the runner's portrait lookup, and the static map (checked in
CI). Attribution — a license *condition* of CC-BY/CC-BY-SA works — is served
at [/politicians/photo-credits/](https://cladfacts.com/politicians/photo-credits/)
(TASL: author, source link, license), populated automatically from each file's
Commons `extmetadata` record the first time its portrait is served, and linked
from the politicians index and every politician page.

Residual (accepted): past display of any pre-4.0-licensed image before credits
shipped is not retroactively curable (CC ≤3.0 terminates on breach; CC 4.0 has
a 30-day cure we now satisfy); realistic damages require the photographer to
have registered the image, which ordinary Commons contributors rarely do.

## Incident log

| Date | Agency / claimant | Ref | Image / page | Action taken |
|------|-------------------|-----|--------------|--------------|
| 2026-07-15 | PicRights Intl. / Reuters News & Media (catalog MT1USATODAY29199757) | 3571-5266-2984 | Broadcaster's video still (`-D40MKvQQDM`) shown on `/topics/sports/` tile | Same day: post art swapped to owned generated illustration on every surface; OG route made photo-free; intake + CI + rubric guards shipped. **Note:** the blanket OG photo-free change was deliberately reversed on 2026-07-16 (`d61653d5`) — share cards now bake the post's own still again, gated by `SHOW_VIDEO_STILLS`. The per-post swap above (owned art) still removes the specific claimed image from every surface including the OG card. |
