import type { APIRoute } from "astro";
import { env } from "cloudflare:workers";
import { commitFile } from "~/lib/github";
import { datedSlug } from "~/lib/slug";
import { emitPost } from "~/lib/yaml";
import { buildBroadcastFrontmatter } from "~/lib/postBuild";
import {
  deleteDraft,
  findDuplicateStory,
  findNearDuplicates,
  getDraft,
  leanSpread,
  listDrafts,
  markSeen,
  putDraft,
  type PendingDraft,
} from "~/lib/agents";
import { resolveThumbnail } from "~/lib/thumbnail";
import {
  coerceMediaPresentation,
  DEFAULT_MEDIA,
  needsOwnedIllustration,
  resolveMediaPresentation,
  type MediaPresentation,
} from "~/lib/mediaPresentation";
import { xaiLimits } from "~/lib/xaiEconomy";
import { getXaiApiKey, xaiUnavailableMessage } from "~/lib/spendGuard";
import { reviseBroadcastReport } from "~/lib/broadcast";
import { applyEventTopics, assessDraftQuality } from "~/lib/draftQuality";
import { lintHeadline } from "~/lib/headlineLint";
import {
  bulkJobSummary,
  emptyBulkJob,
  getQueueBulkJob,
  isBulkJobStale,
  needsBulkKick,
  putQueueBulkJob,
  type QueueBulkJob,
} from "~/lib/queueBulk";

export const prerender = false;

type CfLocals = { cfContext?: { waitUntil?: (p: Promise<unknown>) => void } };

export const GET: APIRoute = async () => {
  const [drafts, bulk] = await Promise.all([listDrafts(env.AGENTS), getQueueBulkJob(env.AGENTS)]);
  return json(
    {
      drafts,
      bulk: bulk
        ? { ...bulk, summary: bulkJobSummary(bulk) }
        : { ...emptyBulkJob(), summary: "" },
    },
    200
  );
};

