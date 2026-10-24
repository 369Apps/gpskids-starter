// Unit tests for Kids Pitch Night (functions/api/pitch.js + functions/api/pitch-admin.js) against a REAL local D1 + R2 (Miniflare)
// with the real schemas (migrations/0001_rl.sql for the counters, migrations-pitch/0001_pitch.sql for entries).
// usage: (cd tests/node && npm i) ; node tests/pitch.test.mjs
import { readFileSync } from "node:fs";
import { Miniflare } from "./node/node_modules/miniflare/dist/src/index.js";
import { onRequestPost as submit, onRequestGet as status } from "../functions/api/pitch.js";
import { onRequestGet as adminGet, onRequestPost as adminPost } from "../functions/api/pitch-admin.js";
import { onRequestPost as feedback } from "../functions/api/feedback.js";
import * as PN from "../public/pitch.js";

const mf = new Miniflare({ modules: true, script: "export default { fetch() { return new Response('') } }", d1Databases: ["RL", "PITCH"], r2Buckets: ["PITCH_AUDIO"] });
const RL = await mf.getD1Database("RL"), PITCH = await mf.getD1Database("PITCH"), PITCH_AUDIO = await mf.getR2Bucket("PITCH_AUDIO");
const sql = (f) => readFileSync(new URL(f, import.meta.url), "utf8").replace(/--.*$/gm, "").split(";").map((x) => x.trim()).filter(Boolean);
for (const s of sql("../migrations/0001_rl.sql")) await RL.prepare(s).run();
for (const s of sql("../migrations-pitch/0001_pitch.sql")) await PITCH.prepare(s).run();
let fails = 0; const ok = (c, m) => { console.log((c ? "PASS " : "FAIL ") + m); if (!c) fails++; };
const HOST = "https://pitch-night.gpskids-speak.pages.dev", KEY = "k".repeat(40);
const env = { RL, PITCH, PITCH_AUDIO, AI: {}, IP_SALT: "t", PITCH_ADMIN_KEY: KEY };
const ctx = { waitUntil() {} };
const META = { parent: "Pat Parent", email: "Pat@Example.com", phone: "(404) 555-0100", kid: "Maya", age: 9, consent: 1, transcript: "Have you ever lost a shoe? My idea is the Beep Shelf.",
  seconds: 58, wpm: 120, fillers: 1, scores: { clarity: 90, pace: 85, confidence: 80, structure: 75 }, coach: "ai" };
const audio = (n = 5000, type = "audio/webm") => new File([new Uint8Array(n).fill(7)], "pitch.webm", { type });
async function send(meta = META, { a = audio(), origin = HOST, ip = "203.0.113.5", e = env, test = false } = {}) {
  const fd = new FormData(); fd.append("meta", JSON.stringify(meta)); if (a) fd.append("audio", a);
  const req = new Request(HOST + "/api/pitch", { method: "POST", body: fd, headers: { origin, "sec-fetch-site": "same-origin", "cf-connecting-ip": ip, ...(test ? { "x-gks-test": "1" } : {}) } });
  const r = await submit({ request: req, env: e, ...ctx });
  return { s: r.status, j: await r.json().catch(() => ({})) };
}
const admin = async (q, { key = KEY, method = "GET", body, ip = "198.51.100.1" } = {}) => {
  const req = new Request(HOST + "/api/pitch-admin" + q, { method, headers: { authorization: "Bearer " + key, origin: HOST, "sec-fetch-site": "same-origin", "cf-connecting-ip": ip, ...(body ? { "content-type": "application/json" } : {}) }, ...(body ? { body: JSON.stringify(body) } : {}) });
  return method === "GET" ? adminGet({ request: req, env, ...ctx }) : adminPost({ request: req, env, ...ctx });
};

// shared rules
ok(PN.bandForAge(5) === "sprouts" && PN.bandForAge(8) === "explorers" && PN.bandForAge(13) === "leaders" && PN.bandForAge(18) === "trailblazers", "age -> age group");
ok(Date.parse(PN.CLOSES) === Date.parse("2026-11-01T23:59:59-05:00"), "closes Sun Nov 1, 11:59:59 PM ET (EST)");
ok(PN.isOpen(Date.parse("2026-11-01T23:59:00-05:00")) && !PN.isOpen(Date.parse("2026-11-02T00:00:01-05:00")), "open at 11:59 PM Nov 1, closed at 12:00 AM Nov 2");
ok(!/[—–]/.test(PN.PROMPT + Object.values(PN.EXAMPLE).join(" ") + PN.CONSENT), "no dashes in the kid-facing copy");

