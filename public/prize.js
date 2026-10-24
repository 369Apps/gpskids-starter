// GPS Kids Speaking Leaderboard (PREVIEW): shared by the browser (app.js) and the Pages Functions (functions/api/prize*.js).
// Pure data + rules, no side effects. Spec: "GPS Kids Speak: Weekly and Monthly Leaderboard Prize Campaign" (, Oct 16 2026).
//   Every kid, free or paid, gets exactly 1 "Today's Scored Challenge" per day (one try). Everything else is Practice (0 points).
//   Scored challenge: +10 for doing it, +5 if they also did one yesterday (streak), up to +10 quality (clarity, pace, confidence).
//   Bring a Friend: +25 when the friend's parent signs up AND the friend finishes a first scored challenge. No cap.
//   One shared board. Weekly resets Monday 12:00 AM ET, monthly on the 1st at 12:00 AM ET. Weekly winner $25, monthly $100,
//   paid to the parent (logged for manual payout in the preview; no money is moved by the app).
// The points rules never look at the kid's plan (free or $20/month): nothing about plans is passed in here.
export const PTS = { done: 10, streak: 5, quality: 10, friend: 25 }; // easy to change
export const PRIZE = { week: 25, month: 100 };     // dollars, paid to the parent
export const BOARD_MAX = 20;
export const LAUNCH = "2026-10-16";     // first day that counts. First week: Oct 16 to Sun Oct 18; October month: Oct 16 to 31.
export const CONSENT_V = "lb2"; // lb2 (Oct 18 2026): no prize wording until the rules have legal review
export const CONSENT = "The public leaderboard is off. GPS Kids does not keep a child's name.";
export const POOL_DEFAULT = "gps";      // one shared GPS Kids board. A partner's kids get their own pool and are never shown to other pools.
export const POOL_RE = /^[a-z0-9-]{2,24}$/;
// Fraud flags (hold the payout + alert ). Spike: way above the kid's own normal pace.
export const SPIKE = { times: 3, minJump: 50, friendsInPeriod: 5 };

