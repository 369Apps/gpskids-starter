// Kid code + "Take me home" link: encode/decode, checksum, version, merge. usage: node tests/kidcode.test.mjs
import * as K from "../public/kidcode.js";
import { ALL_BANDS } from "../public/prompts.js";
import * as PA from "../public/path.js";
import qrcode from "../public/qr.js";
let fails = 0, n = 0;
const ok = (c, m) => { n++; if (!c) { fails++; console.log("FAIL " + m); } else console.log("PASS " + m); };
const eq = (a, b) => JSON.stringify(a) === JSON.stringify(b);

ok(eq(K.BAND_IDS, Object.keys(ALL_BANDS)), "band list matches prompts.js (order matters for the link)");
{ const codes = new Set(); for (let i = 0; i < 300; i++) codes.add(K.makeCode()); ok([...codes].every((c) => K.CODE_RE.test(c)), "codes look like ROAR-4821"); ok(codes.size > 280, "codes are random (" + codes.size + "/300 unique)"); }
ok(K.makeCode(() => 0) === "ROAR-1000", "injectable random for tests");

// a realistic kid
const days = ["2026-10-01", "2026-10-02", "2026-10-03", "2026-10-06", "2026-10-07", "2026-10-08", "2026-10-09"];
let path = PA.blank();
for (const [d, o] of [["2026-10-07", 58], ["2026-10-08", 66], ["2026-10-09", 71]]) path = PA.record(path, { key: "d:" + d, pct: { clarity: o, pace: o, confidence: o, structure: o }, day: d }).path;
path = PA.record(path, { key: "club:2026-10-08", pct: { clarity: 80, pace: 70, confidence: 60, structure: 70 }, day: "2026-10-08", club: "2026-10-08" }).path;
const maya = { name: "Maya Rose", emoji: "🦊", band: "explorers", code: "ROAR-4821", days, daysGu: [], xp: { explorers: 245, sprouts: 30 },
  badges: [{ id: "streak3", date: "2026-10-03" }], path: { explorers: path }, beat: { date: "2026-10-09", o: 71 } };
const frag = K.encode(maya);
console.log("     fragment length " + frag.length + ": " + frag.slice(0, 60) + "…");
ok(/^1\.[A-Za-z0-9_-]+\.[0-9a-z]+$/.test(frag), "versioned, url-safe, with a checksum");
ok(frag.length < 600, "compact (" + frag.length + " chars)");
const d = K.decode(frag);
ok(d.ok, "decodes");
const s = d.snap;
ok(s.name === "" && s.emoji === "🦊" && s.band === "explorers" && s.code === "ROAR-4821", "a name is dropped; avatar, age group, and code survive");
ok(eq(s.days, days) && eq(s.xp, { explorers: 245, sprouts: 30 }) && eq(s.badges, maya.badges) && eq(s.beat, maya.beat), "days, points, badges, best survive");
ok(s.path.explorers.lv === path.lv && eq(s.path.explorers.sk, path.sk) && eq(s.path.explorers.club, path.club) && eq(s.path.explorers.h, path.h.slice(-K.H_LINK)), "level, skills, talk history, club talks survive");
ok(eq(K.decode(K.encode(s)).snap, s), "encode(decode(x)) is stable");
ok(PA.ensure(s.path.explorers).lv === path.lv, "path.js accepts the decoded level");
ok(K.decode(encodeURIComponent(frag)).ok, "survives URL-encoding");

// checksum + version + garbage
const [v, p, c] = frag.split(".");
const flip = p.slice(0, 20) + (p[20] === "A" ? "B" : "A") + p.slice(21);
ok(K.decode([v, flip, c].join(".")).why === "check", "one changed character is caught by the checksum");
ok(K.decode([v, p, "zzzz"].join(".")).why === "check", "wrong checksum rejected");
ok(K.decode("2." + p + "." + K.check("2." + p)).why === "version", "unknown version rejected");
ok(!K.decode("").ok && !K.decode("hello").ok && !K.decode("1.@@@.x").ok, "garbage rejected");
{ const bad = "1." + Buffer.from(JSON.stringify(["<script>", "🦊", 1, "ROAR-4821", [], [], [], [], [], 0])).toString("base64url"); ok(K.decode(bad + "." + K.check(bad)).why === "bad", "a forged link with a bad name is rejected even with a valid checksum"); }
{ const bad = "1." + Buffer.from(JSON.stringify(["Maya", "🦊", 1, "ROAR-4821", [[2000, 9999]], [], [], [], [], 0])).toString("base64url"); ok(!K.decode(bad + "." + K.check(bad)).ok, "too many days rejected"); }
{ const bad = "1." + Buffer.from(JSON.stringify(["Maya", "🦊", 1, "maya@x.com", [], [], [], [], [], 0])).toString("base64url"); ok(!K.decode(bad + "." + K.check(bad)).ok, "a non-code (email) is rejected"); }
ok(K.HASH_RE.test("#home=" + frag) && !K.HASH_RE.test("#home=" + frag + "<x>"), "hash pattern");
ok(K.linkFor("https://gpskids.app", maya).startsWith("https://gpskids.app/#home=1."), "link opens gpskids.app with progress after #");

