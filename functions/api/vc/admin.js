// GET /api/vc/admin  (admin only: "authorization: Bearer <VC_ADMIN_KEY>", its own key, separate from PITCH_ADMIN_KEY) -> AI Coach usage.
// PREVIEW ONLY. Random ids only, no names, words or audio. ?test=1 includes rows marked test.
import { json, isPreview, overLimit , vcOn, feat, engine, features } from "../../../lib/vcoach.js";
import { PLANS, month, day, spendToday, spendCap } from "../../../lib/vcusage.js";
async function digest(s) { return new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(String(s)))); }
async function authed(request, env, context) {
  const got = (request.headers.get("authorization") || "").replace(/^Bearer\s+/i, "");
  for (const want of [env.VC_ADMIN_KEY]) {
    if (!want || want.length < 24 || !got) continue;
    const [a, b] = await Promise.all([digest(got), digest(want)]); let d = 0; for (let k = 0; k < a.length; k++) d |= a[k] ^ b[k];
    if (d === 0) return null;
  }
  const limited = await overLimit(request, env, context, "va:", 20, 100000);
  return json({ error: limited ? "limit" : "unauthorized" }, limited ? 429 : 401);
}
export async function onRequestGet(context) {
  const { request, env } = context;
  if (!vcOn(env, request) || !env.VCU) return json({ error: "forbidden" }, 403);
  const bad = await authed(request, env, context); if (bad) return bad;
  const test = new URL(request.url).searchParams.get("test") === "1", m = month(), T = test ? "" : " AND test=0";
  const q = (sql, ...b) => env.VCU.prepare(sql).bind(...b).all().then((r) => r.results || []);
  const plans = Object.fromEntries((await q("SELECT acct, plan FROM vc_plan WHERE ?1=?1", 1)).map((r) => [r.acct, r.plan]));
  const kids = await q(`SELECT acct, kid, SUM(secs) secs, COUNT(*) sessions, SUM(cost_usd) cost, MAX(test) test, SUM(CASE WHEN day=?2 AND kind='turn' THEN secs ELSE 0 END) today,
      SUM(CASE WHEN mode='feedback' THEN 1 ELSE 0 END) feedback, SUM(CASE WHEN mode='rebuttal' THEN 1 ELSE 0 END) rebuttal, SUM(CASE WHEN mode IN ('live','live-taste') THEN 1 ELSE 0 END) live
      FROM vc_use WHERE month=?1${T} GROUP BY acct, kid ORDER BY secs DESC`, m, day());
  for (const k of kids) { const p = PLANS[plans[k.acct]] ? plans[k.acct] : "free"; k.plan = PLANS[p].label; k.capMin = p === "free" ? 10 : PLANS[p].founding ? 60 : PLANS[p].min; k.daily = p === "free" || !!PLANS[p].founding; k.usedMin = Math.round(k.secs / 6) / 10; k.pct = Math.round(((k.daily ? (k.today || 0) : k.secs) / (k.capMin * 60)) * 100); k.cost = Math.round((k.cost || 0) * 10000) / 10000; }
  const fam = {}; for (const k of kids) { const f = (fam[k.acct] ||= { acct: k.acct, plan: k.plan, kids: 0, usedMin: 0, sessions: 0, cost: 0, test: 0 }); f.kids++; f.usedMin = Math.round((f.usedMin + k.usedMin) * 10) / 10; f.sessions += k.sessions; f.cost = Math.round((f.cost + k.cost) * 10000) / 10000; f.test |= k.test; }
  const daily = await q(`SELECT day, SUM(secs) secs, COUNT(*) sessions, SUM(cost_usd) cost FROM vc_use WHERE month=?1${T} GROUP BY day ORDER BY day DESC`, m);
  const spend = { today: Math.round((await spendToday(env)) * 100) / 100, cap: spendCap(env) }; spend.paused = spend.today >= spend.cap;
  const alerts = await q("SELECT COUNT(*) n, SUM(CASE WHEN email='sent' THEN 1 ELSE 0 END) sent FROM vc_alert WHERE kind='safety' AND at > ?1", Math.floor(Date.now() / 1000) - 30 * 86400);
  const refs = await q("SELECT COUNT(*) n FROM vc_referral WHERE ?1=?1", 1);
  const evs = Object.fromEntries((await q(`SELECT ev, COUNT(*) n FROM vc_event WHERE at > ?1${T} GROUP BY ev`, Math.floor(Date.now() / 1000) - 30 * 86400)).map((r) => [r.ev, r.n]));
  const funnel = { offered: evs.taste_offered || 0, started: evs.taste_started || 0, finished: evs.taste_finished || 0, clicked: evs.upgrade_clicked || 0, upgraded: evs.upgraded || 0 };
  funnel.conversion = funnel.started ? Math.round((funnel.upgraded / funnel.started) * 1000) / 10 : 0;
  const consents = await q("SELECT COUNT(*) n FROM vc_consent WHERE ?1=?1", 1);
  return json({ funnel, spend, alerts: alerts[0], referrals: refs[0].n, consents: consents[0].n, month: m, test, kids, families: Object.values(fam).sort((a, b) => b.usedMin - a.usedMin), top: kids.slice(0, 5), near: kids.filter((k) => k.pct >= 80), daily: daily.map((d) => ({ ...d, minutes: Math.round(d.secs / 6) / 10, cost: Math.round((d.cost || 0) * 10000) / 10000 })) });
}
