-- Rate-limit counters only. k = "ip:<salted daily SHA-256 of the IP>" or "g:<day>". No kid content, no raw IPs.
CREATE TABLE IF NOT EXISTS rl (k TEXT PRIMARY KEY, n INTEGER NOT NULL, exp INTEGER NOT NULL);
CREATE INDEX IF NOT EXISTS rl_exp ON rl (exp);
