// POST /api/try/checkout {plan} -> {url} Stripe Checkout (subscription), preview = TEST mode, prod = LIVE (restricted key). Missing key/price -> {off:true} -> page falls back to "Request a call".
// GET  /api/try/checkout?session_id=cs_... -> {paid, plan, class_day}   POST {session_id, class_day:"tue"|"thu"} -> saves the class day on the Stripe subscription metadata.
import { json, tryOn, allowedOrigin, ev, isPreview } from "../../../lib/trynow.js";
const PRICE = { founding_family: "P20", pro: "P100", all_access: "P200" };
// Preview: STRIPE_TEST_KEY (sk_/rk_test_) + VC_PRICE_*. Prod: STRIPE_LIVE_KEY (rk_live_ only) + TRY_LIVE_PRICE_*. Never mixed.
const priceOf = (env, request, plan) => String((isPreview(request) ? env["VC_PRICE_" + PRICE[plan]] : env["TRY_LIVE_PRICE_" + PRICE[plan]]) || "");
const keyOf = (env, request) => { if (isPreview(request)) { const k = String(env.STRIPE_TEST_KEY || ""); return /^(sk|rk)_test_/.test(k) ? k : ""; } const k = String(env.STRIPE_LIVE_KEY || ""); return /^rk_live_/.test(k) ? k : ""; };
const S = (env, request, path, body) => fetch("https://api.stripe.com/v1/" + path, { method: body ? "POST" : "GET", headers: { authorization: "Bearer " + keyOf(env, request), ...(body ? { "content-type": "application/x-www-form-urlencoded" } : {}) }, body }).then((r) => r.json().catch(() => ({})));
const okReq = (request, env) => tryOn(env, request) && allowedOrigin(request);
export async function onRequestPost({ request, env }) {
  if (!okReq(request, env)) return json({ error: "forbidden" }, 403);
  let b = {}; try { b = await request.json(); } catch (e) {}
  if (!keyOf(env, request)) return json({ off: true });
  if (b.session_id) { // save class day
    if (!(isPreview(request) ? /^cs_test_[A-Za-z0-9]+$/ : /^cs_live_[A-Za-z0-9]+$/).test(b.session_id) || !["tue", "thu"].includes(b.class_day)) return json({ error: "bad_request" }, 400);
    const s = await S(env, request, "checkout/sessions/" + b.session_id);
    if (s.payment_status !== "paid" || !s.subscription || !["pro", "all_access"].includes(s.metadata && s.metadata.plan)) return json({ error: "not_paid" }, 400);
    const f = new URLSearchParams(); f.set("metadata[class_day]", b.class_day);
    const u = await S(env, request, "subscriptions/" + s.subscription, f); return json({ ok: !!u.id, class_day: b.class_day });
  }
  if (!PRICE[b.plan]) return json({ error: "bad_plan" }, 400); const price = priceOf(env, request, b.plan); if (!/^price_/.test(price)) return json({ error: "bad_plan" }, 400);
  const origin = new URL(request.url).origin, f = new URLSearchParams();
  f.set("mode", "subscription"); f.set("line_items[0][price]", price); f.set("line_items[0][quantity]", "1");
  f.set("success_url", origin + "/try?paid=" + b.plan + "&session_id={CHECKOUT_SESSION_ID}"); f.set("cancel_url", origin + "/try#plans");
  f.set("metadata[plan]", b.plan); f.set("metadata[source]", "gpskids-try"); f.set("subscription_data[metadata][plan]", b.plan); f.set("subscription_data[metadata][source]", "gpskids-try");
  f.set("allow_promotion_codes", "false");
  const em = String(b.email || "").trim(); if (em.length <= 120 && /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(em)) f.set("customer_email", em);
  if (/^[A-Za-z0-9-]{8,64}$/.test(String(b.lead_id || ""))) { f.set("metadata[lead_id]", b.lead_id); f.set("subscription_data[metadata][lead_id]", b.lead_id); }
  const j = await S(env, request, "checkout/sessions", f);
  if (!j.url || j.livemode === isPreview(request)) return json({ error: "checkout_failed" }, 502); // preview must be test, prod must be live
  await ev(env, "checkout_started", b.plan); return json({ url: j.url, test: !j.livemode });
}
export async function onRequestGet({ request, env }) {
  if (!okReq(request, env) && !tryOn(env, request)) return json({ error: "forbidden" }, 403);
  const sid = new URL(request.url).searchParams.get("session_id") || "";
  if (!keyOf(env, request) || !(isPreview(request) ? /^cs_test_[A-Za-z0-9]+$/ : /^cs_live_[A-Za-z0-9]+$/).test(sid)) return json({ paid: false });
  const s = await S(env, request, "checkout/sessions/" + sid + "?expand[]=subscription");
  const paid = s.payment_status === "paid", plan = s.metadata && s.metadata.plan;
  if (paid) await ev(env, "checkout_completed", plan || "");
  return json({ paid, plan, class_day: (s.subscription && s.subscription.metadata && s.subscription.metadata.class_day) || null });
}
