-- Per-race pick locks: lock governors without locking senate (etc.).
-- Apply: wrangler d1 execute clad-users --remote --file=db/picks-pick-lock-schema.sql
-- Safe to re-run (IF NOT EXISTS not available for columns; ignore duplicate-column errors).

ALTER TABLE "user_pick" ADD COLUMN "lockedAt" text;