export const POST: APIRoute = async ({ request, locals }) => {
  let p: any;
  try {
    p = await request.json();
  } catch {
    return json({ error: "Invalid JSON body" }, 400);
  }

  const action = String(p?.action ?? "");
  const cfLocals = locals as CfLocals;

  // ---- Background bulk submit (survives navigating away) --------------------
  if (action === "bulk-start") {
    return startBulkJob(request, cfLocals, p);
  }
  if (action === "bulk-tick") {
    // Process a small batch per tick (vision is off on bulk). Then chain more.
    await runBulkBatch({ maxItems: 4, maxMs: 55_000 });
    const bulk = (await getQueueBulkJob(env.AGENTS)) ?? emptyBulkJob();
    if (bulk.status === "running" && bulk.remaining.length > 0) {
      scheduleBulkContinue(request, cfLocals, true);
    }
    return json({ ok: true, bulk: { ...bulk, summary: bulkJobSummary(bulk) } }, 200);
  }
  if (action === "bulk-status") {
    let bulk = (await getQueueBulkJob(env.AGENTS)) ?? emptyBulkJob();
    // Status poll is the reliable path while the admin tab is open.
    if (bulk.status === "running" && bulk.remaining.length > 0) {
      await runBulkBatch({ maxItems: 4, maxMs: 55_000 });
      bulk = (await getQueueBulkJob(env.AGENTS)) ?? bulk;
      if (bulk.status === "running" && bulk.remaining.length > 0) {
        scheduleBulkContinue(request, cfLocals, true);
      }
    } else if (bulk.status === "running" && bulk.remaining.length === 0) {
      bulk.status = "done";
      bulk.lastNote = bulk.lastNote || "Finished";
      await putQueueBulkJob(env.AGENTS, bulk);
    }
    return json({ ok: true, bulk: { ...bulk, summary: bulkJobSummary(bulk) } }, 200);
  }
  if (action === "bulk-cancel") {
    const bulk = (await getQueueBulkJob(env.AGENTS)) ?? emptyBulkJob();
    if (bulk.status === "running") {
      bulk.status = "cancelled";
      bulk.current = null;
      bulk.lastNote = "Cancelled by editor";
      await putQueueBulkJob(env.AGENTS, bulk);
    }
    return json({ ok: true, bulk: { ...bulk, summary: bulkJobSummary(bulk) } }, 200);
  }

  const id = String(p?.draftId ?? "").trim();
  if (!id) return json({ error: "draftId required" }, 400);

  if (action === "reject") {
    await deleteDraft(env.AGENTS, id);
    return json({ ok: true }, 200);
  }

  // Flag for revision: send the draft back to Grok with the editor's comment,
  // then store the corrected report back on the same draft (stays in the queue).
  if (action === "revise") {
    const comment = String(p?.comment ?? "").trim();
    if (comment.length < 3) return json({ error: "Add a comment describing what to fix." }, 400);
    const reviseKey = getXaiApiKey(request, p);
    if (!reviseKey) return json({ error: xaiUnavailableMessage() }, 503);
    const draft = await getDraft(env.AGENTS, id);
    if (!draft) return json({ error: "Draft not found" }, 404);
    try {
      const revised = await reviseBroadcastReport(reviseKey, {
        report: draft.report,
        feedback: comment,
        sourceUrl: draft.sourceUrl,
        videoTitle: draft.source.videoTitle,
        channel: draft.source.channel,
      });
      const q = assessDraftQuality(revised, {
        videoTitle: draft.source.videoTitle,
        channel: draft.source.channel,
      });
      applyEventTopics(revised, q.eventType);
      draft.report = revised;
      draft.quality = {
        score: q.score,
        warnings: q.warnings,
        eventType: q.eventType,
        politicians: q.politicians,
        headlineLint: q.headlineLint,
        priority: q.priority,
      };
      await putDraft(env.AGENTS, draft);
      return json({ ok: true, headline: revised.headline, quality: draft.quality }, 200);
    } catch (err: any) {
      return json({ error: err?.message ?? "Revision failed" }, 502);
    }
  }

  if (action !== "approve") {
    return json({ error: "action must be 'approve', 'reject', 'revise', or bulk-*" }, 400);
  }

  const result = await approveDraft(id, {
    force: Boolean(p?.force),
    featured: Boolean(p?.featured),
    mediaStyle: p?.mediaStyle,
    thumbFocusX: p?.thumbFocusX,
    thumbFocusY: p?.thumbFocusY,
    mediaNote: p?.mediaNote,
    forceStill: Boolean(p?.forceStill),
    preferIllustration: Boolean(p?.preferIllustration),
    xaiKey: getXaiApiKey(request, p),
  });
  if (result.ok) {
    return json(
      { ok: true, slug: result.slug, htmlUrl: result.htmlUrl, postUrl: result.postUrl },
      200
    );
  }
  if (result.duplicate) {
    return json({ error: result.error, duplicate: true }, 409);
  }
  return json({ error: result.error }, result.status);
};

// ---------------------------------------------------------------------------
// Approve one draft (shared by single-click and bulk)
// ---------------------------------------------------------------------------

type ApproveOk = {
  ok: true;
  slug: string;
  htmlUrl: string;
  postUrl: string;
};
type ApproveFail = {
  ok: false;
  error: string;
  status: number;
  duplicate?: boolean;
};

