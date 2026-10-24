// GET  /api/vc/usage            -> minutes left for this parent account + child profile (headers x-acct, x-kid)
// POST /api/vc/usage {sid,secs} -> live session ended: store the real seconds (only ever lowers the amount charged at mint)
// POST /api/vc/usage {plan}     -> PREVIEW-ONLY test-plan switch (there is no real parent login or checkout in preview)
import { json, allowedOrigin, isPreview , vcOn, feat, engine, features } from "../../../lib/vcoach.js";
import { ids, status, PLANS, month, day, track, EVENTS } from "../../../lib/vcusage.js";
export async function onRequestGet({ request, env }) {
  if (!vcOn(env, request) || !env.VCU) return json({ error: "forbidden" }, 403);
  const who = ids(request); if (!who) return json({ error: "need_ids" }, 400);
  if (new URL(request.url).searchParams.get("family") === "1") {
    // Parent view: ONLY this parent account's own kids (WHERE acct = caller). Profile ids only, minutes only.
    const r = await env.VCU.prepare("SELECT DISTINCT kid FROM vc_use WHERE acct=?1 AND month=?2").bind(who.acct, month()).all();
    const kids = await Promise.all((r.results || []).map(async (x) => { const st = await status(env, { acct: who.acct, kid: x.kid }); return { kid: x.kid, usedMin: Math.round(st.usedSec / 6) / 10, leftMin: Math.floor(st.monthLeftSec / 60) }; }));
    return json({ plan: (await status(env, who)).planLabel, kids });
  }
  return json({ ...(await status(env, who, feat(env, request, "VC_PLANS"))), features: features(env, request) });
}
export async function onRequestPost({ request, env }) {
  if (!vcOn(env, request) || !allowedOrigin(request) || !env.VCU) return json({ error: "forbidden" }, 403);
  const who = ids(request); if (!who) return json({ error: "need_ids" }, 400);
  let b; try { b = await request.json(); } catch (e) { return json({ error: "bad_json" }, 400); }
  if (b && typeof b.plan === "string") {
    if (!PLANS[b.plan]) return json({ error: "bad_plan" }, 400);
    await env.VCU.prepare("INSERT INTO vc_plan (acct,plan,updated) VALUES (?1,?2,?3) ON CONFLICT(acct) DO UPDATE SET plan=?2, updated=?3").bind(who.acct, b.plan, Date.now()).run();
  } else if (b && typeof b.ev === "string" && EVENTS.includes(b.ev) && b.ev !== "taste_started") {
    await track(env, who, b.ev);
  } else if (b && typeof b.sid === "string" && Number.isFinite(b.secs)) {
    const m = await env.VCU.prepare("SELECT mode FROM vc_use WHERE sid=?1 AND acct=?2 AND kid=?3").bind(b.sid, who.acct, who.kid).first("mode");
    if (m === "live-taste") await track(env, who, "taste_finished");
    const was = await env.VCU.prepare("SELECT secs FROM vc_use WHERE sid=?1 AND acct=?2 AND kid=?3 AND kind='live'").bind(b.sid, who.acct, who.kid).first("secs");
    if (was != null && b.secs < was) await env.VCU.prepare("UPDATE vc_spend SET usd = MAX(0, usd - ?1) WHERE day=?2").bind(((was - Math.max(0, b.secs)) / 60) * 0.08, day()).run().catch(() => {});
    await env.VCU.prepare("UPDATE vc_use SET secs = MIN(secs, ?1), cost_usd = MIN(secs, ?1) / 60.0 * 0.08 + 0.008 WHERE sid=?2 AND acct=?3 AND kid=?4 AND kind='live'").bind(Math.max(0, Math.round(b.secs)), b.sid, who.acct, who.kid).run();
  } else return json({ error: "bad_request" }, 400);
  return json({ ...(await status(env, who, feat(env, request, "VC_PLANS"))), features: features(env, request) });
}
