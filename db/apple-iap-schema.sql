-- Apple In-App Purchase entitlements for the iOS app. Apply with:
--   wrangler d1 execute clad-users --file db/apple-iap-schema.sql --remote
--
-- One row per user (the rail they bought on). Keyed by userId; the Apple
-- originalTransactionId is the stable subscription identifier across renewals.
-- getAccess() treats the user as Premium when status='active' AND expiresAt is
-- in the future — independent of the Stripe `subscription` row, so a user can
-- be Premium via Stripe (web) OR Apple (app).
CREATE TABLE IF NOT EXISTS "apple_subscription" (
  "userId" text NOT NULL PRIMARY KEY REFERENCES "user" ("id"),
  "originalTransactionId" text NOT NULL,
  "productId" text,
  "status" text NOT NULL DEFAULT 'active',
  "expiresAt" text,
  "updatedAt" text NOT NULL
);
-- Reverse lookup: a renewal/refund notification arrives keyed by
-- originalTransactionId and must find the user it belongs to.
CREATE INDEX IF NOT EXISTS "idx_apple_sub_origtxn"
  ON "apple_subscription" ("originalTransactionId");