async function approveDraft(
  id: string,
  opts: {
    force?: boolean;
    featured?: boolean;
    mediaStyle?: unknown;
    thumbFocusX?: unknown;
    thumbFocusY?: unknown;
    mediaNote?: unknown;
    /** Keep YouTube still even when vision scores stillQuality fail. */
    forceStill?: boolean;
    /** Editor chose owned illustration (always-image path). */
    preferIllustration?: boolean;
    /** Skip Grok vision framing (bulk path) — default 16:9 is intentional. */
    skipVision?: boolean;
    /** Present only when staging spend is opted in (or always on production). */
    xaiKey?: string;
  }
): Promise<ApproveOk | ApproveFail> {
  if (!env.GITHUB_TOKEN || !env.GITHUB_REPO || !env.GITHUB_BRANCH) {
    return { ok: false, error: "GitHub publishing is not configured.", status: 503 };
  }

  const draft = await getDraft(env.AGENTS, id);
  if (!draft) return { ok: false, error: "Draft not found", status: 404 };

  const near = await findNearDuplicates(env.AGENTS, {
    texts: [draft.source.videoTitle ?? "", draft.report.headline],
    publishedAt: draft.source.publishedAt,
    excludeDraftId: draft.draftId,
  });
  const spread = leanSpread([...near, { leanScore: draft.report.leanScore }]);
  if (!opts.force) {
    const dup = await findDuplicateStory(env.AGENTS, {
      channel: draft.source.channel ?? "",
      texts: [draft.source.videoTitle ?? "", draft.report.headline],
    });
    if (dup) {
      return {
        ok: false,
        error: `Looks like a duplicate — ${dup}. Re-approve to publish anyway.`,
        status: 409,
        duplicate: true,
      };
    }
    if (near.length > 0) {
      const top = near[0]!;
      const leanTxt = top.leanScore != null ? `lean ${top.leanScore}%` : "lean n/a";
      return {
        ok: false,
        error: `Near-duplicate coverage in the last 48h: ${top.headline} (${top.channel ?? "unknown channel"}, ${leanTxt}) — lean spread ${spread} pts. Re-approve to publish anyway.`,
        status: 409,
        duplicate: true,
      };
    }
  } else if (near.length > 0) {
    console.warn(
      JSON.stringify({
        evt: "near-dup-cluster",
        videoId: draft.videoId,
        channel: draft.source.channel ?? "",
        matches: near.map((m) => ({ id: m.id, lean: m.leanScore })),
        candidateLean: draft.report.leanScore,
        leanSpread: spread,
        forced: true,
      })
    );
  }

  const srcRaw = (draft.source?.publishedAt ?? "").trim();
  const parsed = srcRaw ? new Date(srcRaw) : null;
  const valid = parsed && !Number.isNaN(parsed.getTime());
  const when = valid ? parsed! : new Date();
  const publishedAt = valid ? when.toISOString() : "";

  const slug = datedSlug(draft.report.headline, when);
  const github = {
    token: env.GITHUB_TOKEN,
    repo: env.GITHUB_REPO,
    branch: env.GITHUB_BRANCH,
  };

  // Always resolve the YouTube still first (vision scores this; audit trail).
  const ytThumb = await resolveThumbnail({
    videoId: draft.videoId,
    title: draft.report.headline,
    slug,
  });

  let media = await resolveApproveMedia({
    opts,
    thumbnail: ytThumb,
    headline: draft.report.headline,
    videoId: draft.videoId,
    xaiKey: opts.xaiKey,
  });

  // Always-image: fail or editor "Use illustration" → owned /generated/ art.
  // Force-show keeps the YouTube still. Generation failure falls back to YT.
  let thumbnail = ytThumb;
  const wantIllustration = needsOwnedIllustration(media, {
    forceStill: Boolean(opts.forceStill),
    preferIllustration: Boolean(opts.preferIllustration),
  });
  if (wantIllustration && opts.xaiKey) {
    const generated = await resolveThumbnail({
      videoId: draft.videoId,
      title: draft.report.headline,
      slug,
      xaiKey: opts.xaiKey,
      github,
      preferGenerated: true,
    });
    if (generated && generated.startsWith("/generated/")) {
      thumbnail = generated;
      media = {
        ...media,
        mediaStyle: "overlay",
        mediaNote: (
          media.stillQuality === "fail"
            ? `YT still fail → owned illustration${media.mediaNote ? `: ${media.mediaNote}` : ""}`
            : typeof opts.mediaNote === "string" && opts.mediaNote
              ? opts.mediaNote
              : "editor chose illustration"
        ).slice(0, 200),
      };
    } else {
      // Last resort: show YT still rather than empty void.
      thumbnail = ytThumb || generated;
      media = {
        ...media,
        mediaStyle: "overlay",
        mediaNote: (
          media.mediaNote
            ? `illustration failed — showing still: ${media.mediaNote}`
            : "illustration failed — showing YT still"
        ).slice(0, 200),
      };
    }
  }

  const fm = buildBroadcastFrontmatter(draft.report, {
    sourceUrl: draft.sourceUrl,
    videoId: draft.videoId,
    videoTitle: draft.source.videoTitle,
    sourceTitle: draft.source.channel,
    featured: Boolean(opts.featured),
    draft: false,
    publishedAt: publishedAt || undefined,
    thumbnail: thumbnail || undefined,
    media,
  });
  if (draft.quality?.politicians?.length) {
    const bySlug = new Map((fm.politicians ?? []).map((x) => [x.slug, x]));
    for (const t of draft.quality.politicians) bySlug.set(t.slug, t);
    fm.politicians = [...bySlug.values()];
  }

  const path = `src/content/posts/${slug}.md`;
  const fileBody = emitPost(fm, "");

  try {
    const out = await commitFile({
      token: env.GITHUB_TOKEN,
      repo: env.GITHUB_REPO,
      branch: env.GITHUB_BRANCH,
      path,
      contents: fileBody,
      message: `publish (agent): ${fm.headline}`,
    });
    await markSeen(env.AGENTS, draft.videoId);
    await deleteDraft(env.AGENTS, id);
    return {
      ok: true,
      slug,
      htmlUrl: out.url,
      postUrl: `/posts/${slug}/`,
    };
  } catch (err: any) {
    return { ok: false, error: err?.message ?? "Approve/publish failed", status: 502 };
  }
}

