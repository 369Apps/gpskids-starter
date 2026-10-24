// POST /api/try/stripe-webhook  Stripe webhook for the /try one-tap checkout.
// checkout.session.completed (metadata.source=gpskids-try, paid) -> PROD ONLY: upsert the family in GHL GPS Kids HQ with tags gpskids-paid + plan-<plan>.
// Preview: verifies with STRIPE_TEST_WEBHOOK_SECRET, logs the event, and does nothing else (no GHL token on preview, ever).
// Prod: verifies with STRIPE_WEBHOOK_SECRET; ignores test-mode events. Stores nothing about the child.
import { json, isPreview, ev, ghlLocation, ghlOn } from "../../../lib/trynow.js";
const PLANS = new Set(["founding_family", "pro", "all_access"]);
const hex = (b) => Array.from(new Uint8Array(b), (x) => x.toString(16).padStart(2, "0")).join("");
async function verify(secret, header, body) {
  const h = String(header || ""), t = Number((h.split(",").find((p) => p.startsWith("t=")) || "").slice(2));
  const sigs = h.split(",").filter((p) => p.startsWith("v1=")).map((p) => p.slice(3));
  if (!secret || !t || Math.abs(Date.now() / 1000 - t) > 300 || !sigs.length) return false;
  const k = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const want = hex(await crypto.subtle.sign("HMAC", k, new TextEncoder().encode(t + "." + body)));
  return sigs.some((s) => s.length === want.length && [...s].reduce((d, c, i) => d | (c.charCodeAt(0) ^ want.charCodeAt(i)), 0) === 0);
}
export async function ghlPaid(env, s, plan) {
  if (!ghlOn(env)) return "off";
  const c = s.customer_details || {}; if (!c.email && !c.phone) return "no_contact";
  const loc = ghlLocation(env);
  const o = { tags: ["gpskids-paid", "plan-" + plan], source: "gpskids try checkout" };
  if (loc) o.locationId = loc;
  if (c.email) o.email = c.email; if (c.phone) o.phone = c.phone; if (c.name) o.firstName = String(c.name).split(" ")[0];
  for (let i = 0; i < 3; i++) {
    const r = await fetch("https://services.leadconnectorhq.com/contacts/upsert", { method: "POST", headers: { Authorization: "Bearer " + env.GHL_GPSKIDS_HQ_TOKEN, Version: "2021-07-28", "content-type": "application/json", accept: "application/json" }, body: JSON.stringify(o) }).catch(() => null);
    if (r && r.ok) return "synced"; if (r && r.status < 500 && r.status !== 429) return "failed";
    await new Promise((ok) => setTimeout(ok, 500 * 2 ** i));
  }
  return "failed";
}
export async function onRequestPost({ request, env }) {
  const preview = isPreview(request), body = await request.text();
  const secret = preview ? env.STRIPE_TEST_WEBHOOK_SECRET : env.STRIPE_WEBHOOK_SECRET;
  if (!secret) return json({ error: "off" }, 404);
  if (!(await verify(secret, request.headers.get("stripe-signature"), body))) return json({ error: "bad signature" }, 400);
  let e = {}; try { e = JSON.parse(body); } catch (x) { return json({ error: "bad json" }, 400); }
  if (e.type !== "checkout.session.completed") return json({ ok: true, ignored: e.type });
  const s = (e.data && e.data.object) || {}, plan = (s.metadata || {}).plan;
  if ((s.metadata || {}).source !== "gpskids-try" || !PLANS.has(plan) || s.payment_status !== "paid") return json({ ok: true, ignored: "not_try" });
  if (preview || !e.livemode) { await ev(env, "checkout_paid", plan + ":preview").catch(() => {}); return json({ ok: true, ghl: "noop_preview" }); }
  const g = await ghlPaid(env, s, plan); await ev(env, "checkout_paid", plan + ":" + g).catch(() => {});
  return json({ ok: true, ghl: g });
}
