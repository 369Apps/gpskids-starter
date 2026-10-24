// POST /api/vc/hear {text} -> audio/mpeg. Reads aloud ONLY the coach's own words (tips, opponent line). PREVIEW ONLY.
import { json, allowedOrigin, overLimit, isPreview, scrubText, logEngine, FALLBACK_TIPS, FALLBACK_LINES, AGAINST_TOPIC , vcOn, feat, engine, features } from "../../../lib/vcoach.js";
import { providerKey, httpBase } from "../../../lib/provider.js";
// Fixed lines (backup tips, backup challenger lines, topic nudge) are the same for every kid: cache their audio at the edge.
const FIXED = new Set([...Object.values(FALLBACK_TIPS).map((t) => t.join(" ")), ...FALLBACK_LINES, AGAINST_TOPIC]);
import { gate, add, cost, paused, addSpend } from "../../../lib/vcusage.js";
export async function onRequestPost(context) {
  const { request, env } = context;
  if (!vcOn(env, request) || !allowedOrigin(request)) return json({ error: "forbidden" }, 403);
  const g = await gate(env, request, 1); if (g instanceof Response) return g; // reading tips aloud is not counted, but needs minutes left
  let body; try { body = await request.json(); } catch (e) { return json({ error: "bad_json" }, 400); }
  const text = scrubText(body && body.text, 700);
  if (text.length < 2) return json({ error: "too_short" }, 422);
  if (await overLimit(request, env, context, "vh:", 80, 4000)) return json({ error: "limit" }, 429);
  const fixed = FIXED.has(text), ck = fixed ? new Request("https://vc-tts-cache.invalid/" + encodeURIComponent(text)) : null;
  if (fixed) { const hit = await caches.default.match(ck).catch(() => null); if (hit) { logEngine("tts", "cache"); return new Response(hit.body, { headers: { "content-type": "audio/mpeg", "cache-control": "no-store" } }); } }
  const store = (buf) => { if (fixed) context.waitUntil(caches.default.put(ck, new Response(buf.slice(0), { headers: { "content-type": "audio/mpeg", "cache-control": "public, max-age=2592000" } })).catch(() => {})); };
  const mp3 = (buf) => { store(buf); return mp3raw(buf); };
  const mp3raw = (buf) => new Response(buf, { headers: { "content-type": "audio/mpeg", "cache-control": "no-store", "x-robots-tag": "noindex" } });
  if (engine(env, request) === "voice" && httpBase(env) && providerKey(env) && !(await paused(env))) {
    try {
      const r = await fetch(httpBase(env) + "/tts", { method: "POST", headers: { Authorization: "Bearer " + providerKey(env), "content-type": "application/json" },
        body: JSON.stringify({ text, voice_id: env.AI_VOICE_ID || "eve", language: "en", output_format: { codec: "mp3" }, speed: 0.95 }) });
      if (r.ok) {
        const ct = r.headers.get("content-type") || "";
        const buf = ct.includes("json") ? Uint8Array.from(atob((await r.json()).audio), (c) => c.charCodeAt(0)).buffer : await r.arrayBuffer();
        if (buf.byteLength > 200) { logEngine("tts", "voice:tts"); await add(env, g.who, "hear", 0, null, { mode: "hear", cost: cost.hear(text.length) }).catch(() => {}); await addSpend(env, cost.hear(text.length)); return mp3(buf); }
      }
    } catch (e) {}
  }
  try {
    const out = await env.AI.run("@cf/deepgram/aura-1", { text, speaker: "asteria", encoding: "mp3" });
    const buf = out instanceof ReadableStream ? await new Response(out).arrayBuffer() : out && out.audio ? Uint8Array.from(atob(out.audio), (c) => c.charCodeAt(0)).buffer : out;
    if (buf && buf.byteLength > 200) { logEngine("tts", "workers-ai:aura-1"); return mp3(buf); }
  } catch (e) {}
  return json({ error: "tts_failed" }, 502); // the page then uses the phone's own voice
}
