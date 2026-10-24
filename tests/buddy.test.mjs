// Buddy play game logic: 4 games, turns, pass-the-phone, finish, resume. usage: node tests/buddy.test.mjs
import * as G from "../public/buddy-games.js";
import { kOk } from "../public/steps.js";
let fails = 0, n = 0;
const ok = (c, m) => { n++; if (!c) { fails++; console.log("FAIL " + m); } else console.log("PASS " + m); };
ok(G.GAMES.map((g) => g.title).join(",") === "Story swap,One-word story,Invention duo,Mystery trip", "4 games");
for (const g of G.GAMES) {
  ok(g.steps.length >= 4 && g.steps.length <= 6, g.title + ": a few short rounds (" + g.steps.length + ")");
  ok(g.steps.every(([w, p]) => [0, 1, 2].includes(w) && p.short && p.mid && p.long), g.title + ": every turn has 3 paces");
  ok(g.steps.some(([w]) => w === 0) && g.steps.some(([w]) => w === 1) && g.steps[g.steps.length - 1][0] === 2, g.title + ": both buddies get turns, finish together");
  ok(kOk("buddy_start", g.id) && kOk("buddy_done", g.id), g.title + ": tracking code listed");
  const all = JSON.stringify(g); ok(!/\u2014/.test(all), g.title + ": no em dashes");
  ok(g.steps.every(([, p]) => Object.values(p).every((t) => t.length <= 140)), g.title + ": prompts are short");
}
ok(G.paceFor("sprouts") === "short" && G.paceFor("explorers") === "mid" && G.paceFor("trailblazers") === "long" && G.paceFor("x") === "mid", "pace from age group");
ok(G.cleanName("  Maya ") === "Maya" && G.cleanName("Zoë") === "Zoë" && !G.cleanName("") && !G.cleanName("a@b.com") && !G.cleanName("x".repeat(17)) && !G.cleanName("<b>"), "first names only");
ok(G.start("story", ["Maya", ""], "explorers") === null && G.start("nope", ["A", "B"], "explorers") === null, "needs two names and a real game");
// play a whole game
let s = G.start("story", ["Maya", "Leo"], "sprouts", 1000), seen = [];
ok(s && s.pace === "short" && s.i === 0 && !s.pass, "game starts on Maya's turn");
let v = G.screen(s); ok(v.kind === "turn" && v.name === "Maya" && v.step === 1 && v.of === 5 && /tiny door/.test(v.prompt), "Your turn, Maya: " + v.prompt.slice(0, 50));
for (let k = 0; k < 20 && !G.isDone(s); k++) { s = G.advance(s, 1000 + k); seen.push(G.screen(s).kind + ":" + (G.screen(s).name || "")); }
ok(G.isDone(s), "game ends");
ok(seen.join(" ") === "pass:Leo turn:Leo pass:Maya turn:Maya pass:Leo turn:Leo pass:Maya and Leo turn:Maya and Leo done:", "turns alternate with a pass-the-phone screen between: " + seen.join(" "));
ok(G.screen(s).text === G.byId("story").finish, "fun finish line");
// resume
{ let t = G.start("trip", ["Ava", "Sam"], "leaders", 5000); t = G.advance(t, 6000); const raw = JSON.stringify(t);
  const r = G.revive(raw, 7000); ok(r && r.i === 1 && r.pass === true && r.n[1] === "Sam" && r.pace === "long", "a closed page resumes at the pass-the-phone screen");
  ok(G.revive(raw, 6000 + G.DRAFT_TTL + 1) === null, "older than a day: start fresh");
  ok(G.revive("{bad", 7000) === null && G.revive(JSON.stringify({ ...t, g: "x" }), 7000) === null && G.revive(JSON.stringify({ ...t, n: ["<x>", "Sam"] }), 7000) === null, "broken saves are ignored");
  let done = t; while (!G.isDone(done)) done = G.advance(done, 6500); ok(G.revive(JSON.stringify(done), 7000) === null, "a finished game is not resumed"); }
ok(kOk("buddy_open", "home") && kOk("buddy_open", "class") && kOk("buddy_open", "resume"), "buddy_open codes");
console.log(fails ? `${fails}/${n} FAILED` : `ALL PASSED (${n})`); process.exit(fails ? 1 : 0);
