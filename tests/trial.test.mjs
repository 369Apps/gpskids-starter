// Unit tests for Book a free trial class (public/trial.js + functions/api/trial.js) against a REAL local D1 (Miniflare)
// with the real schemas (migrations/0001_rl.sql, migrations-pitch/0004_trial.sql). GHL calls are mocked (no network).
// usage: (cd tests/node && npm i) ; node tests/trial.test.mjs     Made-up names and 555 numbers only.
import { readFileSync } from "node:fs";
import { Miniflare } from "./node/node_modules/miniflare/dist/src/index.js";
import { onRequestPost as submit, onRequestGet as list, PER_IP_DAY } from "../functions/api/trial.js";
import * as T from "../public/trial.js";

const mf = new Miniflare({ modules: true, script: "export default { fetch() { return new Response('') } }", d1Databases: ["RL", "PITCH"] });
const RL = await mf.getD1Database("RL"), PITCH = await mf.getD1Database("PITCH");
const sql = (f) => readFileSync(new URL(f, import.meta.url), "utf8").replace(/--.*$/gm, "").split(";").map((x) => x.trim()).filter(Boolean);
for (const s of sql("../migrations/0001_rl.sql")) await RL.prepare(s).run();
for (const s of sql("../migrations-pitch/0004_trial.sql")) await PITCH.prepare(s).run();
let fails = 0; const ok = (c, m) => { console.log((c ? "PASS " : "FAIL ") + m); if (!c) fails++; };
const HOST = "https://trial-class.gpskids-speak.pages.dev", KEY = "k".repeat(40);
const env = { RL, PITCH, IP_SALT: "t", PITCH_ADMIN_KEY: KEY };
const F = { parent: "Pat Sample", phone: "(470) 555-0100", kid: "Sam", age: "8", day: "tue", website: "", ms: 9000 };
async function send(f = F, { origin = HOST, ip = "203.0.113.5", e = env, hdr = {} } = {}) {
  const req = new Request(HOST + "/api/trial", { method: "POST", body: JSON.stringify(f), headers: { origin, "sec-fetch-site": "same-origin", "cf-connecting-ip": ip, "content-type": "application/json", ...hdr } });
  const r = await submit({ request: req, env: e, waitUntil() {} });
  return { s: r.status, j: await r.json().catch(() => ({})) };
}
const rows = async () => (await PITCH.prepare("SELECT * FROM trial_requests ORDER BY created").all()).results;

// shared rules
ok(T.cleanPhone("470-555-0123") === "+14705550123" && T.cleanPhone("1 (678) 555 1234") === "+16785551234" && T.cleanPhone("+44 20 7946 0958") === "+442079460958", "phone: US + international formats");
ok(!T.cleanPhone("555-1234") && !T.cleanPhone("123-456-7890") && !T.cleanPhone("hello") && !T.cleanPhone("470555012"), "phone: too short, bad area code, letters -> rejected");
const bad = T.checkTrial({});
ok(!bad.ok && ["parent", "phone", "kid", "age", "day"].every((k) => bad.errors[k]), "empty form -> an error for every field");
ok(!T.checkTrial({ ...F, age: "4" }).ok && !T.checkTrial({ ...F, age: "18" }).ok && !T.checkTrial({ ...F, day: "mon" }).ok, "age 5-17 only, day Tue/Thu only");
ok(!/[—–]|garu/i.test(readFileSync(new URL("../public/trial.js", import.meta.url), "utf8")), "no dashes or 'garu' in trial.js");

// happy path, no GHL secrets -> saved, pending
let r = await send();
let all = await rows();
ok(r.s === 200 && r.j.ok && all.length === 1, "valid booking -> 200, one row");
ok(all[0].parent === "Pat Sample" && all[0].phone === "+14705550100" && all[0].kid === "Sam" && all[0].age === 8 && all[0].day === "tue" && all[0].ghl === "pending" && all[0].test === 0, "row: name, clean phone, kid, age, day; ghl pending");
r = await send({ ...F, day: "thu", phone: "470 555 0100" });
all = await rows();
ok(r.s === 200 && all.length === 1 && all[0].day === "thu", "same phone again the same day -> updates the same row");
r = await send({ ...F, phone: "678 555 0101" }, { hdr: { "x-gks-test": "1" } });
ok(r.s === 200 && (await rows()).length === 2 && (await rows())[1].test === 1, "x-gks-test rows are marked test");

