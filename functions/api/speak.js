// POST /api/speak  {text} -> audio/mpeg   Coach voice via Workers AI @cf/deepgram/aura-1 (PREVIEW A/B, behind ?voice=1).
// Input is ONLY the coach's own words (feedback note, follow-up question, reply), never the kid's audio or transcript.
// Scrubbed of digit runs/emails/URLs first. Nothing logged or stored; response is no-store. On any error the app falls
// back to the browser's built-in voice. Cost: $0.015 per 1k characters (Workers AI pricing, Oct 2026); max 700 chars/request.
import { json, allowedOrigin, overLimit } from "../../lib/guard.js";
import { voiceFlags, scrub } from "../../lib/voice.js";

const MODEL = "@cf/deepgram/aura-1";
export const MAX_CHARS = 700;
export const PER_IP_DAY = 40;    // ~4 clips per session; new users get aura-1 for their first 3 sessions only
export const GLOBAL_DAY = 1500;  // worst case 1,500 x 700 chars x $0.015/1k = about $15.75/day
const SPEAKERS = new Set(["asteria", "luna", "stella", "athena", "orion", "arcas"]);

export async function onRequestPost(context) {
  const { request, env } = context;
  if (!allowedOrigin(request)) return json({ error: "forbidden" }, 403);
  const f = await voiceFlags(env);
  if (!f.on || !f.neural) return json({ error: "voice_off" }, 503);
  if (Number(request.headers.get("content-length") || 0) > 4000) return json({ error: "too_large" }, 413);
  let body;
  try { body = await request.json(); } catch (e) { return json({ error: "bad_json" }, 400); }
  if (typeof body.text !== "string") return json({ error: "bad_request" }, 400);
  if (body.text.length > MAX_CHARS) return json({ error: "too_long", max: MAX_CHARS }, 413);
  const text = scrub(body.text);
  if (text.length < 2) return json({ error: "too_short" }, 422);
  const speaker = SPEAKERS.has(body.speaker) ? body.speaker : "asteria";

  const limited = await overLimit(request, env, context, "s:", PER_IP_DAY, GLOBAL_DAY);
  if (limited) return json({ error: "limit", reason: limited }, 429);
  try {
    const out = await Promise.race([env.AI.run(MODEL, { text, speaker, encoding: "mp3" }),
      new Promise((_, rej) => setTimeout(() => rej(new Error("timeout")), 15000))]);
    let buf;
    if (out instanceof ReadableStream) buf = await new Response(out).arrayBuffer();
    else if (out && typeof out.audio === "string") buf = Uint8Array.from(atob(out.audio), (c) => c.charCodeAt(0)).buffer;
    else if (out instanceof ArrayBuffer) buf = out;
    else if (out && out.body) buf = await new Response(out.body).arrayBuffer();
    if (!buf || buf.byteLength < 200) return json({ error: "tts_failed" }, 502);
    return new Response(buf, { headers: { "content-type": "audio/mpeg", "cache-control": "no-store", "x-robots-tag": "noindex" } });
  } catch (e) { return json({ error: "tts_failed" }, 502); }
}
export function onRequestGet() { return json({ error: "method_not_allowed" }, 405); }
