/**
 * Unit checks for news-consensus race calls.
 * Run: node --experimental-strip-types scripts/checkRaceCalls.mjs
 */
import assert from "node:assert/strict";
import {
  consensusMeetsBar,
  decideCallAction,
  matchWinnerSide,
  normalizeOutletId,
  nyDateKey,
  raceIsCallEligible,
} from "../src/lib/elections/raceCalls.ts";

const general = {
  id: "ga-senate",
  office: "Georgia U.S. Senate",
  chamber: "senate",
  senateClass: 2,
  region: "South",
  tier: "marquee",
  status: "general-projected",
  state: "GA",
  voteKind: "general",
  nextVoteDate: "2026-11-03",
  generalDate: "2026-11-03",
  a: { slug: "jon-ossoff", name: "Jon Ossoff", party: "D", incumbent: true },
  b: { slug: "mike-collins", name: "Mike Collins", party: "R" },
};

const primary = {
  ...general,
  id: "nh-senate",
  voteKind: "primary",
  nextVoteDate: "2026-09-08",
};

assert.equal(normalizeOutletId("Associated Press"), "ap");
assert.equal(normalizeOutletId("AP"), "ap");
assert.equal(normalizeOutletId("Decision Desk HQ"), "ddhq");
assert.equal(normalizeOutletId("local blog"), null);

assert.equal(consensusMeetsBar({ raceId: "x", called: true, confidence: "ap" }), true);
assert.equal(
  consensusMeetsBar({ raceId: "x", called: true, confidence: "single", outlets: ["Reuters"] }),
  false
);
assert.equal(
  consensusMeetsBar({
    raceId: "x",
    called: true,
    confidence: "multi",
    outlets: ["Reuters", "The New York Times"],
  }),
  true
);
assert.equal(
  consensusMeetsBar({ raceId: "x", called: true, confidence: "none", outlets: ["AP", "NBC"] }),
  true
);

const electionNight = new Date("2026-11-03T23:00:00-05:00");
const dayBefore = new Date("2026-11-02T20:00:00-05:00");
assert.equal(raceIsCallEligible(general, electionNight), true);
assert.equal(raceIsCallEligible(general, dayBefore), false);
assert.equal(raceIsCallEligible(primary, electionNight), false);
assert.equal(nyDateKey(electionNight), "2026-11-03");

assert.equal(
  matchWinnerSide(general, { raceId: general.id, called: true, winnerName: "Mike Collins", winnerParty: "R" }),
  "b"
);
// Model swapped sides; name still maps to Collins = b.
assert.equal(
  matchWinnerSide(general, {
    raceId: general.id,
    called: true,
    winnerName: "Mike Collins",
    winnerSide: "a",
  }),
  "b"
);
assert.equal(
  matchWinnerSide(general, { raceId: general.id, called: true, winnerName: "Someone Else", winnerParty: "I" }),
  "other"
);

{
  const call = {
    raceId: general.id,
    called: true,
    winnerName: "Jon Ossoff",
    winnerParty: "D",
    confidence: "ap",
    outlets: ["AP"],
  };
  const apply = decideCallAction(general, call, undefined, electionNight);
  assert.equal(apply.action, "apply");
  assert.equal(apply.winnerSide, "a");
  assert.ok(String(apply.source).startsWith("consensus:"));

  const desk = decideCallAction(
    general,
    call,
    {
      electionId: "midterms-2026",
      raceId: general.id,
      winnerSide: "b",
      winnerSlug: "mike-collins",
      winnerName: "Mike Collins",
      calledAt: "2026-11-03T00:00:00.000Z",
      source: "editorial",
      updatedAt: "2026-11-03T00:00:00.000Z",
    },
    electionNight
  );
  assert.equal(desk.action, "skip");
  assert.equal(desk.reason, "desk-lock");

  const tooSoon = decideCallAction(general, call, undefined, dayBefore);
  assert.equal(tooSoon.action, "skip");
  assert.equal(tooSoon.reason, "not-eligible");

  const prim = decideCallAction(
    primary,
    { ...call, raceId: primary.id },
    undefined,
    new Date("2026-09-09T12:00:00-04:00")
  );
  assert.equal(prim.action, "skip");
  assert.equal(prim.reason, "not-eligible");
}

console.log("checkRaceCalls: ok");
