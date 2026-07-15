import type { APIRoute } from "astro";
import { clearRaceResult, listResults, upsertRaceResult } from "~/lib/picks";
import { DEFAULT_ELECTION_ID, getElection } from "~/lib/elections";
import { jsonResponse } from "~/lib/user-data";

export const prerender = false;

/** Admin (basic-auth via middleware): list / set / clear race results. */
export const GET: APIRoute = async ({ url }) => {
  const electionId = url.searchParams.get("election") || DEFAULT_ELECTION_ID;
  if (!getElection(electionId)) return jsonResponse({ error: "unknown election" }, 404);
  const results = await listResults(electionId);
  return jsonResponse({ electionId, results });
};

export const POST: APIRoute = async ({ request }) => {
  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
  const action = String(body.action ?? "upsert");
  const electionId = String(body.electionId ?? DEFAULT_ELECTION_ID);
  const raceId = String(body.raceId ?? "").trim();
  if (!getElection(electionId)) return jsonResponse({ error: "unknown election" }, 404);
  if (!raceId) return jsonResponse({ error: "raceId required" }, 400);

  if (action === "clear") {
    try {
      await clearRaceResult(electionId, raceId);
      return jsonResponse({ ok: true });
    } catch (e) {
      return jsonResponse({ error: e instanceof Error ? e.message : "clear failed" }, 500);
    }
  }

  const winnerSide = String(body.winnerSide ?? "");
  if (winnerSide !== "a" && winnerSide !== "b" && winnerSide !== "other") {
    return jsonResponse({ error: "winnerSide must be a|b|other" }, 400);
  }
  try {
    await upsertRaceResult({
      electionId,
      raceId,
      winnerSide,
      winnerSlug: body.winnerSlug != null ? String(body.winnerSlug) : null,
      winnerName: body.winnerName != null ? String(body.winnerName) : null,
      source: body.source != null ? String(body.source) : "editorial",
      calledAt: body.calledAt != null ? String(body.calledAt) : null,
    });
    return jsonResponse({ ok: true });
  } catch (e) {
    return jsonResponse({ error: e instanceof Error ? e.message : "save failed" }, 400);
  }
};
