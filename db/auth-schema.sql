-- Better Auth core tables (SQLite / D1). Column names match Better Auth's model.
CREATE TABLE IF NOT EXISTS "user" (
  "id" text NOT NULL PRIMARY KEY,
  "name" text NOT NULL,
  "email" text NOT NULL UNIQUE,
  "emailVerified" integer NOT NULL DEFAULT 0,
  "image" text,
  "createdAt" date NOT NULL,
  "updatedAt" date NOT NULL
);
CREATE TABLE IF NOT EXISTS "session" (
  "id" text NOT NULL PRIMARY KEY,
  "expiresAt" date NOT NULL,
  "token" text NOT NULL UNIQUE,
  "createdAt" date NOT NULL,
  "updatedAt" date NOT NULL,
  "ipAddress" text,
  "userAgent" text,
  "userId" text NOT NULL REFERENCES "user" ("id")
);
CREATE TABLE IF NOT EXISTS "account" (
  "id" text NOT NULL PRIMARY KEY,
  "accountId" text NOT NULL,
  "providerId" text NOT NULL,
  "userId" text NOT NULL REFERENCES "user" ("id"),
  "accessToken" text,
  "refreshToken" text,
  "idToken" text,
  "accessTokenExpiresAt" date,
  "refreshTokenExpiresAt" date,
  "scope" text,
  "password" text,
  "createdAt" date NOT NULL,
  "updatedAt" date NOT NULL
);
CREATE TABLE IF NOT EXISTS "verification" (
  "id" text NOT NULL PRIMARY KEY,
  "identifier" text NOT NULL,
  "value" text NOT NULL,
  "expiresAt" date NOT NULL,
  "createdAt" date,
  "updatedAt" date
);
-- App-specific: saved preferences + topic alerts (forward-looking).
CREATE TABLE IF NOT EXISTS "user_preferences" (
  "userId" text NOT NULL PRIMARY KEY REFERENCES "user" ("id"),
  "prefs" text NOT NULL DEFAULT '{}',
  "updatedAt" date NOT NULL
);
CREATE TABLE IF NOT EXISTS "topic_alert" (
  "id" text NOT NULL PRIMARY KEY,
  "userId" text NOT NULL REFERENCES "user" ("id"),
  "topic" text NOT NULL,
  "createdAt" date NOT NULL
);
-- Saved/bookmarked articles (one row per user+article).
CREATE TABLE IF NOT EXISTS "favorite" (
  "id" text NOT NULL PRIMARY KEY,
  "userId" text NOT NULL REFERENCES "user" ("id"),
  "slug" text NOT NULL,
  "headline" text NOT NULL DEFAULT '',
  "createdAt" date NOT NULL,
  UNIQUE ("userId", "slug")
);
-- Paid subscription state (one row per user). Trial is derived from
-- user.createdAt, so a row only exists once a Stripe subscription is created.
CREATE TABLE IF NOT EXISTS "subscription" (
  "userId" text NOT NULL PRIMARY KEY REFERENCES "user" ("id"),
  "status" text NOT NULL DEFAULT 'none',
  "plan" text,
  "stripeCustomerId" text,
  "stripeSubscriptionId" text,
  "currentPeriodEnd" date,
  "updatedAt" date NOT NULL
);
-- News-digest send log (one row per user; updated when a digest is emailed).
CREATE TABLE IF NOT EXISTS "digest_send" (
  "userId" text NOT NULL PRIMARY KEY REFERENCES "user" ("id"),
  "lastSentAt" date,
  "updatedAt" date NOT NULL
);
-- Weekly-newsletter send log (separate opt-in/cadence from the digest).
CREATE TABLE IF NOT EXISTS "newsletter_send" (
  "userId" text NOT NULL PRIMARY KEY REFERENCES "user" ("id"),
  "lastSentAt" date,
  "updatedAt" date NOT NULL
);
CREATE INDEX IF NOT EXISTS "idx_session_userId" ON "session" ("userId");
CREATE INDEX IF NOT EXISTS "idx_account_userId" ON "account" ("userId");
CREATE INDEX IF NOT EXISTS "idx_topic_alert_userId" ON "topic_alert" ("userId");
CREATE INDEX IF NOT EXISTS "idx_favorite_userId" ON "favorite" ("userId");
