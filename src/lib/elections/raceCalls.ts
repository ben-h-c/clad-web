/**
 * News-consensus race calls for the Ballot Board pick'em.
 *
 * A call writes D1 race_result (a / b / other) so locked ballots score.
 * Conservative: AP or 2+ major outlets; general/special only; never a primary.
 * Desk `editorial` rows are not overwritten.
 */
import { namesAlign } from "./liveOverlay.ts";
import { isVoteDateTbd, type RaceDef } from "../races.ts";
import type { PickSide, RaceResultRow } from "./types.ts";

export type CallConfidence = "ap" | "multi" | "single" | "none";

export interface ProposedRaceCall {
  raceId: string;
  office?: string;
  called: boolean;
  winnerName?: string;
  winnerParty?: "D" | "R" | "I" | "O";
  winnerSide?: PickSide | "other";
  confidence?: CallConfidence;
  outlets?: string[];
  note?: string;
  calledAt?: string;
}

export type CallSkipReason =
  | "not-called"
  | "below-bar"
  | "not-eligible"
  | "no-match"
  | "desk-lock"
  | "unknown-race";

export interface CallApplyResult {
  raceId: string;
  action: "apply" | "update" | "skip";
  reason?: CallSkipReason;
  winnerSide?: PickSide | "other";
  winnerName?: string;
  source?: string;
}

const MAJOR_OUTLETS: { id: string; re: RegExp }[] = [
  { id: "ap", re: /\bassociated press\b|\bap news\b|\bap\b/i },
  { id: "reuters", re: /\breuters\b/i },
  { id: "ddhq", re: /\bdecision desk\b|\bddhq\b/i },
  { id: "nyt", re: /\bnew york times\b|\bnytimes\b|\bnyt\b/i },
  { id: "wapo", re: /\bwashington post\b|\bwapo\b/i },
  { id: "nbc", re: /\bnbc\b/i },
  { id: "cbs", re: /\bcbs\b/i },
  { id: "abc", re: /\babc news\b|\babc\b/i },
  { id: "cnn", re: /\bcnn\b/i },
  { id: "npr", re: /\bnpr\b/i },
];

export function nyDateKey(now = new Date()): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/New_York",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(now);
  const y = parts.find((p) => p.type === "year")?.value;
  const m = parts.find((p) => p.type === "month")?.value;
  const d = parts.find((p) => p.type === "day")?.value;
  return y && m && d ? `${y}-${m}-${d}` : now.toISOString().slice(0, 10);
}

function callVoteDate(race: RaceDef): string | null {
  const next = race.nextVoteDate;
  if (next && !isVoteDateTbd(next)) return next;
  const general = race.generalDate;
  if (general && !isVoteDateTbd(general)) return general;
  return null;
}

function isSeatFillingVote(race: RaceDef): boolean {
  const kind = race.voteKind;
  if (kind === "general" || kind === "special") return true;
  if (kind === "primary" || kind === "runoff" || kind === "party-process" || kind === "undecided") {
    return false;
  }
  const next = race.nextVoteDate;
  const general = race.generalDate;
  return !!(next && general && next === general && !isVoteDateTbd(next));
}

/** True when this card's next vote is the seat-filling contest and that day has begun in ET. */
export function raceIsCallEligible(race: RaceDef, now = new Date()): boolean {
  if (!isSeatFillingVote(race)) return false;
  const date = callVoteDate(race);
  if (!date) return false;
  return nyDateKey(now) >= date;
}

export function isEditorialSource(source: string | null | undefined): boolean {
  const s = String(source || "").trim().toLowerCase();
  return s === "editorial" || s.startsWith("editorial");
}

export function normalizeOutletId(raw: string): string | null {
  const t = String(raw || "").trim();
  if (!t) return null;
  for (const o of MAJOR_OUTLETS) {
    if (o.re.test(t)) return o.id;
  }
  return null;
}

