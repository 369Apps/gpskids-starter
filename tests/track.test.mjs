// Unit tests for anonymous usage events: ingest (functions/api/ev.js), caps, test-traffic rules, retention cleanup,
// the funnel math (lib/funnel.js) both in pure JS and through the real SQL on a local D1 (Miniflare), and /api/stats auth.
// usage: node tests/track.test.mjs
import { readFileSync } from "node:fs";
import { Miniflare } from "./node/node_modules/miniflare/dist/src/index.js";
import { onRequestPost as ingest, cleanBatch, writeMode, cleanup, etDayOf, KEEP_DAYS, PER_IP_DAY } from "../functions/api/ev.js";
import { onRequestGet as statsGet, onRequestPost as statsPost } from "../functions/api/stats.js";
import { summarize, funnelFromD1, params, inline, args, SQL, median, reportLines } from "../lib/funnel.js";
import { STEPS, kOk, MAX_BATCH } from "../public/steps.js";
import { anonHash, ipHash, etDay } from "../lib/guard.js";

const mf = new Miniflare({ modules: true, script: "export default { fetch() { return new Response('') } }", d1Databases: ["EV"] });
const EV = await mf.getD1Database("EV");
for (const s of readFileSync(new URL("../migrations-events/0001_events.sql", import.meta.url), "utf8").replace(/--.*$/gm, "").split(";").map((x) => x.trim()).filter(Boolean)) await EV.prepare(s).run();
let fails = 0, n = 0; const ok = (c, m) => { n++; console.log((c ? "PASS " : "FAIL ") + m); if (!c) fails++; };
const PROD = "https://gpskids.app", PREV = "https://tracking.gpskids-speak.pages.dev", KEY = "k".repeat(40);
const envProd = { EV, IP_SALT: "salt", EV_ENV: "production", PITCH_ADMIN_KEY: KEY }, envPrev = { EV, IP_SALT: "salt", EV_ENV: "preview", PITCH_ADMIN_KEY: KEY };
const ctx = { waitUntil() {} };
const U = (i) => `00000000-0000-4000-8000-${String(i).padStart(12, "0")}`;
const req = (host, body, { test, origin = host, ip = "203.0.113.9", raw } = {}) => new Request(host + "/api/ev", { method: "POST", body: raw ?? JSON.stringify(body),
  headers: { "content-type": "application/json", origin, "sec-fetch-site": origin === host ? "same-origin" : "cross-site", "cf-connecting-ip": ip, ...(test ? { "x-gks-test": test } : {}) } });
const post = async (host, env, body, o) => { const r = await ingest({ request: req(host, body, o), env, ...ctx }); return { s: r.status, j: r.status === 204 ? null : await r.json().catch(() => ({})) }; };
const rows = async (w = "") => (await EV.prepare("SELECT * FROM ev " + w + " ORDER BY sid, n").all()).results;
const now = Date.now();
const batch = (sid, p, d, list, clock = now) => ({ sid, p, d, now: clock, e: list });

// ---------- step list
ok(Object.keys(STEPS).length >= 30 && ["app_open", "plan_part", "talk_plus", "rec_end", "auto_stop", "feedback_view", "coach_heard", "coach_answered", "retry", "duel_sent", "duel_open", "duel_join", "share", "pn_form", "pn_submit", "pn_abandon", "app_hide", "app_close", "profile_pick", "prompt_shown", "plan_open", "rec_start"].every((s) => s in STEPS), "every step from the spec is in the list");
ok(kOk("app_hide", "rec_start") && !kOk("app_hide", "hello") && kOk("rec_end", "auto") && !kOk("rec_end", "my name is Maya") && kOk("coach_heard", null) && !kOk("coach_heard", "x"), "short codes only from the fixed lists (no free text)");

