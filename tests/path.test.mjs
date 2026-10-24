// node tests/path.test.mjs : the hidden level (public/path.js) + this week's club skill (public/club.js)
import * as PA from "../public/path.js";
import * as CL from "../public/club.js";
import { promptAt } from "../public/prompts.js";
let fails = 0, n = 0;
const ok = (c, m) => { n++; if (!c) fails++; console.log((c ? "PASS " : "FAIL ") + m); };
const pct = (o) => ({ clarity: o, pace: o, confidence: o, structure: o });

// first talk sets the level (capped), then one step at a time
ok(PA.place(30) === 1 && PA.place(50) === 2 && PA.place(55) === 3 && PA.place(61) === 4 && PA.place(99) === 4 && PA.PLACE_MAX === 4, "first talk: 30%->L1, 50%->L2, 55%->L3, 61%->L4, 99%->L4 (cap 4)");
let p = PA.blank(), r;
r = PA.record(p, { key: "d:explorers:3:2026-10-08", pct: pct(61), day: "2026-10-08" });
ok(r.mv === "start" && r.lv === 4 && r.path.from === "talk", "first talk 61% sets Level 4");
ok(PA.lenFor(r.lv, "explorers") === 60 && PA.lenFor(1, "explorers") === 30 && PA.lenFor(8, "leaders") === 90 && PA.lenFor(8, "sprouts") === 60 && PA.lenFor(0, "leaders") === null, "level picks talk time: L1-2 30 s, L3-6 60 s, L7+ 90 s (Sprouts max 60), none before the first talk");
r = PA.record(r.path, { key: "d:explorers:3:2026-10-08", pct: pct(90), day: "2026-10-08" });
ok(r.mv === "start" && r.lv === 4, "retry of the first challenge re-places from the best talk (90% -> still L4: the cap), never stacks");
r = PA.record(r.path, { key: "d:explorers:4:2026-10-09", pct: pct(64), day: "2026-10-09" });
ok(r.mv === "up" && r.lv === 5 && r.changed, "strong result (64% >= 64% bar for L5) -> up one");
r = PA.record(r.path, { key: "d:explorers:4b:2026-10-09", pct: pct(69), day: "2026-10-09" });
ok(r.mv === "up" && r.lv === 6 && r.changed, "next strong result (69% >= 68% bar for L6) -> up one more");
r = PA.record(r.path, { key: "d:explorers:4b:2026-10-09", pct: pct(95), day: "2026-10-09" });
ok(r.mv === "up" && r.lv === 6 && !r.changed, "a retry of the same challenge can't climb twice");
r = PA.record(r.path, { key: "d:explorers:5:2026-10-10", pct: pct(65), day: "2026-10-10" });
ok(r.mv === "hold" && r.lv === 6, "near miss (65% at L6) -> hold");
r = PA.record(r.path, { key: "d:explorers:6:2026-10-11", pct: pct(40), day: "2026-10-11" });
ok(r.mv === "ease" && r.lv === 5, "clearly weak (40% < 68-10) -> ease down one");
r = PA.record(r.path, { key: "d:explorers:6:2026-10-11", pct: pct(66), day: "2026-10-11" });
ok(r.mv === "hold" && r.lv === 6, "retry after an ease can improve the move to hold (back to L6), not beyond");
ok(r.path.h.length === 8 && r.path.sk && r.path.sk.clarity > 0, "history + rolling skill scores kept");
{ let q = PA.blank(); q.lv = 1; const w = PA.record(q, { key: "k", pct: pct(10), day: "2026-10-08" }); ok(w.mv === "hold" && w.lv === 1, "Level 1 never drops below 1"); }
{ let q = PA.blank(); q.lv = 10; ok(PA.record(q, { key: "k", pct: pct(91), day: "d" }).lv === 10 && PA.goalFor(10) === 90, "top level stays 10 (keep 90%+)"); }
// migration: old players keep their progress
ok(PA.ensure(null, 3, true).lv === 3 && PA.ensure(null, 3, true).from === "xp", "old player with XP Lv 3 -> level 3 (no first-talk placement)");
ok(PA.ensure(null, 12, true).lv === PA.MIGRATE_MAX && PA.MIGRATE_MAX === 6, "old player with XP Lv 12 -> capped at level 6 (keeps progress; first-talk cap 4 is for new kids)");
ok(PA.ensure(null, 1, false).lv === 0, "brand-new player: no level until the first talk");
ok(PA.ensure({ lv: 99, h: "x", club: { bad: 1, "2026-10-08": 70 } }).lv === 0 && PA.ensure({ club: { bad: 1, "2026-10-08": 70 } }).club["2026-10-08"] === 70 && !("bad" in PA.ensure({ club: { bad: 1 } }).club), "junk in storage is ignored");
// club
{ const q = PA.record(PA.blank(), { key: "club:2026-10-08", pct: pct(72), day: "2026-10-08", club: "2026-10-08" }); ok(q.path.club["2026-10-08"] === 72 && q.path.h[0].c === "2026-10-08", "a club talk counts on the level and marks the club class done"); }
const c = CL.clubFor("2026-10-08");
ok(c && c.theme === "The Full Package" && c.skills.join() === "eyes,voice,pause,reason,hands", "Thu Oct 8 class: The Full Package (eyes, voice, pause, reason, hands)");
ok(CL.clubFor("2026-10-07").theme === "Hands Out of Pockets" && CL.clubFor("2026-10-12").theme === "The Full Package" && CL.clubFor("2026-10-14").theme === "Three Beats" && CL.clubFor("2026-10-14").skills.join() === "pause,eyes" && CL.clubFor("2026-10-15").theme === "The Full Speech" && CL.clubFor("2026-10-19").theme === "The Full Speech" && CL.clubFor("2026-10-21").theme === "Paint the Picture" && CL.clubFor("2026-10-22").theme === "The Spooky Story" && CL.clubFor("2026-10-28").theme === "The Spooky Story" && CL.clubFor("2026-10-29") === null && CL.clubFor("2026-09-01") === null, "latest class on/before today, within 6 days, else none (Tue Oct 13: Three Beats, pause + eyes; Thu Oct 15: The Full Speech; Tue Oct 20: Paint the Picture; Thu Oct 22: The Spooky Story, added Oct 18 2026)");
const it = CL.clubItem(c, "leaders"), iy = CL.clubItem(c, "sprouts");
ok(it.s === 60 && iy.s === 30 && it.p !== iy.p && /because/.test(it.p) && it.ex.hook && Number.isInteger(it.i) && it.i >= 100 && it.i <= 127, "club item: 60 s case (30 s short version for young kids), own example, prompt number 100-127");
ok(CL.byDuelI(it.i, "2026-10-09") === c && CL.byDuelI(5) === null && CL.byDuelI(128) === null, "friend duels can carry the club challenge (prompt number -> class)");
ok(CL.clubItem(c, "leaders", 90).s === 90 && CL.clubItem(c, "sprouts", 0).s === 30, "club talk time follows the level when given");
ok(new Set(CL.CLUB.map(CL.duelI)).size === CL.CLUB.length && CL.CLUB.every((x, k) => k === 0 || x.date > CL.CLUB[k - 1].date), "club list is in date order with unique duel numbers");
ok(CL.CLUB.every((x) => x.skills.every((k) => CL.SKILLS[k]) && x.p.length < 260 && x.py.length < 200 && ["hook", "point", "example", "close"].every((k) => x.ex[k])), "every class entry has known skills, short kid wording and a full example");
ok(Math.max(...Array.from({ length: 400 }, (_, k) => promptAt("leaders", k).i)) < CL.DUEL_BASE, "daily prompt numbers stay below the club range");
// server: the coach gets the club prompt + skills from the prompt number
{
  const { onRequestPost } = await import("../functions/api/feedback.js");
  let seen = "";
  const env = { AI: { run: async (m, o) => { seen = o.messages[1].content; return { response: { well: ["You gave a reason with because.", "Your pause was strong."], next: "Add one example.", parts: { hook: "weak", point: "strong", example: "weak", close: "weak" }, structure: "Add an example." } }; } },
    RL: { prepare: () => ({ bind: () => ({ first: async () => null, run: async () => ({}) }) }), batch: async () => [] }, IP_SALT: "t" };
  const req = new Request("https://path.gpskids-speak.pages.dev/api/feedback", { method: "POST", headers: { "content-type": "application/json", origin: "https://path.gpskids-speak.pages.dev" },
    body: JSON.stringify({ band: "leaders", i: it.i, transcript: "Every kid should get a build hour because building makes you brave.", seconds: 40, wpm: 120, fillers: 0, goal: 60 }) });
  const res = await onRequestPost({ request: req, env, waitUntil: () => {} });
  ok(res.status === 200 && seen.includes("The Full Package") && seen.includes(it.p) && /cannot see eyes or hands/.test(seen), "feedback API: the coach is told the club prompt + skills (status " + res.status + ")");
}
console.log(fails ? `${fails}/${n} FAILED` : `${n}/${n} ALL PASSED`); process.exit(fails ? 1 : 0);
