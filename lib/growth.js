// Growth counts per Eastern-time day (the /stats "Growth" table and GET /api/stats?view=growth).
// Read-only over the anonymous events table ev (migrations-events/0001_events.sql). Nothing new is stored: only the
// already hashed player ids (p), the step and its short code. No names, ages, words, audio or IPs.
//   new_players     players whose first day in the events (kept 60 days) is this day
//   came_back       players active this day who also played on an earlier day
//   invites_shared  share taps (every share link carries the kid's ?ref invite) + leaderboard "Bring a friend" shares
//   invite_opens    the app opened from a friend link (Challenge a friend duel link or ?ref / ?friend invite)
//   new_from_invite new players whose first day started from a friend link
export const GROWTH_DAYS = 14, MAX_GROWTH_DAYS = 31;
const INVITE_OPEN = "step = 'app_open' AND k IN ('duel', 'ref')";
export const GROWTH_SQL = {
  players: `WITH f AS (SELECT p, MIN(day) AS first FROM ev WHERE test = ?3 GROUP BY p),
    a AS (SELECT day, p, MAX(${INVITE_OPEN}) AS inv FROM ev WHERE test = ?3 AND day BETWEEN ?1 AND ?2 GROUP BY day, p)
    SELECT a.day AS day, COUNT(*) AS players, SUM(f.first = a.day) AS new_players, SUM(f.first < a.day) AS came_back,
      SUM(f.first = a.day AND a.inv = 1) AS new_from_invite
    FROM a JOIN f ON f.p = a.p GROUP BY a.day`,
  invites: `SELECT day, SUM(step IN ('share', 'lb_invite')) AS invites_shared, SUM(${INVITE_OPEN}) AS invite_opens
    FROM ev WHERE test = ?3 AND day BETWEEN ?1 AND ?2 GROUP BY day`,
};
const addDay = (day, n) => new Date(Date.parse(day + "T12:00:00Z") + n * 864e5).toISOString().slice(0, 10);
export const KEYS = ["players", "new_players", "came_back", "invites_shared", "invite_opens", "new_from_invite"];
// One row per day from..to (newest first), zeros on quiet days, plus totals.
export function growthRows(players = [], invites = [], from, to) {
  const by = new Map();
  for (let d = to; d >= from; d = addDay(d, -1)) by.set(d, Object.fromEntries([["day", d], ...KEYS.map((k) => [k, 0])]));
  for (const r of [...players, ...invites]) { const row = by.get(r.day); if (row) for (const k of KEYS) if (r[k] != null) row[k] = Number(r[k]) || 0; }
  const days = [...by.values()];
  const total = Object.fromEntries(KEYS.map((k) => [k, days.reduce((a, r) => a + r[k], 0)]));
  return { from, to, days, total };
}
export async function growthFromD1(db, from, to, test) {
  const t = test ? 1 : 0;
  const [p, i] = await db.batch([db.prepare(GROWTH_SQL.players).bind(from, to, t), db.prepare(GROWTH_SQL.invites).bind(from, to, t)]);
  return growthRows(p.results || [], i.results || [], from, to);
}
