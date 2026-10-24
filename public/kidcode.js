// GPS Kids Speak: kid code + "Take me home". Pure functions only: no storage, no network, no UI.
// DEVICE-ONLY (, Oct 9 2026): a kid's progress never goes to our server. To move to another phone, the progress
// itself rides in a link's #fragment (browsers never send the part after # to a server, and the app removes it from the
// address bar right away). The QR on "Take me home" is that link. No server lookup.
// What the link carries: first name, avatar, age group, kid code, practice days, points per age group, badges,
// the hidden level per age group (level, skill averages, the last few talk scores, club talks) and "Beat it" best.
// No audio, no words, no last names, no contact details.
// Used by app.js (browser) and tests/kidcode.test.mjs (node).
//
// Link format (version 1):  <origin>/#home=1.<payload>.<check>
//   payload = base64url(UTF-8 JSON array, positional, see pack()), check = FNV-1a 32-bit of "1.<payload>" in base36.
import * as NT from "./notes.js";
export const VERSION = 1;
export const BAND_IDS = ["sprouts", "explorers", "leaders", "trailblazers", "grownups"];
const MV = ["start", "up", "hold", "ease"];
const CATS = ["clarity", "pace", "confidence", "structure"];
export const H_LINK = 8, MAX_DAYS = 400, MAX_FRAG = 3000;

// Friendly words a 7-year-old can say out loud (3-5 letters).
export const WORDS = ["ROAR", "STAR", "ZOOM", "BOLT", "WAVE", "MOON", "SUNNY", "LION", "BEAR", "FROG", "DUCK", "KITE", "ROCK", "JAZZ", "FIRE",
  "LEAF", "TREE", "BIRD", "FISH", "HAWK", "WOLF", "LAMB", "SEAL", "TACO", "PEAR", "PLUM", "LIME", "CAKE", "DRUM", "BELL", "SHIP", "SAIL",
  "GEM", "GLOW", "SPARK", "COMET", "TIGER", "PANDA", "OTTER", "ROBOT", "MAGIC", "HAPPY", "BRAVE", "SMART", "SUPER", "CLOUD", "RAIN", "SNOW"];
export const CODE_RE = /^[A-Z]{3,5}-\d{4}$/;
// rand(n) -> integer 0..n-1 (crypto in the app; injectable for tests)
export function makeCode(rand = cryptoRand) { return WORDS[rand(WORDS.length)] + "-" + String(1000 + rand(9000)); }
function cryptoRand(n) { const b = new Uint32Array(1); crypto.getRandomValues(b); return b[0] % n; }

// ---------- dates <-> day numbers (local calendar dates "YYYY-MM-DD") ----------
const EPOCH = Date.UTC(2020, 0, 1) / 864e5;
const ISO_RE = /^\d{4}-\d{2}-\d{2}$/;
export const dn = (s) => { const [y, m, d] = s.split("-").map(Number); return Date.UTC(y, m - 1, d) / 864e5 - EPOCH; };
export const isoOf = (n) => new Date((n + EPOCH) * 864e5).toISOString().slice(0, 10);
const okIso = (s) => typeof s === "string" && ISO_RE.test(s) && isoOf(dn(s)) === s;
// sorted unique day list -> [[startDay, length], ...] runs (practice days are mostly back to back, so this stays tiny)
export function toRuns(days) {
  const ns = [...new Set((days || []).filter(okIso).map(dn))].sort((a, b) => a - b).slice(-MAX_DAYS), out = [];
  for (const n of ns) { const r = out[out.length - 1]; if (r && r[0] + r[1] === n) r[1]++; else out.push([n, 1]); }
  return out;
}
export function fromRuns(runs) {
  const out = [];
  for (const r of runs) { if (!Array.isArray(r) || !int(r[0], 0, 40000) || !int(r[1], 1, MAX_DAYS)) throw new Error("days"); for (let i = 0; i < r[1]; i++) out.push(isoOf(r[0] + i)); }
  if (out.length > MAX_DAYS) throw new Error("days");
  return [...new Set(out)].sort();
}

