-- Unused by the public app. The public board is off and does not store a child's name.
CREATE TABLE IF NOT EXISTS prize_entries (
  id TEXT PRIMARY KEY,
  ekey TEXT NOT NULL UNIQUE,          -- parent email + kid first name (lowercase)
  tok_hash TEXT NOT NULL UNIQUE,      -- SHA-256 of the secret kept on the kid's phone (the phone never sends the email again)
  email TEXT NOT NULL,
  kid TEXT NOT NULL,
  age INTEGER NOT NULL,
  pool TEXT NOT NULL DEFAULT 'gps',   -- GPS Kids online, or one partner. A leaderboard only ever shows one pool.
  hidden INTEGER NOT NULL DEFAULT 0,  -- parent chose to hide this kid from the leaderboard (still in the draw)
  test INTEGER NOT NULL DEFAULT 0,
  consent_v TEXT NOT NULL,
  consent_at INTEGER NOT NULL,
  created INTEGER NOT NULL,
  updated INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS prize_weeks (
  entry_id TEXT NOT NULL,
  week TEXT NOT NULL,                 -- Monday (ET) that starts the week, YYYY-MM-DD
  days INTEGER NOT NULL DEFAULT 0,
  pitches INTEGER NOT NULL DEFAULT 0,
  friends INTEGER NOT NULL DEFAULT 0,
  points INTEGER NOT NULL DEFAULT 0,
  belt INTEGER NOT NULL DEFAULT 0,
  updated INTEGER NOT NULL,
  PRIMARY KEY (entry_id, week)
);
CREATE INDEX IF NOT EXISTS prize_weeks_board ON prize_weeks (week, points DESC);
-- duels this entry sent; a friend finishing one is checked on the server (functions/api/duel.js keeps the done flag)
CREATE TABLE IF NOT EXISTS prize_duels (
  duel_id TEXT PRIMARY KEY,
  entry_id TEXT NOT NULL,
  week TEXT NOT NULL,
  done INTEGER NOT NULL DEFAULT 0,
  created INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS prize_duels_entry ON prize_duels (entry_id, week);
CREATE TABLE IF NOT EXISTS prize_draws (
  week TEXT PRIMARY KEY,
  entry_id TEXT NOT NULL,
  points INTEGER NOT NULL,
  pool_points INTEGER NOT NULL,
  entries INTEGER NOT NULL,
  drawn_at INTEGER NOT NULL
);
