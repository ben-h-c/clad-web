-- APNs device tokens for the CladFacts iOS app. Apply with:
--   wrangler d1 execute clad-users --file db/push-schema.sql --remote
--
-- A token is the device's APNs registration. userId is set when the
-- device was signed in at registration time (nullable: anonymous devices
-- may still opt into breaking-news alerts). environment distinguishes the
-- APNs sandbox (debug builds / TestFlight dev) from production, because a
-- token is only valid against the environment that minted it.
CREATE TABLE IF NOT EXISTS "push_token" (
  "token" text NOT NULL PRIMARY KEY,
  "userId" text,
  "environment" text NOT NULL DEFAULT 'production',
  "createdAt" text NOT NULL,
  "updatedAt" text NOT NULL
);
CREATE INDEX IF NOT EXISTS "idx_push_token_userId" ON "push_token" ("userId");
