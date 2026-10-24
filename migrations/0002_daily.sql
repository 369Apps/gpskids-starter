-- Anonymous daily totals (aggregate only, never expires). No IDs, IPs, content or user agent.
CREATE TABLE IF NOT EXISTS daily (day TEXT NOT NULL, event TEXT NOT NULL, n INTEGER NOT NULL DEFAULT 0, PRIMARY KEY (day, event));
