-- Kids Pitch Night entries (PREVIEW database gpskids-pitchnight-preview; production gets its own database at go-live).
-- Optional table. The public app does not store pitches. If a fork turns storage on, do not save a child's name, photo, or recording.
-- (ekey); resubmitting replaces the row (subs counts submissions, capped). test = 1 marks automated test entries.
CREATE TABLE IF NOT EXISTS entries (
  id TEXT PRIMARY KEY,
  ekey TEXT NOT NULL UNIQUE,
  parent TEXT NOT NULL, email TEXT NOT NULL, phone TEXT NOT NULL DEFAULT '',
  kid TEXT NOT NULL, age INTEGER NOT NULL, band TEXT NOT NULL,
  transcript TEXT NOT NULL DEFAULT '',
  clarity INTEGER NOT NULL, pace INTEGER NOT NULL, confidence INTEGER NOT NULL, structure INTEGER NOT NULL, overall INTEGER NOT NULL,
  seconds INTEGER NOT NULL, wpm INTEGER NOT NULL, fillers INTEGER NOT NULL, coach TEXT NOT NULL DEFAULT 'local',
  audio_key TEXT NOT NULL, audio_type TEXT NOT NULL, audio_size INTEGER NOT NULL,
  subs INTEGER NOT NULL DEFAULT 1, finalist INTEGER NOT NULL DEFAULT 0, test INTEGER NOT NULL DEFAULT 0,
  consent_v TEXT NOT NULL, consent_at INTEGER NOT NULL, created INTEGER NOT NULL, updated INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS entries_rank ON entries (test, overall DESC, updated);
