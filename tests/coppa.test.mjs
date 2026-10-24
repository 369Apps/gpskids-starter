// Child-safety checks that do not need Cloudflare.
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import * as PN from "../public/pitch.js";
import * as TR from "../public/trial.js";
import * as NT from "../public/notes.js";
import * as KC from "../public/kidcode.js";

let n = 0, f = 0;
const ok = (c, m) => { n++; if (!c) { f++; console.log("FAIL " + m); } else console.log("PASS " + m); };

const pitch = PN.checkForm({ parent: "Pat Parent", email: "pat@example.com", kid: "Maya", age: 9, consent: true });
ok(!pitch.ok && pitch.errors.kid, "pitch form rejects a child name");
const pitchOk = PN.checkForm({ parent: "Pat Parent", email: "pat@example.com", kid: "", age: 9, consent: true });
ok(pitchOk.ok && pitchOk.v.kid === "", "pitch form accepts a parent with no child name");

const trial = TR.checkTrial({ parent: "Pat Parent", phone: "5552010199", kid: "Maya", age: 9, day: "tue", ms: 5000 });
ok(!trial.ok && trial.errors.kid, "trial form rejects a child name");
const trialOk = TR.checkTrial({ parent: "Pat Parent", phone: "5552010199", kid: "", age: 9, day: "tue", ms: 5000 });
ok(trialOk.ok && trialOk.v.kid === "", "trial form keeps parent phone and age only");

ok(!NT.codeOk("coach") && !NT.codeOk("COACH"), "no published coach PIN");

const snap = KC.decode(KC.encode({ ...KC.emptySnap(), name: "Maya Rose", emoji: "🦊", band: "explorers", code: "ROAR-4821", days: ["2026-10-01"] }));
ok(snap.ok && snap.snap.name === "", "take-home links drop the name");

function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    if (name === "node_modules" || name === ".git") continue;
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (/\.(js|html|mjs|css|txt|xml|md)$/.test(name)) out.push(p);
  }
  return out;
}
const banned = [/api\.x\.ai/i, /grok-/i, /xai-client-secret/i, /bobbyve\.com/i, /1740 Grassland/i, /Alpharetta/i, /COACH_CODE\s*=\s*"COACH"/];
const hits = [];
for (const p of walk("public")) {
  const t = readFileSync(p, "utf8");
  for (const re of banned) if (re.test(t)) hits.push(p + " " + re);
  if (/first name/i.test(t) && /prompts\.js$/.test(p)) hits.push(p + " asks for a first name");
}
ok(hits.length === 0, "kid-facing files stay clear of vendor urls, the old PIN, and the street address" + (hits.length ? " :: " + hits.join("; ") : ""));

const prompts = readFileSync("public/prompts.js", "utf8");
ok(!/your first name/i.test(prompts) && !/tell me your name/i.test(prompts), "prompts do not ask a child for a name");

console.log(f ? `${n - f}/${n} FAILED` : `${n}/${n} ALL PASSED`);
process.exit(f ? 1 : 0);
