// Belts: thresholds, no penalty for missed days, kid code / Take me home keeps the belt, kid-safe share text. usage: node tests/belts.test.mjs
import * as BT from "../public/belts.js";
import * as K from "../public/kidcode.js";
import { STEPS, kOk } from "../public/steps.js";
let fails = 0, n = 0;
const ok = (c, m) => { n++; if (!c) { fails++; console.log("FAIL " + m); } else console.log("PASS " + m); };
const day = (k) => { const d = new Date(2026, 8, 1 + k); return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0"); };
const daysN = (k) => Array.from({ length: k }, (_, i) => day(i * 2)); // every other day: lots of missed days

ok(BT.BELTS.map((b) => b.name).join(",") === "White,Yellow,Orange,Green,Blue,Purple", "six belts in order");
ok(BT.BELTS.every((b, i) => !i || (b.days > BT.BELTS[i - 1].days && b.xp > BT.BELTS[i - 1].xp)), "each belt needs more than the last");
ok(BT.beltIndex([], {}) === 0, "new kid = White belt");
ok(BT.beltIndex(daysN(2), { explorers: 999 }) === 0, "2 days is still White, even with lots of points (no cramming)");
// slowest honest kid: one talk a day = 30 points minimum (10 + 20 first-talk bonus, no stars)
const slow = (k) => ({ explorers: 30 * k });
ok(BT.beltIndex(daysN(3), slow(3)) === 1, "first belt-up (Yellow) after 3 practice days, even with the minimum points");
for (const [i, b] of BT.BELTS.entries()) if (i) ok(BT.beltIndex(daysN(b.days), slow(b.days)) === i, `${b.name} at ${b.days} practice days with minimum points`);
ok(BT.beltIndex(daysN(3), { explorers: 50 }) === 0 && BT.nextText(daysN(3), { explorers: 50 }) === "A few more talks to Yellow belt", "points bar only stops a kid who skipped scoring");
ok(BT.beltIndex(daysN(100), slow(100)) === 5 && BT.next(daysN(100), slow(100)) === null && BT.nextText(daysN(100), slow(100)) === "Top belt. Amazing!", "Purple is the top");
ok(BT.inputs(["2026-10-01", "2026-10-01", "2026-10-02"], {}).days === 2, "a day counts once");
ok(BT.inputs([], { sprouts: 10, explorers: 20, grownups: 5000 }).xp === 30, "Grown-ups points never count toward a kid's belt");
ok(BT.inputs([], { explorers: "x", leaders: -5 }).xp === 0, "junk points ignored");
ok(BT.nextText(daysN(1), slow(1)) === "2 more practice days to Yellow belt" && BT.nextText(daysN(2), slow(2)) === "1 more practice day to Yellow belt", "kid words for the next belt");
// missed days: streak can break, belt never drops (belt uses total practice days, not the streak)
{ const d = daysN(7); const before = BT.beltIndex(d, slow(7)); ok(before === 2, "7 days spread out = Orange"); ok(BT.beltIndex(d, slow(7)) === before, "a month off later changes nothing (no penalty)"); }
// celebration logic
ok(BT.check(null, daysN(3), slow(3)).up === false && BT.check(null, daysN(3), slow(3)).store, "first look: remember quietly, no party");
ok(BT.check(0, daysN(3), slow(3)).up === true, "White -> Yellow = party");
ok(BT.check(1, daysN(3), slow(3)).up === false, "no second party for the same belt");
ok(BT.check(3, daysN(3), slow(3)).up === false && !BT.check(3, daysN(3), slow(3)).store, "a higher remembered belt is never lowered");
// share text: first name only, no link
ok(BT.shareText("Maya Rose", 1) === "I just earned the Yellow belt in speaking on GPS Kids Speak! 🥋", "share text never includes a name");
ok(!/http|www|\.app|@/.test(BT.shareText("maya@x.com", 2)) && !/http|www|\.app/.test(BT.shareText("", 2)), "no links or emails in the share text");
ok(BT.shareText("", 0).startsWith("I just"), "no name -> 'I just'");
ok(BT.safeName("<script>Bob") === "scriptBob" && BT.safeName("ÉlodieXYZXYZXYZXYZXYZ").length <= 16, "names are cleaned and short");
ok(!/\u2014/.test(JSON.stringify(BT.BELTS) + BT.shareText("A", 3) + BT.nextText([], {})), "no em dashes");
// kid code: belt rides along through days + points, no payload change needed
{ const kid = { name: "Leo", emoji: "🦁", band: "explorers", code: "ROAR-1234", days: daysN(7), daysGu: [], xp: { explorers: 260 }, badges: [], path: {}, beat: null };
  const d = K.decode(K.encode(kid)); ok(d.ok, "kid code still decodes (version " + K.encode(kid).split(".")[0] + ")");
  ok(BT.beltIndex(d.snap.days, d.snap.xp) === BT.beltIndex(kid.days, kid.xp) && BT.beltIndex(kid.days, kid.xp) === 2, "Take me home link keeps the Orange belt"); }
// tracking steps
ok(STEPS.belt_up === null && kOk("belt_share", "native") && !kOk("belt_share", "wa"), "belt steps listed in steps.js");
console.log(fails ? `${fails}/${n} FAILED` : `ALL PASSED (${n})`); process.exit(fails ? 1 : 0);