/** Force-show / illustration preference / vision quality gate for queue approve. */
async function resolveApproveMedia(args: {
  opts: {
    mediaStyle?: unknown;
    thumbFocusX?: unknown;
    thumbFocusY?: unknown;
    mediaNote?: unknown;
    forceStill?: boolean;
    preferIllustration?: boolean;
    skipVision?: boolean;
  };
  thumbnail: string | null | undefined;
  headline: string;
  videoId: string;
  xaiKey?: string;
}): Promise<MediaPresentation> {
  const forceStill = Boolean(args.opts.forceStill);
  const preferIllustration = Boolean(args.opts.preferIllustration);
  // Legacy mediaStyle:text from older clients → treat as prefer illustration.
  const styleRaw =
    typeof args.opts.mediaStyle === "string"
      ? args.opts.mediaStyle.trim().toLowerCase()
      : "";
  const wantIllustration = preferIllustration || styleRaw === "text";

  const hasFocus =
    args.opts.thumbFocusX != null || args.opts.thumbFocusY != null;
  // Explicit focus override — use editor framing (no vision).
  if (hasFocus && !wantIllustration) {
    return coerceMediaPresentation(
      {
        mediaStyle: "overlay",
        thumbFocusX: args.opts.thumbFocusX as any,
        thumbFocusY: args.opts.thumbFocusY as any,
        mediaNote:
          typeof args.opts.mediaNote === "string"
            ? args.opts.mediaNote
            : "editor override",
      },
      { allowNonOverlay: false }
    );
  }

  // Editor chose illustration — skip vision; stillQuality left unset/failish.
  if (wantIllustration) {
    return {
      ...DEFAULT_MEDIA,
      stillQuality: "fail",
      mediaNote:
        typeof args.opts.mediaNote === "string" && args.opts.mediaNote
          ? args.opts.mediaNote
          : "editor chose illustration",
    };
  }

  // Bulk / economy skip vision: default 16:9 is intentional and cheap.
  // Human queue preview is the still gate when vision is off.
  const skipVision =
    args.opts.skipVision ||
    !args.xaiKey ||
    !xaiLimits(env.XAI_ECONOMY).enableVisionOnPublish;
  if (skipVision) {
    return {
      ...DEFAULT_MEDIA,
      mediaNote: "default 16:9 framing (no vision)",
    };
  }

  return resolveMediaPresentation({
    apiKey: args.xaiKey,
    imageUrl: args.thumbnail || undefined,
    headline: args.headline,
    videoId: args.videoId,
    forceStill,
  });
}

// ---------------------------------------------------------------------------
// Bulk job: in-process batches via waitUntil (+ status-poll recovery)
// ---------------------------------------------------------------------------

