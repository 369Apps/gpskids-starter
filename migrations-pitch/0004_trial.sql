-- Book a free trial class (Oct 17 2026, PREVIEW first). Additive only: one new table, nothing else changes.
-- Filled only when a grown-up submits the trial form. Kept: parent name + phone, child first name + age, the day.
-- ghl = 'sent' once the contact is in GoHighLevel (GPS Kids HQ, tag trial-class), 'pending' when GHL isn't set up yet,
-- 'error' when GHL refused it (the row is kept either way, so no booking is ever lost).
CREATE TABLE IF NOT EXISTS trial_requests (
  id TEXT PRIMARY KEY,
  parent TEXT NOT NULL,
  phone TEXT NOT NULL,
  kid TEXT NOT NULL,
  age INTEGER NOT NULL,
  day TEXT NOT NULL,              -- 'tue' | 'thu'
  ghl TEXT NOT NULL DEFAULT 'pending',
  ghl_id TEXT,
  test INTEGER NOT NULL DEFAULT 0,
  created INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS trial_requests_created ON trial_requests (created);
CREATE INDEX IF NOT EXISTS trial_requests_phone ON trial_requests (phone);
