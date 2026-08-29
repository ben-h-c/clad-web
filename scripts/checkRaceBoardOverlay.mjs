/**
 * Unit checks for live race-board candidate overlay (party-stable sides).
 * Run: node --experimental-strip-types scripts/checkRaceBoardOverlay.mjs
 */
import assert from "node:assert/strict";
import {
  applyPublishedCandidates,
  liveBoardVerifiedAsOf,
  namesAlign,
  normalizeRaceCandidates,
  pairOverlayByParty,
} from "../src/lib/elections/liveOverlay.ts";

const mi = {
  id: "mi-senate",
  office: "Michigan U.S. Senate",
  chamber: "senate",
  senateClass: 2,
  region: "Midwest",
  tier: "marquee",
  status: "open-seat",
  state: "MI",
  verifiedAsOf: "2026-07-14",
  a: { slug: "haley-stevens", name: "Dem primary (Stevens / El-Sayed)", party: "D", field: true },
  b: { slug: "mike-rogers-mi", name: "Mike Rogers", party: "R", field: true },
};

function overlay(partial) {
  return {
    raceId: "mi-senate",
    office: "Michigan U.S. Senate",
    status: "general-projected",
    a: { name: "Abdul El-Sayed", party: "D", slug: "abdul-el-sayed", field: false },
    b: { name: "Mike Rogers", party: "R", slug: "mike-rogers", field: false },
    note: "El-Sayed won the Aug 4 primary.",
    ...partial,
  };
}

// Party-stable: overlay listed R first, D stays on side a.
{
  const swapped = overlay({
    a: { name: "Mike Rogers", party: "R", slug: "mike-rogers" },
    b: { name: "Abdul El-Sayed", party: "D", slug: "abdul-el-sayed" },
  });
  const paired = pairOverlayByParty(mi, swapped.a, swapped.b);
  assert.equal(paired.a.party, "D");
  assert.equal(paired.b.party, "R");
  const [out] = applyPublishedCandidates([mi], [swapped], "2026-08-29T12:00:00.000Z");
  assert.equal(out.a.name, "Abdul El-Sayed");
  assert.equal(out.a.party, "D");
  assert.equal(out.b.name, "Mike Rogers");
  assert.equal(out.b.slug, "mike-rogers-mi", "keep disambiguated slug");
  assert.equal(out.a.slug, "abdul-el-sayed");
  assert.equal(out.a.field, undefined);
  assert.equal(out.status, "general-projected");
  assert.equal(out.verifiedAsOf, "2026-08-29");
}

// Same person keeps existing slug even if overlay slug is generic.
assert.equal(namesAlign("Mike Rogers", "Mike Rogers"), true);
assert.equal(namesAlign("Dem primary (Stevens / El-Sayed)", "Abdul El-Sayed"), false);

// Unknown race id is ignored; other races overlay.
{
  const other = { ...mi, id: "nh-senate", a: { ...mi.a }, b: { ...mi.b } };
  const [kept, updated] = applyPublishedCandidates([other, mi], [overlay()]);
  assert.equal(kept.id, "nh-senate");
  assert.equal(kept.a.name, mi.a.name);
  assert.equal(updated.a.name, "Abdul El-Sayed");
}

// Same-party overlay refused.
{
  const bad = overlay({
    a: { name: "Abdul El-Sayed", party: "D" },
    b: { name: "Haley Stevens", party: "D" },
  });
  const [out] = applyPublishedCandidates([mi], [bad]);
  assert.equal(out.a.name, mi.a.name);
}

// Withdrawn live side refused.
{
  const bad = overlay({
    a: { name: "Graham Platner", party: "D", withdrawn: true },
  });
  assert.equal(normalizeRaceCandidates([bad]).length, 0);
}

// Normalize drops junk.
{
  const n = normalizeRaceCandidates([
    overlay(),
    { raceId: "x", a: { name: "<script>", party: "D" }, b: { name: "Ok", party: "R" } },
    { not: "a race" },
  ]);
  assert.equal(n.length, 1);
  assert.equal(n[0].raceId, "mi-senate");
}

assert.equal(liveBoardVerifiedAsOf([mi], "2026-01-01"), "2026-07-14");
assert.equal(
  liveBoardVerifiedAsOf([{ ...mi, verifiedAsOf: "2026-08-29" }], "2026-07-14"),
  "2026-08-29"
);

console.log("checkRaceBoardOverlay: ok");
