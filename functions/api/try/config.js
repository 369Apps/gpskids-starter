// GET /api/try/config -> { voice, sitekey, turnstile, maxSeconds }   preview, or prod when TRYNOW_ENABLED=1
import { json, tryOn, sitekey, turnstileMode, MAX_SECONDS, ev } from "../../../lib/trynow.js";
import { voiceOff } from "./_shared.js";
export const onRequestGet = async ({ request, env }) => {
  if (!tryOn(env, request)) return json({ voice: false, error: "preview_only" }, 403);
  return json({ voice: !(await voiceOff(env, request)), sitekey: sitekey(env), turnstile: turnstileMode(env), maxSeconds: MAX_SECONDS });
};
// POST /api/try/config {ev, prop}: anonymous event counter (no PII; names + tiny enum props only)
export const onRequestPost = async ({ request, env }) => {
  if (!tryOn(env, request)) return json({ ok: false }, 403);
  let b; try { b = await request.json(); } catch (e) { return json({ ok: false }, 400); }
  await ev(env, String(b && b.ev || ""), String(b && b.prop || "")); return json({ ok: true });
};
