-- Ballot Board picks + official results (multi-election ready).
-- Apply: wrangler d1 execute clad-users --remote --file=db/picks-schema.sql

CREATE TABLE IF NOT EXISTS "election" (
  "id" text NOT NULL PRIMARY KEY,
  "title" text NOT NULL,
  "subtitle" text,
  "picksCloseAt" text NOT NULL,
  "generalDate" text NOT NULL,
  "active" integer NOT NULL DEFAULT 1,
  "createdAt" text NOT NULL
);

CREATE TABLE IF NOT EXISTS "user_ballot" (
  "id" text NOT NULL PRIMARY KEY,
  "userId" text NOT NULL REFERENCES "user" ("id"),
  "electionId" text NOT NULL,
  "shareSlug" text NOT NULL UNIQUE,
  "displayName" text,
  "lockedAt" text,
  "createdAt" text NOT NULL,
  "updatedAt" text NOT NULL,
  UNIQUE ("userId", "electionId")
);

CREATE TABLE IF NOT EXISTS "user_pick" (
  "ballotId" text NOT NULL REFERENCES "user_ballot" ("id") ON DELETE CASCADE,
  "raceId" text NOT NULL,
  "side" text NOT NULL CHECK (side IN ('a', 'b')),
  "candidateSlug" text,
  "updatedAt" text NOT NULL,
  /** ISO time when this race pick was locked (scope locks); null = still draft */
  "lockedAt" text,
  PRIMARY KEY ("ballotId", "raceId")
);

CREATE TABLE IF NOT EXISTS "race_result" (
  "electionId" text NOT NULL,
  "raceId" text NOT NULL,
  "winnerSide" text NOT NULL CHECK (winnerSide IN ('a', 'b', 'other')),
  "winnerSlug" text,
  "winnerName" text,
  "calledAt" text,
  "source" text,
  "updatedAt" text NOT NULL,
  PRIMARY KEY ("electionId", "raceId")
);

CREATE INDEX IF NOT EXISTS "idx_ballot_user" ON "user_ballot" ("userId");
CREATE INDEX IF NOT EXISTS "idx_ballot_election" ON "user_ballot" ("electionId");
CREATE INDEX IF NOT EXISTS "idx_ballot_share" ON "user_ballot" ("shareSlug");
CREATE INDEX IF NOT EXISTS "idx_pick_race" ON "user_pick" ("raceId");
CREATE INDEX IF NOT EXISTS "idx_result_election" ON "race_result" ("electionId");

-- Seed active cycle (template details also live in TypeScript).
INSERT OR IGNORE INTO "election" ("id", "title", "subtitle", "picksCloseAt", "generalDate", "active", "createdAt")
VALUES (
  'midterms-2026',
  'Midterms 2026 Ballot Board',
  'Pick winners for Class II Senate and midterm governors.',
  '2026-11-04T04:59:59.000Z',
  '2026-11-03',
  1,
  '2026-07-15T00:00:00.000Z'
);
