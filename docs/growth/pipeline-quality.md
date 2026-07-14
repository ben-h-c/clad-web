# Track C — pipeline quality

Hardening for draft → queue → approve → publish.

## Gates (at `/api/agent/draft`)

| Severity | Examples | Effect |
|----------|----------|--------|
| **Hard error** | Thin summary/assessment, &lt;2 key moments | 400 `quality-gate`; video marked seen |
| **Warning** | Verdict-in-headline, sparse citations, grade/score mismatch, debate without politicians | Queued; shown in admin UI |

## Event typing

From headline / video title / summary / topics:

`debate` · `town-hall` · `presser` · `hearing` · `interview` · `sunday-show` · `newscast` · `other`

Debates get a **Debate** topic (when room under the 4-tag cap) and **Priority** in the queue.

## Politicians

`tagPoliticiansFromText` runs at draft submit; tags stored on `draft.quality.politicians` and merged into frontmatter on approve (with `postBuild` matcher).

## Dead video (runner)

Before Grok:

- `runner/youtubeVideoStatus.mjs` — batch status check
- Scanner + URL intake skip missing/private/non-embeddable when the API confirms

Pruner still cleans already-published dead embeds.

## Queue UX (`/admin/queue`)

- Sort: priority → QA score → newest  
- Pills: Priority, event type, QA score, matched people  
- Warning list from draft-time QA  

## Ops notes

- Restart PM2 `clad-agent-runner` after deploy so the Mac runner picks up `youtubeVideoStatus.mjs`.  
- Existing drafts without `quality` still work (score defaults to 50 in sort).  
