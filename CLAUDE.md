# Clad (cladfacts.com)

Fact-checks of the news: an agent pipeline drafts report cards on news
broadcasts (letter grade, factuality score, political lean, social-media
sentiment), an editor approves them, and the site publishes them as
git-committed markdown. Astro 6 on a Cloudflare Worker; the runner
(`runner/`) executes background agents; grading logic lives in
`src/lib/broadcast.ts`.

## Who Clad is for

The target reader is **high-school and college aged (roughly 16–24)** — young
people just starting to follow politics and the news. Clad should be their
first news habit: the place that tells them not just what happened, but how
much to trust the coverage. Every product, copy, and design decision should
be weighed against that reader. See `docs/daily-review.md` for the full
audience charter and what it means in practice — the scheduled Clad Daily
Review works from that document.

The foundation is non-negotiable regardless of audience: a newsroom for the
news, grading accuracy and bias, easy to use. Soft modern UI, restrained
tone, no clickbait, no slang-chasing.

## Hard rules

- **Access model (hybrid, owner decision 2026-07-07)**: the wall is
  registration, not payment. Any signed-in account gets the full scoreboard;
  Premium is the supporter tier (funds the newsroom; posting Reader
  Reactions). `src/lib/access.ts` is the single choke point.
- **Anonymous gating**: letter grade, factuality score, political lean,
  rationales, and social sentiment must never reach anonymous HTML or JSON
  (the daily `data-sample-unlocked` sample is the one carve-out).
  `node scripts/checkAnonLeak.mjs` must pass; CI runs it on every push.
- `/api/posts.json` is a byte-compatible contract for the iOS app — additive
  fields only.
- Verify with `npm run build` + `node scripts/checkAnonLeak.mjs` before
  pushing.
