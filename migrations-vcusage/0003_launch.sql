-- Consent per child profile (random ids), parent alerts, daily xAI spend. PREVIEW ONLY. No names, words or audio.
CREATE TABLE IF NOT EXISTS vc_consent (acct TEXT NOT NULL, kid TEXT NOT NULL, at INTEGER NOT NULL, version TEXT NOT NULL, live_optin INTEGER NOT NULL DEFAULT 0, gate TEXT, PRIMARY KEY (acct, kid));
CREATE TABLE IF NOT EXISTS vc_alert (id TEXT PRIMARY KEY, acct TEXT NOT NULL, kid TEXT NOT NULL, at INTEGER NOT NULL, kind TEXT NOT NULL, seen INTEGER NOT NULL DEFAULT 0, email TEXT);
CREATE TABLE IF NOT EXISTS vc_spend (day TEXT PRIMARY KEY, usd REAL NOT NULL DEFAULT 0);