// happy path
let r = await send();
ok(r.s === 200 && r.j.ok && r.j.kid === "Maya" && r.j.subs === 1 && r.j.left === PN.MAX_SUBS - 1, "valid entry -> 200 " + JSON.stringify(r.j));
let row = await PITCH.prepare("SELECT * FROM entries").first();
ok(row && row.email === "pat@example.com" && row.parent === "Pat Parent" && row.phone === "(404) 555-0100" && row.age === 9 && row.band === "explorers", "row stores parent, email (lowercased), phone, kid, age, age group");
ok(row.overall === 83 && row.clarity === 90 && row.structure === 75 && row.seconds === 58 && row.coach === "ai" && row.test === 0 && row.consent_v === PN.CONSENT_V, "row stores scores; overall computed on the server (83)");
const obj = await PITCH_AUDIO.get(row.audio_key);
ok(obj && (await obj.arrayBuffer()).byteLength === 5000 && obj.httpMetadata.contentType === "audio/webm", "audio stored in R2 with its type");
const firstKey = row.audio_key, firstId = row.id;
// resubmit: same email (different case) + kid -> replaces, old audio deleted
await new Promise((res) => setTimeout(res, 5));
r = await send({ ...META, email: "pat@EXAMPLE.com", kid: "maya", scores: { clarity: 95, pace: 95, confidence: 95, structure: 95 } }, { a: audio(6000) });
row = await PITCH.prepare("SELECT * FROM entries").first();
ok(r.s === 200 && r.j.subs === 2 && (await PITCH.prepare("SELECT COUNT(*) n FROM entries").first("n")) === 1 && row.id === firstId && row.overall === 95 && row.subs === 2, "resubmit (same email + kid, any case) replaces the entry, latest wins");
ok(!(await PITCH_AUDIO.get(firstKey)) && (await PITCH_AUDIO.get(row.audio_key)), "old recording deleted, new one kept");
r = await send({ ...META, kid: "Leo", age: 15 }, { ip: "203.0.113.6" });
ok(r.s === 200 && (await PITCH.prepare("SELECT COUNT(*) n FROM entries").first("n")) === 2, "a second child from the same parent is a new entry");
for (let k = 0; k < 3; k++) await send(META, { ip: "203.0.113.7" });
r = await send(META, { ip: "203.0.113.8" });
ok(r.s === 429 && r.j.error === "max_subs", "6th submission for the same entry -> 429 max_subs");

// validation
const bad = async (patch, label, code = 400, opts = {}) => { const x = await send({ ...META, kid: "Zed", ...patch }, { ip: "192.0.2." + Math.floor(Math.random() * 200), ...opts }); ok(x.s === code, label + " -> " + code + " (" + x.s + " " + (x.j.error || "") + (x.j.fields ? " " + Object.keys(x.j.fields) : "") + ")"); return x; };
await bad({ email: "nope" }, "bad email");
await bad({ age: 4 }, "age 4"); await bad({ age: 19 }, "age 19"); await bad({ age: "9.5" }, "age 9.5");
await bad({ consent: 0 }, "no consent");
await bad({ parent: "" }, "no parent name"); await bad({ kid: "<script>" }, "kid name with markup");
await bad({ phone: "12" }, "bad phone");
await bad({ scores: { clarity: 101, pace: 1, confidence: 1, structure: 1 } }, "score 101");
await bad({ seconds: 400 }, "400 seconds");
await bad({ transcript: "a".repeat(3001) }, "transcript > 3000 chars");
await bad({}, "no audio", 400, { a: null });
await bad({}, "tiny audio", 400, { a: audio(100) });
await bad({}, "video file", 415, { a: audio(5000, "video/mp4") });
await bad({}, "audio over 3 MB", 413, { a: audio(PN.MAX_AUDIO + 10) });
await bad({}, "wrong origin", 403, { origin: "https://evil.example" });
await bad({}, "production (no PITCH binding)", 503, { e: { RL, AI: {} } });
await bad({}, "after the closing date", 410, { e: { ...env, PITCH_CLOSES: "2026-01-01T00:00:00Z" } });
ok((await PITCH.prepare("SELECT COUNT(*) n FROM entries WHERE kid = 'Zed'").first("n")) === 0, "nothing stored from rejected requests");
const st = await (await status({ env })).json();
ok(st.open === true && st.closes === "2026-11-02T04:59:59.000Z", "GET /api/pitch -> open + closing time");

