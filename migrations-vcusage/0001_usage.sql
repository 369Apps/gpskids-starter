-- PREVIEW ONLY voice coach minutes. Random ids only (parent account id + child profile id). No names, no words, no audio.
CREATE TABLE IF NOT EXISTS vc_plan (acct TEXT PRIMARY KEY, plan TEXT NOT NULL DEFAULT 'free', updated INTEGER);
CREATE TABLE IF NOT EXISTS vc_use (acct TEXT NOT NULL, kid TEXT NOT NULL, day TEXT NOT NULL, month TEXT NOT NULL, kind TEXT NOT NULL, secs INTEGER NOT NULL, at INTEGER NOT NULL, sid TEXT);
CREATE INDEX IF NOT EXISTS vc_use_m ON vc_use(acct, kid, month);
CREATE INDEX IF NOT EXISTS vc_use_sid ON vc_use(sid);
