// Unit test of the real Pages Function with an in-memory counter store and a fake AI binding.
// usage: node tests/limits.test.mjs
import { onRequestPost } from "../functions/api/feedback.js";
import { onRequestPost as transcribe } from "../functions/api/transcribe.js";
const rows = new Map();
const RL = { prepare(sql) { let args = []; return {
  bind(...a) { args = a; return this; },
  async first(col) { const [k, exp] = args; const r = rows.get(k) || { n: 0, exp }; r.n++; rows.set(k, r); return r.n; },
  async run() { const now = args[0]; for (const [k, r] of rows) if (r.exp < now) rows.delete(k); return {}; } }; } };
let aiCalls = 0;
const AI = { async run() { aiCalls++; return { response: { well: ["You were clear.", "You gave a reason."], next: "Add an example." } }; } };
const env = { AI, RL, IP_SALT: "test" };
const call = (ip, extra = {}) => onRequestPost({ env, waitUntil() {}, request: new Request("https://gpskids-speak.pages.dev/api/feedback", {
  method: "POST", headers: { "content-type": "application/json", origin: "https://gpskids-speak.pages.dev", "cf-connecting-ip": ip, ...extra.headers },
  body: JSON.stringify({ band: "explorers", i: 0, transcript: extra.transcript || "Each person gets two slices because eight divided by four is two." }) }) });
let fails = 0; const ok = (c, m) => { console.log((c ? "PASS " : "FAIL ") + m); if (!c) fails++; };
const codes = []; for (let k = 0; k < 22; k++) codes.push((await call("203.0.113.7")).status);
ok(codes.slice(0, 20).every((c) => c === 200) && codes[20] === 429 && codes[21] === 429, "per-IP: 20 allowed, 21st+ get 429 (" + codes.join(",") + ")");
const lim = await (await call("203.0.113.7")).json();
ok(lim.error === "limit" && /resting/.test(lim.message), "friendly limit body: " + JSON.stringify(lim));
ok((await call("198.51.100.9")).status === 200, "another IP still allowed");
ok([...rows.keys()].every((k) => /^ip:[0-9a-f]{32}$|^g:\d{4}-\d{2}-\d{2}$/.test(k)) && ![...rows.keys()].some((k) => k.includes("203.0.113")), "store holds only hashed IP keys + global day key: " + [...rows.keys()].join(" "));
const g = [...rows.keys()].find((k) => k.startsWith("g:")); rows.get(g).n = 5000;
ok((await call("192.0.2.55")).status === 429, "global cap: request #5001 of the day gets 429");
ok((await call("192.0.2.56", { headers: { origin: "https://evil.example" } })).status === 403, "wrong origin -> 403");
ok((await call("192.0.2.57", { transcript: "a".repeat(5001) })).status === 413, "transcript over 5,000 chars -> 413 (5:00 talks, Oct 8)");
const before = aiCalls; await call("192.0.2.58", { transcript: "a ".repeat(1000) }); ok(aiCalls === before, "rejected/limited requests never reach the AI");
// ---- transcribe: own cap (30/IP/day), size/length/type/origin guards, audio never stored
rows.clear(); let stt = 0;
env.AI = { async run(model) { stt++; return { text: "Each person gets two slices." }; } };
const audio = new Uint8Array(5000);
const tcall = (ip, { type = "audio/mp4", origin = "https://gpskids-speak.pages.dev", secs = "20", body = audio } = {}) => transcribe({ env, waitUntil() {}, request: new Request("https://gpskids-speak.pages.dev/api/transcribe", {
  method: "POST", headers: { "content-type": type, origin, "cf-connecting-ip": ip, "x-seconds": secs }, body }) });
const tc = []; for (let k = 0; k < 32; k++) tc.push((await tcall("203.0.113.8")).status);
ok(tc.slice(0, 30).every((c) => c === 200) && tc[30] === 429, "transcribe per-IP: 30 allowed, 31st gets 429");
const tj = await (await tcall("198.51.100.20")).json();
ok(tj.text === "Each person gets two slices." && tj.words === 5, "transcribe returns text + word count");
ok((await tcall("1.1.1.1", { origin: "https://evil.example" })).status === 403, "transcribe wrong origin -> 403");
ok((await tcall("1.1.1.2", { body: new Uint8Array(8 * 1024 * 1024 + 1) })).status === 413, "audio over 8 MB -> 413 (5:00 talks, Oct 8)");
ok((await tcall("1.1.1.3", { secs: "306" })).status === 413, "audio over 305 s -> 413 (5:00 talks, Oct 8)");
ok((await tcall("1.1.1.4", { type: "text/plain" })).status === 415, "non-audio -> 415");
for (const o of ["https://gpskids.app", "https://www.gpskids.app", "https://speak.gpskids.app"]) ok((await tcall("1.1.2." + o.length, { origin: o })).status === 200, "custom domain origin allowed: " + o);
for (const o of ["https://coach.gpskids.app", "https://gpskids.app.evil.example", "http://gpskids.app"]) ok((await tcall("1.1.3." + o.length, { origin: o })).status === 403, "lookalike/other origin -> 403: " + o);
ok([...rows.keys()].every((k) => /^t:(ip:[0-9a-f]{32}|g:\d{4}-\d{2}-\d{2})$/.test(k)), "transcribe counters use their own t: keys, hashed IPs only");
console.log(fails ? fails + " FAILED" : "ALL PASSED"); process.exit(fails ? 1 : 0);
