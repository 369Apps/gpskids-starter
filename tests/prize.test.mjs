// Unit tests for the Speaking Leaderboard (public/prize.js, functions/api/prize.js, prize-admin.js) on a REAL local D1 (Miniflare)
// with the real schemas. Covers scoring, one try a day, practice, parent opt-in, Bring a Friend, resets, winners, fraud holds.
// Test names are made up (never real kids). usage: node tests/prize.test.mjs
import { readFileSync } from "node:fs";
import { Miniflare } from "./node/node_modules/miniflare/dist/src/index.js";
import { onRequestPost as post, onRequestGet as get } from "../functions/api/prize.js";
import { onRequestPost as adminPost, onRequestGet as adminGet } from "../functions/api/prize-admin.js";
import * as PZ from "../public/prize.js";

const mf = new Miniflare({ modules: true, script: "export default { fetch() { return new Response('') } }", d1Databases: ["RL", "PITCH"] });
const RL = await mf.getD1Database("RL"), PITCH = await mf.getD1Database("PITCH");
const sql = (f) => readFileSync(new URL(f, import.meta.url), "utf8").replace(/--.*$/gm, "").split(";").map((x) => x.trim()).filter(Boolean);
for (const s of sql("../migrations/0001_rl.sql")) await RL.prepare(s).run();
for (const f of ["0001_pitch.sql", "0002_prize.sql", "0003_leaderboard.sql"]) for (const s of sql("../migrations-pitch/" + f)) await PITCH.prepare(s).run();
let fails = 0; const ok = (c, m) => { console.log((c ? "PASS " : "FAIL ") + m); if (!c) fails++; };
const HOST = "https://leaderboard.gpskids-speak.pages.dev", KEY = "k".repeat(40);
const env = { RL, PITCH, IP_SALT: "t", PITCH_ADMIN_KEY: KEY, EV_ENV: "preview" }, ctx = { waitUntil() {} };
let ipn = 1;
async function call(body, { origin = HOST, day, test = true } = {}) {
  const h = { origin, "sec-fetch-site": "same-origin", "content-type": "application/json", "cf-connecting-ip": "203.0.113." + (ipn++ % 250) };
  if (test) h["x-gks-test"] = "1"; if (day) h["x-gks-day"] = day;
  const r = await post({ request: new Request(HOST + "/api/prize", { method: "POST", body: JSON.stringify(body), headers: h }), env, ...ctx }); return { s: r.status, j: await r.json() };
}
const board = async (day) => (await (await get({ request: new Request(HOST + "/api/prize", { headers: { "cf-connecting-ip": "198.51.100.9", "x-gks-test": "1", ...(day ? { "x-gks-day": day } : {}) } }), env, ...ctx })).json());
const ST = (c, p, f) => ({ clarity: c, pace: p, confidence: f });
const W = (n) => Array.from({ length: n }, (_, i) => ["we", "pick", "trash", "every", "day", "because", "parks", "matter"][i % 8]).join(" ");
const GOOD = { text: W(60), seconds: 30, band: "explorers", goal: 30 };                       // 120 wpm, no fillers, full time = 3/3/3
const BAD = { text: "i guess maybe um i don't know um", seconds: 60, band: "explorers", goal: 45 }; // slow, fillers, hedges
const MID = { text: W(30) + " um um", seconds: 20, band: "explorers", goal: 45 };
const Q = (t) => PZ.quality(PZ.serverStars(t));
const join = (o) => call({ op: "enter", adult: 1, consent: 1, age: 9, init: "T", ...o });

