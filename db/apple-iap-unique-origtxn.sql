-- Expand: unique originalTransactionId so one Apple purchase binds to one account.
-- Apply:
--   wrangler d1 execute clad-users --file db/apple-iap-unique-origtxn.sql --remote
--
-- Safe if duplicates already exist? No — resolve duplicate originalTransactionId
-- rows first (keep the oldest active row per id). Then:
CREATE UNIQUE INDEX IF NOT EXISTS "idx_apple_sub_origtxn_unique"
  ON "apple_subscription" ("originalTransactionId");
