// Belts: a quiet sign of progress for kids. White -> Yellow -> Orange -> Green -> Blue -> Purple.
// Worked out from things the phone already keeps: practice days (gks_days, kid days only) and points (gks_xp, kid age groups).
// Nothing new travels in the kid code / Take me home link: days and points already ride there, so the belt comes with them.
// Practice days never go down (missed days don't remove days), so a belt is never lost. No leaderboards.
// A day's first talk gives at least 30 points, so the points bar never blocks a kid who has the days.
export const BELTS = [
  { id: "white",  name: "White",  color: "#ffffff", ink: "#14213d", days: 0,  xp: 0 },
  { id: "yellow", name: "Yellow", color: "#f3bd35", ink: "#14213d", days: 3,  xp: 90 },
  { id: "orange", name: "Orange", color: "#f08a24", ink: "#14213d", days: 7,  xp: 210 },
  { id: "green",  name: "Green",  color: "#1f9d55", ink: "#ffffff", days: 14, xp: 420 },
  { id: "blue",   name: "Blue",   color: "#1458d4", ink: "#ffffff", days: 25, xp: 750 },
  { id: "purple", name: "Purple", color: "#6a3fd1", ink: "#ffffff", days: 40, xp: 1200 },
];
export const KID_BANDS = ["sprouts", "explorers", "leaders", "trailblazers"];
// days: array of YYYY-MM-DD (or a count); xpAll: { band: points }
export function inputs(days, xpAll) {
  const d = Array.isArray(days) ? new Set(days.filter((x) => typeof x === "string")).size : Math.max(0, Number(days) || 0);
  let xp = 0;
  if (xpAll && typeof xpAll === "object") for (const b of KID_BANDS) { const v = Number(xpAll[b]); if (Number.isFinite(v) && v > 0) xp += v; }
  return { days: d, xp };
}
export function beltIndex(days, xpAll) {
  const s = inputs(days, xpAll); let i = 0;
  for (let k = 1; k < BELTS.length; k++) if (s.days >= BELTS[k].days && s.xp >= BELTS[k].xp) i = k; else break;
  return i;
}
export const beltOf = (days, xpAll) => BELTS[beltIndex(days, xpAll)];
// what is left for the next belt (null at Purple). Kid words: "2 more practice days to Yellow belt"
export function next(days, xpAll) {
  const i = beltIndex(days, xpAll); if (i >= BELTS.length - 1) return null;
  const s = inputs(days, xpAll), B = BELTS[i + 1];
  return { belt: B, days: Math.max(0, B.days - s.days), xp: Math.max(0, B.xp - s.xp) };
}
export function nextText(days, xpAll) {
  const n = next(days, xpAll); if (!n) return "Top belt. Amazing!";
  if (n.days > 0) return `${n.days} more practice day${n.days === 1 ? "" : "s"} to ${n.belt.name} belt`;
  return `A few more talks to ${n.belt.name} belt`;
}
// Should we celebrate? seen = the belt index this player last celebrated (or null if never stored: then no party, just remember it)
export function check(seen, days, xpAll) {
  const i = beltIndex(days, xpAll);
  if (!Number.isInteger(seen) || seen < 0 || seen >= BELTS.length) return { i, up: false, store: true };
  return { i, up: i > seen, store: i !== seen && i > seen };
}
// Share text: first name only (trimmed, letters only, max 16), no link, nothing personal.
export function safeName(n) { const s = String(n || "").normalize("NFC").replace(/[^\p{L}\p{M}' -]/gu, "").trim().split(/\s+/)[0] || ""; return s.slice(0, 16); }
export function shareText(_name, i) {
  const B = BELTS[Math.max(0, Math.min(BELTS.length - 1, i | 0))];
  return `I just earned the ${B.name} belt in speaking on GPS Kids Speak! 🥋`;
}
