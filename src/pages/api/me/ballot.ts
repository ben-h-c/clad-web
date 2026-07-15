import type { APIRoute } from "astro";
import {
  ensureBallot,
  getBallotForUser,
  lockBallot,
  upsertPick,
} from "~/lib/picks";
import { DEFAULT_ELECTION_ID, getElection } from "~/lib/elections";
import { getSessionUser, jsonResponse } from "~/lib/user-data";

export const prerender = false;

export const GET: APIRoute = async ({ request, url }) => {
  const user = await getSessionUser(request.headers);
  if (!user) return jsonResponse({ error: "auth" }, 401);
  const electionId = url.searchParams.get("election") || DEFAULT_ELECTION_ID;
  if (!getElection(electionId)) return jsonResponse({ error: "unknown election" }, 404);
  const ballot = await getBallotForUser(user.id, electionId);
  return jsonResponse({
    electionId,
    ballot,
    picksOpen: getElection(electionId) ? Date.now() < new Date(getElection(electionId)!.picksCloseAt).getTime() : false,
  });
};

export const PUT: APIRoute = async ({ request }) => {
  const user = await getSessionUser(request.headers);
  if (!user) return jsonResponse({ error: "auth" }, 401);
  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
  const electionId = String(body.electionId ?? DEFAULT_ELECTION_ID);
  if (!getElection(electionId)) return jsonResponse({ error: "unknown election" }, 404);

  // Ensure empty ballot (share slug) without a pick
  if (body.ensure === true) {
    const ballot = await ensureBallot(user.id, electionId, user.name);
    return jsonResponse({ ok: true, ballot });
  }

  if (body.lock === true) {
    try {
      const ballot = await lockBallot(user.id, electionId);
      return jsonResponse({ ok: true, ballot });
    } catch (e) {
      return jsonResponse({ error: e instanceof Error ? e.message : "lock failed" }, 400);
    }
  }

  const raceId = String(body.raceId ?? "").trim();
  const side = String(body.side ?? "").trim();
  if (!raceId || (side !== "a" && side !== "b")) {
    return jsonResponse({ error: "raceId and side (a|b) required" }, 400);
  }
  try {
    const ballot = await upsertPick(user.id, electionId, raceId, side, user.name);
    return jsonResponse({ ok: true, ballot });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "save failed";
    const status =
      msg === "picks closed" || msg === "ballot locked" || msg === "race already called"
        ? 403
        : msg === "invalid race" || msg === "invalid side"
          ? 400
          : 500;
    return jsonResponse({ error: msg }, status);
  }
};
