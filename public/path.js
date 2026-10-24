// GPS Kids Speak: the hidden level behind "Today's challenge". Pure functions only: no storage, no network, no UI.
// Kids never see a level, path or map: the level only picks the challenge (talk time) and whether the weekly club skill fits.
// Used by app.js (browser) and tests/path.test.mjs (node). Stored on the phone per player + age group (localStorage gks_path).
//  - The first talk sets the starting level from its overall % (capped at PLACE_MAX = 4: one talk never puts a kid high up).
//  - Then one step at a time: up after a strong result (the next level's bar met), ease down one after a clearly weak one, hold otherwise.
//  - One move per challenge: a retry of the same challenge can improve that move (ease -> hold -> up) but never stacks it.
//  - Players who already had XP keep their progress: their old XP level becomes this level (capped at MIGRATE_MAX = 6).
export const BAR = [0, 0, 50, 55, 60, 64, 68, 72, 76, 80, 85]; // overall % that earns each level (index = level 1-10)
export const TOP = 10, PLACE_MAX = 4, MIGRATE_MAX = 6, EASE_GAP = 10, KEEP_TOP = 90, H_MAX = 30;
export const CATS = ["clarity", "pace", "confidence", "structure"];
const clamp = (n, lo, hi) => Math.max(lo, Math.min(hi, n));
const overall = (p) => Math.round((p.clarity + p.pace + p.confidence + p.structure) / 4);
const okPct = (p) => !!p && CATS.every((c) => Number.isFinite(p[c]) && p[c] >= 0 && p[c] <= 100);

export const goalFor = (lv) => (lv >= TOP ? KEEP_TOP : BAR[clamp(lv, 1, TOP - 1) + 1]);
export function place(o) { let lv = 1; for (let k = 2; k <= TOP; k++) if (o >= BAR[k]) lv = k; return Math.min(lv, PLACE_MAX); }
export function decide(base, o) {
  if (o >= goalFor(base)) return { lv: Math.min(TOP, base + 1), mv: "up" };
  if (base > 1 && o < BAR[base] - EASE_GAP) return { lv: base - 1, mv: "ease" };
  return { lv: base, mv: "hold" };
}
// The challenge the level picks: talk time. Levels 1-2: 30 s, 3-6: 60 s, 7-10: 90 s (Sprouts, ages 5-7, stop at 60 s).
// No level yet (a brand-new kid) = null: the app's usual default (60 s) for the first talk that sets the level.
export function lenFor(lv, band) {
  if (!lv) return null;
  const s = lv <= 2 ? 30 : lv <= 6 ? 60 : 90;
  return band === "sprouts" ? Math.min(s, 60) : s;
}
export const blank = () => ({ lv: 0, from: "", sk: null, h: [], cur: null, club: {} });
// Read whatever is stored (or nothing) into a valid path. xpLevel/hadPractice = the player's old progress (migration).
export function ensure(raw, xpLevel = 1, hadPractice = false) {
  const p = raw && typeof raw === "object" ? raw : {};
  const out = blank();
  if (Number.isInteger(p.lv) && p.lv >= 1 && p.lv <= TOP) { out.lv = p.lv; out.from = p.from === "xp" ? "xp" : "talk"; }
  else if (hadPractice) { out.lv = clamp(Math.floor(xpLevel) || 1, 1, MIGRATE_MAX); out.from = "xp"; }
  if (okPct(p.sk)) out.sk = { ...p.sk };
  if (Array.isArray(p.h)) out.h = p.h.filter((x) => x && typeof x === "object" && Number.isFinite(x.o)).slice(-H_MAX);
  if (p.cur && typeof p.cur === "object" && typeof p.cur.key === "string" && Number.isFinite(p.cur.best)) out.cur = { key: p.cur.key, base: Number.isInteger(p.cur.base) ? p.cur.base : null, best: p.cur.best };
  if (p.club && typeof p.club === "object") for (const [k, v] of Object.entries(p.club)) if (/^\d{4}-\d{2}-\d{2}$/.test(k) && Number.isFinite(v)) out.club[k] = v;
  return out;
}
// One finished talk (with words). key = which challenge (prompt + day, or club class date). Returns a NEW path + what happened.
export function record(path, { key, pct, day, club = null }) {
  const p = ensure(path), prev = p.lv, o = overall(pct);
  let mv, lv;
  if (!p.cur || p.cur.key !== key) p.cur = { key, base: prev || null, best: o };
  else p.cur.best = Math.max(p.cur.best, o);
  if (p.cur.base == null) { lv = place(p.cur.best); mv = "start"; p.from = "talk"; }
  else ({ lv, mv } = decide(p.cur.base, p.cur.best));
  p.lv = lv;
  p.sk = p.sk ? Object.fromEntries(CATS.map((c) => [c, Math.round(0.6 * p.sk[c] + 0.4 * pct[c])])) : Object.fromEntries(CATS.map((c) => [c, pct[c]]));
  p.h.push({ d: day, o, lv, mv, ...(club ? { c: club } : {}) }); p.h = p.h.slice(-H_MAX);
  if (club) p.club[club] = Math.max(p.club[club] || 0, o);
  return { path: p, o, mv, lv, prev, changed: lv !== prev };
}
