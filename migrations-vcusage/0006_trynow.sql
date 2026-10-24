-- PREVIEW ONLY "Talk to the AI Coach" demo (try-now page). Parent contact only, never child PII, never audio or transcripts.
CREATE TABLE IF NOT EXISTS td_leads (id TEXT PRIMARY KEY, created_at TEXT NOT NULL, session_id TEXT, parent_name TEXT, email TEXT, phone TEXT,
  child_age_band TEXT CHECK (child_age_band IN ('5-8','9-12','13-17')), goal TEXT, source TEXT DEFAULT 'voice-demo',
  utm_source TEXT, utm_medium TEXT, utm_campaign TEXT, plan_interest TEXT, ghl_contact_id TEXT, ghl_sync_status TEXT DEFAULT 'pending', test INTEGER NOT NULL DEFAULT 0);
CREATE TABLE IF NOT EXISTS td_consents (id TEXT PRIMARY KEY, created_at TEXT NOT NULL, session_id TEXT NOT NULL, lead_id TEXT, adult_attested INTEGER NOT NULL,
  ai_disclosure_ack INTEGER NOT NULL, child_participation_ok INTEGER, contact_consent INTEGER, consent_text_version TEXT NOT NULL, ip_hash TEXT, user_agent_hash TEXT);
CREATE TABLE IF NOT EXISTS td_callbacks (id TEXT PRIMARY KEY, created_at TEXT, lead_id TEXT, reason TEXT, preferred_time TEXT, status TEXT DEFAULT 'open');
CREATE TABLE IF NOT EXISTS td_sessions (id TEXT PRIMARY KEY, started_at TEXT, started_ts INTEGER, deadline_ts INTEGER, ended_at TEXT, seconds INTEGER, end_reason TEXT,
  device_hash TEXT, ip_hash TEXT, day TEXT, est_cost_cents INTEGER, tool_calls INTEGER NOT NULL DEFAULT 0, lead_id TEXT, plan_interest TEXT);
CREATE INDEX IF NOT EXISTS td_sessions_dev ON td_sessions(day, device_hash);
CREATE TABLE IF NOT EXISTS td_rl (k TEXT PRIMARY KEY, n INTEGER NOT NULL, exp INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS td_events (day TEXT NOT NULL, ev TEXT NOT NULL, prop TEXT NOT NULL DEFAULT '', n INTEGER NOT NULL DEFAULT 0, PRIMARY KEY (day, ev, prop));
