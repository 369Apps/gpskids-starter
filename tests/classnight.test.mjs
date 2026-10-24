import * as CN from "../public/classnight.js";
let fails = 0, n = 0;
const ok = (c, m) => { n++; if (!c) { fails++; console.log("FAIL " + m); } else console.log("PASS " + m); };
ok(CN.byCode("thu").kids.length === 0 && CN.byCode("THU").label === "Thursday class" && CN.byCode("nope") === null, "no kid names shipped in the public class file");
const NIGHT = { code: "thu", label: "Thursday class", kids: ["Kia", "Rex", "Sam", "Zoe", "Max"].map((name) => ({ name, emoji: "🙂", band: "explorers" })) };
{
  const m = CN.mergeRoster([{ id: "p1", nickname: "", emoji: "🙂" }], NIGHT, () => false, 8);
  ok(m.list.length === 5 && m.list[0].nickname === "Kia" && m.list[0].id === "p1", "blank player becomes the first kid, the other four are added");
  ok(m.bands.length === 5 && m.bands.every((b) => b.band === "explorers"), "each kid gets an explorers age group");
}
{
  const m = CN.mergeRoster([{ id: "p1", nickname: "Alex", emoji: "☕" }, { id: "p2", nickname: "Sam", emoji: "🐼" }], NIGHT, () => true, 8);
  ok(m.list[0].nickname === "Alex" && m.list.filter((p) => p.nickname === "Sam").length === 1 && m.list.length === 6, "existing players stay; a kid already here is not duplicated (Alex + 5)");
}
{
  const full = Array.from({ length: 8 }, (_, i) => ({ id: "p" + (i + 1), nickname: "Kid" + i }));
  const m = CN.mergeRoster(full, NIGHT, () => true, 8);
  ok(m.list.length === 8, "never goes past the phone's player limit");
}
const text = CN.parentSummary({ name: "Sam", talks: [{ o: 78, tip: "Try a strong close." }, { o: 84, tip: "Nice and clear." }], streak: 1, xp: 40 });
ok(/Sam/.test(text) && /2 talks, best score 84%/.test(text) && /1 day/.test(text) && /Nice and clear/.test(text), "summary: " + text);
ok(!/https?:|@|\?c=/.test(text), "summary has no link and no contact");
ok(/No talk was saved/.test(CN.parentSummary({ name: "Max", talks: [], streak: 0, xp: 0 })), "no talk yet is said in plain words");
console.log(fails ? fails + "/" + n + " FAILED" : n + "/" + n + " ALL PASSED");
process.exit(fails ? 1 : 0);