// ---------- validation (pure)
let c = cleanBatch(batch(U(1), U(2), U(3), [[0, "app_open", now - 1000, null, "direct"], [1, "nope", now], [2, "rec_end", now, 58.4, "tap"], [3, "rec_end", now, 5, "Maya"], [4, "share", now, null, "wa", "abcdefghjk"], [5, "duel_sent", now, null, "friend", "abcdefghjk"], [6, "app_open", now - 7 * 3600e3], [7, "duel_open", now, null, "ok", "bad id!"]]));
ok(c.rows.length === 5 && c.rows.map((r) => r.n).join() === "0,2,4,5,7", "unknown steps, free-text codes and too-old events are dropped: kept " + c.rows.map((r) => r.n).join());
ok(c.rows[1].v === 58 && c.rows[2].x === null && c.rows[3].x === "abcdefghjk" && c.rows[4].x === null, "v rounded; a duel id is kept only on duel steps and only in the duel-id format");
c = cleanBatch(batch(U(1), U(2), U(3), [[0, "app_open", 1000 - 2000]], 1000), 5_000_000_000_000);
ok(c.rows[0].ts === 5_000_000_000_000 - 2000, "a wrong phone clock doesn't matter: time = server time minus the event's age on the phone");
ok(cleanBatch(batch("not-a-uuid", U(2), U(3), [[0, "app_open", now]])).error === "bad_ids" && cleanBatch(batch(U(1), U(2), U(3), Array.from({ length: MAX_BATCH + 1 }, (_, i) => [i, "shuffle", now]))).error === "bad_events", "bad ids / more than 50 events -> rejected");

// ---------- who may write
const mode = (host, env, test) => writeMode(new Request(host + "/api/ev", { headers: test ? { "x-gks-test": test } : {} }), env);
ok(mode(PROD, envProd) === 0 && mode("https://gpskids-speak.pages.dev", envProd) === 0, "production host -> real rows");
ok(mode(PREV, envPrev) === null && mode(PREV, envProd) === null, "a real visit to a preview is never recorded");
ok(mode(PREV, envPrev, "count") === 1 && mode(PROD, envProd, "count") === 1, "x-gks-test: count -> stored as test rows");
ok(mode(PREV, envPrev, "1") === null && mode(PROD, envProd, "1") === null, "other x-gks-test values (the normal e2e runs) -> nothing stored");
ok(mode(PREV, envProd, "count") === null && mode(PROD, envPrev) === null, "safety: a production-bound DB never takes preview writes; a preview DB never takes real traffic");

// ---------- ingest through the handler
let r = await post(PREV, envPrev, batch(U(10), U(11), U(12), [[0, "app_open", now - 500, null, "direct"], [1, "prompt_shown", now - 200, 3, "explorers"]]), { test: "count" });
let all = await rows();
ok(r.s === 200 && r.j.stored === 2 && all.length === 2 && all.every((x) => x.test === 1), "preview + x-gks-test: count -> 2 test rows");
ok(all[0].p === (await anonHash(envPrev, "player", U(11))) && all[0].d === (await anonHash(envPrev, "device", U(12))) && all[0].sid === (await anonHash(envPrev, "session", U(10))), "player / device / session ids stored only as salted SHA-256 hashes");
ok(!JSON.stringify(all).includes(U(11)) && !JSON.stringify(all).includes("203.0.113.9") && Object.keys(all[0]).join() === "day,test,sid,n,ts,p,d,step,v,k,x", "no raw ids, no IP, no other columns: " + Object.keys(all[0]).join());
ok(all[0].day === etDayOf(all[0].ts) && all[1].v === 3 && all[1].k === "explorers", "ET day, v and k stored");
r = await post(PREV, envPrev, batch(U(10), U(11), U(12), [[0, "app_open", now - 500, null, "direct"], [1, "prompt_shown", now - 200, 3, "explorers"], [2, "plan_open", now]]), { test: "count" });
ok(r.s === 200 && (await rows()).length === 3, "a resent batch (sendBeacon retry) is stored once (sid + sequence number)");
r = await post(PREV, envPrev, batch(U(20), U(21), U(22), [[0, "app_open", now]]));
ok(r.s === 204 && (await rows()).length === 3, "preview without the test header -> 204, nothing stored");
r = await post(PREV, envPrev, batch(U(20), U(21), U(22), [[0, "app_open", now]]), { test: "1" });
ok(r.s === 204 && (await rows()).length === 3, "x-gks-test: 1 (regular test runs) -> 204, nothing stored");
r = await post(PROD, envProd, batch(U(30), U(31), U(32), [[0, "app_open", now, null, "direct"]]));
ok(r.s === 200 && (await rows("WHERE test = 0")).length === 1, "production host -> one real row (test = 0)");
r = await post(PROD, envProd, batch(U(30), U(31), U(32), [[1, "app_open", now]]), { origin: "https://evil.example" });
ok(r.s === 403, "cross-site write -> 403");
r = await post(PROD, envProd, batch(U(30), U(31), U(32), [[1, "app_open", now]]), { origin: PREV });
ok(r.s === 403, "a preview page can't write to production (origin must match the host) -> 403");
r = await post(PROD, envProd, null, { raw: JSON.stringify(batch(U(30), U(31), U(32), [[1, "app_open", now, null, null]])) + " ".repeat(13000) });
ok(r.s === 413, "payload over 12 KB -> 413");
r = await post(PROD, envProd, batch(U(30), U(31), U(32), [[1, "nope", now]]));
ok(r.s === 400 && r.j.error === "no_valid_events", "nothing valid -> 400");
// per-IP cap
const ipKey = "ev:ip:" + (await ipHash(new Request(PROD, { headers: { "cf-connecting-ip": "198.51.100.77" } }), envProd, etDay()));
await EV.prepare("INSERT INTO evrl (k, n, exp) VALUES (?1, ?2, ?3)").bind(ipKey, PER_IP_DAY, Math.floor(now / 1000) + 3600).run();
r = await post(PROD, envProd, batch(U(40), U(41), U(42), [[0, "app_open", now]]), { ip: "198.51.100.77" });
ok(r.s === 429 && r.j.error === "limit", `per-IP cap (${PER_IP_DAY} batches/day, counters in the events DB) -> 429`);
r = await post(PROD, envProd, batch(U(40), U(41), U(42), [[0, "app_open", now]]), { ip: "198.51.100.78" });
ok(r.s === 200, "another IP is fine");
ok((await EV.prepare("SELECT COUNT(*) n FROM evrl WHERE k LIKE 'tev:%'").first("n")) > 0 && (await EV.prepare("SELECT COUNT(*) n FROM evrl WHERE k LIKE 'ev:%'").first("n")) > 0, "test and real traffic use separate rate-limit counters");