// ---- pure rules
ok(PZ.quality(ST(1, 1, 1)) === 0 && PZ.quality(ST(3, 3, 3)) === 10 && PZ.quality(ST(2, 2, 2)) === 5 && PZ.quality(ST(9, 1, 1)) === 0, "quality: up to 10 from clarity, pace, confidence (junk = 0)");
ok(PZ.scored({ stars: ST(3, 3, 3), didYesterday: true }).points === 25 && PZ.scored({ stars: ST(3, 3, 3) }).points === 20 && PZ.scored({ heard: false, ...GOOD }).points === 10, "scored: 10 done + 5 streak + up to 10 quality");
ok(!/plan|paid|tier|club/i.test(readFileSync(new URL("../public/prize.js", import.meta.url), "utf8").replace(/\/\/.*$/gm, "")), "points rules never read the plan");
ok(!/plan/i.test(readFileSync(new URL("../functions/api/prize.js", import.meta.url), "utf8").replace(/^\s*\/\/.*$/gm, "")), "server scoring never reads the plan");
ok(PZ.weekOfDay("2026-10-18") === "2026-10-12" && PZ.weekOfDay("2026-10-19") === "2026-10-19" && PZ.weekOf(Date.parse("2026-10-19T02:00:00Z")) === "2026-10-12", "week resets Monday 12 AM ET (Sunday 10 PM ET is still last week)");
ok(PZ.monthOf(Date.parse("2026-11-01T03:30:00Z")) === "2026-10" && PZ.monthOf(Date.parse("2026-11-01T04:30:00Z")) === "2026-11", "month resets on the 1st at 12 AM ET");
ok(PZ.prevPeriod("month", "2026-11-01") === "2026-10" && PZ.prevPeriod("week", "2026-10-19") === "2026-10-12" && PZ.range("month", "2026-02")[1] === "2026-02-28", "periods");
ok(PZ.rank([{ id: "a", points: 30, avgq: 5, reached: 2 }, { id: "b", points: 30, avgq: 8, reached: 3 }, { id: "c", points: 30, avgq: 8, reached: 1 }]).map((x) => x.id).join() === "c,b,a", "tie-breaker: higher quality, then earlier");
ok(PZ.spike({ points: 200, prevAvg: 30 }) === "points" && PZ.spike({ points: 60, prevAvg: 30 }) === "" && PZ.spike({ points: 10, friends: 5 }) === "friends", "spike flags");
ok(Q(GOOD) === 10 && Q(BAD) <= 2 && Q(MID) > Q(BAD) && Q(MID) < 10, "server quality from words + time: good 10, weak " + Q(BAD) + ", middle " + Q(MID));
ok(Q({ ...GOOD, seconds: 2 }) < 10 && PZ.serverStars({ ...GOOD, seconds: 2 }).pace === 1, "pasted text with a tiny time gets no pace stars");
ok(PZ.serverStars({ ...GOOD, band: "grownups" }) === null, "grown-ups band can't score");
ok(PZ.range("week", "2026-10-12")[0] === "2026-10-16" && PZ.range("month", "2026-10")[0] === "2026-10-16" && PZ.range("week", "2026-10-19")[0] === "2026-10-19" && PZ.range("month", "2026-11")[0] === "2026-11-01", "first week Oct 16-18, October counts Oct 16-31, then normal periods");
ok(PZ.prevPeriod("week", "2026-10-19") === "2026-10-12" && PZ.prevPeriod("month", "2026-11-03") === "2026-10", "previous periods with the launch start");
ok(!PZ.checkEntry({ email: "a@b.co", kid: "Testa", init: "T", age: 9, consent: 1 }).ok, "parent must say they are 18+");
ok(!PZ.checkEntry({ email: "a@b.co", kid: "Testa Lastname", init: "T", age: 9, adult: 1, consent: 1 }).ok && !PZ.checkEntry({ email: "a@b.co", kid: "Testa", init: "TT", age: 9, adult: 1, consent: 1 }).ok, "first name + ONE last initial only");
ok(!PZ.checkEntry({ email: "a@b.co", kid: "Testa", init: "T", age: 30, adult: 1, consent: 1 }).ok, "grown-ups can't join (ages 5 to 17)");

// ---- opt-in
ok((await join({ email: "a@b.co", kid: "Testa" }, { origin: "https://evil.example" })).s === 200, "setup");
ok((await call({ op: "enter", email: "a@b.co", kid: "Testa", init: "T", age: 9, adult: 1, consent: 1 }, { origin: "https://evil.example" })).s === 403, "other sites can't write");
await PITCH.prepare("DELETE FROM lb_entries").run();
const D = "2026-10-19"; // a Monday (after the launch week)
const A = await join({ email: "Parent.A@example.com", kid: "Testa", init: "q", show: true, dev: "a".repeat(32), kidEmail: "kid@x.com", phone: "555" });
ok(A.s === 200 && A.j.name === "Testa Q." && /^[0-9a-f]{48}$/.test(A.j.token) && PZ.REF_RE.test(A.j.ref), "parent joins: name shown as First L., gets an invite code");
const row = await PITCH.prepare("SELECT * FROM lb_entries").first();
ok(row.email === "parent.a@example.com" && row.tok_hash !== A.j.token && row.consent_v === "lb2" && !Object.keys(row).some((k) => /phone|kid_?email|photo|school/.test(k)) && !JSON.stringify(row).includes("555"), "stored: parent email, first name, initial, age only (no kid email or phone)");
const B = await join({ email: "parent.b@example.com", kid: "Robo", init: "R", dev: "b".repeat(32) }); // show not ticked
ok(B.j.shown === false, "default is hidden until the parent approves");

