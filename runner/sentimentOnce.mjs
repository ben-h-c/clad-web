/**
 * One-shot cloud entrypoint for the Social Sentiment Scanner, for hosts that
 * can't (or shouldn't) run the full PM2 runner — e.g. the scheduled GitHub
 * Actions workflow (.github/workflows/sentiment-scanner.yml). Unlike the
 * YouTube scanner, sentiment scanning only talks to the xAI API and the
 * Worker's own endpoints, so it has no residential-IP or yt-dlp dependency.
 *
 * Coexists with the Mac runner: both respect the same registry (enabled flag,
 * cron, lastRun), so whichever host checks first runs the due scan and the
 * other sees it as no longer due.
 *
 * Env: WORKER_BASE_URL, AGENT_TOKEN, XAI_API_KEY. Exits 0 with a notice when
 * the secrets aren't configured, so a scheduled run can't fail red before the
 * repository secrets have been set up.
 */
import { getConfig, reportStatus } from "./api.mjs";
import { isDue } from "./cron.mjs";
import { runSentimentScanner } from "./sentimentScanner.mjs";

const KIND = "social-sentiment-scanner";

function log(...args) {
  console.log(new Date().toISOString(), ...args);
}

async function main() {
  if (!process.env.AGENT_TOKEN || !process.env.XAI_API_KEY) {
    log("AGENT_TOKEN / XAI_API_KEY not configured — skipping (set the repository secrets to enable cloud scans)");
    return;
  }

  let cfg;
  try {
    cfg = await getConfig();
  } catch (err) {
    log(`config fetch failed: ${String(err?.cause?.message || err?.message || err).slice(0, 200)}`);
    process.exitCode = 1;
    return;
  }
  if (!cfg.ok) {
    log(`config fetch failed: ${cfg.status} ${JSON.stringify(cfg.body).slice(0, 200)}`);
    process.exitCode = 1;
    return;
  }

  const agent = (cfg.body.agents || []).find((a) => a.kind === KIND);
  if (!agent) {
    log(`no ${KIND} agent in the registry — is the Worker deploy current?`);
    process.exitCode = 1;
    return;
  }
  if (!agent.enabled) {
    log(`${agent.id} is disabled in the console — skipping`);
    return;
  }
  const manual = agent.runNowAt || null;
  if (!manual && !isDue(agent.cron, agent.lastRun?.at, new Date())) {
    log(`${agent.id} not due (cron ${agent.cron}, last run ${agent.lastRun?.at ?? "never"}) — skipping`);
    return;
  }

  const started = Date.now();
  log(`running ${agent.id}${manual ? " [manual]" : ""}`);
  let result;
  try {
    result = await runSentimentScanner(agent);
  } catch (err) {
    result = { ok: false, message: String(err?.message || err).slice(0, 300) };
  }
  const status = {
    agentId: agent.id,
    ok: result.ok,
    message: result.message || "",
    submitted: result.submitted || 0,
    skipped: result.skipped || 0,
    durationMs: Date.now() - started,
    consumedRunNow: manual,
  };
  log(`done ${agent.id}: ${status.ok ? "ok" : "FAIL"} — ${status.message}`);
  const reported = await reportStatus(status);
  if (!reported.ok) log(`status report failed: ${reported.status}`);
  if (!result.ok) process.exitCode = 1;
}

main();
