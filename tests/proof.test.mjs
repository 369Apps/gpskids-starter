// Unit tests for the home-screen social proof: lib/proof.js, functions/api/proof.js, functions/api/live.js and the
// 'pfin' counter in functions/api/count.js, on a REAL local D1 (Miniflare) with the real schema.
// Covers: the counter (per-day MAX of device/player finishes, windows), thresholds, the kill switch, config keys,
// test-traffic exclusion (T days, tlive rows, preview hosts), anti-padding caps, edge-cache headers, no raw IDs stored.
// usage: (cd tests/node && npm i) ; node tests/proof.test.mjs
import { readFileSync } from "node:fs";
import { Miniflare } from "./node/node_modules/miniflare/dist/src/index.js";
import { proof, storyCounts, pickStory, liveCount, proofCfg, DEFAULTS, dayMinus } from "../lib/proof.js";
import { onRequestGet } from "../functions/api/proof.js";
import { onRequestPost as livePost, IP_MAX } from "../functions/api/live.js";
import { onRequestPost as countPost, PFIN_IP_MAX } from "../functions/api/count.js";
import { etDay, anonHash } from "../lib/guard.js";

const mf = new Miniflare({ modules: true, script: "export default { fetch() { return new Response('') } }", d1Databases: ["RL"] });
const RL = await mf.getD1Database("RL");
for (const f of ["0001_rl.sql", "0002_daily.sql", "0003_players.sql"])
  for (const s of readFileSync(new URL("../migrations/" + f, import.meta.url), "utf8").replace(/--.*$/gm, "").split(";").map((x) => x.trim()).filter(Boolean)) await RL.prepare(s).run();
let fails = 0; const ok = (c, m) => { console.log((c ? "PASS " : "FAIL ") + m); if (!c) fails++; };
const env = { RL, IP_SALT: "test-salt" };
const run = (sql, ...a) => RL.prepare(sql).bind(...a).run();
const q = async (sql, ...a) => (await RL.prepare(sql).bind(...a).all()).results;
const day = etDay(), now = Math.floor(Date.now() / 1000);
const uuid = (i) => "00000000-0000-4000-8000-" + String(i).padStart(12, "0");
const setDaily = (d, e, n) => run("INSERT INTO daily (day, event, n) VALUES (?1, ?2, ?3) ON CONFLICT(day, event) DO UPDATE SET n = excluded.n", d, e, n);
const reset = async () => { await run("DELETE FROM daily"); await run("DELETE FROM pdaily"); await run("DELETE FROM rl"); };

// ---------- counter: per-day MAX(device finishes, player finishes); T days never count ----------
ok(dayMinus("2026-10-07", 6) === "2026-10-01" && dayMinus("2026-03-09", 1) === "2026-03-08", "dayMinus works across months/DST");
await setDaily(day, "challenge_finished", 10); await setDaily(day, "pfin", 14);           // 14 players on 10 phones
await setDaily(dayMinus(day, 1), "challenge_finished", 9); await setDaily(dayMinus(day, 1), "pfin", 7); // old cached apps: devices > players
await setDaily(dayMinus(day, 6), "challenge_finished", 5);                                // oldest day in the week
await setDaily(dayMinus(day, 7), "challenge_finished", 100);                              // outside the week
await setDaily(day, "visit", 999); await setDaily(day, "challenge_started", 999);         // not finishes
await setDaily("T" + day, "challenge_finished", 5000); await setDaily("T" + day, "pfin", 5000); // test day
let c = await storyCounts(env, { day });
ok(c.today === 14 && c.week === 14 + 9 + 5, "week = per-day MAX of device/player finishes over the last 7 ET days, T days excluded: " + JSON.stringify(c));
ok(c.all === 128, "all-time (computed because the week is under 50) = 128, T days excluded");
ok(JSON.stringify(pickStory(c)) === JSON.stringify({ n: 128, w: "all" }), "week 28 < 50 -> falls back to the bigger true window (all-time 128)");
ok(pickStory({ today: 3, week: 20, all: 49 }) === null, "everything under 50 -> nothing shown");
ok(JSON.stringify(pickStory({ today: 49, week: 50, all: 900 })) === JSON.stringify({ n: 50, w: "week" }), "week >= 50 -> this week");
ok(JSON.stringify(pickStory({ today: 300, week: 1240, all: 5000 })) === JSON.stringify({ n: 300, w: "today" }), "today >= 300 -> today");
const tc = await storyCounts(env, { day, test: true });
ok(tc.today === 5000 && tc.week === 5000 && tc.all === 5000, "test mode reads ONLY the T day: " + JSON.stringify(tc));

