-- Coach roster + parent links (Oct 20 2026, PREVIEW first). Replaces the 0005 coach_notes shape (preview had no real rows).
-- coaches: one row per coach; only the SHA-256 of the coach key is stored. kids: first name only, the coach's class day,
-- and the SHA-256 of a long random parent link token. coach_notes: one note per kid per class date.
DROP TABLE IF EXISTS coach_notes;
CREATE TABLE IF NOT EXISTS coaches (id TEXT PRIMARY KEY, name TEXT NOT NULL, key_hash TEXT NOT NULL UNIQUE, created INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS kids (
  id TEXT PRIMARY KEY, coach_id TEXT NOT NULL, day TEXT NOT NULL, first TEXT NOT NULL,
  parent_hash TEXT NOT NULL UNIQUE, created INTEGER NOT NULL);
CREATE INDEX IF NOT EXISTS kids_coach ON kids (coach_id, day);
CREATE TABLE IF NOT EXISTS coach_notes (
  kid_id TEXT NOT NULL, class_date TEXT NOT NULL, coach_id TEXT NOT NULL, note TEXT NOT NULL, updated INTEGER NOT NULL,
  PRIMARY KEY (kid_id, class_date));
