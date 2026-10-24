// GET /api/proof -> { story: {n, w: "today"|"week"|"all"} | null, live: <kids playing right now> | null }
// Home-screen social proof (lib/proof.js). One small response, edge-cached for 60 s per data center (Cache API) and 60 s in
// the browser, so page loads don't hit D1. Real counts only; below the thresholds the field is null and the app shows nothing.
// Test mode (x-gks-test: count): reads only test data (T days, tlive rows), never cached.
import { proof } from "../../lib/proof.js";

const H = (cc, src) => ({ "content-type": "application/json; charset=utf-8", "cache-control": cc, "x-robots-tag": "noindex", "x-proof-cache": src });
export const MAX_AGE = 60;

export async function onRequestGet({ request, env, waitUntil }) {
  const test = request.headers.get("x-gks-test") === "count";
  const cache = !test && typeof caches !== "undefined" ? caches.default : null;
  const key = new Request(new URL("/api/proof", request.url).toString(), { method: "GET" });
  if (cache) { try { const hit = await cache.match(key); if (hit) return hit; } catch (e) {} }
  let body = { story: null, live: null }, ok = true;
  if (env.RL) { try { body = await proof(env, { test }); } catch (e) { ok = false; } } else ok = false;
  if (test) return new Response(JSON.stringify(body), { headers: H("no-store", "test") });
  // On a D1 error: show nothing, cache briefly (so a hiccup doesn't hammer D1, and clears fast).
  const age = ok ? MAX_AGE : 15;
  const res = new Response(JSON.stringify(body), { headers: H(`public, max-age=${age}`, "miss") });
  if (cache) {
    const put = cache.put(key, new Response(JSON.stringify(body), { headers: H(`public, max-age=${age}, s-maxage=${age}`, "hit") })).catch(() => {});
    if (waitUntil) waitUntil(put); else await put;
  }
  return res;
}
export const onRequestPost = () => new Response(JSON.stringify({ error: "method_not_allowed" }), { status: 405, headers: H("no-store", "none") });
