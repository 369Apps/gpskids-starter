// POST /api/vc/stripe-webhook  Stripe TEST webhook (preview only). Verifies the Stripe-Signature with STRIPE_TEST_WEBHOOK_SECRET.
// checkout.session.completed -> set the plan + count "upgraded"; customer.subscription.updated/deleted -> keep plan in sync
// (canceled/unpaid -> free). Ignores any livemode event. Stores only the random parent account id and plan.
import { isPreview } from "../../../lib/vcoach.js";
import { track } from "../../../lib/vcusage.js";
const PLANS = new Set(["p20", "p100", "p200"]);
const hex = (b) => Array.from(new Uint8Array(b), (x) => x.toString(16).padStart(2, "0")).join("");
async function verify(secret, header, body) {
  const parts = Object.fromEntries(String(header || "").split(",").map((p) => p.split("=")).filter((p) => p.length === 2).map(([k, v]) => [k, v]));
  const sigs = String(header || "").split(",").filter((p) => p.startsWith("v1=")).map((p) => p.slice(3));
  const t = Number(parts.t); if (!t || Math.abs(Date.now() / 1000 - t) > 300 || !sigs.length) return false;
  const k = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const want = hex(await crypto.subtle.sign("HMAC", k, new TextEncoder().encode(t + "." + body)));
  return sigs.some((s) => s.length === want.length && [...s].reduce((d, c, i) => d | (c.charCodeAt(0) ^ want.charCodeAt(i)), 0) === 0);
}
const setPlan = (env, acct, plan) => env.VCU.prepare("INSERT INTO vc_plan (acct,plan,updated) VALUES (?1,?2,?3) ON CONFLICT(acct) DO UPDATE SET plan=?2, updated=?3").bind(acct, plan, Date.now()).run();
export async function onRequestPost({ request, env }) {
  const res = (s, m) => new Response(m || "ok", { status: s });
  if (!isPreview(request) || !env.VCU || !env.STRIPE_TEST_WEBHOOK_SECRET) return res(404, "no");
  const body = await request.text();
  if (!(await verify(env.STRIPE_TEST_WEBHOOK_SECRET, request.headers.get("stripe-signature"), body))) return res(400, "bad signature");
  let e; try { e = JSON.parse(body); } catch (x) { return res(400, "bad json"); }
  if (e.livemode) return res(200, "ignored live");
  const o = (e.data && e.data.object) || {}, md = o.metadata || {}, acct = String(md.acct || o.client_reference_id || ""), plan = String(md.vc_plan || "");
  if (!/^[a-z0-9-]{8,64}$/.test(acct)) return res(200, "no acct");
  if (e.type === "checkout.session.completed" && PLANS.has(plan) && (o.status === "complete" || o.payment_status === "paid" || o.payment_status === "no_payment_required")) {
    await setPlan(env, acct, plan); await track(env, { acct, kid: null }, "upgraded");
  } else if (e.type === "customer.subscription.updated" || e.type === "customer.subscription.created") {
    if (PLANS.has(plan) && ["active", "trialing"].includes(o.status)) await setPlan(env, acct, plan);
    if (["canceled", "unpaid", "incomplete_expired"].includes(o.status)) await setPlan(env, acct, "free");
  } else if (e.type === "customer.subscription.deleted") await setPlan(env, acct, "free");
  console.log(JSON.stringify({ vc: "stripe", type: e.type }));
  return res(200);
}