// ---------- retention
await EV.prepare("DELETE FROM ev").run();
const old = (days) => new Date(Date.parse(etDay() + "T12:00:00Z") - days * 864e5).toISOString().slice(0, 10);
const ins = (o) => EV.prepare("INSERT INTO ev (day, test, sid, n, ts, p, d, step, v, k, x) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11)")
  .bind(o.day, o.test || 0, o.sid, o.n, o.ts, o.p, o.d || "dev", o.step, o.v ?? null, o.k ?? null, o.x ?? null).run();
await ins({ day: old(KEEP_DAYS + 1), sid: "a", n: 0, ts: 1, p: "p", step: "app_open" });
await ins({ day: old(KEEP_DAYS - 1), sid: "b", n: 0, ts: 1, p: "p", step: "app_open" });
await ins({ day: old(3), test: 1, sid: "c", n: 0, ts: 1, p: "p", step: "app_open" });
await ins({ day: old(1), test: 1, sid: "d", n: 0, ts: 1, p: "p", step: "app_open" });
await cleanup(envProd);
ok((await rows()).map((x) => x.sid).join() === "b,d", `cleanup: real rows kept ${KEEP_DAYS} days, test rows 2 days`);
await EV.prepare("DELETE FROM ev").run();

// ---------- funnel math (pure JS) on hand-made sessions
const T0 = Date.parse("2026-10-08T15:00:00Z"), D = "2026-10-08";
const mk = (sid, p, steps) => steps.map(([step, sec, k, x], n) => ({ sid, p, n, ts: T0 + sec * 1000, day: D, step, k: k ?? null, x: x ?? null, v: null }));
const ev = [
  ...mk("s1", "A", [["app_open", 0], ["prompt_shown", 5], ["rec_start", 20], ["rec_end", 80, "tap"], ["feedback_view", 90, "daily"], ["duel_sent", 150, "friend", "X1"], ["app_hide", 160, "duel_sent"]]),
  ...mk("s2", "B", [["app_open", 0], ["prompt_shown", 10], ["app_hide", 40, "prompt_shown"]]),
  ...mk("s3", "C", [["app_open", 0], ["prompt_shown", 4], ["plan_open", 10], ["plan_part", 12], ["rec_start", 40], ["app_hide", 50, "rec_start"], ["app_back", 650], ["rec_end", 700, "tap"], ["feedback_view", 710], ["app_close", 760, "feedback_view"]]),
  ...mk("s4", "D", [["app_open", 0, "duel"], ["duel_open", 3, "ok", "X1"], ["rec_start", 10], ["rec_end", 70, "tap"], ["duel_join", 75, "ok", "X1"], ["app_close", 90]]),
  ...mk("s5", "E", [["app_open", 0, "pitch"], ["pn_open", 1, "open"], ["pn_form", 5], ["app_hide", 60, "pn_form"]]),
  ...mk("s6", "A", [["app_open", 0], ["prompt_shown", 6]]),
];
let s = summarize({ events: ev, joins: [{ sender: "A", x: "X1", joiner: "D" }], ret: { base: 4, ret: 1 }, from: D, to: D });
ok(s.sessions === 6 && s.players === 5, "6 sessions, 5 players");
ok(s.funnel.map((f) => f.n).join() === "5,3,2,1,1", "funnel open > recorded > feedback > duel sent > friend joined = " + s.funnel.map((f) => f.n).join(" > "));
ok(s.funnel[1].step_pct === 60 && s.funnel[2].step_pct === 66.7 && s.funnel[3].step_pct === 50 && s.funnel[4].step_pct === 100 && s.funnel[4].of_open_pct === 20, "step % of previous and of opens");
ok(s.drop_offs.map((d) => d.step + ":" + d.pct).join() === "prompt_shown:33.3,duel_join:16.7,duel_sent:16.7", "top 3 drop-offs (last real step, hide/close ignored): " + s.drop_offs.map((d) => d.step + " " + d.pct + "%").join(", "));
// s1 = 160 s, s2 = 40, s3 = 50 active + (650->760) 110 = 160 (the 600 s hidden is not counted), s4 = 90, s5 = 60, s6 = 6
ok(s.median_session_s === 75 && s.avg_session_s === 86, `median session 75 s (time hidden is not counted), average 86 s: got ${s.median_session_s} / ${s.avg_session_s}`);
const rs = s.step_time.find((t) => t.step === "rec_start");
ok(rs && rs.n === 3 && rs.median_s === 60 && !s.step_time.some((t) => t.step === "app_hide"), "time on step: Started recording median 60 s (3 times); no time counted while hidden");
ok(s.next_day_return.pct === 25 && s.friends.friends_joined === 1 && s.friends.per_sender === 1 && s.friends.per_kid === 0.2, "next-day return 25%, friends brought per sender 1, per player 0.2");
ok(s.pitch.started === 1 && s.pitch.submitted === 0 && s.pitch.abandoned === 1 && s.pitch.abandoned_at.form === 1, "Pitch Night: 1 started, 0 submitted, 1 abandoned on the form");
{ const s7 = summarize({ events: mk("s7", "F", [["app_open", 0, "pitch"], ["pn_open", 1, "open"], ["pn_form", 5], ["pn_open", 30, "open"], ["pn_abandon", 31, "record"], ["app_close", 40, "pn_abandon"]]), joins: [], ret: { base: 0, ret: 0 }, from: D, to: D });
  ok(s7.pitch.abandoned === 1 && s7.pitch.abandoned_at.record === 1 && s7.session_ends[0].step === "pn_abandon", "Pitch Night: the app's own abandon stage (record) is used even before any recording starts"); }
