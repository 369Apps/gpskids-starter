// Home-screen social proof (GET /api/proof). Real counts only, never padded; nothing is shown below the thresholds.
//  - Challenges finished: per ET day, MAX(daily 'challenge_finished' (once per DEVICE per day), daily 'pfin' (once per PLAYER
//    per day, bumped by /api/count the first time a player finishes that day)). Both are LOWER bounds of the real number of
//    finished challenges (a kid who finishes 3 in a day counts once), so the line can only under-state.
//    Window: today if >= cfg:proof_today_min (default 300), else the last 7 ET days if >= cfg:proof_min (default 50),
//    else all-time if >= cfg:proof_min, else nothing.
//  - Kids playing right now: rl rows "live:<salted hash of the player's random ID>" (n = 1 kid band, 0 Grown-ups) written by
//    /api/live, each expiring 5 minutes after the player's last ping. Only kid rows count. Shown only when >= cfg:live_min (default 25).
//  - Kill switch: rl row cfg:proof_off -> both lines off (within the 60 s edge cache).
//  - Test traffic (x-gks-test: count) lives in "T<day>" days and "tlive:" rows: excluded from the real numbers; test mode
//    reads ONLY those. Preview hosts never write real rows (see count.js / live.js).
import { etDay } from "./guard.js";

export const DEFAULTS = { min: 50, todayMin: 300, liveMin: 25 };
export const LIVE_TTL = 300; // seconds a player stays "playing right now" after the last ping
const CFG_KEYS = ["cfg:proof_off", "cfg:proof_min", "cfg:proof_today_min", "cfg:live_min"];
const posInt = (v, d) => (Number.isInteger(v) && v > 0 ? v : d);

export async function proofCfg(env) {
  const r = await env.RL.prepare(`SELECT k, n FROM rl WHERE k IN (${CFG_KEYS.map(() => "?").join(",")})`).bind(...CFG_KEYS).all();
  const m = Object.fromEntries(((r && r.results) || []).map((x) => [x.k, Number(x.n)]));
  return { off: "cfg:proof_off" in m, min: posInt(m["cfg:proof_min"], DEFAULTS.min),
    todayMin: posInt(m["cfg:proof_today_min"], DEFAULTS.todayMin), liveMin: posInt(m["cfg:live_min"], DEFAULTS.liveMin) };
}
export const dayMinus = (day, n) => new Date(new Date(day + "T12:00:00Z").getTime() - n * 864e5).toISOString().slice(0, 10);
const PER_DAY = "SELECT day, MAX(n) AS m FROM daily WHERE event IN ('challenge_finished', 'pfin') AND day >= ?1 AND day <= ?2 GROUP BY day";

// Finished-challenge totals: { today, week, all } (all only computed when the week is too small to show).
export async function storyCounts(env, { test = false, day = etDay(), cfg = DEFAULTS } = {}) {
  const pre = test ? "T" : "";
  const r = await env.RL.prepare(PER_DAY).bind(pre + dayMinus(day, 6), pre + day).all();
  const rows = (r && r.results) || [];
  const today = rows.filter((x) => x.day === pre + day).reduce((a, x) => a + x.m, 0);
  const week = rows.reduce((a, x) => a + x.m, 0);
  let all = week;
  if (today < cfg.todayMin && week < cfg.min) {
    // real days look like "2026-10-07"; test days "T2026-10-07": the range keeps the two apart
    const a = await env.RL.prepare(`SELECT COALESCE(SUM(m), 0) AS s FROM (${PER_DAY})`).bind(pre + "2000-01-01", pre + day).first("s");
    all = Number(a) || 0;
  }
  return { today, week, all };
}
export function pickStory(c, cfg = DEFAULTS) {
  if (c.today >= cfg.todayMin) return { n: c.today, w: "today" };
  if (c.week >= cfg.min) return { n: c.week, w: "week" };
  if (c.all >= cfg.min) return { n: c.all, w: "all" };
  return null;
}
export async function liveCount(env, { test = false, now = Math.floor(Date.now() / 1000) } = {}) {
  const pre = test ? "tlive" : "live";
  const c = await env.RL.prepare("SELECT COUNT(*) AS c FROM rl WHERE k >= ?1 AND k < ?2 AND exp > ?3 AND n = 1").bind(pre + ":", pre + ";", now).first("c");
  return Number(c) || 0;
}
// The public payload: { story: {n, w} | null, live: n | null }. Numbers under the thresholds are never sent.
export async function proof(env, { test = false, day, now } = {}) {
  const cfg = await proofCfg(env);
  if (cfg.off) return { story: null, live: null };
  const [c, l] = await Promise.all([storyCounts(env, { test, day, cfg }), liveCount(env, { test, now })]);
  return { story: pickStory(c, cfg), live: l >= cfg.liveMin ? l : null };
}
