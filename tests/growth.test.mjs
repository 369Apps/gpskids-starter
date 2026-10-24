// Unit tests for the growth counts (lib/growth.js + GET /api/stats?view=growth) on a local D1 (Miniflare).
// usage: node tests/growth.test.mjs
import { readFileSync } from "node:fs";
import { Miniflare } from "./node/node_modules/miniflare/dist/src/index.js";
import { onRequestGet as statsGet } from "../functions/api/stats.js";
import { growthFromD1, growthRows, GROWTH_SQL } from "../lib/growth.js";
import { etDayOf } from "../functions/api/ev.js";

const mf = new Miniflare({ modules: true, script: "export default { fetch() { return new Response('') } }", d1Databases: ["EV"] });
const EV = await mf.getD1Database("EV");
for (const s of readFileSync(new URL("../migrations-events/0001_events.sql", import.meta.url), "utf8").replace(/--.*$/gm, "").split(";").map((x) => x.trim()).filter(Boolean)) await EV.prepare(s).run();
let fails = 0, n = 0; const ok = (c, m) => { n++; console.log((c ? "PASS " : "FAIL ") + m); if (!c) fails++; };
const ins = (day, sid, nn, p, step, k = null, test = 1) => EV.prepare("INSERT INTO ev (day, test, sid, n, ts, p, d, step, v, k, x) VALUES (?1,?2,?3,?4,?5,?6,'dev',?7,NULL,?8,NULL)").bind(day, test, sid, nn, nn, p, step, k).run();
// Made-up anonymous players (hashes in real life): A plays day 1 and day 3, B arrives from a duel link on day 3,
// C from a ?ref invite on day 2 and back on day 3, D only day 3 (direct), E real (test = 0) traffic must never mix in.
const D1 = "2026-10-05", D2 = "2026-10-06", D3 = "2026-10-07";
await ins(D1, "s1", 0, "A", "app_open", "direct"); await ins(D1, "s1", 1, "A", "share", "wa"); await ins(D1, "s1", 2, "A", "duel_sent", "friend");
await ins(D2, "s2", 0, "C", "app_open", "ref"); await ins(D2, "s2", 1, "C", "lb_invite");
await ins(D3, "s3", 0, "A", "app_open", "resume"); await ins(D3, "s3", 1, "A", "share", "copy");
await ins(D3, "s4", 0, "B", "app_open", "duel"); await ins(D3, "s4", 1, "B", "duel_open", "ok");
await ins(D3, "s5", 0, "C", "app_open", "direct"); await ins(D3, "s6", 0, "D", "app_open", "direct");
await ins(D3, "s7", 0, "E", "app_open", "duel", 0); await ins(D3, "s7", 1, "E", "share", "wa", 0);
const g = await growthFromD1(EV, D1, D3, true);
const day = (d) => g.days.find((x) => x.day === d);
ok(g.days.length === 3 && g.days[0].day === D3 && g.days[2].day === D1, "one row per day, newest first");
ok(day(D1).new_players === 1 && day(D1).came_back === 0 && day(D1).invites_shared === 1 && day(D1).invite_opens === 0, "day 1: A is new, 1 share: " + JSON.stringify(day(D1)));
ok(day(D2).new_players === 1 && day(D2).new_from_invite === 1 && day(D2).invite_opens === 1 && day(D2).invites_shared === 1, "day 2: C new from a ?ref invite, Bring a friend share counted: " + JSON.stringify(day(D2)));
ok(day(D3).players === 4 && day(D3).new_players === 2 && day(D3).came_back === 2 && day(D3).new_from_invite === 1 && day(D3).invite_opens === 1 && day(D3).invites_shared === 1,
  "day 3: A and C came back, B (duel link) and D new, 1 from an invite; real traffic not mixed in: " + JSON.stringify(day(D3)));
ok(g.total.new_players === 4 && g.total.came_back === 2 && g.total.new_from_invite === 2, "totals add up");
const real = await growthFromD1(EV, D3, D3, false);
ok(real.days[0].new_players === 1 && real.days[0].new_from_invite === 1 && real.days[0].invites_shared === 1, "real traffic counted separately from test traffic");
const quiet = growthRows([], [], "2026-10-01", "2026-10-14");
ok(quiet.days.length === 14 && quiet.days.every((d) => d.new_players === 0 && d.came_back === 0), "quiet days show zeros (14 rows)");
ok(!/name|email|age|ip|transcript/i.test(GROWTH_SQL.players + GROWTH_SQL.invites), "queries read only the hashed player id, the day, the step and its code");
// endpoint
const KEY = "k".repeat(40), env = { EV, EV_ENV: "preview", PITCH_ADMIN_KEY: KEY, IP_SALT: "salt" }, ctx = { waitUntil() {} };
const PREV = "https://growth-counts.gpskids-speak.pages.dev";
const sreq = (q, key) => new Request(PREV + "/api/stats" + q, { headers: { origin: PREV, "cf-connecting-ip": "192.0.2.7", ...(key ? { authorization: "Bearer " + key } : {}) } });
let r = await statsGet({ request: sreq("?view=growth"), env, ...ctx });
ok(r.status === 401, "growth view without the admin key -> 401");
r = await statsGet({ request: sreq("?view=growth&test=1", KEY), env, ...ctx }); let j = await r.json();
ok(r.status === 200 && j.days.length === 14 && j.to === etDayOf(Date.now()), "growth view default = last 14 ET days ending today");
r = await statsGet({ request: sreq(`?view=growth&test=1&from=${D1}&to=${D3}`, KEY), env, ...ctx }); j = await r.json();
ok(r.status === 200 && j.total.new_players === 4, "growth view with a date range");
r = await statsGet({ request: sreq("?view=growth&from=2026-01-01&to=2026-03-01", KEY), env, ...ctx });
ok(r.status === 400, "growth view: more than 31 days -> 400");
console.log(fails ? `${fails} of ${n} FAILED` : `ALL PASSED (${n})`);
await mf.dispose();
process.exit(fails ? 1 : 0);
