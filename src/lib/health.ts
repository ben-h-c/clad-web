/**
 * Health report for the console: config/binding presence, agent run health,
 * queue + content state. "What's broken at a glance."
 */
import { getCollection } from "astro:content";
import { getRegistry, listDrafts } from "~/lib/agents";

export interface HealthRow {
  label: string;
  status: "ok" | "warn" | "bad";
  detail: string;
}

export async function healthReport(env: any): Promise<HealthRow[]> {
  const rows: HealthRow[] = [];

  // Secrets / bindings present
  const secret = (name: string, required = true): HealthRow => ({
    label: name,
    status: env?.[name] ? "ok" : required ? "bad" : "warn",
    detail: env?.[name] ? "configured" : required ? "MISSING" : "not set (optional)",
  });
  rows.push(secret("XAI_API_KEY"));
  rows.push(secret("GITHUB_TOKEN"));
  rows.push(secret("GITHUB_REPO"));
  rows.push(secret("GITHUB_BRANCH"));
  rows.push(secret("ADMIN_USER"));
  rows.push(secret("ADMIN_PASSWORD"));
  rows.push(secret("AGENT_TOKEN"));
  rows.push({
    label: "AGENTS KV",
    status: env?.AGENTS ? "ok" : "bad",
    detail: env?.AGENTS ? "bound" : "MISSING",
  });
  rows.push(secret("CF_ANALYTICS_TOKEN", false));

  // Agents
  try {
    const reg = await getRegistry(env.AGENTS);
    for (const a of reg.agents) {
      if (!a.enabled) {
        rows.push({ label: `Agent: ${a.name}`, status: "warn", detail: "disabled" });
      } else if (!a.lastRun) {
        rows.push({ label: `Agent: ${a.name}`, status: "warn", detail: "enabled, never run yet" });
      } else if (!a.lastRun.ok) {
        rows.push({ label: `Agent: ${a.name}`, status: "bad", detail: `last run FAILED — ${a.lastRun.message}` });
      } else {
        const ageH = Math.round((Date.now() - new Date(a.lastRun.at).getTime()) / 3_600_000);
        rows.push({ label: `Agent: ${a.name}`, status: "ok", detail: `last run OK ${ageH}h ago — ${a.lastRun.message}` });
      }
    }
  } catch (err: any) {
    rows.push({ label: "Agents", status: "bad", detail: `registry read failed: ${err?.message ?? err}` });
  }

  // Queue + content
  try {
    const pending = (await listDrafts(env.AGENTS)).length;
    rows.push({
      label: "Pending queue",
      status: pending > 20 ? "warn" : "ok",
      detail: `${pending} awaiting review${pending > 20 ? " (piling up)" : ""}`,
    });
  } catch {
    rows.push({ label: "Pending queue", status: "bad", detail: "could not read queue" });
  }

  try {
    const posts = await getCollection("posts");
    const published = posts.filter((p) => !p.data.draft);
    const last = published
      .map((p) => p.data.publishedAt.getTime())
      .sort((a, b) => b - a)[0];
    const ageD = last ? Math.round((Date.now() - last) / 86_400_000) : null;
    rows.push({
      label: "Content",
      status: "ok",
      detail: `${published.length} published${ageD !== null ? `, last ${ageD}d ago` : ""}`,
    });
  } catch {
    rows.push({ label: "Content", status: "bad", detail: "could not read content" });
  }

  return rows;
}
