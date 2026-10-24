// POST /api/live  body: {"p": <player uuid>, "k": 1|0}  -> 204
// "Kids playing right now" presence for the home screen (lib/proof.js). Stores ONE rl row per player:
// "live:<salted SHA-256 of the player's random anonymous ID, label 'live'>", n = 1 (kid age group) or 0 (Grown-ups),
// expiring 5 minutes after the last ping. No names, ages, IPs, user agents or content; rows are swept after they expire.
// The app pings at most every 2 minutes while a player is on the home screen or doing a challenge.
// Anti-padding: at most 60 pings per IP hash per 5 minutes (extra pings are dropped).
// Test traffic: preview hosts and x-gks-test are ignored, except x-gks-test: count, which writes "tlive:" rows (any allowed host).
import { json, allowedOrigin, anonHash, ipHash, etDay } from "../../lib/guard.js";
import { LIVE_TTL } from "../../lib/proof.js";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
export const IP_MAX = 60;
const NO = () => new Response(null, { status: 204, headers: { "cache-control": "no-store", "x-robots-tag": "noindex" } });
const BUMP = "INSERT INTO rl (k, n, exp) VALUES (?1, 1, ?2) ON CONFLICT(k) DO UPDATE SET n = n + 1 RETURNING n";

export async function onRequestPost({ request, env, waitUntil }) {
  if (!allowedOrigin(request)) return json({ error: "forbidden" }, 403);
  const host = new URL(request.url).hostname, test = request.headers.get("x-gks-test");
  const prodHost = /^(www\.)?gpskids\.app$|^gpskids-speak\.pages\.dev$/.test(host);
  if (test ? test !== "count" : !prodHost) return NO();
  if (!env.RL) return json({ error: "no_counter" }, 503);
  let b;
  try { const t = await request.text(); if (t.length > 200) return json({ error: "bad_request" }, 400); b = JSON.parse(t); } catch (x) { return json({ error: "bad_request" }, 400); }
  if (!b || typeof b.p !== "string" || !UUID_RE.test(b.p) || (b.k !== 0 && b.k !== 1)) return json({ error: "bad_request" }, 400);
  const now = Math.floor(Date.now() / 1000), pre = test ? "tlive" : "live";
  try {
    const slot = Math.floor(now / 300);
    const n = await env.RL.prepare(BUMP).bind((test ? "t" : "") + "lv:ip:" + (await ipHash(request, env, etDay())) + ":" + slot, now + 600).first("n");
    if (n > IP_MAX) return NO();
    await env.RL.prepare("INSERT INTO rl (k, n, exp) VALUES (?1, ?2, ?3) ON CONFLICT(k) DO UPDATE SET n = excluded.n, exp = excluded.exp")
      .bind(pre + ":" + (await anonHash(env, "live", b.p)), b.k, now + LIVE_TTL).run();
    if (Math.random() < 0.05 && waitUntil) waitUntil(env.RL.prepare("DELETE FROM rl WHERE exp < ?1").bind(now).run().catch(() => {}));
  } catch (x) { return json({ error: "counter_error" }, 500); }
  return NO();
}
export const onRequest = () => json({ error: "method_not_allowed" }, 405);
