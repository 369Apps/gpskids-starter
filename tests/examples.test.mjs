// Every prompt has its own Hook/Point/Example/Close example (read-only plan cues). node tests/examples.test.mjs
import { EX, EX_ADULT, PARTS, exampleFor, hasOwnExample } from "../public/examples.js";
import { BANK, ADULT_LIST, BANDS, dayList } from "../public/prompts.js";
let fails = 0; const ok = (c, m) => { console.log((c ? "PASS " : "FAIL ") + m); if (!c) fails++; };
const all = [];
for (const b of Object.keys(BANDS)) for (const t of Object.keys(BANK[b])) {
  ok(EX[b] && EX[b][t] && EX[b][t].length === BANK[b][t].length, `${b}/${t}: ${BANK[b][t].length} prompts, ${(EX[b] && EX[b][t] || []).length} examples`);
}
ok(EX_ADULT.length === ADULT_LIST.length, `grown-ups: ${ADULT_LIST.length} prompts, ${EX_ADULT.length} examples`);
let items = 0, own = 0;
for (const b of [...Object.keys(BANDS), "grownups"]) for (const it of dayList(b)) { items++; if (hasOwnExample(it)) own++; all.push(exampleFor(it)); }
ok(items === own, `every prompt in rotation has its own example (${own}/${items})`);
const lines = all.flatMap((x) => PARTS.map(([k]) => x[k]));
ok(lines.every((s) => typeof s === "string" && s.trim().length >= 4), "all 4 parts filled for every prompt");
ok(lines.every((s) => !/[—–]/.test(s)), "no em or en dashes");
ok(lines.every((s) => !/garu/i.test(s)), "plain global English");
const longest = lines.reduce((a, s) => (s.length > a.length ? s : a), "");
ok(longest.length <= 80, "each cue is short (longest " + longest.length + " chars: " + longest + ")");
const mis = exampleFor({ p: "Explain to your kid why it is okay to make mistakes.", type: "kidtalk" });
ok(/Edison/.test(mis.hook), "a tester's prompt gets the Edison hook: " + mis.hook);
ok(exampleFor({ p: "unknown", type: "story" }).point && exampleFor(null).hook, "unknown prompt falls back to a type example");
console.log(fails ? `${fails} FAILED` : "ALL PASSED"); process.exit(fails ? 1 : 0);