function sortDraftsForBulk(drafts: PendingDraft[]): PendingDraft[] {
  return [...drafts].sort((a, b) => {
    const pa = a.quality?.priority ? 1 : 0;
    const pb = b.quality?.priority ? 1 : 0;
    if (pb !== pa) return pb - pa;
    const sa = a.quality?.score ?? 50;
    const sb = b.quality?.score ?? 50;
    if (sb !== sa) return sb - sa;
    return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
  });
}

function basicAuthHeader(): string | null {
  if (!env.ADMIN_USER || !env.ADMIN_PASSWORD) return null;
  const raw = `${env.ADMIN_USER}:${env.ADMIN_PASSWORD}`;
  try {
    return "Basic " + btoa(raw);
  } catch {
    // Non-Latin1 passwords: encode as bytes then btoa
    const bytes = new TextEncoder().encode(raw);
    let bin = "";
    for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]!);
    return "Basic " + btoa(bin);
  }
}

async function startBulkJob(
  request: Request,
  locals: CfLocals,
  p: { draftIds?: unknown }
): Promise<Response> {
  const existing = await getQueueBulkJob(env.AGENTS);
  if (existing?.status === "running" && !isBulkJobStale(existing)) {
    // Nudge a stuck-looking chain while reporting already-running.
    if (needsBulkKick(existing)) {
      scheduleBulkContinue(request, locals, /* alsoRunLocal */ true);
    }
    return json(
      {
        ok: true,
        alreadyRunning: true,
        bulk: { ...existing, summary: bulkJobSummary(existing) },
      },
      200
    );
  }

  // Stale "running" job (e.g. chain never started): reclaim remaining ids.
  let carryIds: string[] | null = null;
  if (existing?.status === "running" && isBulkJobStale(existing) && existing.remaining?.length) {
    carryIds = existing.remaining;
  }

  const all = sortDraftsForBulk(await listDrafts(env.AGENTS));
  let ids: string[];
  if (carryIds) {
    // Keep only drafts that still exist.
    const live = new Set(all.map((d) => d.draftId));
    ids = carryIds.filter((id) => live.has(id));
  } else if (p.all === true || !Array.isArray(p.draftIds) || p.draftIds.length === 0) {
    // Submit all = every pending draft, not just the 40 rendered on the page.
    ids = all.map((d) => d.draftId);
  } else if (Array.isArray(p.draftIds) && p.draftIds.length > 0) {
    const want = new Set(p.draftIds.map((x) => String(x || "").trim()).filter(Boolean));
    ids = all.map((d) => d.draftId).filter((id) => want.has(id));
    const order = p.draftIds.map((x) => String(x || "").trim()).filter(Boolean);
    ids.sort((a, b) => order.indexOf(a) - order.indexOf(b));
  } else {
    ids = all.map((d) => d.draftId);
  }

  if (ids.length === 0) {
    return json({ error: "No drafts to process.", bulk: emptyBulkJob() }, 400);
  }

  const now = new Date().toISOString();
  const job: QueueBulkJob = {
    status: "running",
    startedAt: now,
    updatedAt: now,
    remaining: ids,
    total: ids.length + (existing && isBulkJobStale(existing) ? existing.published + existing.rejected + existing.failed : 0),
    published: existing && isBulkJobStale(existing) ? existing.published : 0,
    rejected: existing && isBulkJobStale(existing) ? existing.rejected : 0,
    failed: existing && isBulkJobStale(existing) ? existing.failed : 0,
    current: null,
    lastError: null,
    lastNote: "Starting…",
    failedIds: [],
    sweeps: 0,
  };
  // Fresh totals when not resuming a stale job.
  if (!(existing && isBulkJobStale(existing))) {
    job.total = ids.length;
    job.published = 0;
    job.rejected = 0;
    job.failed = 0;
  } else {
    job.total = job.published + job.rejected + job.failed + ids.length;
  }
  await putQueueBulkJob(env.AGENTS, job);

  // Process the first draft in THIS request so progress is never stuck at
  // "Starting…". Further items: waitUntil + status-poll kicks.
  await runBulkBatch({ maxItems: 1, maxMs: 55_000 });
  const after = (await getQueueBulkJob(env.AGENTS)) ?? job;
  if (after.status === "running" && after.remaining.length > 0) {
    scheduleBulkContinue(request, locals, /* alsoRunLocal */ true);
  }

  return json(
    {
      ok: true,
      started: true,
      bulk: { ...after, summary: bulkJobSummary(after) },
    },
    200
  );
}

