#!/usr/bin/env node
/**
 * Copy AGENTS KV from production → staging so preview has real home data.
 * Does not write to prod. Prefix filter: home:, quips, calendar, etc.
 *
 *   node scripts/sync-staging-kv.mjs
 */
import { spawnSync } from "node:child_process";
import { writeFileSync, unlinkSync } from "node:fs";

const PROD = "231fcd9cfeaa4ed99367550cd2c10877";
const STAGING = "bd68a4ace38f43a79506cdb318cdde89";
// Keep in sync with src/lib/syncStagingFromProd.ts
const PREFIXES = [
  "agents:registry",
  "home:",
  "frontpage:",
  "breaking:",
  "discover:",
  "goodnews:",
  "good-news:",
  "layout:",
  "calendar:",
  "quips",
  "ticker:",
  "agents:classifications",
  "social:sentiments",
  "races:",
  "elections:",
  "politicians:",
  "compliance:",
  "sharetags:",
];

function wrangler(args) {
  const r = spawnSync("npx", ["wrangler", ...args, "--remote"], {
    encoding: "utf8",
    maxBuffer: 20 * 1024 * 1024,
  });
  if (r.status !== 0) {
    throw new Error(r.stderr || r.stdout || `wrangler ${args.join(" ")}`);
  }
  return r.stdout;
}

function listKeys(ns, prefix) {
  const out = wrangler(["kv", "key", "list", "--namespace-id", ns, "--prefix", prefix]);
  try {
    const arr = JSON.parse(out);
    return Array.isArray(arr) ? arr.map((k) => k.name).filter(Boolean) : [];
  } catch {
    return [];
  }
}

function getKey(ns, name) {
  return wrangler(["kv", "key", "get", name, "--namespace-id", ns]);
}

function putKey(ns, name, value) {
  const tmp = `/tmp/clad-kv-${Buffer.from(name).toString("hex").slice(0, 40)}.json`;
  writeFileSync(tmp, value);
  const r = spawnSync(
    "npx",
    ["wrangler", "kv", "key", "put", name, "--namespace-id", ns, "--remote", "--path", tmp],
    { encoding: "utf8", maxBuffer: 20 * 1024 * 1024 }
  );
  try {
    unlinkSync(tmp);
  } catch {
    /* ignore */
  }
  if (r.status !== 0) {
    throw new Error(r.stderr || r.stdout || `put ${name}`);
  }
}

const names = new Set();
for (const p of PREFIXES) {
  for (const n of listKeys(PROD, p)) names.add(n);
}
console.log(`Copying ${names.size} keys prod → staging…`);
let i = 0;
for (const name of names) {
  i += 1;
  try {
    const val = getKey(PROD, name);
    putKey(STAGING, name, val);
    if (i % 10 === 0) console.log(`  ${i}/${names.size}`);
  } catch (e) {
    console.warn("skip", name, e.message || e);
  }
}
console.log("done", i);
