-- Kids Pitch Night entries (PREVIEW database gpskids-pitchnight-preview; production gets its own database at go-live).
-- The ONLY table in GPS Kids Speak with personal info: parent name/email/phone, kid first name + age, the transcript and
-- the scores of the submitted pitch. The audio itself is in R2 (audio_key). One row per parent email + kid first name
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
