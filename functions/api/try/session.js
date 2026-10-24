// POST /api/try/session {turnstile, adult:true, ai:true, device} -> {connect_url, expires_at, session_id, max_seconds, voice, instructions, tools}
// Order: gate flags, Turnstile, per-IP rate limits, 1 demo per device+IP per day, $50/day spend kill switch, then mint.
import { isPreview, json, ghlRetry, verifyTurnstile, hash, bump, ev, day, addSpend, est, MAX_SECONDS, TOKEN_TTL, INSTRUCTIONS, TOOLS, CONSENT_VERSION, RATE_PER_MIN } from "../../../lib/trynow.js";
import { mintConnect, liveOn } from "../../../lib/provider.js";
import { guard, body, voiceOff } from "./_shared.js";
export async function onRequestPost({ request, env, waitUntil }) {
  const g = guard(request, env); if (g) return g;
  const b = await body(request); if (!b) return json({ error: "bad_json" }, 400);
  if (b.adult !== true || b.ai !== true) return json({ error: "gate_required" }, 403);
  if (typeof b.device !== "string" || !/^[a-z0-9-]{8,64}$/.test(b.device)) return json({ error: "need_device" }, 400);
  const ip = request.headers.get("cf-connecting-ip") || "unknown";
  if (!(await verifyTurnstile(env, b.turnstile, ip))) { await ev(env, "turnstile_failed"); return json({ error: "turnstile_failed" }, 403); }
  const d = day(), ipH = await hash(d + "|ip|" + ip, env), devH = await hash(d + "|dev|" + b.device + "|" + (request.headers.get("user-agent") || ""), env);
  const hr = Math.floor(Date.now() / 3600000);
  const nH = await bump(env, "s:h:" + hr + ":" + ipH, 3700), nD = await bump(env, "s:d:" + d + ":" + ipH, 26 * 3600);
  const tst = env.EV_ENV === "preview" && isPreview(request) && request.headers.get("x-gks-test") === "count"; // preview test runs only: skip the per-IP and per-device limits
  if (!tst && (nH > 3 || nD > 20)) { await ev(env, "demo_limit_hit", "rate"); return json({ error: "rate_limited", message: "Too many tries. Come back later, or start free now." }, 429); }
  const used = await env.VCU.prepare("SELECT COUNT(*) n FROM td_sessions WHERE day=?1 AND (device_hash=?2 OR ip_hash=?3) AND seconds IS NOT NULL AND seconds >= 20").bind(d, devH, ipH).first("n");
  const open = await env.VCU.prepare("SELECT COUNT(*) n FROM td_sessions WHERE day=?1 AND (device_hash=?2 OR ip_hash=?3)").bind(d, devH, ipH).first("n");
  if (!tst && (used >= 1 || open >= 2)) { await ev(env, "demo_limit_hit", "device"); return json({ error: "device_limit", message: "Come back tomorrow, or start free now." }, 429); }
  if (await voiceOff(env, request)) { await ev(env, "demo_limit_hit", "spend"); return json({ error: "voice_paused", message: "Live demos are resting today. Try it free!" }, 503); }
  if (!liveOn(env)) return json({ error: "token_failed", message: "The AI Coach can't start right now. You can still start free." }, 503);
  const minted = await mintConnect(env, { seconds: TOKEN_TTL });
  if (!minted) return json({ error: "token_failed" }, 502);
  const sid = crypto.randomUUID(), now = Math.floor(Date.now() / 1000);
  await env.VCU.prepare("INSERT INTO td_sessions (id,started_at,started_ts,deadline_ts,device_hash,ip_hash,day,est_cost_cents) VALUES (?1,?2,?3,?4,?5,?6,?7,?8)")
    .bind(sid, new Date().toISOString(), now, now + MAX_SECONDS + 10, devH, ipH, d, est(MAX_SECONDS)).run();
  await env.VCU.prepare("INSERT INTO td_consents (id,created_at,session_id,adult_attested,ai_disclosure_ack,consent_text_version,ip_hash,user_agent_hash) VALUES (?1,?2,?3,1,1,?4,?5,?6)")
    .bind(crypto.randomUUID(), new Date().toISOString(), sid, CONSENT_VERSION, ipH, await hash("ua|" + (request.headers.get("user-agent") || ""), env)).run();
  await addSpend(env, (MAX_SECONDS / 60) * RATE_PER_MIN); // charged at the full cap (10 min) now; /end refunds unused seconds
  await ev(env, "demo_started"); waitUntil(ghlRetry(env));
  // preview only: a shorter cap for testing the clean 3-minute ending (prod always uses MAX_SECONDS)
  const cap = isPreview(request) && Number(b.test_cap) >= 20 ? Math.min(MAX_SECONDS, Math.floor(Number(b.test_cap))) : MAX_SECONDS;
  return json({ connect_url: minted.connect_url, voice: minted.voice, expires_at: minted.expires_at, session_id: sid, max_seconds: cap, instructions: INSTRUCTIONS, tools: TOOLS });
}
