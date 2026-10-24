// "This week in class" teaser picks only real class plans (club.js). node tests/club-week.test.mjs
import * as CL from "../public/club.js";
let fails = 0; const ok = (c, m) => { console.log((c ? "PASS " : "FAIL ") + m); if (!c) fails++; };
const L = [{ date: "2026-10-13", theme: "A" }, { date: "2026-10-15", theme: "B" }, { date: "2026-10-27", theme: "C" }];
ok(CL.weekClass("2026-10-14", L).date === "2026-10-15", "Wed: Thursday's class is next");
ok(CL.weekClass("2026-10-15", L).date === "2026-10-15", "class day: that class");
ok(CL.weekClass("2026-10-18", L).date === "2026-10-15", "Sunday: this week's class that already happened");
ok(CL.weekClass("2026-10-19", L) === null, "Monday of a new week with no plan yet: no card (never invents a class)");
ok(CL.weekClass("2026-10-20", L).date === "2026-10-27", "a plan up to 7 days ahead shows");
ok(CL.weekClass("2026-10-12", L).date === "2026-10-13", "Monday: Tuesday's class");
ok(CL.weekClass("bad", L) === null && CL.weekClass("2026-10-18", []) === null, "bad date or no plans: no card");
const real = CL.weekClass("2026-10-18");
ok(real && real.theme === "Paint the Picture" && real.line === "I PAINT THE PICTURE!", "real data: Sun Oct 18 shows the next class, Tue Oct 20 Paint the Picture");
ok(CL.CLUB.every((c) => !/[—–]/.test(c.theme + c.line)), "no long dashes in themes or power lines");
console.log(fails ? fails + " FAILED" : "ALL PASSED"); process.exit(fails ? 1 : 0);