// ---------- payload, thresholds, config, kill switch ----------
let p = await proof(env, { day });
ok(p.story && p.story.n === 128 && p.story.w === "all" && p.live === null, "payload: story all-time 128, live hidden: " + JSON.stringify(p));
await run("DELETE FROM daily WHERE day = ?1", dayMinus(day, 7));
p = await proof(env, { day });
ok(p.story === null, "real total 28 (< 50) -> story null (the small number is never sent)");
await run("INSERT INTO rl (k, n, exp) VALUES ('cfg:proof_min', 20, 4102444800)");
p = await proof(env, { day });
ok(p.story && p.story.n === 28 && p.story.w === "week", "cfg:proof_min=20 -> week 28 shown");
await run("DELETE FROM rl WHERE k = 'cfg:proof_min'");
// live: 24 kids + 3 grown-ups + 5 expired + test rows
for (let i = 0; i < 24; i++) await run("INSERT INTO rl (k, n, exp) VALUES (?1, 1, ?2)", "live:" + (await anonHash(env, "live", uuid(i))), now + 200);
for (let i = 0; i < 3; i++) await run("INSERT INTO rl (k, n, exp) VALUES (?1, 0, ?2)", "live:" + (await anonHash(env, "live", uuid(100 + i))), now + 200);
for (let i = 0; i < 5; i++) await run("INSERT INTO rl (k, n, exp) VALUES (?1, 1, ?2)", "live:" + (await anonHash(env, "live", uuid(200 + i))), now - 1);
for (let i = 0; i < 40; i++) await run("INSERT INTO rl (k, n, exp) VALUES (?1, 1, ?2)", "tlive:" + i, now + 200);
await run("INSERT INTO rl (k, n, exp) VALUES ('livex', 1, ?1), ('lv:ip:abc:1', 50, ?1)", now + 200);
ok((await liveCount(env, { now })) === 24, "live count = 24 kids (grown-ups, expired rows, tlive and other keys excluded)");
p = await proof(env, { day, now });
ok(p.live === null, "24 kids < 25 -> live line not sent");
await run("INSERT INTO rl (k, n, exp) VALUES (?1, 1, ?2)", "live:" + (await anonHash(env, "live", uuid(24))), now + 200);
p = await proof(env, { day, now });
ok(p.live === 25, "25 kids -> live 25");
await run("INSERT INTO rl (k, n, exp) VALUES ('cfg:live_min', 30, 4102444800)");
ok((await proof(env, { day, now })).live === null, "cfg:live_min=30 -> hidden at 25");
await run("UPDATE rl SET n = 0 WHERE k = 'cfg:live_min'");
ok((await proofCfg(env)).liveMin === DEFAULTS.liveMin, "invalid cfg value (0) -> default 25");
await run("DELETE FROM rl WHERE k = 'cfg:live_min'");
ok((await proof(env, { day, now, test: true })).live === 40, "test mode counts only tlive rows (40)");
await run("INSERT INTO rl (k, n, exp) VALUES ('cfg:proof_min', 20, 4102444800), ('cfg:proof_off', 1, 4102444800)");
p = await proof(env, { day, now });
ok(p.story === null && p.live === null, "kill switch cfg:proof_off -> both null (even with numbers over the thresholds)");
ok(JSON.stringify(await proof(env, { day, now, test: true })) === '{"story":null,"live":null}', "kill switch also applies in test mode");
await run("DELETE FROM rl WHERE k IN ('cfg:proof_off', 'cfg:proof_min')");

