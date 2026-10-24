-- Optional notes table. The public app keeps coach notes on the phone, not in this database, and does not store a child's name.
CREATE TABLE IF NOT EXISTS coach_notes (
  id TEXT PRIMARY KEY,
  partner TEXT NOT NULL,
  class_date TEXT NOT NULL,        -- YYYY-MM-DD, a Tuesday or Thursday
  kid TEXT NOT NULL,               -- first name only
  note TEXT NOT NULL,
  created INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS coach_notes_class ON coach_notes (partner, class_date);
