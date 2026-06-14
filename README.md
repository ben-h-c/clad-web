# clad-web

Fact-checked headlines, edited like a 1920s broadsheet. One-editor publication
(Ben), powered by xAI Grok for research, hand-curated for publishing.

Companion to the [Clad iOS app](https://github.com/ben-h-c/debate-moderator-ios).
The two share a verdict vocabulary so a "Mostly False" here means what it means
in the app.

## How it works

1. You open `/admin` (basic-auth gated).
2. You paste a headline + source URL + optional editor notes.
3. The server calls Grok (xAI) with your key and returns a structured
   verdict + summary + body + citations.
4. You edit anything you don't like.
5. You hit publish. The server commits a new markdown file to this repo
   via the GitHub Contents API. Cloudflare Pages auto-redeploys within
   ~30 seconds and the post appears on the homepage.

No reader-facing accounts, no analytics, no tracking. The privacy posture
mirrors the iOS app.

## Stack

- **Astro 6** (server output, Cloudflare adapter) — content collections for
  posts, SSR for `/admin` and `/api/*`, edge-cached static for everything else.
- **Cloudflare Workers + Static Assets** — single Worker serves the static
  site from the `ASSETS` binding and handles the protected routes.
- **GitHub Contents API** — posts are committed to `src/content/posts/`.
- **xAI Grok** — server-side fact-check calls.

## Local development

```bash
cp .dev.vars.example .dev.vars
# fill in XAI_API_KEY, ADMIN_USER, ADMIN_PASSWORD, GITHUB_TOKEN, GITHUB_REPO, GITHUB_BRANCH

npm install
npm run dev                 # Astro dev server on :4321 (reads .dev.vars)
# To exercise the production Worker bundle locally:
npm run preview             # builds, then runs wrangler dev
```

The `.dev.vars` file is gitignored. Both `astro dev` (via the Cloudflare
adapter's Workerd) and `wrangler dev` read it automatically.

## Deploy

1. Push this repo to GitHub (recommended: `ben-h-c/clad-web`).
2. In Cloudflare dashboard: **Workers & Pages → Create → Import a repository**.
3. Build command: `npm run build`. Deploy command: `npx wrangler deploy`.
   Cloudflare detects the generated `dist/server/wrangler.json` and uses it.
4. Add secrets (under Settings → Variables and Secrets → **Secret**):
   - `XAI_API_KEY`
   - `ADMIN_USER`
   - `ADMIN_PASSWORD`
   - `GITHUB_TOKEN` — fine-grained PAT with **Contents: Read and write** on
     this repo only. No other scopes.
   - `GITHUB_REPO` — e.g. `ben-h-c/clad-web`
   - `GITHUB_BRANCH` — usually `main`
5. Add your custom domain (`cladfacts.com` or similar) and let Cloudflare manage DNS.

Every push to the configured branch triggers a build. Publishing from
`/admin` produces such a push, which is what makes the auto-deploy loop close.

Alternative one-shot deploy from your laptop:
```bash
npx wrangler secret put XAI_API_KEY     # repeat for each secret
npm run deploy                          # astro build + wrangler deploy
```

## Editorial standards

- Verdicts key off documents, statutes, primary data, and named sources.
  Wikipedia and partisan outlets are last-resort citations.
- When the evidence is genuinely mixed, the verdict is "Mixed". When it's
  too thin to call, "Unverified". We do not guess.
- Tone is restrained. No emoji, no exclamations, no political adjectives
  applied to actors. Adjectives describe evidence, not people.
- AI-assisted, human-edited. Every post is reviewed before publish. The
  colophon discloses AI assistance.
- Corrections are issued as a new post citing the original, never a
  silent edit. (TODO: build a corrections workflow.)

## Security notes

- The xAI key never leaves the server — only `/api/factcheck` touches it.
- `/admin` and `/api/*` are gated by basic-auth via `src/middleware.ts`.
  Single shared credential; constant-time compare. Upgrade to passkey
  before a second editor is ever added.
- The GitHub PAT is fine-grained (this repo only, Contents only). If it
  leaks, rotate via GitHub Settings → Developer settings → Fine-grained
  tokens.
- No analytics. If you ever add any, it must be cookieless AND must not
  flip the iOS app's `NSPrivacyTracking = false` declaration — see
  `~/.claude/projects/-Users-bencody/memory/project_clad_app_store.md`.

## Roadmap

- Per-section landing pages (`/politics`, `/economy`, …).
- Corrections workflow (new post type that links the original).
- Archive / by-date pages.
- iOS deep-link integration — show today's site posts on the app's home
  screen via the RSS feed.
- Rate-limit on `/api/factcheck` (currently relies on basic-auth gate).
