// POST /api/ev  -> anonymous first-party usage events (batched by the app with sendBeacon / fetch keepalive).
// body: {"sid": <session uuid>, "p": <player uuid>, "d": <device uuid>, "now": <phone clock ms>, "e": [[n, step, t, v, k, x], ...]}
// Stored in D1 binding EV (table ev): salted SHA-256 hashes of the random ids (never the raw ids), the step, its time,
// a small number v and a short code k from public/steps.js, and for duel steps a hashed duel link id. No names, emails,
// phones, ages, transcripts, audio, IPs or user agents. Real rows are deleted after 60 days, test rows after 2.
// Who can write: real traffic only from the production hosts into the production DB; test traffic only with
// x-gks-test: count (stored as test = 1, excluded from the numbers). Preview hosts never write into production data:
// previews are bound to their own DB (wrangler.toml [env.preview]) and EV_ENV = "preview" refuses real traffic there,
// while EV_ENV = "production" refuses every non-production host.
// Caps: 12 KB / 50 events per batch, 3000 events per session, 3000 batches per IP hash per day, 1M batches per day.
import { json, sameOriginWrite, anonHash, ipHash, etDay } from "../../lib/guard.js";
import { STEPS, kOk, DUEL_STEPS, MAX_BATCH, MAX_BYTES, MAX_N, MAX_AGE_MS, DUEL_ID_RE, UUID_RE } from "../../public/steps.js";

export const KEEP_DAYS = 60, TEST_KEEP_DAYS = 2, PER_IP_DAY = 3000, GLOBAL_DAY = 1000000;
const PROD_HOST = /^((www|speak)\.)?gpskids\.app$|^gpskids-speak\.pages\.dev$/;
const NO = (status = 204) => new Response(null, { status, headers: { "cache-control": "no-store", "x-robots-tag": "noindex" } });
const ET = new Intl.DateTimeFormat("en-CA", { timeZone: "America/New_York", year: "numeric", month: "2-digit", day: "2-digit" });
export const etDayOf = (ms) => ET.format(new Date(ms));
const BUMP = "INSERT INTO evrl (k, n, exp) VALUES (?1, 1, ?2) ON CONFLICT(k) DO UPDATE SET n = n + 1 RETURNING n";

// Same pattern as lib/guard.js overLimit, but the counters live in the events DB itself (so a preview never touches production).
export async function evLimit(request, env, ctx, scope, perIp, global) {
  const day = etDay(), now = Math.floor(Date.now() / 1000);
  try {
    if ((await env.EV.prepare(BUMP).bind(scope + "ip:" + (await ipHash(request, env, day)), now + 26 * 3600).first("n")) > perIp) return "ip_limit";
    if ((await env.EV.prepare(BUMP).bind(scope + "g:" + day, now + 48 * 3600).first("n")) > global) return "global_limit";
    return null;
  } catch (e) { return "counter_error"; }
}
export function writeMode(request, env) {
  const host = new URL(request.url).hostname, test = request.headers.get("x-gks-test"), prod = PROD_HOST.test(host);
  if (env.EV_ENV === "selfhost") return test ? (test === "count" ? 1 : null) : 0;
  if (test) return test === "count" ? (env.EV_ENV === "production" && !prod ? null : 1) : null;
  if (!prod || env.EV_ENV !== "production") return null;
  return 0;
}
// Validates one batch. Returns { rows } (unhashed) or { error }.
export function cleanBatch(b, serverNow = Date.now()) {
  if (!b || typeof b !== "object") return { error: "bad_request" };
  if (![b.sid, b.p, b.d].every((x) => typeof x === "string" && UUID_RE.test(x))) return { error: "bad_ids" };
  if (!Number.isFinite(b.now) || !Array.isArray(b.e) || !b.e.length || b.e.length > MAX_BATCH) return { error: "bad_events" };
  const rows = [];
  for (const a of b.e) {
    if (!Array.isArray(a)) continue;
    const [n, step, t, v, k, x] = a;
    if (!Number.isInteger(n) || n < 0 || n > MAX_N) continue;
    if (typeof step !== "string" || !Object.prototype.hasOwnProperty.call(STEPS, step)) continue;
    if (!Number.isFinite(t)) continue;
    const age = b.now - t;                       // how long ago on the phone's own clock (immune to a wrong phone clock)
    if (age < -5000 || age > MAX_AGE_MS) continue;
    if (k != null && !kOk(step, k)) continue;
    const ts = Math.round(serverNow - Math.max(0, age));
    const vv = v == null || !Number.isFinite(v) ? null : Math.max(-1, Math.min(1e6, Math.round(v)));
    const xx = DUEL_STEPS.has(step) && typeof x === "string" && DUEL_ID_RE.test(x) ? x : null;
    rows.push({ n, step, ts, v: vv, k: k == null ? null : k, x: xx });
  }
  return rows.length ? { rows } : { error: "no_valid_events" };
}
export async function onRequestPost(context) {
  const { request, env } = context;
  if (!sameOriginWrite(request)) return json({ error: "forbidden" }, 403);
  const test = writeMode(request, env);
  if (test === null || !env.EV) return NO();
  if (Number(request.headers.get("content-length") || 0) > MAX_BYTES) return json({ error: "too_large" }, 413);
  let b;
  try { const t = await request.text(); if (t.length > MAX_BYTES) return json({ error: "too_large" }, 413); b = JSON.parse(t); } catch (x) { return json({ error: "bad_request" }, 400); }
  const c = cleanBatch(b);
  if (c.error) return json({ error: c.error }, 400);
  const limited = await evLimit(request, env, context, test ? "tev:" : "ev:", PER_IP_DAY, GLOBAL_DAY);
  if (limited) return json({ error: "limit", reason: limited }, 429);
  const [sid, p, d] = await Promise.all([anonHash(env, "session", b.sid), anonHash(env, "player", b.p), anonHash(env, "device", b.d)]);
  const xs = new Map();
  for (const r of c.rows) if (r.x && !xs.has(r.x)) xs.set(r.x, await anonHash(env, "duel", r.x));
  const ins = env.EV.prepare("INSERT OR IGNORE INTO ev (day, test, sid, n, ts, p, d, step, v, k, x) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11)");
  try {
    await env.EV.batch(c.rows.map((r) => ins.bind(etDayOf(r.ts), test, sid, r.n, r.ts, p, d, r.step, r.v, r.k, r.x ? xs.get(r.x) : null)));
  } catch (x) { return json({ error: "store_error" }, 500); }
  if (Math.random() < 0.02 && context.waitUntil) context.waitUntil(cleanup(env).catch(() => {}));
  return json({ ok: true, stored: c.rows.length });
}
export async function cleanup(env) {
  const today = etDay(), cut = (n) => new Date(Date.parse(today + "T12:00:00Z") - n * 864e5).toISOString().slice(0, 10);
  await env.EV.batch([
    env.EV.prepare("DELETE FROM ev WHERE test = 0 AND day < ?1").bind(cut(KEEP_DAYS)),
    env.EV.prepare("DELETE FROM ev WHERE test = 1 AND day < ?1").bind(cut(TEST_KEEP_DAYS)),
    env.EV.prepare("DELETE FROM evrl WHERE exp < ?1").bind(Math.floor(Date.now() / 1000)),
  ]);
}
export const onRequest = () => json({ error: "method_not_allowed" }, 405);