// what is NOT in the link
{ const json = Buffer.from(p, "base64url").toString("utf8"); ok(!/transcript|words|audio|@|http/i.test(json), "no words, audio, emails or links inside: " + json.slice(0, 90) + "…"); }

// long streaks stay exact (runs)
{ const long = []; for (let i = 0; i < 120; i++) long.push(K.isoOf(K.dn("2026-06-12") + i)); const r = K.decode(K.encode({ ...maya, days: long })).snap; ok(eq(r.days, long), "a 120-day streak moves exactly"); }

// merge
{
  const m = K.merge(K.emptySnap(), s);
  ok(eq(m.days, s.days) && eq(m.xp, s.xp) && m.name === "" && m.code === "ROAR-4821", "into an empty player: progress comes over, the name does not");
  const twice = K.merge(m, s);
  ok(eq(twice, m), "importing the same link twice changes nothing (no double counting)");
  ok(eq(K.merge(s, s).xp, s.xp), "same progress on both sides: points stay the same, not doubled");
}
{
  // home phone: Maya already played 2 days at home with 90 points and a level of 3
  let hp = PA.blank(); hp = PA.record(hp, { key: "d:2026-10-04", pct: { clarity: 62, pace: 62, confidence: 62, structure: 62 }, day: "2026-10-04" }).path;
  const home = { ...K.emptySnap(), name: "Maya", emoji: "🐼", band: "leaders", code: "STAR-1111", days: ["2026-10-04", "2026-10-05"], xp: { explorers: 90, leaders: 400 },
    badges: [{ id: "streak3", date: "2026-10-05" }], path: { explorers: hp }, beat: { date: "2026-10-09", o: 80 } };
  const m = K.merge(home, s);
  ok(m.name === "" && m.emoji === "🐼" && m.band === "leaders" && m.code === "STAR-1111", "existing player keeps their avatar, age group and code; names are not kept");
  ok(eq(m.days, [...new Set([...home.days, ...days])].sort()), "practice days: union");
  ok(m.xp.explorers === 245 && m.xp.leaders === 400 && m.xp.sprouts === 30, "points: the bigger total per age group, nothing lost");
  ok(m.badges.length === 1 && m.badges[0].date === "2026-10-03", "badges: union, earliest date kept");
  ok(m.path.explorers.lv === Math.max(hp.lv, path.lv), "level: the higher one");
  ok(m.path.explorers.h.length === hp.h.length + Math.min(K.H_LINK, path.h.length) && m.path.explorers.h[0].d === "2026-10-04", "talk history: union, in date order");
  ok(eq(m.path.explorers.sk, s.path.explorers.sk), "skills: from whoever talked last");
  ok(m.beat.o === 80, "beat: same day -> the better score");
  ok(eq(K.merge(m, s), m), "merge is idempotent");
  ok(eq(K.merge(home, s).days, K.merge(s, home).days) && eq(Object.entries(K.merge(home, s).xp).sort(), Object.entries(K.merge(s, home).xp).sort()), "days and points don't depend on direction");
}
// target player
{
  const list = [{ id: "p1", nickname: "", code: "" }, { id: "p2", nickname: "Leo", code: "BOLT-2222" }, { id: "p3", nickname: "maya", code: "STAR-1111", codes: ["ROAR-4821"] }];
  ok(K.findTarget(list, s).id === "p3" && K.findTarget(list, s).how === "code", "an alias code finds the player");
  ok(K.findTarget([{ id: "p1", nickname: "Maya Rose" }], s).how === "new", "a link never matches a player by name");
  ok(K.findTarget([{ id: "p1", nickname: "" }], s).how === "blank", "a fresh phone's blank player is reused");
  ok(K.findTarget([{ id: "p1", nickname: "" }], s, () => true).how === "new", "a blank player WITH progress is never overwritten");
  ok(K.findTarget([{ id: "p1", nickname: "Leo" }], s).how === "new", "otherwise a new player");
}
{ const r = K.decode(K.encode({ ...maya, name: "" })); ok(r.ok && r.snap.name === "", "a player with no name can still move");
  ok(K.findTarget([{ id: "p1", nickname: "" }, { id: "p2", nickname: "" }], r.snap, (id) => id === "p1").id === "p2", "no name: never matched by name, a blank player without progress is used"); }
ok(!K.hasProgress(K.emptySnap()) && K.hasProgress(s), "hasProgress");
ok(K.sync.enabled() === false, "Layer 2 sync hook exists and is off (device-only)");
{ const q = qrcode(0, "L"); q.addData(K.linkFor("https://gpskids.app", maya)); q.make(); console.log("     QR size " + q.getModuleCount() + " modules"); ok(q.getModuleCount() <= 85, "QR stays scannable from a screen"); }

console.log(fails ? `${fails}/${n} FAILED` : `${n}/${n} ALL PASSED`);
process.exit(fails ? 1 : 0);