/**
 * Process up to maxItems drafts from the running job (re-reads KV each item).
 * Safe to call from waitUntil, bulk-tick, or bulk-status recovery.
 */
async function runBulkBatch(opts: { maxItems: number; maxMs: number }): Promise<void> {
  const deadline = Date.now() + Math.max(5_000, opts.maxMs);
  let n = 0;
  while (n < opts.maxItems && Date.now() < deadline) {
    let job = (await getQueueBulkJob(env.AGENTS)) ?? emptyBulkJob();
    if (job.status !== "running") return;

    const nextId = job.remaining[0];
    if (!nextId) {
      job.status = "done";
      job.current = null;
      job.lastNote = "Finished";
      await putQueueBulkJob(env.AGENTS, job);
      return;
    }

    // Claim next id up front so concurrent ticks don't double-process.
    job.remaining = job.remaining.slice(1);
    job.current = nextId;
    job.lastNote = `Processing ${nextId}…`;
    await putQueueBulkJob(env.AGENTS, job);

    try {
      await processOneBulkDraft(job, nextId);
    } catch (err: any) {
      // Leave it as failed; leftover sweep may retry once if not listed here.
      job = (await getQueueBulkJob(env.AGENTS)) ?? job;
      if (job.status !== "running") return;
      job.failed += 1;
      job.failedIds = [...(job.failedIds ?? []), nextId];
      job.lastError = err?.message ?? String(err);
      job.lastNote = `Failed: ${(err?.message ?? String(err)).slice(0, 120)}`;
      job.current = null;
      await putQueueBulkJob(env.AGENTS, job);
    }
    n += 1;
  }

  // Mark done if emptied during this batch — or pick up drafts the first
  // pass missed (page-sized starts, new arrivals, index rebuild).
  const end = (await getQueueBulkJob(env.AGENTS)) ?? emptyBulkJob();
  if (end.status === "running" && end.remaining.length === 0) {
    const leftover = await leftoverDraftIds(end);
    if (leftover.length > 0 && (end.sweeps ?? 0) < 2) {
      end.sweeps = (end.sweeps ?? 0) + 1;
      end.remaining = leftover;
      end.total += leftover.length;
      end.lastNote = `Queued ${leftover.length} remaining draft(s)…`;
      await putQueueBulkJob(env.AGENTS, end);
    } else if ((end.failedIds?.length ?? 0) > 0 && (end.sweeps ?? 0) < 1) {
      end.sweeps = 1;
      end.remaining = end.failedIds ?? [];
      end.failedIds = [];
      end.lastNote = `Retrying ${end.remaining.length} failed draft(s)…`;
      await putQueueBulkJob(env.AGENTS, end);
    } else {
      end.status = "done";
      end.current = null;
      end.lastNote = leftover.length
        ? `Finished — ${leftover.length} still pending after retries`
        : end.lastNote || "Finished";
      await putQueueBulkJob(env.AGENTS, end);
    }
  }
}

async function leftoverDraftIds(job: QueueBulkJob): Promise<string[]> {
  const skip = new Set(job.failedIds ?? []);
  const live = sortDraftsForBulk(await listDrafts(env.AGENTS));
  const ids = live.map((d) => d.draftId);
  // First pass: drafts this job never claimed (e.g. only the visible page
  // was queued). Later sweeps include prior transient failures for one retry.
  if ((job.sweeps ?? 0) === 0) return ids.filter((id) => !skip.has(id));
  return ids;
}

