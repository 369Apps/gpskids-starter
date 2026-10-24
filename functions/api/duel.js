// "Challenge a friend" duels (PREVIEW, behind the voice switch in lib/voice.js).
// A duel row lives in the existing rl table (no new table, no schema change): k = "duel:<id>", exp = 7 days.
// n packs only scores and the prompt: sender stars (8 bits) | friend stars << 8 | done << 16 | band index << 17 | prompt index << 20.
// No names, no text, no audio, no device or IP ids are stored.
//   POST {op:"create", band, i, stars:[clarity,pace,confidence,structure]} -> {id}
//   GET  ?id=<id>                                                         -> {band, i, a:[4], done, b?:[4]}
//   POST {op:"finish", id, stars:[4]}                                     -> {band, i, a, b, done:true}  (409 if already done)
import { json, sameOriginWrite, overLimit, anonHash, etDay, EVENT_BIT } from "../../lib/guard.js";
// Friend credit (Oct 22 2026): the sender's anonymous player hash (same salted hash as pdaily) is kept next to the duel
// ("duelp:<id>:<mode>:<hash>", 7 days). When a friend finishes, the SENDER is credited right away in pdaily.friends
// (friends_brought), on the finish day, without waiting for the sender to reopen the app. "duelc:<id>" marks it credited
// so the sender's later friend_done count does not add it again. mode R = real (gpskids.app), T = test (x-gks-test: count).
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const PROD = /^(www\.)?gpskids\.app$|^gpskids-speak\.pages\.dev$/;
const countMode = (request) => { const t = request.headers.get("x-gks-test"), h = new URL(request.url).hostname; return t === "count" ? "T" : !t && PROD.test(h) ? "R" : null; };
const CREDIT = "INSERT INTO pdaily (day, p, d, ev, friends, nw) VALUES (?1, ?2, '', ?3, 1, 0) ON CONFLICT(day, p) DO UPDATE SET ev = ev | excluded.ev, friends = friends + 1";
async function creditSender(env, request, id, now) {
  const row = await env.RL.prepare("SELECT k FROM rl WHERE k LIKE ?1 AND exp > ?2 LIMIT 1").bind("duelp:" + id + ":%", now).first("k").catch(() => null);
  if (!row) return false;
  const [, , mode, p] = row.split(":"); if (!p || (mode !== "R" && mode !== "T")) return false;
  const day = (mode === "T" ? "T" : "") + etDay();
  await env.RL.batch([env.RL.prepare(CREDIT).bind(day, p, EVENT_BIT.friend_done), env.RL.prepare("INSERT OR IGNORE INTO rl (k, n, exp) VALUES (?1, 1, ?2)").bind("duelc:" + id, now + TTL),
    env.RL.prepare("DELETE FROM rl WHERE k = ?1").bind(row)]);
  return true;
}
import { voiceFlags } from "../../lib/voice.js";
import { ALL_BANDS } from "../../public/prompts.js";

export const BAND_KEYS = Object.keys(ALL_BANDS);
export const TTL = 7 * 24 * 3600;
const ID_RE = /^[a-km-np-z2-9]{10}$/;
const ALPHA = "abcdefghjkmnpqrstuvwxyz23456789";
const packStars = (s) => s.reduce((n, v, j) => n | (v << (2 * j)), 0);
const unpackStars = (n) => [0, 1, 2, 3].map((j) => (n >> (2 * j)) & 3);
export function pack({ a, b = [0, 0, 0, 0], done = false, band, i }) {
  return packStars(a) + packStars(b) * 256 + (done ? 65536 : 0) + BAND_KEYS.indexOf(band) * 131072 + i * 1048576;
}
export function unpack(n) {
  return { a: unpackStars(n & 255), b: unpackStars((n >> 8) & 255), done: !!(n & 65536), band: BAND_KEYS[(n >> 17) & 7], i: (n >> 20) & 127 };
}
const validStars = (s) => Array.isArray(s) && s.length === 4 && s.every((v) => Number.isInteger(v) && v >= 0 && v <= 3);
const newId = () => { const b = new Uint8Array(10); crypto.getRandomValues(b); return Array.from(b, (x) => ALPHA[x % ALPHA.length]).join(""); };
const view = (u) => (u.done ? { band: u.band, i: u.i, a: u.a, b: u.b, done: true } : { band: u.band, i: u.i, a: u.a, done: false });