ok(median([3, 1, 2]) === 2 && median([4, 1, 2, 3]) === 2.5 && median([]) === null, "median");
ok(reportLines(s).length >= 8 && /Funnel/.test(reportLines(s)[0]), "report lines render");
ok(inline(SQL.ret, args("ret", params("2026-10-01", "2026-10-07", 1))).includes("BETWEEN '2026-09-30' AND '2026-10-07'") && /test = 1/.test(inline(SQL.events, args("events", params(D, D, 1)))), "CLI SQL inlines only validated values");
let threw = false; try { params("2026-10-08'; DROP TABLE ev;--", D, 0); } catch (e) { threw = true; } ok(threw, "a bad date can't reach the SQL");

// ---------- the same sessions through the real ingest + real SQL (D1), test traffic kept apart
const sess = (i) => ({ sid: U(100 + i), dev: U(200 + i) });
const players = { A: U(301), B: U(302), C: U(303), D: U(304), E: U(305) };
const groups = {};
for (const e of ev) (groups[e.sid] ||= []).push(e);
let k = 0;
const clockNow = Date.now();
for (const [sid, list] of Object.entries(groups)) {
  const x = sess(k++), base = clockNow - 20 * 60e3; // 20 min ago (all within today)
  const evs = list.map((e) => [e.n, e.step, base + (e.ts - T0), null, e.k, e.x === "X1" ? "abcdefghjk" : null]);
  const rr = await post(PREV, envPrev, { sid: x.sid, p: players[list[0].p], d: x.dev, now: clockNow, e: evs }, { test: "count" });
  if (rr.s !== 200) console.log("ingest failed", rr);
}
await post(PROD, envProd, batch(U(900), U(901), U(902), [[0, "app_open", clockNow - 1000, null, "direct"], [1, "rec_start", clockNow - 500, 60, "audio"], [2, "rec_end", clockNow, 60, "tap"]]));
const today = etDay();
const t1 = await funnelFromD1(EV, today, today, true), t0 = await funnelFromD1(EV, today, today, false);
ok(t1.funnel.map((f) => f.n).join() === "5,3,2,1,1" && t1.sessions === 6, "SQL path, test traffic: same funnel 5 > 3 > 2 > 1 > 1 from hashed rows");
ok(t1.median_session_s === 75 && t1.drop_offs[0].step === "prompt_shown" && t1.friends.friends_joined === 1 && t1.pitch.abandoned === 1, "SQL path: median 75 s, top drop-off prompt_shown, 1 friend joined (matched by hashed duel id), 1 Pitch Night abandoned");
ok(t0.players === 1 && t0.funnel[1].n === 1 && t0.sessions === 1, "real numbers exclude all test traffic (1 real player)");
// next-day return through SQL: player seen yesterday and today
await ins({ day: old(1), sid: "y1", n: 0, ts: clockNow - 864e5, p: await anonHash(envProd, "player", U(901)), step: "app_open" });
await ins({ day: old(1), sid: "y2", n: 0, ts: clockNow - 864e5, p: "someone-else", step: "app_open" });
const nd = await funnelFromD1(EV, today, today, false);
ok(nd.next_day_return.base === 2 && nd.next_day_return.returned === 1 && nd.next_day_return.pct === 50, "next-day return via SQL: 1 of yesterday's 2 players came back today (50%)");

