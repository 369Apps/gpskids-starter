-- Coach notes after class (Oct 20 2026, PREVIEW first). Additive only: one new table.
-- A coach writes one short note per kid after a Tue or Thu class. Rows belong to ONE partner (from the coach key);
-- a key only ever reads and writes its own partner's rows. Kept: class date, kid first name, the note. No contact details.
CREATE TABLE IF NOT EXISTS coach_notes (
  id TEXT PRIMARY KEY,
  partner TEXT NOT NULL,
  class_date TEXT NOT NULL,        -- YYYY-MM-DD, a Tuesday or Thursday
  kid TEXT NOT NULL,               -- first name only
  note TEXT NOT NULL,
  created INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS coach_notes_class ON coach_notes (partner, class_date);