// ---------- validation helpers ----------
function int(n, lo, hi) { return Number.isInteger(n) && n >= lo && n <= hi; }
export function okName(s) {
  s = String(s || "").replace(/\s+/g, " ").trim();
  return s.length > 0 && s.length <= 16 && /^[\p{L}\p{N} '’.-]+$/u.test(s) && !/\d{3,}/.test(s) && /\p{L}/u.test(s);
}
const okEmoji = (s) => typeof s === "string" && s.length > 0 && s.length <= 8 && !/[<>&"'\s]/.test(s);

// ---------- the snapshot (what moves) ----------
// { name, emoji, band, code, days:[iso], daysGu:[iso], xp:{band:n}, badges:[{id,date}], path:{band:{lv,from,sk,h,club}}, beat:{date,o}|null }
export function emptySnap() { return { name: "", emoji: "", band: "", code: "", days: [], daysGu: [], xp: {}, badges: [], path: {}, beat: null, notes: [] }; }
export function cleanPath(p) {
  p = p && typeof p === "object" ? p : {};
  const out = { lv: int(p.lv, 1, 10) ? p.lv : 0, from: p.from === "xp" ? "xp" : p.from === "talk" ? "talk" : "", sk: null, h: [], club: {} };
  if (!out.lv) out.from = "";
  if (p.sk && CATS.every((c) => Number.isFinite(p.sk[c]) && p.sk[c] >= 0 && p.sk[c] <= 100)) out.sk = Object.fromEntries(CATS.map((c) => [c, Math.round(p.sk[c])]));
  if (Array.isArray(p.h)) out.h = p.h.filter((x) => x && okIso(x.d) && int(x.o, 0, 100) && int(x.lv, 1, 10) && MV.includes(x.mv))
    .map((x) => ({ d: x.d, o: x.o, lv: x.lv, mv: x.mv, ...(okIso(x.c) ? { c: x.c } : {}) }));
  if (p.club && typeof p.club === "object") for (const [k, v] of Object.entries(p.club)) if (okIso(k) && Number.isFinite(v) && v >= 0 && v <= 100) out.club[k] = Math.round(v);
  return out;
}
const hasPath = (p) => p.lv > 0 || p.h.length > 0 || Object.keys(p.club).length > 0;

// ---------- pack / unpack (positional arrays keep the QR small) ----------
// [name, emoji, band#, code, dayRuns, guDayRuns, [[band#, xp]], [[badgeId, day#]], [[band#, lv, from(1 talk/0 xp), sk[4]|0, h[[day#,o,lv,mv#,club day#|-1]], club[[day#,o]]]], beat[day#,o]|0]
export function pack(s) {
  const bi = (b) => BAND_IDS.indexOf(b);
  const paths = Object.entries(s.path || {}).filter(([b]) => bi(b) >= 0).map(([b, p0]) => {
    const p = cleanPath(p0);
    if (!hasPath(p)) return null;
    return [bi(b), p.lv, p.from === "talk" ? 1 : 0, p.sk ? CATS.map((c) => p.sk[c]) : 0,
      p.h.slice(-H_LINK).map((x) => [dn(x.d), x.o, x.lv, MV.indexOf(x.mv), x.c ? dn(x.c) : -1]),
      Object.entries(p.club).map(([k, v]) => [dn(k), v])];
  }).filter(Boolean);
  return ["", s.emoji || "", bi(s.band), s.code || "", toRuns(s.days), toRuns(s.daysGu),
    Object.entries(s.xp || {}).filter(([b, n]) => bi(b) >= 0 && int(n, 1, 1e7)).map(([b, n]) => [bi(b), n]),
    (s.badges || []).filter((x) => x && /^[a-z0-9]{1,16}$/.test(x.id) && okIso(x.date)).map((x) => [x.id, dn(x.date)]),
    paths, s.beat && okIso(s.beat.date) && int(s.beat.o, 0, 100) ? [dn(s.beat.date), s.beat.o] : 0,
    ...(NT.tidy(s.notes).length ? [NT.tidy(s.notes).map((n) => [dn(n.d), n.t])] : [])]; // 11th slot: coach notes (only when there are some)
}
export function unpack(a) {
  if (!Array.isArray(a) || (a.length !== 10 && a.length !== 11)) throw new Error("shape");
  const [name, emoji, b, code, runs, guRuns, xp, badges, paths, beat, notes] = a;
  if (name !== "" && !okName(name)) throw new Error("name"); // "" = a player who never typed a name (allowed)
  if (!okEmoji(emoji)) throw new Error("emoji");
  if (!(int(b, -1, BAND_IDS.length - 1))) throw new Error("band");
  if (!CODE_RE.test(code)) throw new Error("code");
  if (!Array.isArray(runs) || !Array.isArray(guRuns) || !Array.isArray(xp) || !Array.isArray(badges) || !Array.isArray(paths)) throw new Error("shape");
  const s = emptySnap();
  s.name = ""; s.emoji = emoji; s.band = b >= 0 ? BAND_IDS[b] : ""; s.code = code;
  s.days = fromRuns(runs); s.daysGu = fromRuns(guRuns);
  for (const r of xp) { if (!Array.isArray(r) || !int(r[0], 0, BAND_IDS.length - 1) || !int(r[1], 1, 1e7)) throw new Error("xp"); s.xp[BAND_IDS[r[0]]] = r[1]; }
  for (const r of badges.slice(0, 50)) { if (!Array.isArray(r) || !/^[a-z0-9]{1,16}$/.test(r[0]) || !int(r[1], 0, 40000)) throw new Error("badge"); s.badges.push({ id: r[0], date: isoOf(r[1]) }); }
  for (const r of paths) {
    if (!Array.isArray(r) || r.length !== 6 || !int(r[0], 0, BAND_IDS.length - 1) || !int(r[1], 0, 10)) throw new Error("path");
    const [, lv, from, sk, h, club] = r;
    if (!Array.isArray(h) || !Array.isArray(club) || h.length > 30 || club.length > 60) throw new Error("path");
    const p = { lv, from: lv ? (from === 1 ? "talk" : "xp") : "", sk: Array.isArray(sk) && sk.length === 4 ? Object.fromEntries(CATS.map((c, i) => [c, sk[i]])) : null,
      h: h.map((x) => (Array.isArray(x) && x.length === 5 && int(x[0], 0, 40000) ? { d: isoOf(x[0]), o: x[1], lv: x[2], mv: MV[x[3]], ...(int(x[4], 0, 40000) ? { c: isoOf(x[4]) } : {}) } : null)),
      club: Object.fromEntries(club.filter((x) => Array.isArray(x) && int(x[0], 0, 40000)).map((x) => [isoOf(x[0]), x[1]])) };
    const c = cleanPath(p);
    if (c.h.length !== h.length) throw new Error("path");
    s.path[BAND_IDS[r[0]]] = c;
  }
  if (beat !== 0) { if (!Array.isArray(beat) || !int(beat[0], 0, 40000) || !int(beat[1], 0, 100)) throw new Error("beat"); s.beat = { date: isoOf(beat[0]), o: beat[1] }; }
  if (notes !== undefined) {
    if (!Array.isArray(notes) || notes.length > NT.MAX_NOTES) throw new Error("notes");
    for (const r of notes) if (!Array.isArray(r) || r.length !== 2 || !int(r[0], 0, 40000) || !NT.okNote(r[1])) throw new Error("notes");
    s.notes = NT.tidy(notes.map((r) => ({ d: isoOf(r[0]), t: r[1] })));
  }
  return s;
}

// ---------- base64url (UTF-8 safe) + checksum ----------
function b64u(str) {
  const bytes = new TextEncoder().encode(str); let bin = "";
  for (const x of bytes) bin += String.fromCharCode(x);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
function unb64u(s) {
  const bin = atob(s.replace(/-/g, "+").replace(/_/g, "/") + "===".slice((s.length + 3) % 4));
  return new TextDecoder("utf-8", { fatal: true }).decode(Uint8Array.from(bin, (c) => c.charCodeAt(0)));
}
export function check(s) { let h = 0x811c9dc5; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; } return h.toString(36); }

// snapshot -> "1.<payload>.<check>" (what goes after "#home=")
export function encode(snap) {
  const body = VERSION + "." + b64u(JSON.stringify(pack(snap)));
  return body + "." + check(body);
}
// "1.<payload>.<check>" -> { ok: true, snap } | { ok: false, why: "version" | "check" | "bad" }
export function decode(frag) {
  try {
    frag = decodeURIComponent(String(frag || "")).trim();
    if (!frag || frag.length > MAX_FRAG) return { ok: false, why: "bad" };
    const parts = frag.split(".");
    if (parts.length !== 3 || !/^[A-Za-z0-9_-]+$/.test(parts[1])) return { ok: false, why: "bad" };
    if (parts[0] !== String(VERSION)) return { ok: false, why: "version" };
    if (check(parts[0] + "." + parts[1]) !== parts[2]) return { ok: false, why: "check" };
    return { ok: true, snap: unpack(JSON.parse(unb64u(parts[1]))) };
  } catch (e) { return { ok: false, why: "bad" }; }
}
export const linkFor = (origin, snap) => origin + "/#home=" + encode(snap);
export const HASH_RE = /^#home=([A-Za-z0-9._%-]+)$/;

// ---------- merge: bring incoming progress into a player that may already have some. Lose nothing, count nothing twice. ----------
// Days and badges: union. Points per age group: the bigger number (both sides are running totals, so adding would double count).
// Level per age group: the higher one; talk history: union (same talk = same entry); skills: from whichever talked last.
// Name, avatar, age group, code: the local player's own, unless it has none yet.
const hKey = (x) => [x.d, x.o, x.lv, x.mv, x.c || ""].join("|");
export function mergePath(a0, b0) {
  const a = cleanPath(a0), b = cleanPath(b0);
  const seen = new Set(), h = [];
  for (const x of [...a.h, ...b.h]) { const k = hKey(x); if (!seen.has(k)) { seen.add(k); h.push(x); } }
  h.sort((x, y) => (x.d < y.d ? -1 : x.d > y.d ? 1 : 0));
  const last = (p) => (p.h.length ? p.h[p.h.length - 1].d : "");
  const lv = Math.max(a.lv, b.lv);
  const from = !lv ? "" : (a.lv === lv && a.from === "talk") || (b.lv === lv && b.from === "talk") ? "talk" : (a.lv === lv ? a.from : b.from) || "talk";
  const sk = last(b) > last(a) ? (b.sk || a.sk) : (a.sk || b.sk);
  const club = { ...a.club }; for (const [k, v] of Object.entries(b.club)) club[k] = Math.max(club[k] || 0, v);
  return { lv, from, sk: sk ? { ...sk } : null, h: h.slice(-30), club };
}
export function merge(local, inc) {
  const L = { ...emptySnap(), ...(local || {}) }, I = { ...emptySnap(), ...(inc || {}) };
  const out = emptySnap();
  out.name = ""; out.emoji = L.emoji || I.emoji; out.band = L.band || I.band; out.code = L.code || I.code;
  out.days = [...new Set([...(L.days || []), ...(I.days || [])].filter(okIso))].sort().slice(-MAX_DAYS);
  out.daysGu = [...new Set([...(L.daysGu || []), ...(I.daysGu || [])].filter(okIso))].sort().slice(-MAX_DAYS);
  for (const src of [L.xp, I.xp]) for (const [b, n] of Object.entries(src || {})) if (Number.isFinite(n)) out.xp[b] = Math.max(out.xp[b] || 0, n);
  const bd = new Map();
  for (const x of [...(L.badges || []), ...(I.badges || [])]) if (x && x.id) { const c = bd.get(x.id); if (!c || (x.date && x.date < c.date)) bd.set(x.id, { id: x.id, date: x.date }); }
  out.badges = [...bd.values()];
  for (const b of new Set([...Object.keys(L.path || {}), ...Object.keys(I.path || {})])) out.path[b] = mergePath((L.path || {})[b], (I.path || {})[b]);
  const ba = L.beat, bb = I.beat;
  out.notes = NT.tidy([...(L.notes || []), ...(I.notes || [])]);
  out.beat = !ba ? bb || null : !bb ? ba : ba.date === bb.date ? { date: ba.date, o: Math.max(ba.o, bb.o) } : ba.date > bb.date ? ba : bb;
  return out;
}

// Which player on this phone should receive the incoming progress?
// 1) same kid code (or a code this player took in before), 2) same first name, 3) a blank player (no name, no progress), 4) a new player.
export function findTarget(list, snap, hasProgress = () => false) {
  const byCode = list.find((p) => p.code === snap.code || (Array.isArray(p.codes) && p.codes.includes(snap.code)));
  if (byCode) return { id: byCode.id, how: "code" };
  const nm = snap.name.trim().toLowerCase();
  const byName = nm && list.find((p) => (p.nickname || "").trim().toLowerCase() === nm);
  if (byName) return { id: byName.id, how: "name" };
  const blank = list.find((p) => !(p.nickname || "").trim() && !hasProgress(p.id));
  if (blank) return { id: blank.id, how: "blank" };
  return { id: null, how: "new" };
}

// Is there anything worth moving?
export const hasProgress = (s) => !!s && ((s.days || []).length > 0 || (s.daysGu || []).length > 0 || Object.values(s.xp || {}).some((n) => n > 0) || Object.values(s.path || {}).some((p) => hasPath(cleanPath(p))));

// ---------- Layer 2 (later, NOT built): server sync for paid families whose parent accepted the terms at checkout ----------
// The app calls sync.push(snapshot) after each talk and after a "Take me home" import. Today it does nothing and sends nothing.
// To turn on later: enabled() returns true only for a player linked to a paying parent who accepted the terms, and push()
// posts the snapshot to an authenticated endpoint. Free players stay device-only.
export const sync = {
  enabled: (/* player */) => false,
  push: async (/* player, snap */) => false,
};
