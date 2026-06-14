// HTTP client for the Worker's /api/agent/* endpoints. Adds the bearer token.

const BASE = process.env.WORKER_BASE_URL || "http://localhost:8787";
const TOKEN = process.env.AGENT_TOKEN || "";

async function call(path, init = {}) {
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

export function reportStatus(status) {
  return call("/api/agent/status", { method: "POST", body: JSON.stringify(status) });
}
