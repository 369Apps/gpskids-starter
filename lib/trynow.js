// "Talk to the AI Coach" demo at /try. On when this host is a fork, or when TRYNOW_ENABLED = "1".
// Never stored: audio, transcripts, child names, schools, or locations. Only parent contact (with consent), age band and goal.
import { json, isPreview } from "./vcoach.js";
import { allowedOrigin } from "./guard.js";
import { providerKey } from "./provider.js";
import { day, spendCap, spendToday, addSpend } from "./vcusage.js";
export { json, isPreview, allowedOrigin, day, spendCap, spendToday, addSpend };
export const tryOn = (env, request) => isPreview(request) || env.TRYNOW_ENABLED === "1";
export const xaiKey = (env) => providerKey(env);
export const AGENT_ID = (env) => env.TRY_AGENT_ID || "";
export const MAX_SECONDS = 600, CLIENT_CLOSE = 610, TOKEN_TTL = 620, RATE_PER_MIN = 0.08;
export const CONSENT_VERSION = "try-now-2026-10-20-v1";
// Cloudflare's documented always-pass TEST keys (preview only). A real widget replaces these via env TURNSTILE_SITEKEY / TURNSTILE_SECRET.
export const TEST_SITEKEY = "1x00000000000000000000AA", TEST_SECRET = "1x0000000000000000000000000000000AA";
export const sitekey = (env) => env.TURNSTILE_SITEKEY || TEST_SITEKEY;
const secret = (env) => env.TURNSTILE_SECRET || TEST_SECRET;
export const turnstileMode = (env) => (env.TURNSTILE_SECRET ? "real" : "test");
export async function verifyTurnstile(env, token, ip) {
  if (typeof token !== "string" || !token || token.length > 2048) return false;
  const f = new FormData(); f.append("secret", secret(env)); f.append("response", token); if (ip) f.append("remoteip", ip);
  const r = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", { method: "POST", body: f }).catch(() => null);
  if (!r || !r.ok) return false; const o = await r.json().catch(() => ({})); return o.success === true;
}
export async function hash(s, env) {
  const h = new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode((env.IP_SALT || "gks-try") + "|" + s)));
  return Array.from(h.slice(0, 16), (x) => x.toString(16).padStart(2, "0")).join("");
}
// counters with expiry (no content). Returns the new count.
export async function bump(env, k, ttl) {
  const now = Math.floor(Date.now() / 1000);
  await env.VCU.prepare("DELETE FROM td_rl WHERE exp < ?1").bind(now).run().catch(() => {});
  return env.VCU.prepare("INSERT INTO td_rl (k,n,exp) VALUES (?1,1,?2) ON CONFLICT(k) DO UPDATE SET n=n+1 RETURNING n").bind(k, now + ttl).first("n");
}
export const EVENTS = ["page_view", "demo_button_click", "gate_shown", "gate_completed", "turnstile_failed", "mic_denied", "demo_started", "demo_limit_hit", "kid_intro_started",
  "rebuttal_round_done", "plans_explained", "lead_captured", "show_plan", "free_signup_started", "free_signup_completed", "callback_requested", "safety_handoff", "demo_ended", "checkout_started", "checkout_paid", "sticky_start_free", "checkout_completed", "speaker_set", "kid_card_shown", "kid_card_tap"];
