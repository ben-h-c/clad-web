import type { APIRoute } from "astro";
import { getPublicSharedBallot, listResults } from "~/lib/picks";
import { getElection } from "~/lib/elections";
import { jsonResponse } from "~/lib/user-data";

export const prerender = false;

/**
 * Public ballot summary — locked ballots only; display name + picks, no PII keys.
 */
export const GET: APIRoute = async ({ params }) => {
  const shareSlug = String(params.shareSlug ?? "").trim();
  if (!shareSlug || shareSlug.length > 32) return jsonResponse({ error: "not found" }, 404);

  const ballot = await getPublicSharedBallot(shareSlug);
  if (!ballot) return jsonResponse({ error: "not found" }, 404);

  const election = getElection(ballot.electionId);
  if (!election) return jsonResponse({ error: "not found" }, 404);

  const results = await listResults(ballot.electionId);
  const resultByRace = new Map(results.map((r) => [r.raceId, r]));
  const pickByRace = new Map(ballot.picks.map((p) => [p.raceId, p]));

  const races = election.races.map((race) => {
    const pick = pickByRace.get(race.id);
    const result = resultByRace.get(race.id);
    const pickedSide = pick?.side ?? null;
    const pickedName =
      pickedSide === "a" ? race.a.name : pickedSide === "b" ? race.b.name : null;
    let outcome: "correct" | "wrong" | "pending" | "open" = "pending";
    if (result?.winnerSide === "a" || result?.winnerSide === "b") {
      if (!pickedSide) outcome = "open";
      else outcome = pickedSide === result.winnerSide ? "correct" : "wrong";
    }
    return {
      raceId: race.id,
      office: race.office,
      state: race.state,
      chamber: race.chamber,
      a: { name: race.a.name, party: race.a.party ?? null },
      b: { name: race.b.name, party: race.b.party ?? null },
      pickSide: pickedSide,
      pickName: pickedName,
      winnerName: result?.winnerName ?? null,
      outcome,
    };
  });

  return jsonResponse({
    shareSlug: ballot.shareSlug,
    displayName: ballot.displayName || "A Clad reader",
    electionId: ballot.electionId,
    title: election.title,
    score: ballot.score,
    lockedAt: ballot.lockedAt,
    updatedAt: ballot.updatedAt,
    races,
  });
};