const pad = (n) => String(n).padStart(2, "0");
export function etDate(ms = Date.now()) {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/New_York", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(ms));
}
export function addDays(s, n) { const [y, m, d] = s.split("-").map(Number); const t = new Date(Date.UTC(y, m - 1, d + n)); return t.getUTCFullYear() + "-" + pad(t.getUTCMonth() + 1) + "-" + pad(t.getUTCDate()); }
export const DAY_RE = /^\d{4}-\d{2}-\d{2}$/, MONTH_RE = /^\d{4}-\d{2}$/;
// Week key = the Monday (ET) that starts the week. Month key = YYYY-MM (ET).
export function weekOfDay(s) { const [y, m, d] = s.split("-").map(Number), dow = new Date(Date.UTC(y, m - 1, d)).getUTCDay(); return addDays(s, -((dow + 6) % 7)); }
export const weekOf = (ms = Date.now()) => weekOfDay(etDate(ms));
export const monthOfDay = (s) => s.slice(0, 7);
export const monthOf = (ms = Date.now()) => monthOfDay(etDate(ms));
// first and last day (inclusive) of a period
export function range(kind, key) {
  if (kind === "week") return [key < LAUNCH && addDays(key, 6) >= LAUNCH ? LAUNCH : key, addDays(key, 6)];
  const [y, m] = key.split("-").map(Number), last = new Date(Date.UTC(y, m, 0)).getUTCDate();
  const a = key + "-01", b = key + "-" + pad(last);
  return [a < LAUNCH && b >= LAUNCH ? LAUNCH : a, b];
}
export const periodOf = (kind, day) => (kind === "week" ? weekOfDay(day) : monthOfDay(day));
export function prevPeriod(kind, day) { return kind === "week" ? addDays(weekOfDay(day), -7) : monthOfDay(addDays(monthOfDay(day) + "-01", -1)); }
export function label(kind, key) {
  const f = (s) => { const [y, m, d] = s.split("-").map(Number); return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" }); };
  if (kind === "month") { const [y, m] = key.split("-").map(Number); return new Date(Date.UTC(y, m - 1, 1)).toLocaleDateString("en-US", { month: "long", year: "numeric", timeZone: "UTC" }); }
  const [a, b] = range("week", key); return f(a) + " to " + f(b);
}

// Quality points from the app's clarity, pace and confidence stars (1 to 3 each): all 1s = 0, all 3s = 10.
export function quality(stars) {
  const v = ["clarity", "pace", "confidence"].map((k) => Math.floor(Number(stars && stars[k])));
  if (v.some((x) => !(x >= 1 && x <= 3))) return 0;
  return Math.round(((v[0] + v[1] + v[2] - 3) / 6) * PTS.quality);
}
// The SERVER works out the stars from what the kid said (the phone's own stars are never trusted for points).
// Same idea as the app's on-phone scoring: pace = words a minute for the age group, clarity = few fillers / stutters,
// confidence = talked for most of the goal time and no hedging. Kid age groups only (grown-ups can't score).
export const KID_WPM = { sprouts: [70, 150], explorers: [85, 160], leaders: [100, 165], trailblazers: [110, 170] };
const HEDGES = ["i don't know", "i guess", "i'm not sure", "kind of", "sort of", "sorry", "maybe"];
export function serverStars({ text = "", seconds = 0, band = "", goal = 45 } = {}) {
  const B = KID_WPM[band]; if (!B) return null;
  const secs = Math.max(1, Math.min(600, Math.floor(Number(seconds)) || 1)), g = Math.max(20, Math.min(180, Math.floor(Number(goal)) || 45));
  const words = String(text).slice(0, 6000).toLowerCase().replace(/[‘’]/g, "'").match(/[a-z0-9']+/g) || [];
  const n = words.length, wpm = Math.round(n / (secs / 60));
  if (n < 3) return { clarity: 1, pace: 1, confidence: 1, n, wpm };
  let fillers = 0, stutters = 0;
  words.forEach((w, k) => { if (/^(u+m+|u+h+|uhm+|e+rm+|h+mm+)$/.test(w) || (w === "like" && words[k + 1] === "like")) fillers++; if (w === words[k - 1] && w.length < 6) stutters++; });
  const joined = " " + words.join(" ") + " ", hedges = HEDGES.filter((h) => joined.includes(" " + h + " ")).length;
  const [lo, hi] = B;
  // talking faster than any real speaker (e.g. pasted text with a tiny time) never gets pace stars
  const pace = n < 5 || wpm > 260 ? 1 : wpm >= lo && wpm <= hi ? 3 : wpm >= lo - 25 && wpm <= hi + 30 ? 2 : 1;
  const rate = (fillers / n) * 100;
  const clarity = Math.max(1, (rate <= 3 ? 3 : rate <= 8 ? 2 : 1) - (stutters >= 3 ? 1 : 0));
  const ratio = secs / g;
  let confidence = ratio >= 0.75 ? 3 : ratio >= 0.4 ? 2 : 1;
  if (ratio > 3) confidence = 2;
  if (hedges >= 2) confidence = Math.max(1, confidence - 1);
  return { clarity, pace, confidence, n, wpm };
}
// Points for today's scored challenge. didYesterday = the kid finished yesterday's scored challenge.
export function scored({ stars = null, didYesterday = false, heard = true } = {}) {
  const q = heard ? quality(stars) : 0, st = didYesterday ? PTS.streak : 0;
  return { done: PTS.done, streak: st, quality: q, points: PTS.done + st + q };
}
// Tie-breaker: more points, then higher average quality, then whoever got there first.
export function rank(rows) {
  return rows.slice().sort((a, b) => b.points - a.points || (b.avgq || 0) - (a.avgq || 0) || a.reached - b.reached);
}
// Spike: this period is far above the kid's own normal (average of earlier periods), or lots of friends at once.
export function spike({ points, prevAvg = 0, friends = 0 }) {
  if (friends >= SPIKE.friendsInPeriod) return "friends";
  if (prevAvg > 0 && points > SPIKE.times * prevAvg && points - prevAvg >= SPIKE.minJump) return "points";
  return "";
}
// The winner: the top kid with no fraud hold wins; a held top kid keeps the spot and  decides (release or pass to next).
export function pickWinner(rows) { const r = rank(rows.filter((x) => x.points > 0)); return r.length ? r[0] : null; }

const sq = (s) => String(s == null ? "" : s).replace(/[\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ").trim();
const NAME_RE = /^[\p{L}][\p{L}\p{M}'-]*$/u, INIT_RE = /^\p{Lu}$/u;
const EMAIL_RE = /^[^\s@<>()",;:\\[\]]+@[^\s@<>()",;:\\[\]]+\.[a-z]{2,}$/i;
const int = (v) => (typeof v === "number" || (typeof v === "string" && /^\d+$/.test(v)) ? Number(v) : NaN);
const truthy = (x) => x === true || x === 1 || x === "1";
// Parent opt-in form. No kid email or phone anywhere. Shown on the board only if the parent ticks "show" (default hidden).
export function checkEntry(f) {
  f = f || {};
  const v = { email: sq(f.email).toLowerCase(), kid: sq(f.kid), init: sq(f.init).replace(/\.$/, "").toUpperCase(), age: int(f.age),
    adult: truthy(f.adult), consent: truthy(f.consent), show: truthy(f.show) };
  const e = {};
  if (v.email.length > 120 || !EMAIL_RE.test(v.email)) e.email = "Please enter your email so we can reach you about the leaderboard.";
  if (!v.kid || v.kid.length > 16 || !NAME_RE.test(v.kid)) e.kid = "First name only, please (letters, no spaces).";
  if (!INIT_RE.test(v.init)) e.init = "Just one letter, like B.";
  if (!Number.isInteger(v.age) || v.age < 5 || v.age > 17) e.age = "The leaderboard is for ages 5 to 17.";
  if (!v.adult || !v.consent) e.consent = "Please tick the box to join.";
  return { ok: !Object.keys(e).length, errors: e, v };
}
export const showName = (kid, init) => kid + " " + init + ".";
export const entryKey = (email, kid, init) => String(email).toLowerCase().trim() + "|" + String(kid).toLowerCase().trim() + "|" + String(init).toLowerCase();
export const REF_RE = /^[a-km-np-z2-9]{8}$/;
