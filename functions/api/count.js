// POST /api/count  body: {"e": <event>, "p": <player uuid>, "d": <device uuid>, "df": 0|1, "pf": 0|1, "nw": 0|1} -> 204
// Privacy: anonymous daily counts only.
//  - daily(day, event, n): per-ET-day totals, bumped once per DEVICE per day (df=1), exactly as before (old clients send only {e}).
//  - pdaily(day, p, d, ...): one row per PLAYER per day. p/d are salted SHA-256 hashes of random IDs made by the app
//    (no names, ages, IPs, user agents or content); raw IDs are never stored; rows are deleted after 40 days.
//  - daily(day, 'pfin', n): players who finished a challenge that day (bumped once per player per day, the first time pdaily
//    gets the challenge_finished bit; at most PFIN_IP_MAX per IP hash per day so nobody can pad it). Feeds the home-screen
//    "challenges finished" line (lib/proof.js).
// Test traffic: preview/branch hosts and x-gks-test are ignored, except x-gks-test: count, which writes to day "T<ET day>"
// (kept apart from real days, deleted after 2 days; accepted from preview hosts too) so the live checks can run without
// touching real numbers.
import { json, allowedOrigin, bumpDaily, COUNT_EVENTS, EVENT_BIT, anonHash, etDay, ipHash } from "../../lib/guard.js";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const NO = () => new Response(null, { status: 204, headers: { "cache-control": "no-store", "x-robots-tag": "noindex" } });
const UPSERT = "INSERT INTO pdaily (day, p, d, ev, friends, nw) VALUES (?1, ?2, ?3, ?4, ?5, ?6) " +
  "ON CONFLICT(day, p) DO UPDATE SET ev = ev | excluded.ev, friends = friends + excluded.friends, d = excluded.d, nw = MAX(nw, excluded.nw)";
export const KEEP_DAYS = 40;
export const PFIN_IP_MAX = 300;
const BUMP = "INSERT INTO rl (k, n, exp) VALUES (?1, 1, ?2) ON CONFLICT(k) DO UPDATE SET n = n + 1 RETURNING n";

export async function onRequestPost({ request, env, waitUntil }) {
  if (!allowedOrigin(request)) return json({ error: "forbidden" }, 403);
  // Only real production traffic counts: previews/branch URLs and test runs (x-gks-test header) are ignored.
  const host = new URL(request.url).hostname, test = request.headers.get("x-gks-test");
  const prodHost = /^(www\.)?gpskids\.app$|^gpskids-speak\.pages\.dev$/.test(host);
  if (test ? test !== "count" : !prodHost) return NO();
  if (!env.RL) return json({ error: "no_counter" }, 503);
  let b;
  try { const t = await request.text(); if (t.length > 340) return json({ error: "bad_request" }, 400); b = JSON.parse(t); } catch (x) { return json({ error: "bad_request" }, 400); }
  const e = b && b.e;
  if (!COUNT_EVENTS.includes(e)) return json({ error: "bad_event" }, 400);
  const day = (test === "count" ? "T" : "") + etDay();
  const hasIds = typeof b.p === "string" && UUID_RE.test(b.p) && typeof b.d === "string" && UUID_RE.test(b.d);
  try {
    // device-level total, as before (an old cached app sends only {e}: it already dedupes per device per day)
    if (!hasIds || b.df === 1 || e === "friend_done") {
      if (test === "count") await env.RL.prepare("INSERT INTO daily (day, event, n) VALUES (?1, ?2, 1) ON CONFLICT(day, event) DO UPDATE SET n = n + 1").bind(day, e).run();
      else await bumpDaily(env, e);
    }
    if (hasIds && (b.pf === 1 || e === "friend_done")) {
      const [p, d] = await Promise.all([anonHash(env, "player", b.p), anonHash(env, "device", b.d)]);
      // first finished challenge for this player today? (read before the upsert sets the bit)
      const firstFin = e === "challenge_finished" &&
        !((Number(await env.RL.prepare("SELECT ev FROM pdaily WHERE day = ?1 AND p = ?2").bind(day, p).first("ev")) || 0) & EVENT_BIT.challenge_finished);
      // friend_done: the server already credited the sender when the friend finished (functions/api/duel.js) unless the duel is older
      let fr = e === "friend_done" ? 1 : 0;
      if (fr && typeof b.x === "string" && /^[a-km-np-z2-9]{10}$/.test(b.x) && (await env.RL.prepare("SELECT 1 AS y FROM rl WHERE k = ?1").bind("duelc:" + b.x).first("y"))) fr = 0;
      await env.RL.prepare(UPSERT).bind(day, p, d, EVENT_BIT[e], fr, b.nw === 1 ? 1 : 0).run();
      if (firstFin) {
        const k = (test ? "t" : "") + "pf:ip:" + (await ipHash(request, env, etDay()));
        if ((await env.RL.prepare(BUMP).bind(k, Math.floor(Date.now() / 1000) + 26 * 3600).first("n")) <= PFIN_IP_MAX)
          await env.RL.prepare("INSERT INTO daily (day, event, n) VALUES (?1, 'pfin', 1) ON CONFLICT(day, event) DO UPDATE SET n = n + 1").bind(day).run();
      }
      if (Math.random() < 0.02 && waitUntil) waitUntil(cleanup(env).catch(() => {}));
    }
  } catch (x) { return json({ error: "counter_error" }, 500); }
  return NO();
}
export async function cleanup(env) {
  const now = new Date(etDay() + "T12:00:00Z");
  const cut = new Date(now.getTime() - KEEP_DAYS * 864e5).toISOString().slice(0, 10);
  const tcut = "T" + new Date(now.getTime() - 2 * 864e5).toISOString().slice(0, 10);
  await env.RL.prepare("DELETE FROM pdaily WHERE (day NOT LIKE 'T%' AND day < ?1) OR (day LIKE 'T%' AND day < ?2)").bind(cut, tcut).run();
  await env.RL.prepare("DELETE FROM daily WHERE day LIKE 'T%' AND day < ?1").bind(tcut).run();
}
export const onRequest = () => json({ error: "method_not_allowed" }, 405);
