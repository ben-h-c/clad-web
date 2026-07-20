// HTTP client for the Worker's /api/agent/* endpoints. Adds the bearer token.

const BASE = process.env.WORKER_BASE_URL || "http://localhost:8787";
const TOKEN = process.env.AGENT_TOKEN || "";

export async function call(path, init = {}) {
  const res = await fetch(BASE + path, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${TOKEN}`,
      ...(init.headers || {}),
    },
  });
  const text = await res.text();
  let body;
  try {
    body = text ? JSON.parse(text) : {};
  } catch {
    body = { raw: text };
  }
  return { status: res.status, ok: res.ok, body };
}

export function getConfig() {
  return call("/api/agent/config", { method: "GET" });
}

export function getKnown(agentId, candidates) {
  return call("/api/agent/seen", {
    method: "POST",
    body: JSON.stringify({ agentId, candidates }),
  });
}

export function submitDraft(draft) {
  return call("/api/agent/draft", { method: "POST", body: JSON.stringify(draft) });
}

export function getPosts() {
  return call("/api/agent/posts", { method: "GET" });
}

export function setFrontpage(ids) {
  return call("/api/agent/frontpage", { method: "POST", body: JSON.stringify({ ids }) });
}

export function setDiscover(sections) {
  return call("/api/agent/discover", { method: "POST", body: JSON.stringify({ sections }) });
}

export function setGoodNews(sections) {
  return call("/api/agent/goodnews", { method: "POST", body: JSON.stringify({ sections }) });
}

export function prune(ids, dryRun) {
  return call("/api/agent/prune", { method: "POST", body: JSON.stringify({ ids, dryRun }) });
}

export function getBreaking() {
  return call("/api/agent/breaking", { method: "GET" });
}

export function setBreaking(items) {
  return call("/api/agent/breaking", { method: "POST", body: JSON.stringify({ items }) });
}

export function getAuditContent() {
  return call("/api/agent/compliance", { method: "GET" });
}

export function putComplianceReport(report) {
  return call("/api/agent/compliance", { method: "POST", body: JSON.stringify(report) });
}

export function getRaceBoard() {
  return call("/api/agent/races", { method: "GET" });
}

export function putRaceAuditReport(report) {
  return call("/api/agent/races", { method: "POST", body: JSON.stringify(report) });
}

export function getCalendarEvents() {
  return call("/api/agent/calendar", { method: "GET" });
}

export function putCalendarEvents(payload) {
  return call("/api/agent/calendar", { method: "POST", body: JSON.stringify(payload) });
}

export function getTodayInHistory() {
  return call("/api/agent/today-in-history", { method: "GET" });
}

export function putTodayInHistory(payload) {
  return call("/api/agent/today-in-history", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export function getPoliticianRoster() {
  return call("/api/agent/politicians-roster", { method: "GET" });
}

export function putPoliticianRoster(roster) {
  return call("/api/agent/politicians-roster", {
    method: "POST",
    body: JSON.stringify(roster),
  });
}

export function getPoliticianProfile() {
  return call("/api/agent/politicians-profile", { method: "GET" });
}

export function putPoliticianProfile(payload) {
  return call("/api/agent/politicians-profile", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export function getPoliticianGradeQueue() {
  return call("/api/agent/politicians-grade", { method: "GET" });
}

export function putPoliticianGrades(payload) {
  return call("/api/agent/politicians-grade", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export function getCategories() {
  return call("/api/agent/categories", { method: "GET" });
}

export function getUrlQueue() {
  return call("/api/agent/urlqueue", { method: "GET" });
}

export function removeUrls(urls) {
  return call("/api/agent/urlqueue", { method: "POST", body: JSON.stringify({ remove: urls }) });
}

export function reportStatus(status) {
  return call("/api/agent/status", { method: "POST", body: JSON.stringify(status) });
}

export function setTicker(quotes) {
  return call("/api/agent/ticker", { method: "POST", body: JSON.stringify({ quotes }) });
}

export function getQuips() {
  return call("/api/agent/quips", { method: "GET" });
}

export function setQuips(quips) {
  return call("/api/agent/quips", { method: "POST", body: JSON.stringify({ quips }) });
}

export function getShareTags() {
  return call("/api/agent/sharetags", { method: "GET" });
}

export function setShareTags(tags) {
  return call("/api/agent/sharetags", { method: "POST", body: JSON.stringify({ tags }) });
}

export function getClassifications() {
  return call("/api/agent/classify", { method: "GET" });
}

export function runDigest() {
  return call("/api/agent/digest", { method: "POST", body: "{}" });
}

export function runNewsletter() {
  return call("/api/agent/newsletter", { method: "POST", body: "{}" });
}

export function putClassifications(updates, keepIds) {
  return call("/api/agent/classify", {
    method: "POST",
    body: JSON.stringify({ updates, keepIds }),
  });
}

export function getSentiments() {
  return call("/api/agent/sentiment", { method: "GET" });
}

export function putSentiments(updates, keepIds) {
  return call("/api/agent/sentiment", {
    method: "POST",
    body: JSON.stringify({ updates, keepIds }),
  });
}
