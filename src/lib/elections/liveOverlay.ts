/**
 * Live race-board overlays from the daily auditor (AGENTS KV).
 *
 * Dates and candidates publish without a code deploy. Race ids / a-b sides stay
 * stable so locked ballot picks keep their meaning (match overlay sides by party).
 */
import { slugify } from "../slug.ts";
import {
  type RaceDef,
  type RaceSide,
  type RaceStatus,
} from "../races.ts";
import type { RaceCandidateSnapshot, RaceSidePatch } from "../agents.ts";

const STATUSES: RaceStatus[] = [
  "incumbent-vs-field",
  "open-seat",
  "general-projected",
  "special",
];

const PARTIES = ["D", "R", "I", "O"] as const;
type Party = (typeof PARTIES)[number];

function isParty(v: unknown): v is Party {
  return v === "D" || v === "R" || v === "I" || v === "O";
}

function isStatus(v: unknown): v is RaceStatus {
  return typeof v === "string" && (STATUSES as string[]).includes(v);
}

function personKey(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function lastToken(key: string): string {
  const bits = key.split(" ").filter(Boolean);
  return bits[bits.length - 1] || "";
}

const NON_PERSON_LAST = new Set([
  "field",
  "tbd",
  "nominee",
  "primary",
  "seat",
  "open",
  "gov",
  "senate",
]);

/** Same person, or same last name + first initial (Mike Rogers ≈ Rogers). */
export function namesAlign(a: string, b: string): boolean {
  const na = personKey(a);
  const nb = personKey(b);
  if (!na || !nb) return false;
  if (na === nb) return true;
  const lastA = lastToken(na);
  const lastB = lastToken(nb);
  if (!lastA || lastA !== lastB || lastA.length < 4 || NON_PERSON_LAST.has(lastA)) {
    return false;
  }
  const firstA = na.split(" ")[0] || "";
  const firstB = nb.split(" ")[0] || "";
  return !!firstA && !!firstB && firstA[0] === firstB[0];
}

export function isValidCandidateName(raw: string): boolean {
  const name = raw.trim();
  if (name.length < 2 || name.length > 80) return false;
  if (/[{}\[\]<>]/.test(name)) return false;
  if (/undefined|null|^n\/?a$/i.test(name)) return false;
  // Person or desk placeholder ("GOP field (MN)", "Democratic nominee TBD").
  return /[A-Za-z]/.test(name);
}

function validSlug(raw: string | undefined): string | null {
  if (!raw) return null;
  const s = String(raw)
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 80);
  return s.length >= 2 ? s : null;
}

function inferField(name: string, overlayField: boolean | undefined, namesMatch: boolean, existing?: RaceSide): boolean {
  if (overlayField === true) return true;
  if (overlayField === false) return false;
  if (namesMatch) return existing?.field === true;
  return /\b(field|TBD|nominee TBD)\b/i.test(name);
}

function mergeSide(existing: RaceSide, overlay: RaceSidePatch): RaceSide | null {
  const name = String(overlay.name || "").trim().slice(0, 80);
  if (!isValidCandidateName(name)) return null;
  if (!isParty(overlay.party)) return null;
  if (overlay.withdrawn === true) {
    // Auditor should replace withdrawn names; never publish a withdrawn person as the live side.
    return null;
  }
  const match = namesAlign(existing.name, name);
  const slug =
    (match && existing.slug) ||
    validSlug(overlay.slug) ||
    slugify(name) ||
    existing.slug;
  const side: RaceSide = {
    slug,
    name,
    party: overlay.party,
  };
  const incumbent =
    overlay.incumbent === true ? true : overlay.incumbent === false ? false : match ? existing.incumbent : undefined;
  if (incumbent) side.incumbent = true;
  const field = inferField(name, overlay.field, match, existing);
  if (field) side.field = true;
  return side;
}

function pickForParty(party: Party | undefined, a: RaceSidePatch, b: RaceSidePatch): RaceSidePatch | null {
  if (!party) return null;
  const aHit = a.party === party;
  const bHit = b.party === party;
  if (aHit && !bHit) return a;
  if (bHit && !aHit) return b;
  return null;
}

/**
 * Assign overlay sides onto the editorial a/b slots by party so a locked
 * pick for side "a" does not silently flip to the other party.
 */
