// /api/fc/* : free coaching taste on the home page (PREVIEW ONLY: every route refuses on production hosts).
//   GET  /api/fc/config                 -> { live, cap }  (+ preview safety flags: no secret values)
//   POST /api/fc/session {device, topic} -> { token, max_seconds, model, instructions }  1 per device or IP per day + global FC_DAILY_CAP
//   POST /api/fc/lead {first, email, band, consent:true} -> { ok, id }   saved to fc_leads, source home-voice-taste
//   GET  /api/fc/leads[?format=csv]  header x-admin-code = NOTES_ADMIN_CODE -> { leads } or CSV
import { json, isPreview, day, hash, voiceKey, same, db, bump, isTest, instructions, TOPICS, BANDS, TASTE_SECONDS, SOURCE } from "../../../lib/freecoach.js";
import { mintConnect } from "../../../lib/provider.js";
const cap = (env) => Math.max(0, Number(env.FC_DAILY_CAP || 300));
const ipOf = (r) => r.headers.get("cf-connecting-ip") || "unknown";
export async function onRequest(ctx) {
  const { request, env, params } = ctx;
  if (!isPreview(request)) return json({ error: "not_here" }, 404);
  if (!env.VCU) return json({ error: "no_db" }, 503);
  const p = (params.path || []).join("/"), m = request.method;
  try {
    if (p === "config" && m === "GET") return json({ live: !!voiceKey(env), cap: cap(env), seconds: TASTE_SECONDS });
    if (p === "session" && m === "POST") return session(request, env);
    if (p === "lead" && m === "POST") return lead(request, env);
    if (p === "leads" && m === "GET") return leads(request, env);
  } catch (e) { return json({ error: "server" }, 500); }
  return json({ error: "not_found" }, 404);
}
async function body(r) { try { return await r.json(); } catch (e) { return null; } }
async function session(request, env) {
  const b = await body(request); if (!b) return json({ error: "bad_json" }, 400);
  if (typeof b.device !== "string" || !/^[a-z0-9-]{8,64}$/.test(b.device)) return json({ error: "need_device" }, 400);
  const topic = TOPICS[b.topic] ? b.topic : "me", D = await db(env), d = day(), ip = ipOf(request);
  const ipH = await hash(d + "|fcip|" + ip, env), devH = await hash(d + "|fcdev|" + b.device, env), tst = isTest(request, env);
  if (!tst) {
    const mine = await D.prepare("SELECT COUNT(*) n FROM fc_sessions WHERE day=?1 AND (dev_h=?2 OR ip_h=?3)").bind(d, devH, ipH).first("n");
    if (mine >= 1) return json({ error: "come_back_tomorrow", message: "You had your free practice today. Come back tomorrow, or type your answer below!" }, 429);
  }
  const all = await D.prepare("SELECT COUNT(*) n FROM fc_sessions WHERE day=?1").bind(d).first("n");
  if (all >= cap(env)) return json({ error: "resting", message: "Coach is resting today. Type your answer below instead!" }, 503);
  if (!voiceKey(env)) return json({ error: "live_off", message: "Talking is resting. Type your answer below!" }, 503);
  const minted = await mintConnect(env, { seconds: TASTE_SECONDS + 15 });
  if (!minted) return json({ error: "token_failed", message: "Coach can't talk right now. Type your answer below!" }, 502);
  const id = crypto.randomUUID();
  await D.prepare("INSERT INTO fc_sessions (id,day,dev_h,ip_h,topic,created) VALUES (?1,?2,?3,?4,?5,?6)").bind(id, d, devH, ipH, topic, Date.now()).run();
  return json({ connect_url: minted.connect_url, voice: minted.voice, session_id: id, max_seconds: TASTE_SECONDS, instructions: instructions(topic) });
}
const EMAIL = /^[^\s@]{1,64}@[^\s@]{1,189}\.[a-z]{2,24}$/i;
async function lead(request, env) {
  const b = await body(request); if (!b) return json({ error: "bad_json" }, 400);
  const first = String(b.first || "").replace(/[<>\u0000-\u001f]/g, "").trim().slice(0, 60), email = String(b.email || "").trim().toLowerCase().slice(0, 254);
  if (!first) return json({ error: "need_first" }, 400);
  if (!EMAIL.test(email)) return json({ error: "need_email" }, 400);
  if (!BANDS.includes(b.band)) return json({ error: "need_band" }, 400);
  if (b.consent !== true) return json({ error: "need_consent" }, 400);
  const D = await db(env), ipH = await hash("fclead|" + ipOf(request), env);
  if (!isTest(request, env) && (await bump(env, "lead:" + day() + ":" + ipH, 26 * 3600)) > 10) return json({ error: "limit" }, 429);
  const id = crypto.randomUUID(), test = /^test\+/i.test(email) || isTest(request, env) ? 1 : 0;
  await D.prepare("INSERT INTO fc_leads (id,created,parent_first,parent_email,kid_age,consent,source,ip_h,test) VALUES (?1,?2,?3,?4,?5,1,?6,?7,?8)")
    .bind(id, new Date().toISOString(), first, email, b.band, SOURCE, ipH, test).run();
  return json({ ok: true, id });
}
const csvCell = (v) => { let s = String(v == null ? "" : v); if (/^[=+\-@]/.test(s)) s = "'" + s; return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; };
async function leads(request, env) {
  if (!env.NOTES_ADMIN_CODE || !same(request.headers.get("x-admin-code") || "", env.NOTES_ADMIN_CODE)) return json({ error: "code" }, 401);
  const D = await db(env);
  const { results } = await D.prepare("SELECT created, parent_first, parent_email, kid_age, consent, source, test FROM fc_leads ORDER BY created DESC LIMIT 5000").all();
  if (new URL(request.url).searchParams.get("format") !== "csv") return json({ leads: results });
  const cols = ["created", "parent_first", "parent_email", "kid_age", "consent", "source", "test"];
  const csv = [cols.join(",")].concat(results.map((r) => cols.map((c) => csvCell(r[c])).join(","))).join("\n") + "\n";
  return new Response(csv, { headers: { "content-type": "text/csv; charset=utf-8", "content-disposition": 'attachment; filename="gpskids-free-coach-leads.csv"', "cache-control": "no-store" } });
}
