// GET /api/stats?view=growth[&from=..&to=..][&test=1] -> per day: new players, came back, invites shared / opened,
//   new players from an invite (lib/growth.js; default the last 14 ET days, max 31).
// GET /api/stats?from=YYYY-MM-DD&to=YYYY-MM-DD[&test=1]  (admin only: "authorization: Bearer <PITCH_ADMIN_KEY>")
//   -> funnel, drop-offs, session time, next-day return, friends brought, Pitch Night, time on each step (lib/funnel.js).
// POST /api/stats {op:"purge_tests"} -> deletes every test event (test = 1).
// Read-only on the anonymous events DB (binding EV). Wrong keys: 20 per IP hash per day, then 429. Nothing is logged.
import { json, sameOriginWrite } from "../../lib/guard.js";
import { funnelFromD1, DAY_RE } from "../../lib/funnel.js";
import { growthFromD1, GROWTH_DAYS, MAX_GROWTH_DAYS } from "../../lib/growth.js";
import { evLimit, etDayOf } from "./ev.js";

const MAX_DAYS = 31;
async function digest(s) { return new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(String(s)))); }
async function authed(request, env, context) {
  const want = env.PITCH_ADMIN_KEY;
  if (!want || want.length < 24) return json({ error: "not_configured" }, 503);
  if (!env.EV) return json({ error: "no_events_db" }, 503);
  const got = (request.headers.get("authorization") || "").replace(/^Bearer\s+/i, "");
  const [a, b] = await Promise.all([digest(got), digest(want)]);
  let diff = 0; for (let k = 0; k < a.length; k++) diff |= a[k] ^ b[k];
  if (got && diff === 0) return null;
  const limited = await evLimit(request, env, context, "sa:", 20, 100000);
  return json({ error: limited ? "limit" : "unauthorized" }, limited ? 429 : 401);
}
export async function onRequestGet(context) {
  const { request, env } = context;
  const denied = await authed(request, env, context); if (denied) return denied;
  const u = new URL(request.url);
  if (u.searchParams.get("view") === "growth") {
    const to = u.searchParams.get("to") || etDayOf(Date.now());
    const from = u.searchParams.get("from") || new Date(Date.parse(to + "T12:00:00Z") - (GROWTH_DAYS - 1) * 864e5).toISOString().slice(0, 10);
    if (!DAY_RE.test(from) || !DAY_RE.test(to) || from > to) return json({ error: "bad_range" }, 400);
    if ((Date.parse(to) - Date.parse(from)) / 864e5 + 1 > MAX_GROWTH_DAYS) return json({ error: "range_too_long", maxDays: MAX_GROWTH_DAYS }, 400);
    try { return json(await growthFromD1(env.EV, from, to, u.searchParams.get("test") === "1")); }
    catch (e) { return json({ error: "query_failed" }, 500); }
  }
  const from = u.searchParams.get("from") || "", to = u.searchParams.get("to") || "";
  if (!DAY_RE.test(from) || !DAY_RE.test(to) || from > to) return json({ error: "bad_range" }, 400);
  if ((Date.parse(to) - Date.parse(from)) / 864e5 + 1 > MAX_DAYS) return json({ error: "range_too_long", maxDays: MAX_DAYS }, 400);
  try { return json(await funnelFromD1(env.EV, from, to, u.searchParams.get("test") === "1")); }
  catch (e) { return json({ error: "query_failed" }, 500); }
}
export async function onRequestPost(context) {
  const { request, env } = context;
  if (!sameOriginWrite(request)) return json({ error: "forbidden" }, 403);
  const denied = await authed(request, env, context); if (denied) return denied;
  let b = {}; try { b = await request.json(); } catch (e) {}
  if (b.op !== "purge_tests") return json({ error: "bad_op" }, 400);
  const r = await env.EV.prepare("DELETE FROM ev WHERE test = 1").run();
  return json({ ok: true, deleted: (r.meta && r.meta.changes) || 0 });
}
