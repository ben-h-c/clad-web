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

const ONCE = process.argv.includes("--once");
const TICK_MS = 60_000;
const running = new Set(); // single-flight per agent id

const KINDS = {
  "youtube-scanner": runYoutubeScanner,
  "frontpage-curator": runFrontpageCurator,
};

function log(...args) {
  console.log(new Date().toISOString(), ...args);
}

async function runAgent(agent) {
  if (running.has(agent.id)) {
    log(`skip ${agent.id}: still running`);
    return;
  }
  running.add(agent.id);
  const started = Date.now();
  log(`running ${agent.id} (${agent.kind})`);
  let result;
  try {
    const fn = KINDS[agent.kind];
    result = fn
      ? await fn(agent)
      : { ok: false, message: `unknown kind: ${agent.kind}` };
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
  };
  log(`done ${agent.id}: ${status.ok ? "ok" : "FAIL"} — ${status.message}`);
  await reportStatus(status);
}

async function tick() {
  const cfg = await getConfig();
  if (!cfg.ok) {
    log(`config fetch failed: ${cfg.status} ${JSON.stringify(cfg.body).slice(0, 120)}`);
    return;
  }
  const agents = cfg.body.agents || [];
  const now = new Date();
  for (const agent of agents) {
    if (!agent.enabled) continue;
    if (!isDue(agent.cron, agent.lastRun?.at, now)) continue;
    await runAgent(agent);
  }
}

async function main() {
  log(`runner start (once=${ONCE}, base=${process.env.WORKER_BASE_URL || "http://localhost:8787"})`);
  if (ONCE) {
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
