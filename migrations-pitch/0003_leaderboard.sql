-- GPS Kids Speaking Leaderboard (PREVIEW DB ONLY until Bobby approves). Replaces the 0002 weekly giveaway tables (left unused).
-- Filled only after a grown-up passes the check, says they are 18+, accepts the rules and ticks consent.
-- Personal data kept: parent email (to contact a winner's parent), kid first name, last initial, age. No kid email, phone, photo, school.
CREATE TABLE IF NOT EXISTS lb_entries (
  id TEXT PRIMARY KEY,
  ekey TEXT NOT NULL UNIQUE,          -- parent email + kid first name + last initial (lowercase)
  tok_hash TEXT NOT NULL UNIQUE,      -- SHA-256 of the secret kept on the kid's phone
  email TEXT NOT NULL,
  email_hash TEXT NOT NULL,           -- for duplicate friend checks
  dev_hash TEXT NOT NULL DEFAULT '',  -- hash of a random id made on the phone (duplicate friend checks)
  kid TEXT NOT NULL,
  init TEXT NOT NULL,
  age INTEGER NOT NULL,
  pool TEXT NOT NULL DEFAULT 'gps',
  shown INTEGER NOT NULL DEFAULT 0,   -- parent approved showing "First L." on the board. Default hidden.
  ref_code TEXT NOT NULL UNIQUE,      -- this family's Bring a Friend link code
  referred_by TEXT,                   -- entry id of the friend who invited them
  test INTEGER NOT NULL DEFAULT 0,
  consent_v TEXT NOT NULL,
  consent_at INTEGER NOT NULL,
  created INTEGER NOT NULL
);
-- Points ledger. kind 'day' (ref = ET date, so ONE scored challenge per kid per day) or 'friend' (ref = friend's entry id, once).
CREATE TABLE IF NOT EXISTS lb_points (
  entry_id TEXT NOT NULL,
  kind TEXT NOT NULL,
  ref TEXT NOT NULL,
  day TEXT NOT NULL,                  -- ET date the points were earned (decides the week and month)
  pts INTEGER NOT NULL,
  quality INTEGER NOT NULL DEFAULT 0,
  flag TEXT NOT NULL DEFAULT '',      -- 'dup_email' / 'dup_device' on a suspicious friend
  created INTEGER NOT NULL,
  PRIMARY KEY (entry_id, kind, ref)
);
CREATE INDEX IF NOT EXISTS lb_points_day ON lb_points (day);
-- Winners picked automatically at each reset. Payout is MANUAL in the preview: status logged | held | released | passed | paid.
CREATE TABLE IF NOT EXISTS lb_winners (
  kind TEXT NOT NULL,                 -- week | month
  period TEXT NOT NULL,               -- Monday date or YYYY-MM
  pool TEXT NOT NULL,
  entry_id TEXT,
  points INTEGER NOT NULL DEFAULT 0,
  amount INTEGER NOT NULL,
  status TEXT NOT NULL,
  flags TEXT NOT NULL DEFAULT '',
  test INTEGER NOT NULL DEFAULT 0,
  created INTEGER NOT NULL,
  PRIMARY KEY (kind, period, pool, test)
);
CREATE TABLE IF NOT EXISTS lb_alerts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  kind TEXT NOT NULL,
  period TEXT NOT NULL,
  entry_id TEXT,
  reason TEXT NOT NULL,
  test INTEGER NOT NULL DEFAULT 0,
  created INTEGER NOT NULL
);
