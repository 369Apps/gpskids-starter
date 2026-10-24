-- Coach notes with review before parents see them (Oct 22 2026). First names only, no other kid details.
-- One row per kid (random id), so two kids with the same first name stay apart. The parent link token belongs to the kid.
CREATE TABLE IF NOT EXISTS cnote_kids (id TEXT PRIMARY KEY, first TEXT NOT NULL, token TEXT NOT NULL UNIQUE, created INTEGER NOT NULL, ghl_contact TEXT);
CREATE TABLE IF NOT EXISTS cnotes (id INTEGER PRIMARY KEY AUTOINCREMENT, class_date TEXT NOT NULL, first TEXT NOT NULL, note TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending', flag TEXT, suggest TEXT, created INTEGER NOT NULL, updated INTEGER NOT NULL, kid_id TEXT, auto INTEGER NOT NULL DEFAULT 0);
CREATE INDEX IF NOT EXISTS cnotes_status ON cnotes(status, class_date);
CREATE INDEX IF NOT EXISTS cnotes_kid ON cnotes(kid_id);
