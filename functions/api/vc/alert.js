// POST /api/vc/alert {kind:"safety"} -> stores an in-app alert for this parent account (shown on the grown-up screen)
//   and emails the parent through the CRM when configured. No words, no audio: the alert says only that Coach paused for safety and when.
// GET  /api/vc/alert -> this parent account's alerts (x-acct). POST {seen:true} marks them read.
import { json, allowedOrigin, isPreview, isCandidate, vcOn, feat, engine, features } from "../../../lib/vcoach.js";
import { ids } from "../../../lib/vcusage.js";
const GHL = "https://services.leadconnectorhq.com";
async function emailTest(env, when, kind) {
  if (!env.GHL_GPSKIDS_HQ_TOKEN) return "skipped_no_token"; // token is NOT on the shared preview env on purpose (it would reach every preview branch)
  if (!env.VC_ALERT_TEST_CONTACT) return "skipped_no_contact";
  const up = `<p>[PREVIEW TEST] Your teen just tried 3 minutes of live practice with their AI Coach on ${when} (ET).</p><p>Founding Family, $20 a month: everything in Free, unlimited, plus 60 minutes of live conversation, and a Pitch Night spot. Open GPS Kids to upgrade.</p>`;
  const html = kind === "upsell" ? up : `<p>[PREVIEW TEST] GPS Kids Coach paused a practice session on ${when} (ET) because your child may need a grown-up.</p>
<p>Please check in with your child. If they are in danger, call 911. For emotional support, call or text 988 (Suicide and Crisis Lifeline, US).</p>
<p>No recording or words were saved.</p>`;
  try {
    const r = await fetch(GHL + "/conversations/messages", { method: "POST", headers: { authorization: "Bearer " + env.GHL_GPSKIDS_HQ_TOKEN, version: "2021-07-28", "content-type": "application/json", accept: "application/json" },
      body: JSON.stringify({ type: "Email", contactId: env.VC_ALERT_TEST_CONTACT, emailFrom: env.ALERT_FROM || "GPS Kids <coach@example.com>", subject: kind === "upsell" ? "[PREVIEW TEST] Your teen tried live practice" : "[PREVIEW TEST] Coach paused for safety", html }) });
    if (!r.ok) return "failed_" + r.status;
    const j = await r.json().catch(() => ({}));
    if (j.messageId) { // GHL can accept then fail (e.g. empty wallet); check once
      await new Promise((ok) => setTimeout(ok, 1500));
      const m = await fetch(GHL + "/conversations/messages/" + j.messageId, { headers: { authorization: "Bearer " + env.GHL_GPSKIDS_HQ_TOKEN, version: "2021-07-28", accept: "application/json" } }).then((x) => x.json()).catch(() => ({}));
      const st = (m.message && m.message.status) || m.status || "";
      if (/fail|error|undeliver/i.test(String(st))) return "failed_" + st;
    }
    return "sent";
  } catch (e) { return "failed"; }
}
export async function onRequestPost({ request, env }) {
  if (!vcOn(env, request) || !allowedOrigin(request) || !env.VCU) return json({ error: "forbidden" }, 403);
  const who = ids(request); if (!who) return json({ error: "need_ids" }, 400);
  let b = {}; try { b = await request.json(); } catch (e) {}
  if (b.seen === true) { await env.VCU.prepare("UPDATE vc_alert SET seen=1 WHERE acct=?1").bind(who.acct).run(); return json({ ok: true }); }
  // at most one alert email per child per 10 minutes
  const recent = await env.VCU.prepare("SELECT id FROM vc_alert WHERE acct=?1 AND kid=?2 AND at > ?3").bind(who.acct, who.kid, Math.floor(Date.now() / 1000) - 600).first("id");
  const at = Math.floor(Date.now() / 1000), id = crypto.randomUUID();
  const when = new Intl.DateTimeFormat("en-US", { timeZone: "America/New_York", dateStyle: "medium", timeStyle: "short" }).format(new Date());
  // test-* ids (automated tests) never send email.
  const kind = b.kind === "upsell" ? "upsell" : "safety";
  if (kind === "upsell" && !feat(env, request, "VC_PLANS")) return json({ ok: false, off: true });
  const email = !isPreview(request) || isCandidate(request) ? "skipped_launch" : who.acct.startsWith("test-") ? "skipped_test" : recent ? "skipped_recent" : await emailTest(env, when, kind);
  await env.VCU.prepare("INSERT INTO vc_alert (id,acct,kid,at,kind,email) VALUES (?1,?2,?3,?4,?5,?6)").bind(id, who.acct, who.kid, at, kind, email).run();
  console.log(JSON.stringify({ vc: "parent_alert", email }));
  return json({ ok: true, email });
}
export async function onRequestGet({ request, env }) {
  if (!vcOn(env, request) || !env.VCU) return json({ error: "forbidden" }, 403);
  const who = ids(request); if (!who) return json({ error: "need_ids" }, 400);
  const r = await env.VCU.prepare("SELECT kid, at, kind, seen FROM vc_alert WHERE acct=?1 ORDER BY at DESC LIMIT 10").bind(who.acct).all();
  return json({ alerts: (r.results || []).map((a) => ({ thisChild: a.kid === who.kid, at: a.at, kind: a.kind, seen: !!a.seen })) });
}
