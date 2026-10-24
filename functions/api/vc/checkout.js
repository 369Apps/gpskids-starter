// POST /api/vc/checkout {plan:"founding"|"pro"|"allaccess"} -> { url } Stripe Checkout in TEST MODE ONLY, or { comingSoon:true }.
// Uses env STRIPE_TEST_KEY and refuses anything that is not sk_test_/rk_test_ (the live key is never read here).
// Prices are the TEST prices VC_PRICE_P20 / P100 / P200 (created in test mode). The webhook (stripe-webhook.js) sets the plan.
// Referral credits (free months) become a free trial of 30 days per credit.
import { json, allowedOrigin, isPreview, feat } from "../../../lib/vcoach.js";
import { ids, track } from "../../../lib/vcusage.js";
const MAP = { founding: ["p20", "VC_PRICE_P20"], pro: ["p100", "VC_PRICE_P100"], allaccess: ["p200", "VC_PRICE_P200"] };
export async function onRequestPost({ request, env }) {
  if (!isPreview(request) || !allowedOrigin(request)) return json({ error: "forbidden" }, 403);
  const who = ids(request); if (!who) return json({ error: "need_ids" }, 400);
  let b = {}; try { b = await request.json(); } catch (e) {}
  const [plan, priceVar] = MAP[b.plan] || MAP.founding;
  if (!feat(env, request, "VC_PLANS")) return json({ comingSoon: true, off: true });
  await track(env, who, "upgrade_clicked");
  const key = String(env.STRIPE_TEST_KEY || ""), price = String(env[priceVar] || "");
  if (!/^(sk|rk)_test_/.test(key) || !/^price_/.test(price)) return json({ comingSoon: true, message: "Checkout coming soon" });
  const credits = env.VCU ? ((await env.VCU.prepare("SELECT free_months FROM vc_credit WHERE acct=?1").bind(who.acct).first("free_months").catch(() => 0)) || 0) : 0;
  const origin = new URL(request.url).origin, f = new URLSearchParams();
  f.set("mode", "subscription"); f.set("success_url", origin + "/voice-coach?paid=1&session_id={CHECKOUT_SESSION_ID}"); f.set("cancel_url", origin + "/voice-coach");
  f.set("client_reference_id", who.acct); f.set("metadata[acct]", who.acct); f.set("metadata[vc_plan]", plan);
  f.set("subscription_data[metadata][acct]", who.acct); f.set("subscription_data[metadata][vc_plan]", plan);
  f.set("line_items[0][price]", price); f.set("line_items[0][quantity]", "1");
  if (credits > 0) f.set("subscription_data[trial_period_days]", String(Math.min(12, credits) * 30));
  const r = await fetch("https://api.stripe.com/v1/checkout/sessions", { method: "POST", headers: { authorization: "Bearer " + key, "content-type": "application/x-www-form-urlencoded" }, body: f });
  const j = await r.json().catch(() => ({}));
  if (!r.ok || !j.url || j.livemode) return json({ error: "checkout_failed" }, 502);
  return json({ url: j.url, test: true, freeMonths: credits });
}