// ---------- GET /api/proof: cache headers, edge cache, test mode bypasses the cache ----------
const store = new Map();
globalThis.caches = { default: { match: async (r) => { const x = store.get(r.url); return x ? x.clone() : undefined; }, put: async (r, res) => { store.set(r.url, res); } } };
const get = async (headers = {}) => { const w = []; const r = await onRequestGet({ env, waitUntil: (x) => w.push(x), request: new Request("https://gpskids.app/api/proof?x=1", { headers }) }); await Promise.all(w); return r; };
let r = await get();
ok(r.status === 200 && r.headers.get("cache-control") === "public, max-age=60" && r.headers.get("x-proof-cache") === "miss", "first GET: miss, browser cache 60 s");
const j1 = await r.json();
ok(j1.live === 25 && j1.story === null, "GET body = real payload: " + JSON.stringify(j1));
ok(store.has("https://gpskids.app/api/proof") && /s-maxage=60/.test(store.get("https://gpskids.app/api/proof").headers.get("cache-control")), "stored in the edge cache for 60 s (query string ignored in the key)");
await run("INSERT INTO rl (k, n, exp) VALUES (?1, 1, ?2)", "live:" + (await anonHash(env, "live", uuid(25))), now + 200);
r = await get();
ok(r.headers.get("x-proof-cache") === "hit" && (await r.json()).live === 25, "second GET within 60 s is served from the edge cache (no D1)");
r = await get({ "x-gks-test": "count" });
ok(r.headers.get("cache-control") === "no-store" && r.headers.get("x-proof-cache") === "test" && (await r.json()).live === 40, "test-mode GET: no-store, never cached, test data only");
ok(store.size === 1, "test-mode GET did not touch the cache");
delete globalThis.caches;
r = await onRequestGet({ env: {}, waitUntil() {}, request: new Request("https://gpskids.app/api/proof") });
ok((await r.json()).live === null && /max-age=15/.test(r.headers.get("cache-control")), "no D1 / error -> show nothing, short cache");
await reset();

// ---------- POST /api/live ----------
const live = async (body, { host = "https://gpskids.app", origin, test, ip = "203.0.113.9" } = {}) => {
  const h = { "content-type": "application/json", origin: origin || host, "cf-connecting-ip": ip }; if (test) h["x-gks-test"] = test;
  return (await livePost({ env, waitUntil() {}, request: new Request(host + "/api/live", { method: "POST", headers: h, body: JSON.stringify(body) }) })).status;
};
ok((await live({ p: uuid(1), k: 1 })) === 204, "kid ping -> 204");
await live({ p: uuid(1), k: 1 }); await live({ p: uuid(2), k: 0 });
let rows = await q("SELECT k, n, exp FROM rl WHERE k LIKE 'live:%'");
const h1live = await anonHash(env, "live", uuid(1));
ok(rows.length === 2 && rows.some((x) => x.n === 1) && rows.some((x) => x.n === 0), "one row per player (repeat pings refresh, not add); kid n=1, grown-up n=0");
ok(rows.every((x) => /^live:[0-9a-f]{32}$/.test(x.k) && x.exp > now + 290 && x.exp <= now + 302), "row = salted hash only, expires in ~5 minutes");
ok(!JSON.stringify(await q("SELECT * FROM rl")).includes("0000-4000") && rows.some((x) => x.k === "live:" + h1live), "raw player IDs are never stored (key = live:<salted hash>)");
ok((await live({ p: uuid(3), k: 1 }, { host: "https://parent-accounts.gpskids-speak.pages.dev" })) === 204 && (await live({ p: uuid(3), k: 1 }, { test: "1" })) === 204 &&
  (await q("SELECT COUNT(*) c FROM rl WHERE k LIKE 'live:%' OR k LIKE 'tlive:%'"))[0].c === 2, "preview hosts and x-gks-test runs write nothing");