export function pairOverlayByParty(
  race: RaceDef,
  overlayA: RaceSidePatch,
  overlayB: RaceSidePatch
): { a: RaceSidePatch; b: RaceSidePatch } | null {
  if (!isParty(overlayA.party) || !isParty(overlayB.party)) return null;
  if (overlayA.party === overlayB.party) return null;
  const forA = pickForParty(race.a.party, overlayA, overlayB);
  const forB = pickForParty(race.b.party, overlayA, overlayB);
  if (forA && forB && forA !== forB) return { a: forA, b: forB };
  if (race.a.party && race.b.party && race.a.party !== race.b.party) {
    // Editorial sides have parties but overlay didn't map cleanly — refuse.
    if (!forA || !forB || forA === forB) return null;
  }
  // No editorial parties: keep overlay order.
  return { a: overlayA, b: overlayB };
}

export function applyPublishedCandidates(
  races: RaceDef[],
  published: RaceCandidateSnapshot[] | null | undefined,
  generatedAt?: string | null
): RaceDef[] {
  if (!published?.length) return races;
  const byId = new Map(published.map((c) => [c.raceId, c]));
  const verified =
    generatedAt && /^\d{4}-\d{2}-\d{2}/.test(generatedAt)
      ? generatedAt.slice(0, 10)
      : undefined;
  return races.map((r) => {
    const snap = byId.get(r.id);
    if (!snap?.a || !snap?.b) return r;
    const paired = pairOverlayByParty(r, snap.a, snap.b);
    if (!paired) return r;
    const a = mergeSide(r.a, paired.a);
    const b = mergeSide(r.b, paired.b);
    if (!a || !b) return r;
    const next: RaceDef = { ...r, a, b };
    if (isStatus(snap.status)) next.status = snap.status;
    if (snap.note) next.note = String(snap.note).slice(0, 400);
    if (verified) next.verifiedAsOf = verified;
    return next;
  });
}

function normBool(v: unknown): boolean | undefined {
  if (v === true) return true;
  if (v === false) return false;
  return undefined;
}

export function normalizeSidePatch(raw: unknown): RaceSidePatch | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  const name = String(o.name || "").trim().slice(0, 80);
  const party = String(o.party || "").trim().toUpperCase();
  if (!isValidCandidateName(name) || !isParty(party)) return null;
  const patch: RaceSidePatch = { name, party };
  const slug = validSlug(typeof o.slug === "string" ? o.slug : undefined);
  if (slug) patch.slug = slug;
  const incumbent = normBool(o.incumbent);
  if (incumbent !== undefined) patch.incumbent = incumbent;
  const field = normBool(o.field);
  if (field !== undefined) patch.field = field;
  const withdrawn = normBool(o.withdrawn);
  if (withdrawn !== undefined) patch.withdrawn = withdrawn;
  return patch;
}

/** Sanitize auditor candidate rows; skip races that fail validation. */
export function normalizeRaceCandidates(raw: unknown): RaceCandidateSnapshot[] {
  if (!Array.isArray(raw)) return [];
  const out: RaceCandidateSnapshot[] = [];
  const seen = new Set<string>();
  for (const item of raw.slice(0, 80)) {
    if (!item || typeof item !== "object") continue;
    const o = item as Record<string, unknown>;
    const raceId = String(o.raceId || "").slice(0, 80);
    if (!raceId || seen.has(raceId)) continue;
    const a = normalizeSidePatch(o.a);
    const b = normalizeSidePatch(o.b);
    if (!a || !b) continue;
    if (a.party === b.party) continue;
    if (a.withdrawn || b.withdrawn) continue;
    seen.add(raceId);
    const snap: RaceCandidateSnapshot = { raceId, a, b };
    if (o.office) snap.office = String(o.office).slice(0, 160);
    if (isStatus(o.status)) snap.status = o.status;
    if (o.note) snap.note = String(o.note).slice(0, 400);
    if (Array.isArray(o.sources)) {
      snap.sources = o.sources.map((s) => String(s).slice(0, 300)).slice(0, 6);
    }
    out.push(snap);
  }
  return out;
}

/** Newest per-race verifiedAsOf, else the editorial board stamp. */
export function liveBoardVerifiedAsOf(races: RaceDef[], fallback: string): string {
  let max = fallback;
  for (const r of races) {
    const d = r.verifiedAsOf;
    if (d && /^\d{4}-\d{2}-\d{2}$/.test(d) && d > max) max = d;
  }
  return max;
}
