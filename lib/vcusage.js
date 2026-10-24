// Voice coach minutes. Checked before every paid voice call.
// Ids: x-acct (parent account id) + x-kid (child profile id), random ids only. Stored in the preview D1 "VCU", never prod.
// Free: 10 min of recorded coaching PER DAY (no monthly cap), no live voice except one 3 min taste per kid per 7 days.
// Paid: monthly caps below (recorded + live share the cap), and at most 20 min a day per kid.
export const FREE_DAY_MIN = 10, FREE_TASTE_SEC = 180;
export const PLANS = { free: { min: 10, label: "Free", daily: true }, p20: { min: 60, label: "Founding Family", founding: true, recDayMin: 60, liveMonthMin: 60 }, p100: { min: 300, label: "Pro", founding: true, recDayMin: 60, liveMonthMin: 300 }, p200: { min: 600, label: "All Access", founding: true, recDayMin: 60, liveMonthMin: 600 } };
export const DAY_MIN = 20, LIVE_MAX = 300;
const ID = /^[a-z0-9-]{8,64}$/;
const et = (o) => new Intl.DateTimeFormat("en-CA", { timeZone: "America/New_York", ...o }).format(new Date());
const day = () => et({ year: "numeric", month: "2-digit", day: "2-digit" }), month = () => day().slice(0, 7);
export function ids(request) {
  const a = (request.headers.get("x-acct") || "").toLowerCase(), k = (request.headers.get("x-kid") || "").toLowerCase();
  return ID.test(a) && ID.test(k) ? { acct: a, kid: k } : null;
}
export async function status(env, who, plansOn = env.VC_PLANS === "1") {
  const p = !plansOn ? "free" : await env.VCU.prepare("SELECT plan FROM vc_plan WHERE acct=?1").bind(who.acct).first("plan");
  const plan = PLANS[p] ? p : "free";
  const m = await env.VCU.prepare("SELECT COALESCE(SUM(secs),0) s FROM vc_use WHERE acct=?1 AND kid=?2 AND month=?3").bind(who.acct, who.kid, month()).first("s");
  const d = await env.VCU.prepare("SELECT COALESCE(SUM(secs),0) s FROM vc_use WHERE acct=?1 AND kid=?2 AND day=?3").bind(who.acct, who.kid, day()).first("s");
  if (plan === "free") {
    const dt = await env.VCU.prepare("SELECT COALESCE(SUM(secs),0) s FROM vc_use WHERE acct=?1 AND kid=?2 AND day=?3 AND kind='turn'").bind(who.acct, who.kid, day()).first("s");
    const lastLive = await env.VCU.prepare("SELECT MAX(at) a FROM vc_use WHERE acct=?1 AND kid=?2 AND kind='live'").bind(who.acct, who.kid).first("a");
    // VC_TASTE_MODE: "weekly" (default) = one 3 min taste per kid per 7 days; "first_week" = one taste, only in the first 7 days after consent.
    const now = Math.floor(Date.now() / 1000);
    let tasteOk = !lastLive || lastLive < now - 7 * 86400;
    if (env.VC_TASTE_MODE === "first_week") {
      const c = await env.VCU.prepare("SELECT at FROM vc_consent WHERE acct=?1 AND kid=?2").bind(who.acct, who.kid).first("at").catch(() => null);
      tasteOk = !lastLive && !!c && c > now - 7 * 86400;
    }
    const dayLeft = Math.max(0, FREE_DAY_MIN * 60 - dt);
    return { plan, planLabel: "Free", daily: true, planMin: FREE_DAY_MIN, usedSec: m, monthLeftSec: dayLeft, dayLeftSec: dayLeft, leftSec: dayLeft, dayMin: FREE_DAY_MIN,
      liveTasteSec: tasteOk ? FREE_TASTE_SEC : 0, liveTasteNext: tasteOk ? null : (lastLive + 7 * 86400) };
  }
  if (PLANS[plan].founding) { // unlimited recorded coaching (60 min a day fair use) + 60 live minutes a month
    const dt = await env.VCU.prepare("SELECT COALESCE(SUM(secs),0) s FROM vc_use WHERE acct=?1 AND kid=?2 AND day=?3 AND kind='turn'").bind(who.acct, who.kid, day()).first("s");
    const lm = await env.VCU.prepare("SELECT COALESCE(SUM(secs),0) s FROM vc_use WHERE acct=?1 AND kid=?2 AND month=?3 AND kind='live'").bind(who.acct, who.kid, month()).first("s");
    const recLeft = Math.max(0, PLANS[plan].recDayMin * 60 - dt), liveLeft = Math.max(0, PLANS[plan].liveMonthMin * 60 - lm);
    return { plan, planLabel: PLANS[plan].label, founding: true, planMin: PLANS[plan].liveMonthMin, usedSec: m, monthLeftSec: liveLeft, dayLeftSec: recLeft, leftSec: recLeft, liveLeftSec: liveLeft, dayMin: PLANS[plan].recDayMin };
  }
  const monthLeft = Math.max(0, PLANS[plan].min * 60 - m), dayLeft = Math.max(0, DAY_MIN * 60 - d);
  return { plan, planLabel: PLANS[plan].label, planMin: PLANS[plan].min, usedSec: m, monthLeftSec: monthLeft, dayLeftSec: dayLeft, leftSec: Math.min(monthLeft, dayLeft), dayMin: DAY_MIN };
}
// Rough cost estimates in USD so a fork can pause live voice before a surprise bill.
// A turn is one transcription plus two short text calls. Replace the rates if your provider charges differently.
export const RATES = { liveMin: 0.08, liveTextMsg: 0.004, sttHour: 0.10, ttsPerChar: 15 / 1e6, textIn: 1.25 / 1e6, textOut: 2.5 / 1e6 };
export const cost = {
  turn: (secs) => (secs / 3600) * RATES.sttHour + 2 * (900 * RATES.textIn + 250 * RATES.textOut),
  live: (secs) => (secs / 60) * RATES.liveMin + 2 * RATES.liveTextMsg,
  hear: (chars) => chars * RATES.ttsPerChar,
};
// One row per session. mode: feedback | rebuttal | live | hear. Only "secs" counts against minutes ("hear" rows have 0).
export async function add(env, who, kind, secs, sid, extra = {}) {
  secs = Math.max(0, Math.round(secs));
  const mode = extra.mode || kind;
  const usd = extra.cost != null ? extra.cost : kind === "live" ? cost.live(secs) : kind === "turn" ? cost.turn(secs) : 0;
  const st = await status(env, who).catch(() => null);
  const left = st ? Math.max(0, st.leftSec - secs) : null;
  await env.VCU.prepare("INSERT INTO vc_use (acct,kid,day,month,kind,secs,at,sid,plan,mode,cost_usd,left_sec,test) VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,?11,?12,?13)")
    .bind(who.acct, who.kid, day(), month(), kind, secs, Math.floor(Date.now() / 1000), sid || null, st ? st.plan : null, mode, Math.round(usd * 1e6) / 1e6, left, extra.test || who.acct.startsWith("test-") ? 1 : 0).run();
}
export { month, day };
// Returns {who, st} when allowed, or a Response to send back. need = seconds this call may use.
export async function gate(env, request, need = 1) {
  const json = (o, s) => new Response(JSON.stringify(o), { status: s, headers: { "content-type": "application/json", "cache-control": "no-store" } });
  if (!env.VCU) return json({ error: "usage_unavailable" }, 503);
  const who = ids(request); if (!who) return json({ error: "need_ids" }, 400);
  const st = await status(env, who).catch(() => null);
  if (!st) return json({ error: "usage_unavailable" }, 503);
  if (!(await hasConsent(env, who))) return json({ error: "consent_needed", message: "A grown-up needs to say OK first." }, 412);
  if (st.leftSec < Math.min(need, 5) || st.leftSec <= 0) return json({ error: "out_of_minutes", resting: true, message: "Coach is resting. Ask your grown-up!", usage: st }, 402);
  return { who, st };
}

