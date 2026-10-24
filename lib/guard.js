// Shared guards for the Pages Functions: origin check, JSON helper, and D1 daily rate limits (counters only).
// D1 table rl(k, n, exp) holds: "<scope>ip:<salted daily SHA-256 of IP>" and "<scope>g:<ET day>" counts. No kid content, no raw IPs.
export const HEADERS = { "content-type": "application/json; charset=utf-8", "cache-control": "no-store", "x-robots-tag": "noindex" };
export const json = (obj, status = 200) => new Response(JSON.stringify(obj), { status, headers: HEADERS });
// A fork accepts its own host only (https, or http on localhost). No shared allow-list.
function hostOrigin(request) {
  try { return new URL(request.url).origin; } catch (e) { return ""; }
}
function statedOrigin(request) {
  const o = request.headers.get("origin");
  if (o) return o;
  const r = request.headers.get("referer");
  if (!r) return "";
  try { return new URL(r).origin; } catch (e) { return ""; }
}
export function okOrigin(origin, request) {
  if (!origin) return false;
  let u;
  try { u = new URL(origin); } catch (e) { return false; }
  const here = new URL(request.url);
  if (u.host !== here.host) return false;
  if (u.protocol === "https:") return true;
  const local = here.hostname === "localhost" || here.hostname === "127.0.0.1";
  return u.protocol === "http:" && local;
}
export function allowedOrigin(request) {
  return okOrigin(statedOrigin(request), request);
}
// Constant-time compare for admin codes. Empty never matches.
export function same(a, b) {
  a = String(a || ""); b = String(b || "");
  if (!a || !b || a.length !== b.length) return false;
  let x = 0;
  for (let i = 0; i < a.length; i++) x |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return x === 0;
}

export const etDay = () => new Intl.DateTimeFormat("en-CA", { timeZone: "America/New_York", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
export async function ipHash(request, env, day) {
  const ip = request.headers.get("cf-connecting-ip") || "unknown";
  const data = new TextEncoder().encode((env.IP_SALT || "gks-speak") + "|" + day + "|" + ip);
  const h = new Uint8Array(await crypto.subtle.digest("SHA-256", data));
  return Array.from(h.slice(0, 16), (x) => x.toString(16).padStart(2, "0")).join("");
}
const BUMP = "INSERT INTO rl (k, n, exp) VALUES (?1, 1, ?2) ON CONFLICT(k) DO UPDATE SET n = n + 1 RETURNING n";

// scope "" = AI coaching notes, "t:" = transcriptions. Returns null when allowed, else a reason. Fails closed.
// Writes that change shared state (e.g. /api/duel): the browser's Origin must be present, allowed, and the same host the
// request went to (so a preview page can't write to production), and never a cross-site fetch.
export function sameOriginWrite(request) {
  const o = request.headers.get("origin");
  if (!o || !okOrigin(o, request) || o !== hostOrigin(request)) return false;
  const site = request.headers.get("sec-fetch-site");
  return !site || site === "same-origin";
}

export async function overLimit(request, env, ctx, scope, perIp, global) {
  if (!env.RL) return "no_counter";
  const day = etDay(), now = Math.floor(Date.now() / 1000);
  try {
    const ip = await env.RL.prepare(BUMP).bind(scope + "ip:" + (await ipHash(request, env, day)), now + 26 * 3600).first("n");
    if (ip > perIp) return "ip_limit";
    const g = await env.RL.prepare(BUMP).bind(scope + "g:" + day, now + 48 * 3600).first("n");
    if (g > global) return "global_limit";
    if (Math.random() < 0.05 && ctx && ctx.waitUntil) ctx.waitUntil(env.RL.prepare("DELETE FROM rl WHERE exp < ?1").bind(now).run().catch(() => {}));
    return null;
  } catch (e) { return "counter_error"; }
}

// Anonymous daily play totals. D1 table daily(day, event, n): one row per ET day per event, kept forever (aggregate only).
// No IDs, no IPs (not even hashed), no content, no user agent.
export const COUNT_EVENTS = ["visit", "challenge_started", "challenge_finished", "shared", "coach_heard", "coach_answered", "twist_done", "duel_done", "duel_sent", "duel_joined", "friend_done", "prep_used", "time_choice"];
// Bit i of pdaily.ev = COUNT_EVENTS[i]. APPEND ONLY: never reorder or remove (the report queries use these bit values).
export const EVENT_BIT = Object.fromEntries(COUNT_EVENTS.map((e, i) => [e, 1 << i]));
// Anonymous player/device ids from the app (random UUIDs) are never stored raw: salted SHA-256, first 16 bytes.
// Same secret as the IP hashes (IP_SALT) but a separate label, and no day in the input so next-day return can be counted.
export async function anonHash(env, label, id) {
  const data = new TextEncoder().encode((env.IP_SALT || "gks-speak") + "|" + label + "|" + id);
  const h = new Uint8Array(await crypto.subtle.digest("SHA-256", data));
  return Array.from(h.slice(0, 16), (x) => x.toString(16).padStart(2, "0")).join("");
}
export async function bumpDaily(env, event) {
  await env.RL.prepare("INSERT INTO daily (day, event, n) VALUES (?1, ?2, 1) ON CONFLICT(day, event) DO UPDATE SET n = n + 1").bind(etDay(), event).run();
}