export function consensusMeetsBar(call: ProposedRaceCall): boolean {
  if (!call.called) return false;
  if (call.confidence === "ap" || call.confidence === "multi") {
    // Still require at least one recognizable major, or explicit AP confidence
    // with a named winner — confidence alone from the model is not enough if
    // outlets are empty, except AP which is the industry call standard.
    if (call.confidence === "ap") return true;
  }
  const ids = [...new Set((call.outlets || []).map(normalizeOutletId).filter(Boolean))] as string[];
  if (ids.includes("ap")) return true;
  if (ids.length >= 2) return true;
  return false;
}

export function matchWinnerSide(
  race: RaceDef,
  call: ProposedRaceCall
): PickSide | "other" | null {
  const name = String(call.winnerName || "").trim();
  if (name) {
    const aHit = namesAlign(race.a.name, name);
    const bHit = namesAlign(race.b.name, name);
    if (aHit && !bHit) return "a";
    if (bHit && !aHit) return "b";
    if (aHit && bHit) return null;
  }
  const party = call.winnerParty;
  if (party === "D" || party === "R" || party === "I" || party === "O") {
    const aHit = race.a.party === party;
    const bHit = race.b.party === party;
    if (aHit && !bHit) return "a";
    if (bHit && !aHit) return "b";
  }
  if (call.winnerSide === "other") return "other";
  // Do not trust model a/b alone — that can flip parties.
  return name ? "other" : null;
}

export function consensusSource(call: ProposedRaceCall): string {
  const ids = [...new Set((call.outlets || []).map(normalizeOutletId).filter(Boolean))] as string[];
  const tag = ids.length ? ids.join(",") : call.confidence === "ap" ? "ap" : "news";
  return `consensus:${tag}`.slice(0, 120);
}

export function decideCallAction(
  race: RaceDef | undefined,
  call: ProposedRaceCall,
  existing: RaceResultRow | undefined,
  now = new Date()
): CallApplyResult {
  const raceId = call.raceId;
  if (!race) return { raceId, action: "skip", reason: "unknown-race" };
  if (!call.called) return { raceId, action: "skip", reason: "not-called" };
  if (!raceIsCallEligible(race, now)) return { raceId, action: "skip", reason: "not-eligible" };
  if (!consensusMeetsBar(call)) return { raceId, action: "skip", reason: "below-bar" };
  const side = matchWinnerSide(race, call);
  if (!side) return { raceId, action: "skip", reason: "no-match" };
  const winnerName =
    side === "a" ? race.a.name : side === "b" ? race.b.name : String(call.winnerName || "").slice(0, 80);
  const source = consensusSource(call);
  if (existing && isEditorialSource(existing.source)) {
    return { raceId, action: "skip", reason: "desk-lock", winnerSide: existing.winnerSide, winnerName: existing.winnerName ?? undefined };
  }
  if (existing && existing.winnerSide === side) {
    return { raceId, action: "update", winnerSide: side, winnerName, source };
  }
  return { raceId, action: existing ? "update" : "apply", winnerSide: side, winnerName, source };
}

export function normalizeProposedCall(raw: unknown): ProposedRaceCall | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  const raceId = String(o.raceId || "").slice(0, 80);
  if (!raceId) return null;
  const called = o.called === true;
  const conf = String(o.confidence || "").toLowerCase();
  const confidence: CallConfidence =
    conf === "ap" || conf === "multi" || conf === "single" || conf === "none" ? conf : "none";
  const party = String(o.winnerParty || "").toUpperCase();
  const side = String(o.winnerSide || "").toLowerCase();
  const call: ProposedRaceCall = {
    raceId,
    called,
    confidence,
  };
  if (o.office) call.office = String(o.office).slice(0, 160);
  if (o.winnerName) call.winnerName = String(o.winnerName).trim().slice(0, 80);
  if (party === "D" || party === "R" || party === "I" || party === "O") call.winnerParty = party;
  if (side === "a" || side === "b" || side === "other") call.winnerSide = side;
  if (Array.isArray(o.outlets)) {
    call.outlets = o.outlets.map((s) => String(s).slice(0, 80)).filter(Boolean).slice(0, 8);
  }
  if (o.note) call.note = String(o.note).slice(0, 400);
  if (typeof o.calledAt === "string" && o.calledAt.trim()) {
    call.calledAt = o.calledAt.trim().slice(0, 40);
  }
  return call;
}
