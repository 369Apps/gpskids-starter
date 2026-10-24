// Unit tests for "Challenge a friend" duels (functions/api/duel.js, PREVIEW) against a REAL local D1 (Miniflare) with the real rl schema.
// usage: (cd tests/node && npm i) ; node tests/duel.test.mjs
import { readFileSync } from "node:fs";
import { Miniflare } from "./node/node_modules/miniflare/dist/src/index.js";
import { onRequestGet, onRequestPost, pack, unpack } from "../functions/api/duel.js";
import { promptAt } from "../public/prompts.js";

const mf = new Miniflare({ modules: true, script: "export default { fetch() { return new Response('') } }", d1Databases: ["RL"] });
const RL = await mf.getD1Database("RL");
for (const s of readFileSync(new URL("../migrations/0001_rl.sql", import.meta.url), "utf8").replace(/--.*$/gm, "").split(";").map((x) => x.trim()).filter(Boolean)) await RL.prepare(s).run();
let fails = 0; const ok = (c, m) => { console.log((c ? "PASS " : "FAIL ") + m); if (!c) fails++; };
const HOST = "https://voice-coach.gpskids-speak.pages.dev";
const ON = { RL, AI: {}, VOICE: "1", IP_SALT: "t" }, PROD = { RL, AI: {}, IP_SALT: "t" };
const post = async (env, body, { origin = HOST, ip = "203.0.113.5" } = {}) => {
  const r = await onRequestPost({ env, ctx: { waitUntil() {} }, request: new Request(HOST + "/api/duel", { method: "POST",
    headers: { "content-type": "application/json", origin, "sec-fetch-site": "same-origin", "cf-connecting-ip": ip }, body: JSON.stringify(body) }) });
  return { s: r.status, j: await r.json().catch(() => ({})) };
};
const get = async (env, id, ip = "203.0.113.5") => {
  const r = await onRequestGet({ env, ctx: { waitUntil() {} }, request: new Request(HOST + "/api/duel?id=" + id, { headers: { "cf-connecting-ip": ip } }) });
  return { s: r.status, j: await r.json().catch(() => ({})) };
};

// packing round-trip
const u = unpack(pack({ a: [3, 2, 1, 0], b: [0, 1, 2, 3], done: true, band: "grownups", i: 19 }));
ok(JSON.stringify(u) === JSON.stringify({ a: [3, 2, 1, 0], b: [0, 1, 2, 3], done: true, band: "grownups", i: 19 }), "pack/unpack round-trip (scores, band, prompt only)");
ok(unpack(pack({ a: [3, 3, 3, 3], band: "trailblazers", i: 34 })).i === 34, "largest kid prompt index fits");

// switch
ok((await post(PROD, { op: "create", band: "explorers", i: 2, stars: [3, 2, 3, 1] })).s === 503, "production (no VOICE) -> create 503");
ok((await get(PROD, "abcdefghjk")).s === 503, "production -> get 503");
await RL.prepare("INSERT INTO rl (k,n,exp) VALUES ('cfg:voice_off',1,4102444800)").run();
ok((await post(ON, { op: "create", band: "explorers", i: 2, stars: [3, 2, 3, 1] })).s === 503, "kill switch row -> create 503");
await RL.prepare("DELETE FROM rl WHERE k = 'cfg:voice_off'").run();

// create -> get -> finish -> get
let c = await post(ON, { op: "create", band: "explorers", i: 2, stars: [3, 2, 3, 1] });
ok(c.s === 200 && /^[a-km-np-z2-9]{10}$/.test(c.j.id), "create -> 10-char id");
const id = c.j.id;
let g = await get(ON, id);
ok(g.s === 200 && g.j.band === "explorers" && g.j.i === 2 && JSON.stringify(g.j.a) === "[3,2,3,1]" && g.j.done === false && !("b" in g.j), "get open duel -> challenger scores + prompt, no friend score yet");
ok(promptAt(g.j.band, g.j.i).p.length > 5, "friend can rebuild the same prompt from band+i");
const row = await RL.prepare("SELECT * FROM rl WHERE k = ?1").bind("duel:" + id).first();
ok(Object.keys(row).join() === "k,n,exp" && typeof row.n === "number" && row.exp - Date.now() / 1000 > 6.9 * 86400 && row.exp - Date.now() / 1000 < 7.1 * 86400, "stored as one rl row: a number only, expires in 7 days");
let f = await post(ON, { op: "finish", id, stars: [2, 3, 3, 3] }, { ip: "198.51.100.9" });
ok(f.s === 200 && f.j.done === true && JSON.stringify(f.j.b) === "[2,3,3,3]" && JSON.stringify(f.j.a) === "[3,2,3,1]", "friend finish -> both scores");
let f2 = await post(ON, { op: "finish", id, stars: [3, 3, 3, 3] }, { ip: "198.51.100.10" });
ok(f2.s === 409 && JSON.stringify(f2.j.b) === "[2,3,3,3]", "second finish -> 409, first score kept (no overwrite)");
g = await get(ON, id);
ok(g.j.done === true && JSON.stringify(g.j.b) === "[2,3,3,3]", "sender poll sees the friend's score (then claims +20 XP locally)");

// validation
ok((await post(ON, { op: "create", band: "nope", i: 2, stars: [3, 2, 3, 1] })).s === 400, "bad band -> 400");
ok((await post(ON, { op: "create", band: "explorers", i: 2, stars: [4, 2, 3, 1] })).s === 400, "stars out of range -> 400");
ok((await post(ON, { op: "create", band: "explorers", i: 200, stars: [3, 2, 3, 1] })).s === 400, "prompt index out of range -> 400");
ok((await post(ON, { op: "create", band: "explorers", i: 2, stars: [3, 2, 3, 1], name: "Sam" })).s === 200, "extra fields (e.g. a name) are ignored, never stored");
ok((await post(ON, { op: "finish", id: "zzzzzzzzzz", stars: [1, 1, 1, 1] })).s === 404, "unknown id -> 404");
ok((await get(ON, "bad id")).s === 400, "malformed id -> 400");
ok((await post(ON, { op: "create", band: "explorers", i: 2, stars: [3, 2, 3, 1] }, { origin: "https://evil.example" })).s === 403, "wrong origin -> 403");
await RL.prepare("UPDATE rl SET exp = 1 WHERE k = ?1").bind("duel:" + id).run();
ok((await get(ON, id)).s === 404, "expired duel -> 404");

// rate limit
const codes = []; for (let k = 0; k < 22; k++) codes.push((await post(ON, { op: "create", band: "leaders", i: 1, stars: [1, 1, 1, 1] }, { ip: "192.0.2.77" })).s);
ok(codes.slice(0, 20).every((s) => s === 200) && codes[20] === 429, "create cap: 20 per IP per day, then 429");
const keys = (await RL.prepare("SELECT k FROM rl").all()).results.map((r) => r.k);
ok(keys.every((k) => /^(duel:[a-km-np-z2-9]{10}|d[cfg]:(ip:[0-9a-f]{32}|g:\d{4}-\d{2}-\d{2}))$/.test(k)), "only duel rows and hashed-IP counters in rl");

await mf.dispose();
console.log(fails ? `${fails} FAILED` : "ALL PASSED"); process.exit(fails ? 1 : 0);