// ---------- /api/stats
const sreq = (q, key, method = "GET", body) => new Request(PREV + "/api/stats" + q, { method, headers: { origin: PREV, "sec-fetch-site": "same-origin", "cf-connecting-ip": "192.0.2.1", ...(key ? { authorization: "Bearer " + key } : {}), ...(body ? { "content-type": "application/json" } : {}) }, ...(body ? { body: JSON.stringify(body) } : {}) });
let sr = await statsGet({ request: sreq(`?from=${today}&to=${today}&test=1`), env: envPrev, ...ctx });
ok(sr.status === 401, "/api/stats without the key -> 401");
sr = await statsGet({ request: sreq(`?from=${today}&to=${today}&test=1`, "w".repeat(40)), env: envPrev, ...ctx });
ok(sr.status === 401, "wrong key -> 401");
sr = await statsGet({ request: sreq(`?from=${today}&to=${today}&test=1`, KEY), env: envPrev, ...ctx });
const sj = await sr.json();
ok(sr.status === 200 && sj.funnel[0].n === 5, "right key -> the same numbers as the report");
sr = await statsGet({ request: sreq(`?from=2026-01-01&to=2026-03-01`, KEY), env: envPrev, ...ctx });
ok(sr.status === 400, "range over 31 days -> 400");
sr = await statsGet({ request: sreq(`?from=x&to=y`, KEY), env: envPrev, ...ctx });
ok(sr.status === 400, "bad dates -> 400");
sr = await statsPost({ request: sreq("", KEY, "POST", { op: "purge_tests" }), env: envPrev, ...ctx });
const pj = await sr.json();
ok(sr.status === 200 && pj.deleted > 0 && (await EV.prepare("SELECT COUNT(*) n FROM ev WHERE test = 1").first("n")) === 0 && (await EV.prepare("SELECT COUNT(*) n FROM ev WHERE test = 0").first("n")) > 0, `purge_tests removes only test rows (${pj.deleted})`);

await mf.dispose();
console.log(`${n - fails}/${n} ` + (fails ? fails + " FAILED" : "ALL PASSED"));
process.exit(fails ? 1 : 0);