// ---- scoring, one try, practice
let s = await call({ op: "score", token: A.j.token, ...GOOD }, { day: D });
ok(s.s === 200 && s.j.points === 20 && s.j.streak === 0, "day 1 scored challenge: 10 + 10 quality = 20");
s = await call({ op: "score", token: A.j.token, ...GOOD }, { day: D });
ok(s.s === 409, "only ONE scored try per day (second try refused)");
ok((await call({ op: "score", token: A.j.token, ...BAD, stars: ST(3, 3, 3) }, { day: "2026-10-16" })).j.quality === Q(BAD), "FAKE stars from the phone are ignored: quality comes from the server (" + Q(BAD) + ", not 10)");
await PITCH.prepare("DELETE FROM lb_points WHERE day = '2026-10-16'").run();
ok((await call({ op: "score", token: A.j.token, ...GOOD, band: "grownups" }, { day: "2026-10-17" })).s === 400, "server refuses a grown-ups score");
ok((await call({ op: "me", token: A.j.token }, { day: D })).j.done === true, "app knows today's try is used");
s = await call({ op: "score", token: A.j.token, ...MID }, { day: PZ.addDays(D, 1) });
ok(s.j.points === 15 + Q(MID) && s.j.streak === 5, "day 2: 10 + 5 streak + server quality " + Q(MID));
s = await call({ op: "score", token: A.j.token, ...GOOD }, { day: PZ.addDays(D, 3) });
ok(s.j.streak === 0, "missed a day: no streak bonus");
await call({ op: "score", token: B.j.token, ...GOOD }, { day: D });
ok((await PITCH.prepare("SELECT COUNT(*) AS n FROM lb_points").first("n")) === 4, "practice runs send nothing (only scored tries are in the ledger)");
let bd = await board(PZ.addDays(D, 3));
ok(bd.week.rows.length === 1 && bd.week.rows[0].name === "Testa Q." && bd.week.rows[0].points === 55 + Q(MID) && Object.keys(bd.week.rows[0]).sort().join() === "name,points", "public board: only opted-in kids, First L. + points");
ok(!JSON.stringify(bd).includes("@") && !JSON.stringify(bd).includes("Robo"), "no emails, hidden kid not shown");
ok(bd.month.rows[0].points === 55 + Q(MID) && bd.month.prize === 100 && bd.week.prize === 25, "monthly board uses the same points; $25 / $100");
ok((await call({ op: "show", token: B.j.token, show: true })).j.shown && (await board(PZ.addDays(D, 3))).week.rows.length === 2, "parent approves: kid shows up");

// ---- Bring a Friend
const C = await join({ email: "parent.c@example.com", kid: "Zork", init: "Z", ref: A.j.ref, dev: "c".repeat(32) });
let me = await call({ op: "me", token: A.j.token }, { day: PZ.addDays(D, 3) });
ok(me.j.friends === 0 && me.j.week.points === 55 + Q(MID), "friend's parent signed up but no challenge yet: no points");
await call({ op: "score", token: C.j.token, ...BAD }, { day: PZ.addDays(D, 4) });
me = await call({ op: "me", token: A.j.token }, { day: PZ.addDays(D, 4) });
ok(me.j.friends === 1 && me.j.week.points === 80 + Q(MID), "friend finished a first challenge: +25 for the inviter (and a badge)");
await call({ op: "score", token: C.j.token, ...BAD }, { day: PZ.addDays(D, 5) });
ok((await call({ op: "me", token: A.j.token }, { day: PZ.addDays(D, 5) })).j.friends === 1, "a friend counts once");
// duplicates: same parent email (new kid name) and same device
const dupE = await join({ email: "parent.a@example.com", kid: "Fakey", init: "F", ref: A.j.ref, dev: "d".repeat(32) });
await call({ op: "score", token: dupE.j.token, ...BAD }, { day: PZ.addDays(D, 5) });
const dupD = await join({ email: "other@example.com", kid: "Fakeo", init: "F", ref: A.j.ref, dev: "c".repeat(32) });
await call({ op: "score", token: dupD.j.token, ...BAD }, { day: PZ.addDays(D, 5) });
const flags = (await PITCH.prepare("SELECT flag FROM lb_points WHERE kind = 'friend' ORDER BY created").all()).results.map((x) => x.flag);
ok(flags.join() === ",dup_email,dup_device", "duplicate friend sign-ups flagged (same parent email, same device): " + flags.join());
ok((await join({ email: "self@example.com", kid: "Selfy", init: "S", ref: "zzzzzzzz" })).s === 200, "unknown invite code is ignored");

