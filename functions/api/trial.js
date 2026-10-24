// POST /api/trial  JSON { parent, phone, kid, age, day, website (must be empty), ms (time on the form) }
//   -> { ok: true }  |  { error, fields? }
// Book a free trial class. Saves the booking in D1 (env.PITCH, table trial_requests) FIRST, so nothing is lost, then, when
// the GPS Kids HQ GoHighLevel secrets are set (GHL_API_KEY = a private integration token, GHL_LOCATION_ID), creates or
// updates the contact there with the tag "trial-class" and a note with the age band and day. Never a child's name.
// Spam: same-origin only, hidden honeypot box, 3-second minimum, and a per-IP daily limit (lib/guard.js, scope "tr:").
// The same phone booking again within a day updates the same row instead of adding a new one. Nothing is logged.
// GET /api/trial (authorization: Bearer <PITCH_ADMIN_KEY>) -> { requests: [...] } newest first (test rows only with ?test=1).
import { json, sameOriginWrite, overLimit } from "../../lib/guard.js";
import { checkTrial, looksLikeBot, DAYS, PLACE } from "../../public/trial.js";

export const PER_IP_DAY = 6;      // a family fixing a typo, or two kids
export const GLOBAL_DAY = 500;
const GHL = "https://services.leadconnectorhq.com";
const rid = () => Array.from(crypto.getRandomValues(new Uint8Array(12)), (x) => x.toString(16).padStart(2, "0")).join("");

async function toGhl(env, v) {
  if (!env.GHL_API_KEY || !env.GHL_LOCATION_ID) return { status: "pending" };
  const H = { authorization: "Bearer " + env.GHL_API_KEY, version: "2021-07-28", "content-type": "application/json", accept: "application/json" };
  const parts = v.parent.split(" "), firstName = parts.shift(), lastName = parts.join(" ");
  try {
    const r = await fetch(GHL + "/contacts/upsert", { method: "POST", headers: H, body: JSON.stringify({
      locationId: env.GHL_LOCATION_ID, firstName, lastName, name: v.parent, phone: v.phone, source: "gps kids free trial form" }) });
    if (!r.ok) return { status: "error" };
    const id = (((await r.json()) || {}).contact || {}).id;
    if (!id) return { status: "error" };
    await fetch(GHL + `/contacts/${id}/tags`, { method: "POST", headers: H, body: JSON.stringify({ tags: ["trial-class"] }) });
    await fetch(GHL + `/contacts/${id}/notes`, { method: "POST", headers: H, body: JSON.stringify({
      body: `Free trial class request\nAge band: ${v.age}\nDay: ${DAYS[v.day]}${PLACE ? "\nPlace: " + PLACE : ""}` }) });
    return { status: "sent", id };
  } catch (e) { return { status: "error" }; }
}

export async function onRequestPost(context) {
  const { request, env } = context;
  if (!sameOriginWrite(request)) return json({ error: "forbidden" }, 403);
  if (!env.PITCH) return json({ error: "not_open" }, 503);
  if (Number(request.headers.get("content-length") || 0) > 4000) return json({ error: "too_large" }, 413);
  let f;
  try { f = await request.json(); } catch (e) { return json({ error: "bad_request" }, 400); }
  if (!f || typeof f !== "object") return json({ error: "bad_request" }, 400);
  if (looksLikeBot(f)) return json({ ok: true }); // looks fine to a bot, saves nothing
  const c = checkTrial(f);
  if (!c.ok) return json({ error: "invalid", fields: c.errors }, 400);
  const test = request.headers.get("x-gks-test") ? 1 : 0;
  // automated test runs on a preview branch (own preview DB) skip the per-IP limit so the suites can run again and again
  const previewTest = test && env.EV_ENV === "preview" && /\.gpskids-speak\.pages\.dev$/.test(new URL(request.url).hostname);
  const limited = previewTest ? null : await overLimit(request, env, context, "tr:", PER_IP_DAY, GLOBAL_DAY);
  if (limited) return json({ error: "limit" }, 429);
  const v = c.v, now = Date.now();
  try {
    const old = await env.PITCH.prepare("SELECT id FROM trial_requests WHERE phone = ?1 AND created > ?2 ORDER BY created DESC LIMIT 1").bind(v.phone, now - 864e5).first();
    const id = old ? old.id : rid();
    await env.PITCH.prepare("INSERT INTO trial_requests (id, parent, phone, kid, age, day, ghl, test, created) VALUES (?1, ?2, ?3, ?4, ?5, ?6, 'pending', ?7, ?8) " +
      "ON CONFLICT(id) DO UPDATE SET parent = excluded.parent, kid = '', age = excluded.age, day = excluded.day, ghl = 'pending', test = MAX(trial_requests.test, excluded.test)")
      .bind(id, v.parent, v.phone, "", v.age, v.day, test, now).run();
    // automated tests never reach GHL unless the one-off live check asks for it (x-gks-test: ghl)
    const g = test && request.headers.get("x-gks-test") !== "ghl" ? { status: "pending" } : await toGhl(env, v);
    if (g.status !== "pending") await env.PITCH.prepare("UPDATE trial_requests SET ghl = ?1, ghl_id = ?2 WHERE id = ?3").bind(g.status, g.id || null, id).run().catch(() => {});
    return json({ ok: true });
  } catch (e) { return json({ error: "store_error" }, 500); }
}

async function digest(s) { return new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(String(s)))); }
export async function onRequestGet(context) {
  const { request, env } = context;
  const want = env.PITCH_ADMIN_KEY;
  if (!want || want.length < 24 || !env.PITCH) return json({ error: "not_configured" }, 503);
  const got = (request.headers.get("authorization") || "").replace(/^Bearer\s+/i, "");
  const [a, b] = await Promise.all([digest(got), digest(want)]);
  let diff = 0; for (let k = 0; k < a.length; k++) diff |= a[k] ^ b[k];
  if (!got || diff !== 0) {
    const limited = await overLimit(request, env, context, "pa:", 20, 100000);
    return json({ error: limited ? "limit" : "unauthorized" }, limited ? 429 : 401);
  }
  const test = new URL(request.url).searchParams.get("test") === "1";
  const r = await env.PITCH.prepare(`SELECT id, parent, phone, kid, age, day, ghl, test, created FROM trial_requests ${test ? "" : "WHERE test = 0 "}ORDER BY created DESC LIMIT 500`).all();
  return json({ requests: r.results || [] });
}
