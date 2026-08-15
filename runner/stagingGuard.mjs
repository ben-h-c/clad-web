/** True when this runner is aimed at the staging Worker, not production. */
export function runnerTargetsStaging(baseUrl = process.env.WORKER_BASE_URL) {
  const u = String(baseUrl || "").toLowerCase();
  return u.includes("clad-web-staging") || /(?:^|\/\/)staging\.cladfacts\.com/.test(u);
}