// ---- weekly reset + automatic winner (held because of the flags)
bd = await board(PZ.addDays(D, 7)); // next Monday
ok(bd.week.rows.length === 0 && bd.month.rows.length > 0, "Monday 12 AM: weekly board starts empty, monthly keeps going");
let w = await PITCH.prepare("SELECT * FROM lb_winners WHERE kind = 'week' AND period = ?1 AND test = 1").bind(D).first();
ok(w && w.entry_id === row.id && w.amount === 25 && w.status === "held" && /dup_email/.test(w.flags), "last week's winner picked automatically, payout HELD by fraud flag: " + (w && w.flags));
ok((await PITCH.prepare("SELECT COUNT(*) AS n FROM lb_alerts WHERE period = ?1").bind(D).first("n")) === 1, "alert logged for ");
await board(PZ.addDays(D, 7));
ok((await PITCH.prepare("SELECT COUNT(*) AS n FROM lb_winners WHERE kind = 'week' AND period = ?1").bind(D).first("n")) === 1 && (await PITCH.prepare("SELECT COUNT(*) AS n FROM lb_alerts").first("n")) === 1, "picked once, alerted once");
// admin: pass to next eligible
const areq = (body, key = KEY) => new Request(HOST + "/api/prize-admin" + (body ? "" : "?test=1"), { method: body ? "POST" : "GET", headers: { authorization: "Bearer " + key, origin: HOST, "sec-fetch-site": "same-origin", "cf-connecting-ip": "198.51.100.1", "content-type": "application/json" }, ...(body ? { body: JSON.stringify(body) } : {}) });
ok((await adminGet({ request: areq(null, "x".repeat(40)), env, ...ctx })).status === 401, "admin: wrong key refused");
const ag = await (await adminGet({ request: areq(null), env, ...ctx })).json();
ok(ag.winners.some((x) => x.status === "held" && x.email === "parent.a@example.com") && ag.alerts.length === 1, "admin hold list shows the flag reason and the parent");
w = await (await adminPost({ request: areq({ op: "pass", kind: "week", period: D, test: 1 }), env, ...ctx })).json();
ok(w.status === "logged" && w.entry_id !== row.id && w.entry_id, " passes the prize: goes to the next kid with no flags");
ok((await (await adminPost({ request: areq({ op: "paid", kind: "week", period: D, test: 1 }), env, ...ctx })).json()).status === "paid", "manual payout logged as paid (no money moved by the app)");
// clean winner: monthly, no flags in a fresh test month
await PITCH.prepare("DELETE FROM lb_points WHERE flag != ''").run();
await PITCH.prepare("DELETE FROM lb_points WHERE kind = 'friend'").run();
await board("2026-11-02");
w = await PITCH.prepare("SELECT * FROM lb_winners WHERE kind = 'month' AND period = '2026-10' AND test = 1").first();
ok(w && w.amount === 100 && w.status === "logged" && w.entry_id === row.id, "Nov 1: October winner picked, $100 logged for manual payout (no flags)");
ok((await PITCH.prepare("SELECT COUNT(*) AS n FROM lb_winners WHERE test = 0 AND entry_id IS NOT NULL").first("n")) === 0, "test rows never mix with real winners");
// spike
const sp = await join({ email: "spiky@example.com", kid: "Spiky", init: "S" });
await PITCH.prepare("INSERT INTO lb_points (entry_id, kind, ref, day, pts, created) SELECT id, 'day', 'x' || ?2, ?2, 500, 1 FROM lb_entries WHERE tok_hash IS NOT NULL AND kid = 'Spiky'").bind(0, "2026-11-10").run();
await PITCH.prepare("INSERT INTO lb_points (entry_id, kind, ref, day, pts, created) SELECT id, 'day', 'old', '2026-10-20', 20, 1 FROM lb_entries WHERE kid = 'Spiky'").run();
await board("2026-11-16");
w = await PITCH.prepare("SELECT * FROM lb_winners WHERE kind = 'week' AND period = '2026-11-09' AND test = 1").first();
ok(w && w.status === "held" && /spike_points/.test(w.flags), "point spike vs the kid's normal pace holds the payout: " + (w && w.flags));
// leave
ok((await call({ op: "leave", token: A.j.token })).s === 200 && !(await PITCH.prepare("SELECT 1 FROM lb_entries WHERE id = ?1").bind(row.id).first()) && !(await PITCH.prepare("SELECT 1 FROM lb_points WHERE entry_id = ?1").bind(row.id).first()), "leave deletes the entry and points");
// x-gks-day ignored in production
env.EV_ENV = "production";
ok((await board("2030-01-07")).today === PZ.etDate(), "day override never works in production");
console.log(fails ? fails + " FAILED" : "ALL PASSED"); process.exit(fails ? 1 : 0);
