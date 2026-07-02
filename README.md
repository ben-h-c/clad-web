# clad-web

Fact-checked news broadcasts, edited like a 1920s broadsheet. One-editor
publication (Ben), powered by xAI Grok for research, hand-curated for
publishing. Live at [cladfacts.com](https://cladfacts.com).

Each broadcast report grades a news segment: a letter grade (A+–F), a
0–100 factuality score, and a political-lean percentage, each with a
published rationale. Legacy claim posts carry a verdict on a fixed scale
(Verified True, Mostly True, Mixed, Mostly False, False, Unverified —
`src/components/Verdict.astro`). The report text is free to read; grades,
scores, and lean are part of CladFacts Premium.

Companion to the CladFacts iOS app, which consumes `/api/posts.json` and
shares the grade vocabulary — an A− here means what it means in the app.

## How it works

1. A Mac-side agent runner (`runner/`, one Node process under PM2) drafts
   broadcast reports with Grok: a `youtube-scanner` finds new broadcast
   segments; `frontpage-curator`, `breaking-news-curator`, `discover-curator`,
   and `good-news-curator` pick what to cover; `quip-writer`,
   `compliance-auditor`, `dead-video-pruner`, `digest-sender`, and
   `newsletter-sender` handle the rest; a URL-intake queue and the news
   ticker run on every tick.
2. Drafts land in an approval queue at `/admin/queue`, submitted through the
   bearer-token `/api/agent/*` endpoints. The editor reviews and edits — or
   writes a report by hand at `/admin`.
3. Approval commits a markdown file to `src/content/posts/` via the GitHub
   Contents API (one commit per post — `src/pages/api/publish.ts` +
   `src/lib/github.ts`). Cloudflare Workers Builds redeploys within ~30
   seconds and the post appears on the homepage.

Reader accounts exist (Better Auth on D1; email + password plus Google,
Apple, and X sign-in). Grades sit behind CladFacts Premium — $2.99/mo or
$29.99/yr with a 7-day trial; Stripe on the web, Apple in-app purchase in the
app (tiers `paid`/`trial`/`free`/`anon` in `src/lib/access.ts`). There are no
third-party analytics, no ads, and no cross-site trackers.

## Stack

- **Astro 6** (server output, Cloudflare adapter) — content collections for
  posts, SSR for `/admin` and `/api/*`, edge-cached static for everything else.
- **Cloudflare Workers + Static Assets** — single Worker serves the static
  site from the `ASSETS` binding and handles the protected routes; deployed
  by Cloudflare Workers Builds on every push.
- **Cloudflare D1** — reader accounts, sessions, preferences, subscriptions
  (Better Auth via `kysely-d1`); schema files under `db/`.
- **Cloudflare KV** — the `AGENTS` namespace holds agent state (registry,
  pending drafts, seen-ledger).
- **Workers rate limiting** — the `FACTCHECK_LIMITER` binding throttles
  `/api/factcheck`.
- **GitHub Contents API** — posts are committed to `src/content/posts/`.
- **xAI Grok** — server-side fact-check and drafting calls.
- **Stripe** (web subscriptions), **Resend** (transactional email),
  **APNs** (iOS push).
- **`runner/`** — the Mac-side agent runner (PM2). **`scripts/`** —
  build-time helpers (`scripts/topicsAgg.mjs` topic aggregation for OG
  images; `scripts/backfillDates.mjs` one-off post re-dating).

## Local development

```bash
cp .dev.vars.example .dev.vars
# required: XAI_API_KEY, ADMIN_USER, ADMIN_PASSWORD,
#           GITHUB_TOKEN, GITHUB_REPO, GITHUB_BRANCH, AGENT_TOKEN

npm install
npm run dev                 # Astro dev server on :4321 (reads .dev.vars)
# To exercise the production Worker bundle locally:
npm run preview             # builds, then runs wrangler dev
```

Optional secrets, per feature: `BETTER_AUTH_SECRET` (reader accounts),
`GOOGLE_*` / `APPLE_*` / `TWITTER_*` (social sign-in), `RESEND_API_KEY`
(email), `STRIPE_*` (web subscriptions), `APNS_*` (push), `APPLE_IAP_*`
(app subscriptions). `src/env.d.ts` is the full binding list.

The `.dev.vars` file is gitignored. Both `astro dev` (via the Cloudflare
adapter's Workerd) and `wrangler dev` read it automatically.

## Deploy

1. The repo lives at `github.com/ben-h-c/clad-web`.
2. In Cloudflare dashboard: **Workers & Pages → Create → Import a repository**
   (Workers Builds).
3. Build command: `npm run build`. Deploy command: `npx wrangler deploy`.
   Cloudflare detects the generated `dist/server/wrangler.json` and uses it.
4. Add secrets (under Settings → Variables and Secrets → **Secret**):
   - `XAI_API_KEY`
   - `ADMIN_USER`
   - `ADMIN_PASSWORD`
   - `AGENT_TOKEN`
   - `GITHUB_TOKEN` — fine-grained PAT with **Contents: Read and write** on
     this repo only. No other scopes.
   - `GITHUB_REPO` — `ben-h-c/clad-web`
   - `GITHUB_BRANCH` — usually `main`
   - plus the optional per-feature secrets above.
5. Bindings: the D1 database (`clad-users`; apply the schema files in `db/`)
   and the `AGENTS` KV namespace must exist — `wrangler.jsonc` pins their IDs.
6. Custom domains: `cladfacts.com` and `www.cladfacts.com` (the `routes` in
   `wrangler.jsonc`).

Every push to the configured branch triggers a build. Approving a draft (or
publishing by hand) produces such a push, which is what makes the auto-deploy
loop close.

Alternative one-shot deploy from your laptop:
```bash
npx wrangler secret put XAI_API_KEY     # repeat for each secret
npm run deploy                          # astro build + wrangler deploy
```

## Editorial standards

- Every broadcast report publishes its reasoning: the letter grade, the
  0–100 factuality score, and the political lean each carry a written
  rationale. Key moments carry their own verdicts: verified, disputed,
  missing context, unsupported. The methodology is public at
  `/how-it-works/`.
- Headlines never state the verdict. No "holds up", "matches official
  accounts", "accurate", "false", or "misleading" in a headline — the
  headline describes what the broadcast covered; the grade carries the
  judgment.
- Verdicts key off documents, statutes, primary data, and named sources.
  Wikipedia and partisan outlets are last-resort citations.
- When the evidence is genuinely mixed, the verdict is "Mixed". When it's
  too thin to call, "Unverified". We do not guess.
- Tone is restrained. No emoji, no exclamations, no political adjectives
  applied to actors. Adjectives describe evidence, not people.
- AI-assisted, human-edited. Every post is reviewed before publish. The
  colophon discloses AI assistance.
- Corrections are issued as a new post linking the original via the
  `correctionOf` field, never a silent edit. They are listed on the public
  `/corrections/` page.

## Security notes

- The xAI key never leaves the server — only `/api/factcheck` touches it,
  and that endpoint is rate-limited via the `FACTCHECK_LIMITER` binding
  (20 req/min; over-limit requests get a 429 with `Retry-After`).
- Grades are gated server-side: letter grade, factuality score, lean, and
  rationale never render into anonymous HTML or JSON. Each route checks
  `getAccess()`; nothing is hidden client-side.
- `/admin` and `/api/*` sit behind basic-auth via `src/middleware.ts`, with
  deliberate carve-outs: `/api/agent/*` authenticates with the agent bearer
  token; `/api/auth/*` is the Better Auth surface; `/api/me/*`,
  `/api/comments`, `/api/push/*`, and `/api/iap/*` check the reader session
  (or Apple's signed webhook) inside the route; `/api/stripe/*` checks the
  session or the Stripe webhook signature; `/api/flag` is public but
  rate-limited in the route; `/api/posts.json`, `/api/posts/<slug>.json`,
  and `/api/search` are the public reader feed with grades gated by tier.
  The editor credential is a single shared basic-auth pair with
  constant-time compare — upgrade to passkey before a second editor is
  ever added.
- The GitHub PAT is fine-grained (this repo only, Contents only). If it
  leaks, rotate via GitHub Settings → Developer settings → Fine-grained
  tokens.
- No third-party analytics. If any are ever added, they must be cookieless
  AND must not flip the iOS app's `NSPrivacyTracking = false` declaration.

## Roadmap

- Deep links between cladfacts.com posts and the iOS app.
- Passkey login for `/admin` before a second editor is ever added.

## License

Source-visible, not open source. The code and editorial content are
copyright CladFacts LLC — see [LICENSE](LICENSE).
