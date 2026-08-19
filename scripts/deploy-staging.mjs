#!/usr/bin/env node
/**
 * Build + deploy the isolated staging Worker.
 * Astro's generated wrangler.json drops `env.staging`, so we patch
 * dist/server/wrangler.json then deploy that file. Never binds cladfacts.com.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import path from "node:path";

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
const GEN = path.join(ROOT, "dist/server/wrangler.json");

const STAGING = {
  name: "clad-web-staging",
  vars: {
    ENVIRONMENT: "staging",
    BETTER_AUTH_URL: "https://clad-web-staging.benjaminharriscody.workers.dev",
    XAI_ECONOMY: "economy",
  },
  routes: [{ pattern: "staging.cladfacts.com", custom_domain: true }],
  kvId: "bd68a4ace38f43a79506cdb318cdde89",
  prodKvId: "231fcd9cfeaa4ed99367550cd2c10877",
  d1Name: "clad-users-staging",
  d1Id: "c693f21f-cc09-4022-9bf4-6fa8232ffa9a",
};

function run(cmd, args, opts = {}) {
  const r = spawnSync(cmd, args, { stdio: "inherit", cwd: ROOT, ...opts });
  if (r.status !== 0) process.exit(r.status ?? 1);
}

console.log("→ astro build");
run("npx", ["astro", "build"]);

const cfg = JSON.parse(readFileSync(GEN, "utf8"));
if (cfg.name === "clad-web" && !process.env.FORCE_STAGING_PATCH) {
  /* expected */
}
cfg.name = STAGING.name;
cfg.vars = { ...(cfg.vars || {}), ...STAGING.vars };
cfg.routes = STAGING.routes;
if (Array.isArray(cfg.kv_namespaces)) {
  cfg.kv_namespaces = cfg.kv_namespaces.map((k) =>
    k.binding === "AGENTS" ? { ...k, id: STAGING.kvId } : k
  );
  if (!cfg.kv_namespaces.some((k) => k.binding === "AGENTS_PROD")) {
    cfg.kv_namespaces.push({ binding: "AGENTS_PROD", id: STAGING.prodKvId });
  }
}
if (cfg.kv_namespaces?.some((k) => k.binding === "AGENTS" && k.id === STAGING.prodKvId)) {
  console.error("Refusing deploy: staging AGENTS still points at production KV");
  process.exit(2);
}
if (Array.isArray(cfg.d1_databases)) {
  cfg.d1_databases = cfg.d1_databases.map((d) =>
    d.binding === "DB"
      ? { ...d, database_name: STAGING.d1Name, database_id: STAGING.d1Id }
      : d
  );
}
if (Array.isArray(cfg.ratelimits)) {
  cfg.ratelimits = cfg.ratelimits.map((r) => {
    if (r.name === "FACTCHECK_LIMITER") return { ...r, namespace_id: "2001" };
    if (r.name === "CAMPAIGN_LIMITER") return { ...r, namespace_id: "2002" };
    return r;
  });
}
writeFileSync(GEN, JSON.stringify(cfg, null, 2));
console.log("→ patched", GEN, "as", cfg.name, cfg.routes);

if (cfg.name !== "clad-web-staging") {
  console.error("Refusing deploy: patched name is", cfg.name, "(expected clad-web-staging)");
  process.exit(2);
}
if ((cfg.routes || []).some((r) => /^(www\.)?cladfacts\.com$/.test(r.pattern || ""))) {
  console.error("Refusing deploy: staging config still lists production hosts");
  process.exit(2);
}

console.log("→ wrangler deploy (staging worker only)");
run("npx", ["wrangler", "deploy"]);

console.log("Staging deploy complete.");
console.log("Review: https://clad-web-staging.benjaminharriscody.workers.dev");
console.log("Custom: https://staging.cladfacts.com (when DNS resolves)");
