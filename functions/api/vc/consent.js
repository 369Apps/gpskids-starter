// GET  /api/vc/consent -> { ok, at, liveOptIn } for this parent account + child profile (x-acct, x-kid). PREVIEW ONLY.
// POST /api/vc/consent {a, b, answer, liveOptIn} -> grown-up check (a + b) then saves consent with a timestamp.
// The math numbers come from the page; this is a "grown-up check", not identity verification (same as most kids apps).
import { json, allowedOrigin, isPreview , vcOn, feat, engine, features } from "../../../lib/vcoach.js";
import { ids } from "../../../lib/vcusage.js";
export const VERSION = "vc-consent-2026-10-20";
export async function onRequestGet({ request, env }) {
  if (!vcOn(env, request) || !env.VCU) return json({ error: "forbidden" }, 403);
  const who = ids(request); if (!who) return json({ error: "need_ids" }, 400);
  const r = await env.VCU.prepare("SELECT at, live_optin FROM vc_consent WHERE acct=?1 AND kid=?2").bind(who.acct, who.kid).first();
  return json(r ? { ok: true, at: r.at, liveOptIn: !!r.live_optin, version: VERSION } : { ok: false });
}
export async function onRequestPost({ request, env }) {
  if (!vcOn(env, request) || !allowedOrigin(request) || !env.VCU) return json({ error: "forbidden" }, 403);
  const who = ids(request); if (!who) return json({ error: "need_ids" }, 400);
  let b; try { b = await request.json(); } catch (e) { return json({ error: "bad_json" }, 400); }
  if (b && b.withdraw === true) { await env.VCU.prepare("DELETE FROM vc_consent WHERE acct=?1 AND kid=?2").bind(who.acct, who.kid).run(); return json({ ok: false, withdrawn: true }); }
  if (b && b.update === true) { // change only the live opt-in, and only when consent already exists
    const r = await env.VCU.prepare("UPDATE vc_consent SET live_optin=?1 WHERE acct=?2 AND kid=?3").bind(b.liveOptIn ? 1 : 0, who.acct, who.kid).run();
    return json({ ok: !!(r.meta && r.meta.changes), liveOptIn: !!b.liveOptIn });
  }
  const a = Number(b && b.a), c = Number(b && b.b);
  if (!(a >= 6 && a <= 19 && c >= 6 && c <= 19) || Number(b.answer) !== a + c) return json({ error: "wrong_answer" }, 422);
  const at = Math.floor(Date.now() / 1000);
  await env.VCU.prepare("INSERT INTO vc_consent (acct,kid,at,version,live_optin,gate) VALUES (?1,?2,?3,?4,?5,'math') ON CONFLICT(acct,kid) DO UPDATE SET at=?3, version=?4, live_optin=?5")
    .bind(who.acct, who.kid, at, VERSION, b.liveOptIn ? 1 : 0).run();
  return json({ ok: true, at, liveOptIn: !!b.liveOptIn, version: VERSION });
}
