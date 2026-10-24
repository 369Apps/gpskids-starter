// POST /api/try/end {session_id, seconds, reason} -> records real duration and refunds unused spend.   preview, or prod when TRYNOW_ENABLED=1
import { json, ev, day, est, MAX_SECONDS, RATE_PER_MIN } from "../../../lib/trynow.js";
import { guard, body, sidOk } from "./_shared.js";
const ENDS = ["completed", "time_limit", "no_adult", "safety", "user_left"];
export async function onRequestPost({ request, env }) {
  const g = guard(request, env); if (g) return g;
  const b = await body(request); if (!b || !sidOk(b.session_id)) return json({ ok: false }, 400);
  const s = await env.VCU.prepare("SELECT * FROM td_sessions WHERE id=?1").bind(b.session_id).first();
  if (!s || s.ended_at) return json({ ok: false, error: "no_open_session" }, 404);
  // seconds are the larger of what the page says and wall time since start (capped at 3 min), so nobody under-reports
  const wall = Math.floor(Date.now() / 1000) - s.started_ts, secs = Math.min(MAX_SECONDS, Math.max(0, Math.round(Number(b.seconds) || 0), Math.min(wall, MAX_SECONDS)));
  const reason = ENDS.includes(b.reason) ? b.reason : "user_left";
  await env.VCU.prepare("UPDATE td_sessions SET ended_at=?2, seconds=?3, end_reason=?4, est_cost_cents=?5 WHERE id=?1").bind(s.id, new Date().toISOString(), secs, reason, est(secs)).run();
  const refund = ((MAX_SECONDS - secs) / 60) * RATE_PER_MIN; // addSpend only adds, so refund here
  if (refund > 0) await env.VCU.prepare("UPDATE vc_spend SET usd = MAX(0, usd - ?2) WHERE day=?1").bind(day(), refund).run().catch(() => {});
  await ev(env, "demo_ended", reason); return json({ ok: true, seconds: secs });
}