async function processOneBulkDraft(jobSnap: QueueBulkJob, nextId: string): Promise<void> {
  // Re-load job after each step so concurrent cancel is respected.
  const load = async () => (await getQueueBulkJob(env.AGENTS)) ?? jobSnap;

  const draft = await getDraft(env.AGENTS, nextId);
  let job = await load();
  if (job.status !== "running") return;

  if (!draft) {
    job.rejected += 1;
    job.lastNote = "Skipped missing draft";
    job.current = null;
    await putQueueBulkJob(env.AGENTS, job);
    return;
  }

  const lint = draft.quality?.headlineLint?.length
    ? draft.quality.headlineLint
    : lintHeadline(draft.report.headline);
  if (lint.length > 0) {
    await deleteDraft(env.AGENTS, nextId);
    job = await load();
    if (job.status !== "running") return;
    job.rejected += 1;
    job.lastNote = `Rejected (headline lint): ${draft.report.headline.slice(0, 60)}`;
    job.current = null;
    await putQueueBulkJob(env.AGENTS, job);
    return;
  }

  const result = await approveDraft(nextId, {
    force: false,
    featured: false,
    skipVision: true,
  });
  job = await load();
  if (job.status !== "running") return;

  if (result.ok) {
    job.published += 1;
    job.lastNote = `Published ${result.slug}`;
    job.current = null;
    await putQueueBulkJob(env.AGENTS, job);
    return;
  }

  if (result.duplicate) {
    await deleteDraft(env.AGENTS, nextId);
    job = await load();
    if (job.status !== "running") return;
    job.rejected += 1;
    job.lastNote = `Rejected (duplicate): ${draft.report.headline.slice(0, 60)}`;
    job.current = null;
    await putQueueBulkJob(env.AGENTS, job);
    return;
  }

  // Transient failure — leave draft in queue; leftover sweep retries once.
  job.failed += 1;
  job.failedIds = [...(job.failedIds ?? []), nextId];
  job.lastError = result.error;
  job.lastNote = `Failed: ${result.error.slice(0, 120)}`;
  job.current = null;
  await putQueueBulkJob(env.AGENTS, job);
}

/**
 * Continue the job: run a local batch in waitUntil, then self-fetch another tick
 * if work remains. `alsoRunLocal` processes immediately inside waitUntil so we
 * do not depend solely on HTTP self-calls (which left jobs stuck at "Starting…").
 */
function scheduleBulkContinue(
  request: Request,
  locals: CfLocals,
  alsoRunLocal = false
): void {
  const waitUntil = locals?.cfContext?.waitUntil?.bind(locals.cfContext);

  // Fast path (no vision): several drafts per waitUntil window.
  const localWork = alsoRunLocal
    ? runBulkBatch({ maxItems: 8, maxMs: 50_000 }).then(async () => {
        const job = await getQueueBulkJob(env.AGENTS);
        if (job?.status === "running" && job.remaining.length > 0) {
          await chainBulkTickFetch(request);
        }
      })
    : chainBulkTickFetch(request);

  if (waitUntil) {
    waitUntil(localWork.catch((e) => console.error("bulk continue", e)));
  } else {
    // Dev / missing cfContext: still try (may be cancelled after response).
    void localWork.catch((e) => console.error("bulk continue", e));
  }
}

async function chainBulkTickFetch(request: Request): Promise<void> {
  const origin = new URL(request.url).origin;
  // Prefer same origin; also try workers.dev if custom domain self-fetch fails.
  const urls = [
    `${origin}/api/admin/queue`,
    "https://clad-web.benjaminharriscody.workers.dev/api/admin/queue",
  ];
  // Dedupe if origin already is workers.dev
  const unique = [...new Set(urls)];
  const auth = basicAuthHeader();
  const secret = env.BETTER_AUTH_SECRET || env.AGENT_TOKEN || "";

  for (const url of unique) {
    try {
      const r = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(auth ? { Authorization: auth } : {}),
          ...(secret ? { "X-Clad-Bulk-Secret": secret } : {}),
        },
        body: JSON.stringify({ action: "bulk-tick" }),
      });
      if (r.ok) return;
      const t = await r.text().catch(() => "");
      console.error("bulk-tick chain non-ok", url, r.status, t.slice(0, 180));
    } catch (err) {
      console.error("bulk-tick chain error", url, err);
    }
  }
}

function json(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}
