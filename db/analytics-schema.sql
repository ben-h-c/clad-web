-- Privacy-first first-party analytics (aggregate only).
-- No user ids, emails, names, raw IPs, full user-agents, or query strings.
-- Aligned with cookieless practices (Plausible / Fathom style).

-- Per-path daily rollups
CREATE TABLE IF NOT EXISTS analytics_daily (
  day TEXT NOT NULL,
  path TEXT NOT NULL,
  pageviews INTEGER NOT NULL DEFAULT 0,
  sessions INTEGER NOT NULL DEFAULT 0,
  engaged_seconds INTEGER NOT NULL DEFAULT 0,
  engages INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (day, path)
);
CREATE INDEX IF NOT EXISTS idx_analytics_daily_day ON analytics_daily(day);

-- Referrer host only (never full URL with path/query)
CREATE TABLE IF NOT EXISTS analytics_referrers_daily (
  day TEXT NOT NULL,
  host TEXT NOT NULL,
  hits INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (day, host)
);

-- Coarse device class only
CREATE TABLE IF NOT EXISTS analytics_devices_daily (
  day TEXT NOT NULL,
  device TEXT NOT NULL,
  hits INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (day, device)
);

-- Coarse country from Cloudflare edge header (ISO-3166 alpha-2 or XX)
CREATE TABLE IF NOT EXISTS analytics_countries_daily (
  day TEXT NOT NULL,
  country TEXT NOT NULL,
  hits INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (day, country)
);

-- UTC hour-of-day volume
CREATE TABLE IF NOT EXISTS analytics_hours_daily (
  day TEXT NOT NULL,
  hour INTEGER NOT NULL,
  pageviews INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (day, hour)
);

-- Video engagement by YouTube id + path (no personal data)
CREATE TABLE IF NOT EXISTS analytics_video_daily (
  day TEXT NOT NULL,
  video_id TEXT NOT NULL,
  path TEXT NOT NULL,
  plays INTEGER NOT NULL DEFAULT 0,
  watch_seconds INTEGER NOT NULL DEFAULT 0,
  milestone_15 INTEGER NOT NULL DEFAULT 0,
  milestone_30 INTEGER NOT NULL DEFAULT 0,
  milestone_60 INTEGER NOT NULL DEFAULT 0,
  milestone_120 INTEGER NOT NULL DEFAULT 0,
  milestone_300 INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (day, video_id, path)
);

-- Ephemeral session uniqueness for the day (hash only; purged after retention)
CREATE TABLE IF NOT EXISTS analytics_session_day (
  day TEXT NOT NULL,
  session_hash TEXT NOT NULL,
  PRIMARY KEY (day, session_hash)
);

-- Schema bootstrap marker
CREATE TABLE IF NOT EXISTS analytics_meta (
  key TEXT NOT NULL PRIMARY KEY,
  value TEXT NOT NULL
);
