// POST /api/transcribe  body = raw recorded audio (audio/mp4 from iPhone Safari, audio/webm from Chrome, ...)
// -> { text, words, model }   (text may be "" when nothing could be heard)
// Kid privacy: the audio is held in memory only for this request, sent to Workers AI Whisper, then dropped.
// Nothing is logged or stored (no console.log, no KV/R2, no AI Gateway); the response is no-store.
// The only storage is the D1 rate-limit counter (hashed IP + daily totals).
import { json, allowedOrigin, overLimit } from "../../lib/guard.js";

const MAX_BYTES = 8 * 1024 * 1024;   // ~8 MB (5:00 at the app's 32 kbps is ~1.3 MB; some phones record at a higher bitrate)
const MAX_SECONDS = 305;             // the app stops recording at 5:00 (whisper-large-v3-turbo handles 5:00 in one call, ~15 s)
const PER_IP_DAY = 30;               // transcriptions per IP per day (own cap; whisper is cheap, retries are common)
const GLOBAL_DAY = 5000;             // transcriptions per day, whole app
const TYPES = /^audio\/(mp4|m4a|x-m4a|aac|webm|ogg|wav|x-wav|wave|mpeg|mp3)$/;
const MODELS = ["@cf/openai/whisper-large-v3-turbo", "@cf/openai/whisper"];
// Whisper tends to "hear" these in silence or noise; treat them as nothing heard.
const PHANTOM = /^(thank you\.?|thanks for watching!?|you|bye\.?|\.+|\[.*\]|\(.*\)|music)$/i;

function b64(u8) {
  let s = "";
  for (let i = 0; i < u8.length; i += 0x8000) s += String.fromCharCode.apply(null, u8.subarray(i, i + 0x8000));
  return btoa(s);
}
function withTimeout(p, ms) { return Promise.race([p, new Promise((_, rej) => setTimeout(() => rej(new Error("timeout")), ms))]); }

export async function onRequestPost(context) {
  const { request, env } = context;
  if (!allowedOrigin(request)) return json({ error: "forbidden" }, 403);
  if (!env.AI) return json({ error: "ai_unavailable" }, 503);
  const type = (request.headers.get("content-type") || "").split(";")[0].trim().toLowerCase();
  if (!TYPES.test(type)) return json({ error: "bad_type" }, 415);
  const len = Number(request.headers.get("content-length") || 0);
  if (len > MAX_BYTES) return json({ error: "too_large", maxBytes: MAX_BYTES }, 413);
  const secs = Number(request.headers.get("x-seconds") || 0);
  if (secs > MAX_SECONDS) return json({ error: "too_long", maxSeconds: MAX_SECONDS }, 413);
  let u8 = new Uint8Array(await request.arrayBuffer());
  if (u8.length > MAX_BYTES) return json({ error: "too_large", maxBytes: MAX_BYTES }, 413);
  if (u8.length < 800) return json({ text: "", words: 0, error: "empty" });

  const limited = await overLimit(request, env, context, "t:", PER_IP_DAY, GLOBAL_DAY);
  if (limited) return json({ error: "limit", reason: limited, message: "The listening robot is resting for today." }, 429);

  for (const model of MODELS) {
    try {
      const input = model.endsWith("turbo")
        ? { audio: b64(u8), language: "en", vad_filter: true, condition_on_previous_text: false }
        : { audio: Array.from(u8) };
      const out = await withTimeout(env.AI.run(model, input), 25000 + Math.min(secs, MAX_SECONDS) * 150);
      let text = String((out && out.text) || "").replace(/\s+/g, " ").trim().slice(0, 6000);
      if (PHANTOM.test(text)) text = "";
      u8 = null; // drop the audio
      const words = text ? text.split(" ").length : 0;
      return json({ text, words, model, ...(text ? {} : { error: "empty" }) });
    } catch (e) { /* try the fallback model; never log audio or text */ }
  }
  u8 = null;
  return json({ error: "stt_failed" }, 502);
}
export function onRequestGet() { return json({ error: "method_not_allowed" }, 405); }
