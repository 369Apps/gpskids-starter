// POST /api/try/lead {email|phone, parent_name?, child_age_band?, goal?, consent:true, turnstile, utm}   web form fallback.  preview, or prod when TRYNOW_ENABLED=1
import { json, PLANS, validateLead, saveLead, ghlPush, ev, verifyTurnstile, hash, bump, day } from "../../../lib/trynow.js";
import { guard, body } from "./_shared.js";
export async function onRequestPost({ request, env, waitUntil }) {
  const g = guard(request, env); if (g) return g;
  const b = await body(request); if (!b) return json({ ok: false, error: "bad_json" }, 400);
  const ip = request.headers.get("cf-connecting-ip") || "unknown", ipH = await hash(day() + "|ip|" + ip, env);
  if ((await bump(env, "l:d:" + day() + ":" + ipH, 26 * 3600)) > 10) return json({ ok: false, error: "rate_limited" }, 429);
  if (!(await verifyTurnstile(env, b.turnstile, ip))) { await ev(env, "turnstile_failed"); return json({ ok: false, error: "turnstile_failed" }, 403); }
  const v = validateLead(b); if (!v.ok) return json(v, 400);
  const plan = PLANS.includes(b.plan) ? b.plan : "free"; // unknown plan values fall back to free, never a reject
  const id = await saveLead(env, null, v.lead, b.utm || {}, { adult: b.adult === true, ai: false, ip: ipH, plan });
  await ev(env, "lead_captured", (v.lead.child_age_band || "none") + ":" + (v.lead.email ? "e" : "") + (v.lead.phone ? "p" : ""));
  if (b.signup) await ev(env, "free_signup_completed");
  const checkout = b.checkout === true && plan !== "free";
  if (plan !== "free" && !checkout) await env.VCU.prepare("INSERT INTO td_callbacks (id,created_at,lead_id,reason,preferred_time) VALUES (?1,?2,?3,?4,NULL)").bind(crypto.randomUUID(), new Date().toISOString(), id, plan === "pro" ? "in_person_booking" : "question").run();
  const tags = checkout ? ["gpskids-checkout-started"] : plan !== "free" ? ["gpskids-callback-requested"] : [];
  if (checkout) { // GHL first (prod only; off on preview), but never hold the parent more than 4s before Stripe
    const push = ghlPush(env, id, tags).catch(() => "failed"); const r = await Promise.race([push, new Promise((ok) => setTimeout(() => ok("slow"), 4000))]);
    if (r === "slow") waitUntil(push); return json({ ok: true, lead_id: id, ghl: r });
  }
  waitUntil(ghlPush(env, id, tags)); return json({ ok: true, lead_id: id });
}
