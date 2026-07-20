/**
 * Agent runner. Ticks every 60s (or once with --once): fetches the agent
 * registry from the Worker, runs each enabled+due agent, and reports status.
 * Runs on the Mac (residential IP) under PM2.
 *
 * Env (runner/.env): WORKER_BASE_URL, AGENT_TOKEN, XAI_API_KEY, YOUTUBE_API_KEY
 * Run with Node 22 (imports a .ts lib via built-in type stripping).
 */
import { getConfig, reportStatus } from "./api.mjs";
import { isDue } from "./cron.mjs";
import { runYoutubeScanner } from "./youtubeScanner.mjs";
import { runFrontpageCurator } from "./frontpageCurator.mjs";
import { runBreakingCurator } from "./breakingCurator.mjs";
import { runComplianceAuditor } from "./complianceAuditor.mjs";
import { runQuipWriter } from "./quipWriter.mjs";
import { runShareTagWriter } from "./shareTagWriter.mjs";
import { runDigestSender } from "./digestSender.mjs";
import { runNewsletterSender } from "./newsletterSender.mjs";
import { runDiscoverCurator } from "./discoverCurator.mjs";
import { runGoodNewsCurator } from "./goodNewsCurator.mjs";
import { runDeadVideoPruner } from "./deadVideoPruner.mjs";
import { runSentimentScanner } from "./sentimentScanner.mjs";
import { runRaceBoardAuditor } from "./raceBoardAuditor.mjs";
import { runPoliticianRosterSync } from "./politicianRosterSync.mjs";
import { runPoliticianProfileBuilder } from "./politicianProfileBuilder.mjs";
import { runPoliticianGrader } from "./politicianGrader.mjs";
import { runCalendarScanner } from "./calendarScanner.mjs";
import { runTodayInHistory } from "./todayInHistory.mjs";
import { runHumanSpotlight } from "./humanSpotlight.mjs";
import { runPushReminders } from "./pushReminders.mjs";
import { processUrlQueue } from "./urlIntake.mjs";
import { updateTicker } from "./ticker.mjs";

const ONCE = process.argv.includes("--once");
/** Force specific agent kinds this tick (comma-separated): --force=calendar-scanner,politician-grader */
const FORCE_KINDS = new Set(
  (process.argv.find((a) => a.startsWith("--force=")) || "")
    .slice("--force=".length)
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean)
);
const TICK_MS = 60_000;
const running = new Set(); // single-flight per agent id

const KINDS = {
  "youtube-scanner": runYoutubeScanner,
  "frontpage-curator": runFrontpageCurator,
  "breaking-news-curator": runBreakingCurator,
  "compliance-auditor": runComplianceAuditor,
  "quip-writer": runQuipWriter,
  "share-tag-writer": runShareTagWriter,
  "digest-sender": runDigestSender,
  "newsletter-sender": runNewsletterSender,
  "discover-curator": runDiscoverCurator,
  "good-news-curator": runGoodNewsCurator,
  "dead-video-pruner": runDeadVideoPruner,
  "social-sentiment-scanner": runSentimentScanner,
  "race-board-auditor": runRaceBoardAuditor,
  "politician-roster-sync": runPoliticianRosterSync,
  "politician-profile-builder": runPoliticianProfileBuilder,
  "politician-grader": runPoliticianGrader,
  "calendar-scanner": runCalendarScanner,
  "today-in-history": runTodayInHistory,
  "human-spotlight": runHumanSpotlight,
  "push-reminders": runPushReminders,
};

function log(...args) {
  console.log(new Date().toISOString(), ...args);
}

// Hard cap so a hung Grok/YouTube call cannot freeze the whole runner loop.
// Youtube scan can draft many reports; 12 min is generous. Curators are short.
const AGENT_TIMEOUT_MS = {
  "youtube-scanner": 12 * 60_000,
  "politician-profile-builder": 12 * 60_000,
  "politician-grader": 15 * 60_000,
  "calendar-scanner": 15 * 60_000,
  default: 6 * 60_000,
};

function withTimeout(promise, ms, label) {
  let timer;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(
      () => reject(new Error(`timeout after ${Math.round(ms / 1000)}s`)),
      ms
    );
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

async function runAgent(agent, consumedRunNow = null) {
  if (running.has(agent.id)) {
    log(`skip ${agent.id}: still running`);
    return;
  }
  running.add(agent.id);
  const started = Date.now();
  log(`running ${agent.id} (${agent.kind})${consumedRunNow ? " [manual]" : ""}`);
  let result;
  try {
    const fn = KINDS[agent.kind];
    if (!fn) {
      result = { ok: false, message: `unknown kind: ${agent.kind}` };
    } else {
      const ms = AGENT_TIMEOUT_MS[agent.kind] ?? AGENT_TIMEOUT_MS.default;
      result = await withTimeout(fn(agent), ms, agent.id);
    }
  } catch (err) {
    result = { ok: false, message: String(err?.message || err).slice(0, 300) };
  } finally {
    running.delete(agent.id);
  }
  const status = {
    agentId: agent.id,
    ok: result.ok,
    message: result.message || "",
    submitted: result.submitted || 0,
    skipped: result.skipped || 0,
    durationMs: Date.now() - started,
    // Always consume runNow even on timeout so a stuck manual run doesn't loop forever.
    consumedRunNow,
  };
  log(`done ${agent.id}: ${status.ok ? "ok" : "FAIL"} — ${status.message}`);
  await reportStatus(status);
}

async function tick() {
  // Process any editor-supplied URLs first (quota-free intake), independent of
  // the agent registry.
  try {
    await processUrlQueue(log);
  } catch (err) {
    log(`url-intake error: ${String(err?.message || err).slice(0, 120)}`);
  }

  // Refresh the markets ticker (throttled internally to ~2 min).
  try {
    await updateTicker(log);
  } catch (err) {
    log(`ticker error: ${String(err?.message || err).slice(0, 120)}`);
  }

  const cfg = await getConfig();
  if (!cfg.ok) {
    log(`config fetch failed: ${cfg.status} ${JSON.stringify(cfg.body).slice(0, 120)}`);
    return;
  }
  const agents = cfg.body.agents || [];
  const now = new Date();
  for (const agent of agents) {
    if (!agent.enabled) continue;
    const forced = FORCE_KINDS.has(agent.kind) || FORCE_KINDS.has(agent.id);
    const manual = agent.runNowAt || null;
    if (!forced && !manual && !isDue(agent.cron, agent.lastRun?.at, now)) continue;
    await runAgent(agent, manual || (forced ? "force-cli" : null));
  }
}

async function main() {
  log(
    `runner start (once=${ONCE}, force=[${[...FORCE_KINDS].join(",") || "—"}], base=${process.env.WORKER_BASE_URL || "http://localhost:8787"})`
  );
  if (ONCE || FORCE_KINDS.size) {
    await tick();
    log("once complete");
    return;
  }
  // continuous loop
  // eslint-disable-next-line no-constant-condition
  while (true) {
    try {
      await tick();
    } catch (err) {
      log(`tick error: ${String(err?.message || err)}`);
    }
    await new Promise((r) => setTimeout(r, TICK_MS));
  }
}

main();
