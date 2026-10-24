-- One row per coach session (turn = one recording, live = one realtime session, tts = one "Hear it"). Random ids only.
ALTER TABLE vc_use ADD COLUMN plan TEXT;
ALTER TABLE vc_use ADD COLUMN mode TEXT;        -- feedback | rebuttal | live | hear
ALTER TABLE vc_use ADD COLUMN cost_usd REAL;    -- estimate, see lib/vcusage.js RATES
ALTER TABLE vc_use ADD COLUMN left_sec INTEGER; -- minutes left (in seconds) after this session
ALTER TABLE vc_use ADD COLUMN test INTEGER NOT NULL DEFAULT 0;