await live({ p: uuid(4), k: 1 }, { test: "count", host: "https://proof.gpskids-speak.pages.dev" });
ok((await q("SELECT COUNT(*) c FROM rl WHERE k LIKE 'tlive:%'"))[0].c === 1 && (await liveCount(env)) === 1, "x-gks-test: count writes a tlive row (also from a preview host), never a real one");
ok((await live({ p: "nope", k: 1 })) === 400 && (await live({ p: uuid(5), k: 2 })) === 400 && (await live({ p: uuid(5), k: 1, x: "y".repeat(200) })) === 400, "bad id / bad k / oversized -> 400");
ok((await live({ p: uuid(5), k: 1 }, { origin: "https://evil.example" })) === 403, "wrong origin -> 403");
for (let i = 0; i < IP_MAX + 10; i++) await live({ p: uuid(1000 + i), k: 1 }, { ip: "198.51.100.7" });
ok((await liveCount(env)) === 1 + IP_MAX - 0, "anti-padding: one IP can add at most " + IP_MAX + " pings per 5 minutes (live = " + (await liveCount(env)) + ")");
await reset();

// ---------- /api/count 'pfin': first finish per player per day ----------
const cnt = async (body, { test, ip = "203.0.113.1", host = "https://gpskids.app" } = {}) => {
  const h = { "content-type": "application/json", origin: host, "cf-connecting-ip": ip }; if (test) h["x-gks-test"] = test;
  return (await countPost({ env, waitUntil() {}, request: new Request(host + "/api/count", { method: "POST", headers: h, body: JSON.stringify(body) }) })).status;
};
const D = uuid(9000);
await cnt({ e: "visit", p: uuid(1), d: D, df: 1, pf: 1 });
await cnt({ e: "challenge_finished", p: uuid(1), d: D, df: 1, pf: 1 });
await cnt({ e: "challenge_finished", p: uuid(1), d: D, df: 0, pf: 1 });           // replayed beacon: same player, same day
await cnt({ e: "challenge_finished", p: uuid(2), d: D, df: 0, pf: 1 });           // sibling on the same phone
const dm = async (d = day) => Object.fromEntries((await q("SELECT event, n FROM daily WHERE day = ?1", d)).map((x) => [x.event, x.n]));
let m = await dm();
ok(m.pfin === 2 && m.challenge_finished === 1, "pfin = 2 players finished (repeat ignored), device total stays 1: " + JSON.stringify(m));
await cnt({ e: "challenge_finished", p: uuid(3), d: D, df: 1, pf: 1 }, { host: "https://x.gpskids-speak.pages.dev" });
await cnt({ e: "challenge_finished", p: uuid(3), d: D, df: 1, pf: 1 }, { test: "1" });
ok((await dm()).pfin === 2, "preview hosts / x-gks-test runs don't bump pfin");
await cnt({ e: "challenge_finished", p: uuid(3), d: D, df: 1, pf: 1 }, { test: "count", host: "https://proof.gpskids-speak.pages.dev" });
ok((await dm("T" + day)).pfin === 1 && (await dm()).pfin === 2, "x-gks-test: count -> T day pfin only (preview host allowed)");
for (let i = 0; i < PFIN_IP_MAX + 5; i++) await cnt({ e: "challenge_finished", p: uuid(20000 + i), d: D, df: 0, pf: 1 }, { ip: "192.0.2.50" });
ok((await dm()).pfin === 2 + PFIN_IP_MAX, "anti-padding: at most " + PFIN_IP_MAX + " new finishers per IP per day (pfin = " + (await dm()).pfin + ")");
ok((await q("SELECT COUNT(*) c FROM pdaily WHERE day = ?1", day))[0].c === 2 + PFIN_IP_MAX + 5, "pdaily rows still written for every player (cap only affects the proof counter)");
await mf.dispose();
console.log(fails ? `${fails} FAILED` : "ALL PASSED"); process.exit(fails ? 1 : 0);
