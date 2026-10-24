// Referral (PREVIEW, ON): one free month for BOTH families when a friend joins with your code.
// GET  /api/vc/referral -> { code, link, joined, freeMonths }   (code = short hash of the parent account id, no names)
// POST /api/vc/referral {code} -> the new family joins with a friend's code: +1 free month each. Once per joining family,
//      never your own code. "Joins" in preview = a family with consent saved on at least one child redeems the code.
import { json, allowedOrigin, isPreview , feat } from "../../../lib/vcoach.js";
import { ids } from "../../../lib/vcusage.js";
const codeOf = async (acct) => { const h = new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode("gks-ref|" + acct))); return Array.from(h.slice(0, 5), (x) => x.toString(36).padStart(2, "0")).join("").slice(0, 8).toUpperCase(); };
const credit = (env, acct) => env.VCU.prepare("INSERT INTO vc_credit (acct, free_months) VALUES (?1, 1) ON CONFLICT(acct) DO UPDATE SET free_months = free_months + 1").bind(acct).run();
export async function onRequestGet({ request, env }) {
  if (!isPreview(request) || !feat(env, request, "VC_REFERRAL") || !env.VCU) return json({ error: "forbidden" }, 403);
  const who = ids(request); if (!who) return json({ error: "need_ids" }, 400);
  const code = await codeOf(who.acct);
  const joined = await env.VCU.prepare("SELECT COUNT(*) n FROM vc_referral WHERE referrer=?1").bind(who.acct).first("n");
  const fm = (await env.VCU.prepare("SELECT free_months FROM vc_credit WHERE acct=?1").bind(who.acct).first("free_months")) || 0;
  return json({ code, link: new URL(request.url).origin + "/voice-coach?ref=" + code, joined, freeMonths: fm });
}
export async function onRequestPost({ request, env }) {
  if (!isPreview(request) || !feat(env, request, "VC_REFERRAL") || !allowedOrigin(request) || !env.VCU) return json({ error: "forbidden" }, 403);
  const who = ids(request); if (!who) return json({ error: "need_ids" }, 400);
  let b; try { b = await request.json(); } catch (e) { return json({ error: "bad_json" }, 400); }
  const code = String((b && b.code) || "").toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 8);
  if (code.length !== 8) return json({ error: "bad_code" }, 400);
  if (code === (await codeOf(who.acct))) return json({ error: "own_code" }, 400);
  if (!(await env.VCU.prepare("SELECT 1 FROM vc_consent WHERE acct=?1").bind(who.acct).first())) return json({ error: "consent_first" }, 412);
  if (await env.VCU.prepare("SELECT 1 FROM vc_referral WHERE joiner=?1").bind(who.acct).first()) return json({ error: "already_joined" }, 409);
  // find the referrer among known families (accounts with consent); preview scale only
  const fams = (await env.VCU.prepare("SELECT DISTINCT acct FROM vc_consent").all()).results || [];
  let ref = null; for (const f of fams) if ((await codeOf(f.acct)) === code) { ref = f.acct; break; }
  if (!ref) return json({ error: "unknown_code" }, 404);
  await env.VCU.prepare("INSERT INTO vc_referral (joiner, referrer, at, test) VALUES (?1, ?2, ?3, ?4)").bind(who.acct, ref, Math.floor(Date.now() / 1000), who.acct.startsWith("test-") ? 1 : 0).run();
  await credit(env, who.acct); await credit(env, ref);
  return json({ ok: true, freeMonths: 1 });
}