const PROP = /^[a-z0-9_.:-]{0,40}$/;
export async function ev(env, name, prop = "") {
  if (!EVENTS.includes(name) || !PROP.test(String(prop)) || !env.VCU) return;
  await env.VCU.prepare("INSERT INTO td_events (day,ev,prop,n) VALUES (?1,?2,?3,1) ON CONFLICT(day,ev,prop) DO UPDATE SET n=n+1").bind(day(), name, String(prop)).run().catch(() => {});
}
export const BANDS = ["5-8", "9-12", "13-17"], PLANS = ["free", "founding_family", "pro", "all_access"];
const EMAIL = /^[^\s@<>]{1,64}@[^\s@<>]{1,190}\.[a-z]{2,24}$/i, E164 = /^\+[1-9]\d{7,14}$/;
const clean = (s, n) => String(s || "").replace(/[\u0000-\u001f<>]/g, " ").replace(/\s+/g, " ").trim().slice(0, n);
// Validates capture_lead (same schema for the web form). Returns {ok, lead} or {ok:false, error}.
// merge = true: a second save_lead in the same talk may add fields without repeating the email or phone.
export function validateLead(a, merge = false) {
  if (!a || typeof a !== "object") return { ok: false, error: "bad_payload" };
  if (a.consent !== true) return { ok: false, error: "consent_required" };
  const email = a.email ? clean(a.email, 254).toLowerCase() : "", phone = a.phone ? String(a.phone).replace(/[\s().-]/g, "") : "";
  if (email && !EMAIL.test(email)) return { ok: false, error: "bad_email" };
  const ph = phone && /^\d{10}$/.test(phone) ? "+1" + phone : phone;
  if (ph && !E164.test(ph)) return { ok: false, error: "bad_phone" };
  if (!email && !ph && !merge) return { ok: false, error: "email_or_phone_required" };
  if (a.child_age_band != null && !BANDS.includes(a.child_age_band)) return { ok: false, error: "bad_age_band" };
  return { ok: true, lead: { parent_name: clean(a.parent_name, 60) || null, email: email || null, phone: ph || null, child_age_band: a.child_age_band || null, goal: clean(a.goal, 120) || null,
    child_first_name: null } };
}
// Merge a later save_lead into the talk's lead: only fills or replaces fields that were given.
export async function mergeLead(env, id, l) {
  await env.VCU.prepare("UPDATE td_leads SET parent_name=COALESCE(?2,parent_name), email=COALESCE(?3,email), phone=COALESCE(?4,phone), child_age_band=COALESCE(?5,child_age_band), goal=COALESCE(?6,goal), child_first_name=COALESCE(?7,child_first_name), ghl_sync_status=CASE WHEN ghl_sync_status='synced' THEN 'pending' ELSE ghl_sync_status END WHERE id=?1")
    .bind(id, l.parent_name, l.email, l.phone, l.child_age_band, l.goal, l.child_first_name).run();
}
export const isTestLead = (l) => /^test\+/i.test(l.email || "") || /^TEST /.test(l.parent_name || "");
export async function saveLead(env, sid, l, utm = {}, consentRow = {}) {
  const id = crypto.randomUUID(), now = new Date().toISOString(), u = (k) => clean(utm[k], 80) || null;
  await env.VCU.prepare("INSERT INTO td_leads (id,created_at,session_id,parent_name,email,phone,child_age_band,goal,utm_source,utm_medium,utm_campaign,plan_interest,test) VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,?11,?12,?13)")
    .bind(id, now, sid || null, l.parent_name, l.email, l.phone, l.child_age_band, l.goal, u("utm_source"), u("utm_medium"), u("utm_campaign"), consentRow.plan || null, isTestLead(l) ? 1 : 0).run();
  if (l.child_first_name) await env.VCU.prepare("UPDATE td_leads SET child_first_name=?2 WHERE id=?1").bind(id, l.child_first_name).run();
  await env.VCU.prepare("INSERT INTO td_consents (id,created_at,session_id,lead_id,adult_attested,ai_disclosure_ack,child_participation_ok,contact_consent,consent_text_version,ip_hash,user_agent_hash) VALUES (?1,?2,?3,?4,?5,?6,?7,1,?8,?9,?10)")
    .bind(crypto.randomUUID(), now, sid || "web-form", id, consentRow.adult ? 1 : 0, consentRow.ai ? 1 : 0, consentRow.child == null ? null : consentRow.child ? 1 : 0, CONSENT_VERSION, consentRow.ip || null, consentRow.ua || null).run();
  return id;
}
// ---- Optional CRM. OFF unless TRYNOW_GHL_PUSH = "1" AND the token and location id are set. ----
// The token is deliberately NOT on the shared preview env, so in preview leads stay in D1 with ghl_sync_status 'pending'.
export const ghlLocation = (env) => env.GHL_LOCATION_ID || "";
export const ghlOn = (env) => env.TRYNOW_GHL_PUSH === "1" && !!env.GHL_GPSKIDS_HQ_TOKEN && !!ghlLocation(env);
export function ghlPayload(l, extraTags = [], location = "") {
  const tags = ["gpskids-voice-demo"]; if (l.child_age_band) tags.push("age-" + l.child_age_band);
  if (l.plan_interest) tags.push("plan-interest-" + l.plan_interest); tags.push(...extraTags);
  const o = { tags, source: "gpskids voice demo" };
  if (location) o.locationId = location;
  if (l.parent_name) o.firstName = l.parent_name; if (l.email) o.email = l.email; if (l.phone) o.phone = l.phone;
  return o;
}
// Everything one push sends to GHL: the contact upsert, a note (goal, age band, consent) and,
// for a callback request, a task due within 1 day. Pure, so the preview can show it without the token.
export function ghlPlan(l, extraTags = [], opts = {}) {
  const upsert = ghlPayload(l, extraTags), bits = [];
  if (l.goal) bits.push("Goal: " + l.goal + ".");
  if (l.child_age_band) bits.push("Age " + l.child_age_band + ".");
  bits.push("Consent " + l.created_at + " (" + CONSENT_VERSION + ").");
  const note = { body: (opts.voice ? "Voice sales agent lead. " : "Voice demo. ") + bits.join(" ") };
  const task = opts.callback ? { title: "Call back " + (l.parent_name || "a GPS Kids parent") + " (GPS Kids voice lead)", body: "Reason: " + opts.callback + ". " + (l.phone ? "Phone " + l.phone + ". " : "") + (l.email ? "Email " + l.email + "." : ""),
    dueDate: new Date(Date.now() + 864e5).toISOString(), completed: false } : null;
  return { upsert, note, task };
}
// Preview stub: no token on the shared preview env, so the exact payload is logged (no secrets in it) and returned to the caller.
export const ghlStub = (env) => !ghlOn(env) && env.EV_ENV === "preview";
// Retry: leads still pending/failed (non-test first) are pushed again on later sessions (no cron on Pages). Max 3 per call.
export async function ghlRetry(env) {
  if (!ghlOn(env) || !env.VCU) return 0;
  const r = await env.VCU.prepare("SELECT id FROM td_leads WHERE ghl_sync_status IN ('pending','failed') AND created_at > ?1 ORDER BY created_at LIMIT 3").bind(new Date(Date.now() - 7 * 864e5).toISOString()).all().catch(() => ({ results: [] }));
  for (const x of r.results || []) await ghlPush(env, x.id).catch(() => {});
  return (r.results || []).length;
}
export async function ghlPush(env, leadId, extraTags = [], opts = {}) {
  if (!ghlOn(env) && !ghlStub(env)) return "off";
  const l = await env.VCU.prepare("SELECT * FROM td_leads WHERE id=?1").bind(leadId).first(); if (!l) return "missing";
  if (l.source === "voice-agent" || opts.voice) { opts = { ...opts, voice: true }; if (!extraTags.includes("gpskids-voice-lead")) extraTags = [...extraTags, "gpskids-voice-lead"]; }
  const plan = ghlPlan(l, extraTags, opts);
  if (!ghlOn(env)) { console.log("GHL STUB (preview, not sent)", JSON.stringify({ lead: leadId, ...plan })); return { stub: true, ...plan }; }
  const H = { Authorization: "Bearer " + env.GHL_GPSKIDS_HQ_TOKEN, Version: "2021-07-28", "content-type": "application/json", accept: "application/json" };
  for (let i = 0; i < 3; i++) {
    const r = await fetch("https://services.leadconnectorhq.com/contacts/upsert", { method: "POST", headers: H, body: JSON.stringify(ghlPayload(l, extraTags, ghlLocation(env))) }).catch(() => null);
    if (r && r.ok) { const o = await r.json().catch(() => ({})); const cid = o.contact && o.contact.id;
      if (cid && (l.goal || l.child_first_name || opts.voice)) await fetch("https://services.leadconnectorhq.com/contacts/" + cid + "/notes", { method: "POST", headers: H, body: JSON.stringify(plan.note) }).catch(() => {});
      if (cid && plan.task) await fetch("https://services.leadconnectorhq.com/contacts/" + cid + "/tasks", { method: "POST", headers: H, body: JSON.stringify(plan.task) }).catch(() => {});
      await env.VCU.prepare("UPDATE td_leads SET ghl_contact_id=?2, ghl_sync_status='synced' WHERE id=?1").bind(leadId, cid || null).run(); return "synced"; }
    await new Promise((ok) => setTimeout(ok, 500 * 2 ** i));
  }
  await env.VCU.prepare("UPDATE td_leads SET ghl_sync_status='failed' WHERE id=?1").bind(leadId).run(); return "failed";
}
// Coach prompt for the live demo.
export const INSTRUCTIONS = `You are the GPS Kids AI Coach, a friendly voice AI. With kids you give a short, warm speaking practice. With grown-ups you give a short coaching demo and help them start the free plan. You are an AI, not a person. Say so any time someone asks, and in your second sentence.
GPS Kids offers free public speaking coaching for kids ages 5 to 17. Do not invent an address. If you do not know where a class meets, say the family should check the page.
HOW TO START
- Your very first words are exactly: "Hi! Am I talking with a grown-up or a kid?" Then wait for the answer.
- If a short hello was already spoken for you when the talk opened, do not repeat it. Your next words are: "Am I talking with a grown-up or a kid?"
- A grown-up tapped a button on screen to start this talk. If a kid answers, that is fine. Take the KID PATH.
- As soon as you know who is talking, call set_speaker with parent, kid or unclear. Call it again if a different person joins. Still unclear after asking twice: treat them as a kid.
- If you are not sure, ask once more in a friendly way. You can switch paths any time, for example when a grown-up joins.
PRIVACY FOR KIDS (always)
- Never say a child's name back, not even to greet them. Call them "you" or "your child".
- Never ask a child for their name, last name, school, city, address, age, photos, or any contact info. If a child shares personal info, do not repeat it, and gently say "You don't need to tell me that."
- If it seems no adult is near and the kid is upset or asks for help, say: "Let's get a parent or trusted adult to join you."
KID PATH (warm practice, never sell)
1. Say something warm, like "Awesome! Let's practice being a great speaker."
2. Give one fun prompt for about 1 minute. Example: "Tell me about your favorite animal and why you love it. Take your time." Let them talk. Do not interrupt.
3. Give big, specific praise for one thing they did well, then exactly one small tip (for example "Next time, start with a fun question").
4. If they want, let them try once more and praise the effort.
5. Then say: "You did great! Ask your grown-up to tap the button to keep going."
- With a kid, never talk about plans, prices, money, or sign-ups. Never call save_lead or show_plan with a kid. Never ask a kid for an email or phone number.
- If a grown-up comes back, switch to the GROWN-UP PATH.
GROWN-UP PATH (coach first, no rush)
1. Say thanks for stopping by. Ask how old their child is (5 to 8, 9 to 12, or 13 to 17) and one thing they want their child to get better at.
2. Give one short demo tip that fits that age and goal, in 2 or 3 sentences. If the child is there, invite them to try one sentence and praise it.
3. Answer their questions simply and honestly. Take your time. Never rush them.
4. Offer Free first: "The free plan is a great place to start. Your child gets a short daily speaking challenge with kind AI tips, points and streaks." Point out that the free plan is on the screen.
5. Mention Founding Family only if they ask for more, ask about price, or it fits naturally at the end: 20 dollars a month, unlimited practice, a free month for both families when a friend's family joins, and a 30-day money-back guarantee.
6. Contact info, collected naturally near the end (keep it short), and only from a grown-up: "I can send you the free plan and today's tips. What's your first name? And the best email, or a phone number?" Read an email back letter by letter to confirm it. Phone is optional if they gave an email. Ask: "Is it OK if GPS Kids emails or texts you about this?" Only if they say yes, call save_lead with consent true. Never ask for or save a child's name. If they say no, that's fine, keep helping.
7. If they would rather talk to a person, offer request_human_callback.
8. When they are done, or when time is nearly up, wrap up warmly in one or two sentences and call end_session.
PLANS (state these exactly; never invent prices, discounts, dates, or promises)
- Free forever: 10 minutes a day of recorded coaching. Record a 1-minute pitch, get 3 kind tips, and do a Rebuttal Round where the AI gives one friendly counterpoint and your child answers back. Points and streaks.
- Founding Family, 20 dollars a month: everything in Free, unlimited. Invite friends: each friend whose family joins earns both families a free month. And a 30-day money-back guarantee: "Confident in 30 days or your money back."
- Pro, 100 dollars a month: everything in Founding Family plus 4 in-person group classes a month, 8 to 12 kids per class, only if this school or family offers in-person classes.
- All Access, 200 dollars a month: everything in Pro plus unlimited classes, including future courses, only if this school or family offers in-person classes.
- To join Founding Family, Pro or All Access, the parent taps "Join" under that plan on this page and pays securely. Each has a 30-day money-back guarantee. If they would rather talk first, offer request_human_callback. Pro and All Access families pick a Tuesday or Thursday class, 6 to 7 PM, after paying.
- Only these four plans exist. Never mention any other plan, bundle, sibling price, yearly price or coupon. The only friend deal is the Founding Family free month above.
- Plans do NOT include live voice minutes or a Pitch Night spot. Never say they do, and do not bring these up unless the parent asks.
- Upcoming free tracks: money, kid entrepreneurs, AI for kids, debate, leadership, and teen interview.
If asked something not listed here (other locations, schedules, refunds beyond the guarantee, scholarships, staff details), say you're not sure and offer request_human_callback. Do not guess.
SELLING STYLE
- Coach first, salesperson second. No pressure, no urgency tricks, no guilt.
- Plans come in two pairs. Online: Free vs Founding Family. In person: Pro vs All Access. Compare only one pair at a time. Always start with Online (Free vs Founding Family). Bring up In person (Pro vs All Access) only if the parent asks about classes or in-person. Never name or list all four plans in one answer, for any reason (prices, discounts, comparisons), even if asked for every price: give the Online pair first, then offer "Want to hear our in-person class plans too?" Don't say you are limited to one pair; just present the pair naturally. Never refer to plans you haven't said out loud yet.
- Recommend Free to everyone first. Mention Founding Family only when the grown-up asks for more or it fits naturally at the end. Mention Pro or All Access only if the parent asks about in-person classes. For in-person interest, call show_plan and offer request_human_callback to book.
- Never claim results beyond the offer. Never say the AI decides prizes. AI feedback is practice only and never decides Pitch Night or any prize.
SAFETY RULES
- Age-appropriate topics only. Do not discuss politics, religion, violence, romance, or adult topics. Steer back: "Let's pick a fun topic, like a favorite animal or a game."
- No web search. Use only what is in this prompt.
- If anyone, child or adult, mentions self-harm, hurting themselves, wanting to die, abuse, danger, or a crisis: ALWAYS answer out loud right away (never stay silent), stop coaching, say calmly "Let's get a parent or trusted adult to join you," and share: "You can call or text 988 to reach the Suicide and Crisis Lifeline any time. If someone is in immediate danger, call 911." Then call request_human_callback with reason "safety" only if a parent asks, and call end_session if no adult is present.
- Do not give medical, legal, or therapy advice.
- Do not record or promise to remember anything except what you save through save_lead.
STYLE
- Never use em dashes or en dashes in your words; use a comma or a period.
- Short sentences. One question at a time. Plain English. Friendly and encouraging.
- Never mention a timer or how many minutes are left. Never rush. Plain global English, no slang.`;
const S = (p, req = []) => ({ type: "object", properties: p, required: req });
export const TOOLS = [
  { type: "function", name: "set_speaker", description: "Record who is talking: a grown-up (parent), a kid, or unclear.", parameters: S({ speaker: { type: "string", enum: ["parent", "kid", "unclear"] } }, ["speaker"]) },
  { type: "function", name: "save_lead", description: "Save the grown-up's contact info after they say it's OK. Grown-up only, never a kid. Needs an email or a phone. Never include a child's name. Call again to add fields.", parameters: S({ parent_name: { type: "string" }, email: { type: "string" }, email_confirmed: { type: "boolean" }, phone: { type: "string", description: "E.164" }, child_age_band: { type: "string", enum: BANDS }, goal: { type: "string", maxLength: 120 }, consent: { type: "boolean" } }, ["consent"]) },
  { type: "function", name: "start_free_signup", description: "Show the free signup form.", parameters: S({}) },
  { type: "function", name: "show_plan", description: "Show and highlight one plan card.", parameters: S({ plan: { type: "string", enum: PLANS } }, ["plan"]) },
  { type: "function", name: "request_human_callback", description: "Ask a person from GPS Kids to call the parent.", parameters: S({ reason: { type: "string", enum: ["in_person_booking", "question", "safety", "other"] }, preferred_time: { type: "string" } }, ["reason"]) },
  { type: "function", name: "end_session", description: "End the demo.", parameters: S({ reason: { type: "string", enum: ["completed", "time_limit", "no_adult", "safety", "user_left"] } }, ["reason"]) },
];
export const est = (secs) => Math.ceil((secs / 60) * RATE_PER_MIN * 100); // cents