// rate limit (12 per IP per day)
const codes = []; for (let k = 0; k < 13; k++) codes.push((await send({ ...META, kid: "Rate" + "abcdefghijklm"[k] }, { ip: "203.0.113.99" })).s);
ok(codes.slice(0, 12).every((c) => c === 200) && codes[12] === 429, "per-IP limit: 12 allowed, 13th -> 429 (" + codes.join(",") + ")");
ok((await RL.prepare("SELECT COUNT(*) n FROM rl WHERE k LIKE 'pn:ip:%'").first("n")) > 0 && !(await RL.prepare("SELECT k FROM rl WHERE k LIKE '%203.0.113%'").first()), "counter rows hold only hashed IPs");
// test marker
r = await send({ ...META, kid: "Testy" }, { test: true, ip: "203.0.113.50" });
ok(r.s === 200 && (await PITCH.prepare("SELECT test FROM entries WHERE kid = 'Testy'").first("test")) === 1, "x-gks-test entries are stored with test = 1");

// admin
ok((await admin("?op=list", { key: "" })).status === 401 && (await admin("?op=list", { key: "x".repeat(40) })).status === 401, "admin: no key / wrong key -> 401");
const L = await (await admin("?op=list")).json();
ok(L.entries.length >= 14 && L.entries.every((e, k, a) => !k || a[k - 1].overall >= e.overall) && !L.entries.some((e) => e.test), "admin list sorted by overall, test entries hidden by default");
const maya = L.entries.find((e) => e.kid === "Maya");
ok(maya && maya.subs === 5 && maya.overall === 83 && !("audio_key" in maya) && !("ekey" in maya), "entry shows the latest of 5 submissions; no storage keys exposed");
ok((await (await admin("?op=list&test=1")).json()).entries.some((e) => e.test === 1), "test entries shown with test=1");
const au = await admin("?op=audio&id=" + maya.id);
ok(au.status === 200 && au.headers.get("content-type") === "audio/webm" && (await au.arrayBuffer()).byteLength === 5000 && (await PITCH_AUDIO.list({ prefix: "pitch/" + maya.id + "/" })).objects.length === 1, "admin audio returns the latest recording (only one kept per entry)");
ok((await admin("?op=audio&id=../../x")).status === 400, "admin audio: bad id -> 400");
const ids = L.entries.map((e) => e.id);
let fin = []; for (const id of ids.slice(0, 13)) fin.push((await admin("", { method: "POST", body: { op: "finalist", id, on: true } })).status);
ok(fin.slice(0, 12).every((c) => c === 200) && fin[12] === 409, "finalist toggle: 12 allowed, 13th -> 409");
ok((await admin("", { method: "POST", body: { op: "finalist", id: ids[0], on: false } })).status === 200 && (await admin("", { method: "POST", body: { op: "finalist", id: ids[12], on: true } })).status === 200, "untick one, then another can be ticked");
const csvBytes = new Uint8Array(await (await admin("?op=csv")).arrayBuffer()), csv = new TextDecoder().decode(csvBytes);
ok(csvBytes[0] === 0xef && csvBytes[1] === 0xbb && /^rank,finalist,kid,age/.test(csv) && csv.includes("Maya") && csv.includes("pat@example.com") && csv.split("\r\n").length >= 16, "CSV export (UTF-8 BOM for Excel) with header + rows");
await send({ ...META, kid: "Eq", transcript: "=HYPERLINK(1) plus words here" }, { ip: "203.0.113.77" });
ok((await (await admin("?op=csv")).text()).includes(",'=HYPERLINK"), "CSV cells starting with = are neutralised");
const wrong = []; for (let k = 0; k < 21; k++) wrong.push((await admin("?op=list", { key: "y".repeat(40), ip: "203.0.113.200" })).status);
ok(wrong[19] === 401 && wrong[20] === 429, "21st wrong key from one IP in a day -> 429");
const pg = await (await admin("", { method: "POST", body: { op: "purge_tests" } })).json();
ok(pg.ok && pg.deleted === 1 && !(await PITCH.prepare("SELECT 1 FROM entries WHERE test = 1").first()), "purge_tests deletes only test entries");

// coach: pn = 1 uses the Pitch Night prompt
let seen = "";
const fenv = { RL, IP_SALT: "t", AI: { async run(m, o) { seen = o.messages[1].content; return { response: { well: ["You named a real problem.", "You asked for a yes."], next: "Add one example." } }; } } };
const fr = await feedback({ env: fenv, waitUntil() {}, request: new Request(HOST + "/api/feedback", { method: "POST", headers: { "content-type": "application/json", origin: HOST, "cf-connecting-ip": "203.0.113.120" },
  body: JSON.stringify({ band: "explorers", i: 0, pn: 1, transcript: "My idea is a shoe shelf that beeps.", seconds: 50, wpm: 110, fillers: 0, goal: 60 }) }) });
ok(fr.status === 200 && seen.includes("Kids Pitch Night pitch") && seen.includes(PN.PROMPT), "coach gets the Pitch Night prompt when pn = 1");

await mf.dispose();
console.log(fails ? fails + " FAILED" : "ALL PASSED");
process.exit(fails ? 1 : 0);
