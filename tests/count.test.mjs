// Unit tests for anonymous per-player counting (functions/api/count.js + tools/players.sql) on a REAL local D1 (Miniflare).
// usage: (cd tests/node && npm i) ; node tests/count.test.mjs
import { readFileSync } from "node:fs";
import { Miniflare } from "./node/node_modules/miniflare/dist/src/index.js";
import { onRequestPost, cleanup } from "../functions/api/count.js";
import { etDay, anonHash, EVENT_BIT, COUNT_EVENTS } from "../lib/guard.js";

const mf = new Miniflare({ modules: true, script: "export default { fetch() { return new Response('') } }", d1Databases: ["RL"] });
const RL = await mf.getD1Database("RL");
for (const f of ["0001_rl.sql", "0002_daily.sql", "0003_players.sql"])
  for (const s of readFileSync(new URL("../migrations/" + f, import.meta.url), "utf8").replace(/--.*$/gm, "").split(";").map((x) => x.trim()).filter(Boolean)) await RL.prepare(s).run();
let fails = 0; const ok = (c, m) => { console.log((c ? "PASS " : "FAIL ") + m); if (!c) fails++; };
const env = { RL, IP_SALT: "test-salt" };
const send = async (body, { host = "https://gpskids.app", test, origin } = {}) => {
  const h = { "content-type": "application/json", origin: origin || host, "cf-connecting-ip": "203.0.113.1" }; if (test) h["x-gks-test"] = test;
  const r = await onRequestPost({ env, waitUntil() {}, request: new Request(host + "/api/count", { method: "POST", headers: h, body: JSON.stringify(body) }) });
  return r.status;
};
const q = async (sql, ...a) => (await RL.prepare(sql).bind(...a).all()).results;
const day = etDay();
const P1 = "11111111-1111-4111-8111-111111111111", P2 = "22222222-2222-4222-8222-222222222222", D1 = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", D2 = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";

ok(COUNT_EVENTS.slice(0, 4).join() === "visit,challenge_started,challenge_finished,shared" && EVENT_BIT.challenge_finished === 4 && EVENT_BIT.duel_sent === 256 && EVENT_BIT.duel_joined === 512 && EVENT_BIT.friend_done === 1024, "event bits are the documented values");
// two players on one phone + one on another phone
ok(await send({ e: "visit", p: P1, d: D1, df: 1, pf: 1, nw: 1 }) === 204, "player 1 visit -> 204");
await send({ e: "visit", p: P2, d: D1, df: 0, pf: 1, nw: 1 });           // sibling on the same phone: device already counted today
await send({ e: "challenge_finished", p: P1, d: D1, df: 1, pf: 1 });
await send({ e: "challenge_finished", p: P2, d: D1, df: 0, pf: 1 });
await send({ e: "visit", p: "33333333-3333-4333-8333-333333333333", d: D2, df: 1, pf: 1 });
let daily = Object.fromEntries((await q("SELECT event, n FROM daily WHERE day = ?1", day)).map((r) => [r.event, r.n]));
ok(daily.visit === 2 && daily.challenge_finished === 1, "daily totals stay per DEVICE as before: " + JSON.stringify(daily));
const rows = await q("SELECT * FROM pdaily WHERE day = ?1", day);
ok(rows.length === 3, "pdaily: one row per player per day (3 players)");
const h1 = await anonHash(env, "player", P1);
ok(rows.every((r) => /^[0-9a-f]{32}$/.test(r.p) && /^[0-9a-f]{32}$/.test(r.d)) && !JSON.stringify(rows).includes("1111-4111") && rows.some((r) => r.p === h1), "only salted hashes stored, never the raw IDs");
ok(Object.keys(rows[0]).join() === "day,p,d,ev,friends,nw", "row holds no name, age, IP or content (day,p,d,ev,friends,nw)");
ok(rows.find((r) => r.p === h1).ev === (1 | 4), "event bits OR together per player");
ok((await anonHash({ IP_SALT: "other" }, "player", P1)) !== h1, "hash depends on the server secret (IP_SALT)");
// repeats and old clients
await send({ e: "visit", p: P1, d: D1, df: 0, pf: 0 });
ok((await q("SELECT n FROM daily WHERE day = ?1 AND event = 'visit'", day))[0].n === 2, "repeat with df=0/pf=0 adds nothing");
await send({ e: "visit" });
ok((await q("SELECT n FROM daily WHERE day = ?1 AND event = 'visit'", day))[0].n === 3, "old cached app (sends only {e}) still bumps the device total");
ok(await send({ e: "visit", p: "not-a-uuid", d: D1, df: 1, pf: 1 }) === 204 && (await q("SELECT COUNT(*) c FROM pdaily WHERE day = ?1", day))[0].c === 3, "malformed IDs: device total only, no player row");
ok(await send({ e: "hack", p: P1, d: D1, df: 1, pf: 1 }) === 400, "unknown event -> 400");
ok(await send({ e: "visit", p: P1, d: D1, x: "y".repeat(300) }) === 400, "oversized body -> 400");
ok(await send({ e: "visit", p: P1, d: D1, df: 1, pf: 1 }, { origin: "https://evil.example" }) === 403, "wrong origin -> 403");
// duels / friends
await send({ e: "duel_sent", p: P1, d: D1, df: 1, pf: 1 });
await send({ e: "friend_done", p: P1, d: D1, df: 0, pf: 0 });
await send({ e: "friend_done", p: P1, d: D1, df: 0, pf: 0 });
const r1 = (await q("SELECT ev, friends FROM pdaily WHERE day = ?1 AND p = ?2", day, h1))[0];
ok(r1.friends === 2 && (r1.ev & 256) && (r1.ev & 1024), "friend_done counts every friend (friends=2) for the sender");
// ignored traffic
const before = (await q("SELECT COUNT(*) c FROM pdaily"))[0].c;
await send({ e: "visit", p: "44444444-4444-4444-8444-444444444444", d: D2, df: 1, pf: 1 }, { host: "https://voice-coach.gpskids-speak.pages.dev" });
await send({ e: "visit", p: "44444444-4444-4444-8444-444444444444", d: D2, df: 1, pf: 1 }, { test: "1" });
ok((await q("SELECT COUNT(*) c FROM pdaily"))[0].c === before, "preview hosts and x-gks-test runs are ignored");
await send({ e: "visit", p: "44444444-4444-4444-8444-444444444444", d: D2, df: 1, pf: 1 }, { test: "count" });
ok((await q("SELECT COUNT(*) c FROM pdaily WHERE day = ?1", "T" + day))[0].c === 1 && (await q("SELECT COUNT(*) c FROM pdaily WHERE day = ?1", day))[0].c === 3, "x-gks-test: count writes to day T<day>, never to the real day");