// ---- spend kill switch: estimated voice spend per ET day. Default cap $50 (env VC_DAILY_SPEND_CAP). ----
export const spendCap = (env) => { const n = Number(env.VC_DAILY_SPEND_CAP); return Number.isFinite(n) && n > 0 ? n : 50; };
export async function spendToday(env) { return (await env.VCU.prepare("SELECT usd FROM vc_spend WHERE day=?1").bind(day()).first("usd").catch(() => 0)) || 0; }
export async function addSpend(env, usd) {
  if (!(usd > 0)) return;
  await env.VCU.prepare("INSERT INTO vc_spend (day, usd) VALUES (?1, ?2) ON CONFLICT(day) DO UPDATE SET usd = usd + ?2").bind(day(), usd).run().catch(() => {});
}
// true when today's voice spend reached the cap: live is paused and recorded coaching falls back to Workers AI.
export async function paused(env) { return (await spendToday(env)) >= spendCap(env); }
// env copy without the voice key, so paid voice calls are skipped and Workers AI runs.
export const noXai = (env) => new Proxy(env, { get: (t, k) => (k === "AI_API_KEY" || k === "XAI_API_KEY" || k === "TRY_XAI_KEY" ? undefined : t[k]) });
export async function hasConsent(env, who) { return !!(await env.VCU.prepare("SELECT at FROM vc_consent WHERE acct=?1 AND kid=?2").bind(who.acct, who.kid).first("at").catch(() => null)); }
export async function kidOverLimit(env, who, max) {
  const n = await env.VCU.prepare("SELECT COUNT(*) n FROM vc_use WHERE acct=?1 AND kid=?2 AND day=?3 AND kind='turn'").bind(who.acct, who.kid, day()).first("n").catch(() => 0);
  return n >= max;
}
export const EVENTS = ["taste_offered", "taste_started", "taste_finished", "upgrade_clicked", "upgraded"];
export async function track(env, who, ev) {
  if (!EVENTS.includes(ev) || !env.VCU) return;
  await env.VCU.prepare("INSERT INTO vc_event (acct,kid,at,ev,test) VALUES (?1,?2,?3,?4,?5)").bind(who.acct, who.kid || null, Math.floor(Date.now() / 1000), ev, who.acct.startsWith("test-") ? 1 : 0).run().catch(() => {});
}
