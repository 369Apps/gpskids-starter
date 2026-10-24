-- Optional roster tables. The public app does not write them and does not store a child's name.
DROP TABLE IF EXISTS coach_notes;
CREATE TABLE IF NOT EXISTS coaches (id TEXT PRIMARY KEY, name TEXT NOT NULL, key_hash TEXT NOT NULL UNIQUE, created INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS kids (
  id TEXT PRIMARY KEY, coach_id TEXT NOT NULL, day TEXT NOT NULL, first TEXT NOT NULL,
  parent_hash TEXT NOT NULL UNIQUE, created INTEGER NOT NULL);
CREATE INDEX IF NOT EXISTS kids_coach ON kids (coach_id, day);
CREATE TABLE IF NOT EXISTS coach_notes (
  kid_id TEXT NOT NULL, class_date TEXT NOT NULL, coach_id TEXT NOT NULL, note TEXT NOT NULL, updated INTEGER NOT NULL,
  PRIMARY KEY (kid_id, class_date));