// report SQL (tools/players.sql), with a player who also played yesterday
const yday = new Date(new Date(day + "T12:00:00Z").getTime() - 864e5).toISOString().slice(0, 10);
const h2 = await anonHash(env, "player", P2), hd1 = await anonHash(env, "device", D1);
await RL.prepare("INSERT INTO pdaily (day, p, d, ev) VALUES (?1, ?2, ?3, 5), (?1, ?4, ?3, 1), (?1, ?5, ?3, 5)").bind(yday, h1, hd1, "f".repeat(32), h2).run();
const sql = readFileSync(new URL("../tools/players.sql", import.meta.url), "utf8").replace(/^--.*$/gm, "").replaceAll("{DAY}", day).replaceAll("{YDAY}", yday);
const rep = (await RL.prepare(sql).all()).results[0];
console.log("  report:", JSON.stringify(rep));
ok(rep.players === 3 && rep.devices === 2 && rep.players_per_device === 1.5 && rep.devices_visit === 4, "report: players, devices, players per device");
ok(rep.players_yesterday === 3 && rep.returned_next_day === 2 && rep.finished_both_days === 2 && rep.finished_yesterday === 2, "report: next-day return (played yesterday and today)");
ok(rep.new_players === 2 && rep.players_duel_sent === 1 && rep.friends_brought === 2 && rep.senders_with_friends === 1, "report: new players, duel_sent, friends brought");
// retention
await RL.prepare("INSERT INTO pdaily (day, p, d, ev) VALUES ('2020-01-01', 'x', 'y', 1), ('T2020-01-01', 'x', 'y', 1)").run();
await cleanup(env);
ok((await q("SELECT COUNT(*) c FROM pdaily WHERE day LIKE '%2020-01-01'"))[0].c === 0 && (await q("SELECT COUNT(*) c FROM pdaily WHERE day = ?1", day))[0].c === 3, "rows older than 40 days (and old test rows) are deleted; recent rows kept");
await mf.dispose();
console.log(fails ? `${fails} FAILED` : "ALL PASSED"); process.exit(fails ? 1 : 0);
