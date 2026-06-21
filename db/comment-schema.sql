-- Reader reactions on reports. One editable reaction per user per post: a
-- free-text comment plus an optional agree/disagree on the letter grade and on
-- the political lean. Reactions are visible to full-access readers (trial +
-- premium); only premium users can post (enforced in src/pages/api/comments.ts).
-- Apply with:
--   wrangler d1 execute clad-users --file db/comment-schema.sql --local
--   wrangler d1 execute clad-users --file db/comment-schema.sql --remote
CREATE TABLE IF NOT EXISTS "comment" (
  "id" text NOT NULL PRIMARY KEY,
  "postSlug" text NOT NULL,
  "userId" text NOT NULL REFERENCES "user" ("id"),
  "authorName" text NOT NULL DEFAULT '',
  "body" text NOT NULL DEFAULT '',
  "gradeVote" text,   -- 'agree' | 'disagree' | NULL
  "leanVote" text,    -- 'agree' | 'disagree' | NULL
  "createdAt" date NOT NULL,
  "updatedAt" date NOT NULL,
  UNIQUE ("userId", "postSlug")
);
CREATE INDEX IF NOT EXISTS "idx_comment_postSlug" ON "comment" ("postSlug");
CREATE INDEX IF NOT EXISTS "idx_comment_userId" ON "comment" ("userId");
