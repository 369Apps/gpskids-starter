-- Anonymous per-player daily activity (for unique players/day, players per device, next-day return, friends brought).
-- p = salted SHA-256 of the player's random anonymous ID, d = salted SHA-256 of the device's random anonymous ID.
-- Raw IDs are never stored. No names, ages, IPs, user agents or content. Rows older than 40 days are deleted.
-- ev = bitmask of COUNT_EVENTS (lib/guard.js, bit i = COUNT_EVENTS[i]); friends = friend duels completed (claimed by the sender) that day;
-- nw = 1 on the first day this player was ever counted.
CREATE TABLE IF NOT EXISTS pdaily (day TEXT NOT NULL, p TEXT NOT NULL, d TEXT NOT NULL, ev INTEGER NOT NULL DEFAULT 0,
  friends INTEGER NOT NULL DEFAULT 0, nw INTEGER NOT NULL DEFAULT 0, PRIMARY KEY (day, p));
CREATE INDEX IF NOT EXISTS pdaily_p ON pdaily (p, day);