export async function onRequestGet({ request, env, ctx }) {
  if (!(await voiceFlags(env)).on) return json({ error: "off" }, 503);
  const id = new URL(request.url).searchParams.get("id") || "";
  if (!ID_RE.test(id)) return json({ error: "bad_id" }, 400);
  if (await overLimit(request, env, ctx, "dg:", 300, 100000)) return json({ error: "rate_limited" }, 429);
  const now = Math.floor(Date.now() / 1000);
  const n = await env.RL.prepare("SELECT n FROM rl WHERE k = ?1 AND exp > ?2").bind("duel:" + id, now).first("n").catch(() => null);
  if (n === null || n === undefined) return json({ error: "not_found" }, 404);
  return json(view(unpack(n)));
}

export async function onRequestPost({ request, env, ctx }) {
  if (!sameOriginWrite(request)) return json({ error: "forbidden" }, 403);
  if (!(await voiceFlags(env)).on) return json({ error: "off" }, 503);
  if (Number(request.headers.get("content-length") || 0) > 500) return json({ error: "too_large" }, 413);
  let body; try { body = await request.json(); } catch (e) { return json({ error: "bad_json" }, 400); }
  const now = Math.floor(Date.now() / 1000);
  if (body && body.op === "create") {
    const band = String(body.band || ""), i = body.i;
    if (!ALL_BANDS[band] || !Number.isInteger(i) || i < 0 || i > 127 || !validStars(body.stars)) return json({ error: "bad_input" }, 400);
    if (await overLimit(request, env, ctx, "dc:", 20, 5000)) return json({ error: "rate_limited" }, 429);
    const id = newId();
    try { await env.RL.prepare("INSERT INTO rl (k, n, exp) VALUES (?1, ?2, ?3)").bind("duel:" + id, pack({ a: body.stars, band, i }), now + TTL).run(); }
    catch (e) { return json({ error: "store_failed" }, 502); }
    const mode = countMode(request);
    if (mode && typeof body.p === "string" && UUID_RE.test(body.p)) {
      try { await env.RL.prepare("INSERT INTO rl (k, n, exp) VALUES (?1, 0, ?2)").bind("duelp:" + id + ":" + mode + ":" + (await anonHash(env, "player", body.p)), now + TTL).run(); } catch (e) {}
    }
    return json({ id });
  }
  if (body && body.op === "finish") {
    const id = String(body.id || "");
    if (!ID_RE.test(id) || !validStars(body.stars)) return json({ error: "bad_input" }, 400);
    if (await overLimit(request, env, ctx, "df:", 30, 10000)) return json({ error: "rate_limited" }, 429);
    const k = "duel:" + id;
    const n = await env.RL.prepare("SELECT n FROM rl WHERE k = ?1 AND exp > ?2").bind(k, now).first("n").catch(() => null);
    if (n === null || n === undefined) return json({ error: "not_found" }, 404);
    const u = unpack(n);
    if (u.done) return json({ error: "already_done", ...view(u) }, 409);
    const next = pack({ ...u, b: body.stars, done: true });
    // only the first finisher wins the row (atomic: the WHERE re-checks the old value)
    const w = await env.RL.prepare("UPDATE rl SET n = ?1 WHERE k = ?2 AND n = ?3 RETURNING n").bind(next, k, n).first("n").catch(() => null);
    if (w === null || w === undefined) return json({ error: "already_done" }, 409);
    let credited = false; try { credited = await creditSender(env, request, id, now); } catch (e) {}
    return json({ ...view(unpack(w)), credited });
  }
  return json({ error: "bad_op" }, 400);
}
