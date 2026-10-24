-- Anonymous first-party usage events (GPS Kids Speak). One row per step a player takes in the app.
-- No names, emails, phones, ages, transcripts, audio, IPs or user agents. p / d / sid / x are salted SHA-256 hashes
-- (first 16 bytes) of random IDs made by the app (player, device, session) or of a friend-duel link id; raw IDs are never stored.
-- day = ET day of the event; test = 1 for test traffic (x-gks-test: count). Real rows are deleted after 60 days, test rows after 2.
-- step / k / v: see public/steps.js (k is a short code from a fixed list, v a small number such as seconds or a score).
CREATE TABLE IF NOT EXISTS ev (
  day TEXT NOT NULL, test INTEGER NOT NULL DEFAULT 0,
  sid TEXT NOT NULL, n INTEGER NOT NULL, ts INTEGER NOT NULL,
  p TEXT NOT NULL, d TEXT NOT NULL,
  step TEXT NOT NULL, v INTEGER, k TEXT, x TEXT,
  PRIMARY KEY (sid, n)
);
CREATE INDEX IF NOT EXISTS ev_day ON ev (test, day, step);
CREATE INDEX IF NOT EXISTS ev_p ON ev (p, day);
CREATE INDEX IF NOT EXISTS ev_x ON ev (x) WHERE x IS NOT NULL;
-- Rate-limit counters for /api/ev and /api/stats (k = "<scope>ip:<salted daily SHA-256 of IP>" or "<scope>g:<day>"), auto-expiring.
CREATE TABLE IF NOT EXISTS evrl (k TEXT PRIMARY KEY, n INTEGER NOT NULL, exp INTEGER NOT NULL);
CREATE INDEX IF NOT EXISTS evrl_exp ON evrl (exp);
