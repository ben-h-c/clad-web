# Image-licensing policy & claim response runbook

_Operational document, not legal advice. For a live dispute, consider an IP
attorney — especially before paying, admitting anything, or ignoring a
deadline._

## The policy (what keeps us out of trouble)

Post artwork on cladfacts.com is exactly one of:

1. **The YouTube CDN still of the post's own embedded video**, hotlinked from
   `img.youtube.com` / `i.ytimg.com`. We display the poster frame of a video we
   embed and review; the bytes never touch our servers. We never rehost,
   proxy, resize, or bake these stills into images we serve (the OG share-card
   route composes its cards without them for this reason).
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
frame, hotlinked from YouTube while we review that very broadcast, is a
defensible use (commentary/criticism of the identified work; no copy on our
servers). But broadcasters sometimes put licensed wire photos in their
thumbnails, and rights-agency crawlers (PicRights, Copytrack, Higbee clients)
match pixels, not provenance — so letters can still arrive. The trade-off is
deliberate: keep the visual tiles, keep the response cost low with this
runbook, and keep the kill switch ready.

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
     page AND from `/og/<slug>.png` (the deploy purge covers the edge cache;
     spot-check with `curl -I`).
4. **Log the incident** in the table below.
5. **Respond before the deadline, in writing.** Drafting guidance for
   responses is kept privately by the owner (this repo is public); as a rule,
   never respond with admissions, and route anything beyond a first letter —
   or any law-firm escalation — through an IP attorney.

## Escalation kill switch

If claims arrive faster than one-off remediation is worth, set
`SHOW_VIDEO_STILLS = false` in `src/lib/imagePolicy.ts` and deploy: every
video still disappears from tiles site-wide in one release (owned `/generated/`
art keeps rendering, and the embedded players themselves are unaffected —
YouTube serves its own poster inside the iframe).

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
| 2026-07-15 | PicRights Intl. / Reuters News & Media (catalog MT1USATODAY29199757) | 3571-5266-2984 | Broadcaster's video still (`-D40MKvQQDM`) shown on `/topics/sports/` tile | Same day: post art swapped to owned generated illustration on every surface; OG route stopped baking stills site-wide; intake + CI + rubric guards shipped |
