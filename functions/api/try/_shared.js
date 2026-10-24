import { json, tryOn, xaiKey, allowedOrigin, spendCap, spendToday } from "../../../lib/trynow.js";
export const cap = (env) => { const n = Number(env.DAILY_VOICE_CAP_USD); return Number.isFinite(n) && n > 0 ? n : spendCap(env); };
export const voiceOff = async (env, request) => !env.VCU || env.TRY_VOICE === "0" || !xaiKey(env, request) || (await spendToday(env)) >= cap(env);
// preview host (or prod with TRYNOW_ENABLED=1) + allowed origin + D1, or refuse.
export function guard(request, env) {
  if (!tryOn(env, request) || !allowedOrigin(request)) return json({ error: "forbidden" }, 403);
  if (!env.VCU) return json({ error: "unavailable" }, 503);
  return null;
}
export async function body(request) { try { const t = await request.text(); if (t.length > 8000) return null; return JSON.parse(t); } catch (e) { return null; } }
export const sidOk = (s) => typeof s === "string" && /^[0-9a-f-]{36}$/.test(s);