// errors + spam
r = await send({ ...F, phone: "555" });
ok(r.s === 400 && r.j.fields && r.j.fields.phone, "bad phone -> 400 with a phone error");
r = await send(F, { origin: "https://evil.example" });
ok(r.s === 403, "other site -> 403");
const n0 = (await rows()).length;
r = await send({ ...F, phone: "678 555 0102", website: "http://spam" });
ok(r.s === 200 && (await rows()).length === n0, "honeypot filled -> looks ok, saves nothing");
r = await send({ ...F, phone: "678 555 0103", ms: 500 });
ok(r.s === 200 && (await rows()).length === n0, "sent in under 3 seconds -> saves nothing");
let last = null; for (let k = 0; k < PER_IP_DAY + 1; k++) last = await send({ ...F, phone: "770 555 01" + String(10 + k) }, { ip: "203.0.113.9" });
ok(last.s === 429, `more than ${PER_IP_DAY} a day from one IP -> 429`);

r = await send({ ...F, phone: "770 555 0130" }, { ip: "203.0.113.9", hdr: { "x-gks-test": "1" } });
ok(r.s === 429, "production: test header does NOT skip the limit");
r = await send({ ...F, phone: "770 555 0131" }, { ip: "203.0.113.9", hdr: { "x-gks-test": "1" }, e: { ...env, EV_ENV: "preview" } });
ok(r.s === 200, "preview branch + test header skips the limit (automated suites)");

// GHL path (mocked fetch): upsert -> tag -> note; failure keeps the row as 'error'
const calls = []; const realFetch = globalThis.fetch;
globalThis.fetch = async (u, o) => { calls.push({ u: String(u), b: JSON.parse(o.body), h: o.headers }); return new Response(JSON.stringify(String(u).endsWith("/upsert") ? { contact: { id: "c123" } } : {}), { status: 200 }); };
const genv = { ...env, GHL_API_KEY: "pit-test", GHL_LOCATION_ID: "loc-test" };
r = await send({ ...F, phone: "404 555 0120" }, { e: genv, ip: "203.0.113.20" });
let g = (await PITCH.prepare("SELECT * FROM trial_requests WHERE phone = '+14045550120'").first());
ok(r.s === 200 && g.ghl === "sent" && g.ghl_id === "c123", "GHL set: contact created, row marked sent");
ok(calls[0].u.endsWith("/contacts/upsert") && calls[0].b.locationId === "loc-test" && calls[0].b.phone === "+14045550120" && calls[0].b.firstName === "Pat" && calls[0].h.authorization === "Bearer pit-test", "GHL upsert: location, phone, name, bearer key");
ok(calls[1].u.endsWith("/contacts/c123/tags") && calls[1].b.tags[0] === "trial-class", "GHL tag trial-class");
ok(calls[2].u.endsWith("/contacts/c123/notes") && /Sam, age 8/.test(calls[2].b.body) && /Tuesday/.test(calls[2].b.body), "GHL note: child, age, day");
calls.length = 0;
r = await send({ ...F, phone: "404 555 0121" }, { e: genv, ip: "203.0.113.21", hdr: { "x-gks-test": "1" } });
ok(r.s === 200 && calls.length === 0, "automated test rows never reach GHL");
globalThis.fetch = async () => new Response("{}", { status: 401 });
r = await send({ ...F, phone: "404 555 0122" }, { e: genv, ip: "203.0.113.22" });
g = await PITCH.prepare("SELECT * FROM trial_requests WHERE phone = '+14045550122'").first();
ok(r.s === 200 && g && g.ghl === "error", "GHL refuses -> parent still sees thanks, row kept as error");
globalThis.fetch = realFetch;

// admin list
const adm = async (key, q = "") => list({ request: new Request(HOST + "/api/trial" + q, { headers: { authorization: "Bearer " + key, "cf-connecting-ip": "198.51.100.1" } }), env, waitUntil() {} });
let a = await adm("wrong");
ok(a.status === 401, "admin list: wrong key -> 401");
a = await (await adm(KEY)).json();
ok(Array.isArray(a.requests) && a.requests.every((x) => x.test === 0) && a.requests.length >= 1, "admin list: real rows only by default");
a = await (await adm(KEY, "?test=1")).json();
ok(a.requests.some((x) => x.test === 1), "admin list ?test=1 includes test rows");

await mf.dispose();
console.log(fails ? fails + " FAILED" : "ALL PASSED"); process.exit(fails ? 1 : 0);
