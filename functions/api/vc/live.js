// POST /api/vc/live {band:"teen", parentOptIn:true, consent:true} -> { value, expires_at, model }  (Phase 2, PREVIEW ONLY)
// Mints a short-lived voice socket server-side. The API key never reaches the browser.
// Off unless env VC_LIVE = "1" AND a voice provider is configured AND ages 13 to 17 AND parent opt-in AND consent.
import { COACH_LABEL } from "../../../public/vc-config.js";
import { json, allowedOrigin, overLimit, isPreview, logEngine , feat } from "../../../lib/vcoach.js";
import { mintConnect, liveOn } from "../../../lib/provider.js";
import { ids, status, add, LIVE_MAX, paused, addSpend, cost, hasConsent, track } from "../../../lib/vcusage.js";
const INSTRUCTIONS = "You are " + COACH_LABEL + ", a friendly speaking coach and a friendly opponent in a game called Answer back, talking with a teen aged 13 to 17. " +
  "First listen to their short pitch, then give one kind tip, then ask one playful but fair challenge question about their idea and let them answer. Up to 3 rounds. " +
  "Always encouraging, never mean. Never ask for or repeat names, schools, ages, addresses or personal details. Never discuss politics, elections, government, wars, religion or faith, or grown-up topics; if they come up, kindly steer back to the pitch. Keep each turn under 25 words. Call yourself " + COACH_LABEL + ". If a child asks whether you are a real person, answer honestly that you are an AI coach, not a person. If a child seems unsafe or upset, say: Let's get a parent or trusted adult to join you.";
// live: usable now. ready=false with flag on means "coming soon" (no key yet), never a broken button.
export const onRequestGet = async ({ request, env }) => { const off = env.VCU ? await paused(env) : true; return json({ flag: feat(env, request, "VC_LIVE") && isPreview(request), paused: off, live: feat(env, request, "VC_LIVE") && liveOn(env) && isPreview(request) && !off }); };
export async function onRequestPost(context) {
  const { request, env } = context;
  if (!isPreview(request) || !allowedOrigin(request)) return json({ error: "forbidden" }, 403);
  if (env.VC_LIVE !== "1" || !liveOn(env)) return json({ error: "live_off" }, 503);
  let b; try { b = await request.json(); } catch (e) { return json({ error: "bad_json" }, 400); }
  if (!b || b.band !== "teen" || b.parentOptIn !== true || b.consent !== true) return json({ error: "not_allowed" }, 403);
  if (await overLimit(request, env, context, "vl:", 6, 300)) return json({ error: "limit" }, 429);
  if (!env.VCU) return json({ error: "usage_unavailable" }, 503);
  const who = ids(request); if (!who) return json({ error: "need_ids" }, 400);
  if (await paused(env)) return json({ error: "paused", message: "Live talk is resting today. Recorded Coach still works!" }, 503);
  if (!(await hasConsent(env, who))) return json({ error: "consent_needed" }, 412);
  // live is ages 13 to 17 with the parent's live opt-in saved on the server (not just the page's switch)
  if (!(await env.VCU.prepare("SELECT live_optin FROM vc_consent WHERE acct=?1 AND kid=?2").bind(who.acct, who.kid).first("live_optin"))) return json({ error: "need_live_optin" }, 403);
  const st = await status(env, who);
  // Fallback reconnect (tokens are single use): a fresh token for the same, already charged session, within 60 s.
  let resume = null;
  if (typeof b.sid === "string") {
    resume = await env.VCU.prepare("SELECT secs FROM vc_use WHERE sid=?1 AND acct=?2 AND kid=?3 AND kind='live' AND at > ?4").bind(b.sid, who.acct, who.kid, Math.floor(Date.now() / 1000) - 60).first();
    if (!resume) return json({ error: "bad_session" }, 403);
  }
  // Paid: 5 min per session within monthly + daily caps. Free: only the 3 min weekly taste.
  const allow = st.plan === "free" ? st.liveTasteSec : st.founding ? Math.min(st.liveLeftSec, LIVE_MAX) : Math.min(st.leftSec, LIVE_MAX);
  const maxSecs = resume ? Math.min(LIVE_MAX, resume.secs) : Math.min(LIVE_MAX, allow);
  if (!resume && maxSecs < 30) return json({ error: "out_of_minutes", resting: true, live: true, message: "Coach is resting. Ask your grown-up!", usage: st }, 402);
  const minted = await mintConnect(env, { seconds: maxSecs });
  if (!minted) return json({ error: "token_failed" }, 502);
  logEngine("live", "voice");
  // Charge the full allowance now; /api/vc/usage {sid, secs} lowers it to the real seconds at session end (never raises it).
  const sid = resume ? b.sid : crypto.randomUUID();
  if (!resume) { await add(env, who, "live", maxSecs, sid, { mode: st.plan === "free" ? "live-taste" : "live" }); await addSpend(env, cost.live(maxSecs)); if (st.plan === "free") await track(env, who, "taste_started"); } // spend counted at the max; refunded at end
  return json({ connect_url: minted.connect_url, voice: minted.voice, expires_at: minted.expires_at, instructions: INSTRUCTIONS, sid, maxSecs, taste: st.plan === "free" });
}
