/* GPS Kids Speak v1. Everything sticky (band, streak, XP, badges, ref codes) lives in localStorage on this device.
   Recordings stay on this device (IndexedDB, last 7 days). To give feedback, the audio is sent once to /api/transcribe
   (Workers AI Whisper), turned into text and dropped. Nothing about you is stored on the server (friend duels keep only two star scores for 7 days; anonymous usage events
   from track.js carry only random hashed ids, the step and its time, deleted after 60 days). No accounts, no third-party trackers.
   Talking coach (voice.js), Grown-ups, duels: on for everyone unless ?voice=0 or the server switch (/api/voice) is off. */
import { BANDS as KID_BANDS, ALL_BANDS as BANDS, TYPES, promptAt, todayIndex, twistFor } from "./prompts.js";
import * as V from "./voice.js";
import * as PL from "./plan.js";
import { PARTS, exampleFor } from "./examples.js";
import * as PN from "./pitch.js"; // Kids Pitch Night (prelims)
import * as TR from "./track.js"; // anonymous usage events (public/steps.js lists every step; no names, words or audio)
import * as PA from "./path.js"; // hidden level: picks Today's challenge (talk time), never shown to kids
import * as CL from "./club.js";
import * as FT from "./featured.js"; // featured free challenge (Halloween trash pitch through Oct 31)
import * as CN from "./classnight.js"; // this week's club skill (latest Tue/Thu class theme), worked in when it fits
import * as NT from "./notes.js"; // coach notes per kid (class report; device-only)
import * as KC from "./kidcode.js"; // kid code + "Take me home" link (progress rides in the #fragment; device-only)
import qrcode from "./qr.js"; // self-hosted QR maker (MIT)
import * as BT from "./belts.js"; // belts White..Purple, worked out from practice days + points (nothing new stored off the phone)
import * as BD from "./buddy.js"; // Buddy play: two kids, one phone, no mic, no AI
import * as TRL from "./trial.js"; // Book a free trial class (grown-ups form, #trial)
import * as PZ from "./prize.js"; // Speaking Leaderboard (PREVIEW): 1 scored challenge a day, parent joins behind the grown-up check

const BRAND = window.GPS_BRAND || {};
const WA_GROUP = BRAND.whatsapp || "";
const AI_PER_DAY = 5;
const $ = (id) => document.getElementById(id);
const K = { band: "gks_band", days: "gks_days", xp: "gks_xp", badges: "gks_badges", mine: "gks_myref", by: "gks_refby", shuffle: "gks_shuffle", ai: "gks_ai",
  log: "gks_log" };
/* ---------- local players ("Who's playing?"): up to 6 profiles on this device. Nothing leaves the phone. ----------
   Profile "p1" owns the original keys (so existing progress migrates with no copying); others use "<key>@<id>".
   Shape mirrors the optional parent-accounts kid row (nickname, band) so a profile can be linked to a kid later (kid_id). */
const P_KEY = "gks_profiles", P_MAX = 8; // 8 so a class tablet fits 5 kids + a new kid, even if a player was already here
const PER_PROFILE = new Set(["gks_band", "gks_days", "gks_days_gu", "gks_xp", "gks_badges", "gks_badges_gu", "gks_ai", "gks_shuffle",
  "gks_log", "gks_log_gu", "gks_ask", "gks_ntalk", "gks_duels", "gks_seen", "gks_len", "gks_notes", "gks_prep", "gks_path", "gks_beat", "gks_belt", "gks_prize", "gks_pts", "gks_feat"]);
const rawGet = (k) => { try { return localStorage.getItem(k); } catch (e) { return null; } };
const rawSet = (k, v) => { try { localStorage.setItem(k, typeof v === "string" ? v : JSON.stringify(v)); } catch (e) {} };
let PROFILES = (() => { try { const p = JSON.parse(rawGet(P_KEY)); if (p && Array.isArray(p.list) && p.list.length) return p; } catch (e) {} return null; })();
if (!PROFILES) {
  PROFILES = { v: 1, cur: "p1", list: [{ id: "p1", nickname: "", emoji: "🙂", band: rawGet("gks_band") || "", created_at: Date.now(), kid_id: null }] };
  rawSet(P_KEY, PROFILES);
}
if (!PROFILES.list.some((p) => p.id === PROFILES.cur)) { PROFILES.cur = PROFILES.list[0].id; rawSet(P_KEY, PROFILES); }
// Anonymous random IDs for counting unique players and devices per day (/api/count hashes them with a server secret).
// Made once on this phone, never tied to a name, age or account.
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const uuid = () => {
  if (crypto.randomUUID) return crypto.randomUUID();
  const b = crypto.getRandomValues(new Uint8Array(16)); b[6] = (b[6] & 15) | 64; b[8] = (b[8] & 63) | 128;
  const h = Array.from(b, (x) => x.toString(16).padStart(2, "0")).join("");
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
};
if (PROFILES.list.some((p) => !UUID_RE.test(p.anon || ""))) { PROFILES.list.forEach((p) => { if (!UUID_RE.test(p.anon || "")) p.anon = uuid(); }); rawSet(P_KEY, PROFILES); }
const DEV_ID = (() => { let d = rawGet("gks_dev"); if (!UUID_RE.test(d || "")) { d = uuid(); rawSet("gks_dev", d); } return d; })();
// Class link (/class/thu -> ?c=thu): remember it on this phone and make sure each kid has a player. No names leave the phone.
// Class mode ONLY when the address is /class/... (it redirects to /?c=thu). Plain gpskids.app is always the family app.
// The code is kept for this tab only (sessionStorage), so a reload in the class tab stays in class mode, but a new visit
// to gpskids.app never does. The old sticky localStorage flag is removed: it put family phones into class mode for good.
const CLASS_CODE = (() => {
  const q = (new URLSearchParams(location.search).get("c") || "").toLowerCase();
  try { localStorage.removeItem("gks_class"); } catch (e) {}
  // Typing or tapping plain gpskids.app (a fresh "navigate") always leaves class mode, even in the same tab.
  let nav = ""; try { nav = (performance.getEntriesByType("navigation")[0] || {}).type || ""; } catch (e) {}
  // The app's own fresh starts (switching player) set gks_class_keep first, so a class phone stays in class mode.
  let keep = false; try { keep = sessionStorage.getItem("gks_class_keep") === "1"; sessionStorage.removeItem("gks_class_keep"); } catch (e) {}
  let tab = ""; try { tab = keep || nav === "reload" || nav === "back_forward" ? sessionStorage.getItem("gks_class") || "" : ""; } catch (e) {}
  if (!CN.byCode(q) && !tab) { try { sessionStorage.removeItem("gks_class"); } catch (e) {} }
  const code = CN.byCode(q) ? q : (CN.byCode(tab) ? tab : "");
  if (code) { try { sessionStorage.setItem("gks_class", code); } catch (e) {} }
  return code;
})();
if (CLASS_CODE) {
  const night = CN.byCode(CLASS_CODE);
  const read = (id, k) => rawGet(id === "p1" ? k : k + "@" + id);
  const m = CN.mergeRoster(PROFILES.list, night, (id) => !!(read(id, "gks_days") || read(id, "gks_xp")), P_MAX);
  PROFILES.list = m.list;
  PROFILES.list.forEach((p) => { if (!UUID_RE.test(p.anon || "")) p.anon = uuid(); });
  if (!PROFILES.list.some((p) => p.id === PROFILES.cur)) PROFILES.cur = PROFILES.list[0].id;
  for (const w of m.bands) { const k = w.id === "p1" ? "gks_band" : "gks_band@" + w.id; if (!rawGet(k)) rawSet(k, w.band); }
  rawSet(P_KEY, PROFILES);
}
const PID = PROFILES.cur;
const TR_FRESH = TR.init((PROFILES.list.find((p) => p.id === PID) || {}).anon, DEV_ID); // true = a new session
const pk = (k, pid = PID) => (pid !== "p1" && PER_PROFILE.has(k) ? k + "@" + pid : k);
const store = (k, v) => { k = pk(k); try { if (v === undefined) return localStorage.getItem(k); localStorage.setItem(k, typeof v === "string" ? v : JSON.stringify(v)); } catch (e) { return null; } };
const load = (k, d) => { try { const v = JSON.parse(store(k)); return v == null ? d : v; } catch (e) { return d; } };
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
const iso = (d = new Date()) => d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0");
const addDays = (s, n) => { const [y, m, d] = s.split("-").map(Number); return iso(new Date(y, m - 1, d + n)); };
const fmt = (s) => { s = Math.max(0, Math.round(s)); return Math.floor(s / 60) + ":" + String(s % 60).padStart(2, "0"); };
const today = iso();

/* ---------- anonymous daily counts: one beacon per event per player per day (plus "friend_done" each time a friend
   finishes this player's duel). Carries only the event, this player's and this phone's random anonymous IDs, and two
   "first time today" flags. No names, ages, or content. ---------- */
function count(e, x) {
  const kd = "gks_c_" + e, kp = kd + "@" + PID, always = e === "friend_done";
  let df = false, pf = false;
  try {
    if (localStorage.getItem("gks_test") === "1") return;
    df = localStorage.getItem(kd) !== today; pf = localStorage.getItem(kp) !== today;
    if (!df && !pf && !always) return;
    if (df) localStorage.setItem(kd, today);
    if (pf) localStorage.setItem(kp, today);
  } catch (x) { return; }
  const me = PROFILES.list.find((p) => p.id === PID) || {};
  // nw: first day this player is ever counted (players who already had progress before counting started are not "new")
  let nw = 0;
  if (pf && !store("gks_seen")) { nw = load("gks_days", []).length || load("gks_days_gu", []).length ? 0 : 1; store("gks_seen", today); }
  const body = { e, p: me.anon, d: DEV_ID, df: df ? 1 : 0, pf: pf || always ? 1 : 0, nw, ...(x ? { x } : {}) };
  try { const b = new Blob([JSON.stringify(body)], { type: "application/json" }); if (!(navigator.sendBeacon && navigator.sendBeacon("/api/count", b))) fetch("/api/count", { method: "POST", body: b, keepalive: true }).catch(() => {}); } catch (x) {}
}
count("visit");

/* ---------- "kids playing right now" presence: at most one tiny ping per 2 minutes while on the home screen or in a
   challenge. Carries only this player's random anonymous ID and whether it's a kid age group (k=1) or Grown-ups (k=0).
   The server keeps a salted hash for 5 minutes, then drops it. ---------- */
let pingAt = 0;
function ping() {
  try { if (localStorage.getItem("gks_test") === "1") return; } catch (x) { return; }
  if (document.hidden || Date.now() - pingAt < 120000) return;
  const me = PROFILES.list.find((p) => p.id === PID) || {};
  if (!UUID_RE.test(me.anon || "")) return;
  pingAt = Date.now();
  const body = { p: me.anon, k: isAdult() ? 0 : 1 };
  try { const b = new Blob([JSON.stringify(body)], { type: "application/json" }); if (!(navigator.sendBeacon && navigator.sendBeacon("/api/live", b))) fetch("/api/live", { method: "POST", body: b, keepalive: true }).catch(() => {}); } catch (x) {}
}
document.addEventListener("visibilitychange", () => { if (!document.hidden && band && (view === "v-home" || view === "v-rec")) ping(); });

/* ---------- home social proof: one small cached GET /api/proof (real counts, edge-cached 60 s). The server only sends a
   number once it's big enough (otherwise null), so most of the time this shows nothing. Never blocks the start button. ---------- */
let proofAt = 0;
const nf = (n) => Number(n).toLocaleString("en-US");
const PROOF_W = { today: "today", week: "this week", all: "so far" };
function paintProof() {
  if (Date.now() - proofAt < 60000) return;
  proofAt = Date.now();
  fetch("/api/proof").then((r) => (r.ok ? r.json() : null)).then((j) => {
    const el = $("proof"), bits = [];
    if (!el) return;
    if (j && Number.isInteger(j.live) && j.live > 0) bits.push(`<span class="proof-live"><i class="live-dot" aria-hidden="true"></i><b>${nf(j.live)}</b> kids playing right now</span>`);
    if (j && j.story && Number.isInteger(j.story.n) && j.story.n > 0 && PROOF_W[j.story.w]) bits.push(`<span>🎤 <b>${nf(j.story.n)}</b> challenges finished ${PROOF_W[j.story.w]}</span>`);
    el.innerHTML = bits.join("");
    el.hidden = !bits.length;
  }).catch(() => {});
}

/* ---------- referral codes (?ref=) ---------- */
const REF_RE = /^[A-Za-z0-9_-]{2,40}$/;
function myCode() {
  let c = store(K.mine);
  if (!/^GK-[A-Z0-9]{6}$/.test(c || "")) {
    const chars = "ABCDEFGHJKMNPQRSTUVWXYZ23456789", buf = new Uint32Array(6);
    crypto.getRandomValues(buf); c = "GK-" + Array.from(buf, (x) => chars[x % chars.length]).join("");
    store(K.mine, c);
  }
  return c;
}
const MINE = myCode();
const qs = new URLSearchParams(location.search);
const inRef = qs.get("ref");
if (inRef && REF_RE.test(inRef) && inRef.toUpperCase() !== MINE && !store(K.by)) store(K.by, inRef);
const inBand = qs.get("b");
if (inBand && BANDS[inBand] && !store(K.band)) store(K.band, inBand);
// Voice coach PREVIEW flag: ?voice=1 (aura-1 for the first 3 sessions, then device voice), ?voice=neural / ?voice=browser
// (force one voice, for the A/B), ?voice=0 (off). Remembered on this device. The server switch (/api/voice) must also be on.
const vq = qs.get("voice");
if (vq === "1" || vq === "neural" || vq === "browser") { store("gks_voice", "1"); store("gks_vmode", vq === "1" ? "auto" : vq); }
else if (vq === "0") { store("gks_voice", "0"); try { localStorage.removeItem("gks_vmode"); } catch (e) {} }
const VLOCAL = store("gks_voice") !== "0"; // on for everyone; ?voice=0 turns it off on this device (and ?voice=1 back on)
// "Challenge a friend" duel link (PREVIEW): /?ref=<code>&b=<band>&d=<duel id>&voice=1. The id points at star scores only.
const inDuel = /^[a-km-np-z2-9]{10}$/.test(qs.get("d") || "") ? qs.get("d") : null;
let VS = { on: false, neural: false };
const vOn = () => VLOCAL && VS.on;
const cameClass = CN.byCode((qs.get("c") || "").toLowerCase());
// "Take me home" link (/#home=1.<progress>.<check>): read it BEFORE the address bar is cleaned below. Browsers never send the
// part after # to a server, and it leaves the address bar right away (so it never sits in history either).
const HOME_M = location.hash.match(KC.HASH_RE);
const HOME_IN = HOME_M ? KC.decode(HOME_M[1]) : null;
const TRIAL_IN = location.hash === "#trial"; // "Book a free trial class" direct link (gpskids.app/#trial), even on a first visit
const BUDDY_IN = location.hash === "#buddy"; // page reopened in the middle of Buddy play: resume it
// A Take me home link opened in a tab that already has the app: same page, new #, so start fresh to read it.
window.addEventListener("hashchange", () => { if (KC.HASH_RE.test(location.hash)) location.reload(); });
if (qs.has("ref") || qs.has("b") || qs.has("voice") || qs.has("d") || qs.has("c") || location.hash) history.replaceState(null, "", location.pathname);
// Kids Pitch Night: /pitch (redirects to /?pitch=1) or /?pitch=1 opens the entry screen
if (qs.get("pitch") === "1") history.replaceState(null, "", location.pathname + "#pitch");
else if (cameClass) history.replaceState(null, "", location.pathname + "#class");
if (HOME_IN) history.replaceState(null, "", location.pathname + "#welcome");
else if (TRIAL_IN && !cameClass) history.replaceState(null, "", location.pathname + "#trial");
else if (BUDDY_IN && !cameClass && qs.get("pitch") !== "1") history.replaceState(null, "", location.pathname + "#buddy");
if (TR_FRESH) TR.track("app_open", null, qs.get("pitch") === "1" ? "pitch" : inDuel ? "duel" : inRef || qs.has("friend") ? "ref" : HOME_IN ? "home" : "direct");
const shareUrl = () => location.origin + "/?ref=" + encodeURIComponent(MINE) + (band ? "&b=" + band : "");

/* ---------- state ---------- */
let band = BANDS[store(K.band)] ? store(K.band) : null;
let item = null, result = null;
let trPromptKey = "", trPlanObs = null, pnStage = ""; // usage events: last prompt logged, plan-card observer, Pitch Night stage
let PNA = false, pnBand0 = null; // Kids Pitch Night: a pitch is being recorded/reviewed (band = the kid's age group meanwhile)

// Featured challenge (Halloween): opt-in per player per day. From Oct 15 it replaced Today's challenge for every kid and starts fell
// from about 30% of homes to almost 0 (Oct 18 2026 review), so the home shows the normal daily / club prompt and the featured one waits under More.
function featChosen() { const f = load("gks_feat", null); return !!(f && f.date === today && FT.isOn(today)); }
function shuffleN() { const s = load(K.shuffle, {}); return s.date === today ? s.n : 0; }
// Talk time (30/60/90 s chips): the last choice per player and age group (gks_len); no choice = 60 s.
// promptAt() returns shared cached objects, so a chosen length makes a copy (s = chosen seconds, s0 = the default).
function lenFor(b) {
  const m = load("gks_len", {}), v = m && typeof m === "object" ? m[b] : 0;
  if (PL.LENS.includes(Number(v))) return Number(v);
  return (!(BANDS[b] && BANDS[b].adult) && PA.lenFor(pathOf(b).lv, b)) || PL.clampLen(0);
}
// "Plan first" time (30/60/90 s chips on the planning screen), chosen separately (gks_prep); no choice = 30 s.
function prepFor(b) { const m = load("gks_prep", {}); return PL.prepSecs(m && typeof m === "object" ? m[b] : 0); }
// test phones only (gks_test + gks_test_nofeat): skip the featured challenge so the daily-prompt tests keep testing the daily prompts
const featOff = rawGet("gks_test") === "1" && rawGet("gks_test_nofeat") === "1";
function currentItem() {
  if (firstKid()) return firstItem(); // a brand-new kid's very first talk (see "First challenge" below)
  if (band && !isAdult() && !shuffleN() && featChosen() && !featOff) return FT.item(band, lenFor(band)); // featured, only after the kid picked it under More (Oct 18 2026 talk-drop fix)
  const c = clubFit();
  if (c) return CL.clubItem(c, band, lenFor(band)); // the level (or the kid's own 30/60/90 choice) sets the talk time here too
  const base = promptAt(band, todayIndex(today, shuffleN())), L = lenFor(band); return L === base.s ? base : { ...base, s: L, s0: base.s };
}
// A friend duel / duel result: prompt numbers 100-127 are club classes (club.js), the rest are daily prompts.
const itemAt = (b, i) => { if (FT.byI(i)) return FT.item(b); const c = CL.byDuelI(i, today); return c ? CL.clubItem(c, b) : promptAt(b, i); };
// Grown-ups mode keeps its own practice days/points/badges ("_gu" keys), so a parent's practice never lands in a kid's
// streak or in a kid profile backup (parent.js always reads the kid keys via API.days/streak).
const isAdult = (b = band) => !!(BANDS[b] && BANDS[b].adult);
const dKey = (k) => (isAdult() ? k + "_gu" : k);
const daysOf = (k) => { const a = load(k, []); return Array.isArray(a) ? a : []; };
function days() { return daysOf(dKey(K.days)); }
function streakOf(list) {
  const set = new Set(list); let d = set.has(today) ? today : addDays(today, -1), n = 0;
  while (set.has(d)) { n++; d = addDays(d, -1); }
  return { n, today: set.has(today) };
}
function streak() { return streakOf(days()); }
function xpOf(b) { return (load(K.xp, {})[b] || 0); }
const level = (xp) => 1 + Math.floor(xp / 100);
/* ---------- the hidden level behind "Today's challenge" (path.js; per player + age group, on this phone, gks_path).
   Kids never see it. Old players keep their progress: with XP and no level yet, their XP level becomes the level. ---------- */
function pathAll() { const m = load("gks_path", {}); return m && typeof m === "object" && !Array.isArray(m) ? m : {}; }
function pathOf(b = band) { return PA.ensure(pathAll()[b]); }
function savePath(p, b = band) { const all = pathAll(); all[b] = p; store("gks_path", all); }
// Once, at start: every kid age group this player already has XP in (but no level yet) gets its level from that XP.
// (Done here, not on read, so a brand-new kid's first talk, which also earns XP, still sets the level from the talk.)
(function migratePath() {
  const all = pathAll(), xpAll = load(K.xp, {}); let n = 0;
  for (const b of Object.keys(KID_BANDS)) if (!all[b] && xpAll && xpAll[b] > 0) { all[b] = PA.ensure(null, level(xpAll[b]), true); n++; }
  if (n) store("gks_path", all);
})();
// This week's club skill becomes Today's challenge when it fits: a kid age group, the latest class on or before today
// (within CL.SHOW_DAYS), the kid's first talk has already set their level, not played yet today, not done yet, no "New prompt".
function clubFit() {
  if (!band || isAdult() || shuffleN()) return null;
  const c = CL.clubFor(today), p = pathOf();
  if (!c || !p.h.length || p.club[c.date] != null || streak().today) return null;
  return c;
}
const exOf = (it) => (it && it.ex) || exampleFor(it); // a club challenge brings its own Hook/Point/Example/Close example
/* ---------- First challenge (Oct 17 2026). A brand-new kid's very first talk on this phone: one big Start, no plan step, a
   20-second talk with a clear countdown (stops by itself at 30 s), then right away "You did it!" + stars + ONE big
   "Challenge a friend". No mic (blocked, missing, in-app browser)? The kid still talks out loud with the timer and finishes.
   Only before this player's first finished talk. Never for grown-ups, Pitch Night, the class phone, duels or a kid already on the
   leaderboard (so the leaderboard rules, class mode and Pitch Night stay exactly as they are). The prompt is a normal bank prompt
   (an easy intro), so a friend duel opens the same challenge. Test phones can turn it off with gks_test_nofirst = 1. ---------- */
const FIRST = { goal: 30, max: 40, minStop: 3, wait: 8000, i: { sprouts: 33, explorers: 26, leaders: 26, trailblazers: 26 } };
function firstKid() {
  if (!band || isAdult() || !(band in FIRST.i) || PNA || CLASS_CODE || round !== "" || days().length) return false;
  if (rawGet("gks_test_nofirst") === "1") return false; // test phones only
  return !pzMe();
}
function firstItem() { const b = promptAt(band, FIRST.i[band]); return { ...b, s: FIRST.goal, s0: b.s, first: true }; }
const isFirst = () => !!(item && item.first) && !PNA && round === "";
// No words heard (no mic, or the AI could not hear in time): stars for showing up and talking. Max 9 of 12, so a friend can win.
function paintFirstRec() { // the record screen for the first challenge: the prompt, a countdown, one button
  const btn = $("rec-btn"), audio = mode === "audio";
  ["talk-plus", "redo-btn", "tips-btn", "switch-btn", "notes-edit"].forEach((id) => { $(id).hidden = true; });
  $("t-note").textContent = "Talk until the ring fills"; $("rec-chip").textContent = "⭐ Your first challenge";
  if (!audio && phase === "rec") { $("mic-panel").hidden = false; $("meter").hidden = true; $("mic-msg").textContent = "🗣️ Talk out loud now!"; } // no mic: still a clear "talk now"
  if (phase === "rec") { btn.textContent = "✋ I'm done"; if (!$("v-rec").classList.contains("first-met")) $("rec-status").textContent = audio ? "Talk out loud. I'm listening!" : ""; if (audio) $("mic-msg").textContent = "🔴 I'm listening! Talk nice and loud."; }
  else if (phase === "idle" && $("err-panel").hidden) { btn.textContent = "🎤 Start"; $("mic-msg").textContent = "🎤 Tap Allow so I can hear you."; $("rec-status").textContent = ""; }
  else if (phase === "asking") $("mic-msg").textContent = "🎤 Tap Allow so I can hear you.";
  else if (phase === "processing") { btn.textContent = "🎉 Done!"; $("rec-status").textContent = ""; }
}
// Stop tapped on the first challenge: "You did it!" shows at once; the words are heard in the background (max 8 s), then the stars.
let firstSeq = 0;
async function firstHear(type) {
  const seq = ++firstSeq, sec = Math.max(1, elapsed), blob = audioBlob, ok = !!blob && blob.size >= 1000;
  if (ok) saveRecording(blob, sec).catch(() => {});
  $("v-fb").classList.add("first", "first-wait"); paintFirstBlock(sec, null);
  history.replaceState({ v: "fb" }, "", "#feedback"); show("v-fb");
  let text = "";
  if (ok) try {
    const ctl = new AbortController(), to = setTimeout(() => ctl.abort(), FIRST.wait);
    const r = await fetch("/api/transcribe", { method: "POST", headers: { "content-type": type.split(";")[0], "x-seconds": String(Math.round(sec)) }, body: blob, signal: ctl.signal });
    clearTimeout(to); const j = r.ok ? await r.json().catch(() => ({})) : {}; text = String(j.text || "").trim();
  } catch (e) {}
  if (seq !== firstSeq || view !== "v-fb" || !$("v-fb").classList.contains("first-wait")) return; // the kid left meanwhile
  const words = (text.match(/[A-Za-z0-9']+/g) || []).length;
  finish(words >= 3 ? text : "", sec, words >= 3 ? { first: true, heard: text } : { first: true });
}
function paintFirstBlock(sec, n) {
  $("first-done").hidden = false; $("fb-main").hidden = false;
  $("fd-p").textContent = `You talked for ${Math.round(sec)} seconds. ${sec >= FIRST.goal ? "Amazing!" : "Great job!"}`;
  $("fd-stars").innerHTML = n == null ? "⭐ Counting your stars…" : `<span class="fd-big" aria-hidden="true">${"⭐".repeat(n >= 10 ? 3 : n >= 6 ? 2 : 1)}</span><b>You got ${n} stars!</b>`;
  $("fd-sub").textContent = n == null ? "" : `Can a friend beat ${n} stars?`;
  const fb = $("friend-btn"); fb.hidden = !vOn(); fb.disabled = n == null; $("fb-offer").hidden = fb.hidden; $("fd-done").hidden = n == null;
}
function paintFirstDone(r, sec) { // called by finish() for every talk: the first-challenge layout on, or off again
  const on = !!(r && r.first) && !PNA, v = $("v-fb");
  v.classList.toggle("first", on); v.classList.remove("first-wait");
  $("first-done").hidden = !on; $("fd-done").hidden = !(r && !PNA); // a small "Done" link on every finish (no second button)
  if (on) $("fd-sub").before($("pts")); else $("nowords").after($("pts")); // the points moment sits right after the stars (never under More)
  if (on) paintFirstBlock(sec, totalStars(r.a.stars));
}
$("fd-done").addEventListener("click", () => { V.stop(); goHome(); });
const effortStars = (sec) => ({ clarity: 2, pace: 2, confidence: sec >= 15 ? 3 : sec >= 8 ? 2 : 1, structure: sec >= 10 ? 2 : 1 });

/* ---------- views ---------- */
const VIEWS = ["v-pick", "v-home", "v-rec", "v-fb", "v-share", "v-recs", "v-duel", "v-who", "v-pitch", "v-class", "v-welcome", "v-buddy", "v-prize", "v-trial"];
let view = "";
function show(v) {
  if (v !== view) V.stop();
  VIEWS.forEach((id) => { $(id).hidden = id !== v; });
  view = v; window.scrollTo(0, 0);
}
function route() {
  const h = location.hash;
  if (view === "v-rec" && h === "#speak") return;
  if (view === "v-rec") stopRec(true);
  if (pnStage && h !== "#pitch" && h !== "#speak" && h !== "#feedback") { TR.track("pn_abandon", null, pnStage); pnStage = ""; }
  if (PNA && h !== "#feedback") pnExit(); // leaving a Pitch Night recording restores the player's own age group
  if (h === "#welcome" && HOME_IN) return paintWelcome();
  if (h === "#class" && CLASS_CODE) return paintClass();
  if (h === "#report" && CLASS_CODE) return paintClassReport();
  if (h === "#who") return paintWho();
  if (h === "#pitch") return pnPaint();
  if (h === "#prize" || h === "#account") { history.replaceState(null, "", location.pathname); return band ? paintHome() : paintPick(); }
  if (h === "#trial") { if (TRIAL_IN && !route.trialSeen) { route.trialSeen = true; TR.track("trial_open", null, "link"); } return trPaint(); }
  if (h === "#buddy") { if (view === "v-buddy") return; if (route.buddyResume) { route.buddyResume = false; return BD.resume(); } return BD.open("home"); }
  if (!band) return paintPick();
  if (h === "#feedback" && result) return show("v-fb");
  if (h === "#share" && result) return show("v-share");
  if (h === "#duel" && duel && vOn()) return show("v-duel");
  if (h === "#recordings") { show("v-recs"); return paintRecs(); }
  paintHome();
}
window.addEventListener("popstate", route);
function goHome() { history.replaceState(null, "", location.pathname); route(); }

function toast(t) { const el = $("toast"); el.textContent = t; el.hidden = false; clearTimeout(toast.t); toast.t = setTimeout(() => { el.hidden = true; }, 2600); }

/* ---------- 1. band picker ---------- */
function bandButtons(cur) {
  return Object.entries(BANDS).filter(([, b]) => !b.adult || vOn()).map(([id, b]) =>
    `<button type="button" class="band${id === cur ? " on" : ""}${b.adult ? " adult" : ""}" data-band="${id}"><span class="e" aria-hidden="true">${b.emoji}</span><span><strong>${b.name}</strong><small>Ages ${esc(b.ages)}</small></span></button>`).join("");
}
function paintPick() {
  let who = ""; try { who = sessionStorage.getItem("gks_pickfor") || ""; } catch (e) {}
  // First visit: "Who are you?" (kid = age buttons right here, one tap to practice; parent / coach / partner below).
  // Adding a player or changing age group: just the age buttons.
  const sub = !!who || !!band;
  $("v-pick").classList.toggle("v-pick-sub", sub);
  $("pick-h").textContent = who ? "Pick " + who + "'s age group" : sub ? "Pick your age group" : "Who are you?";
  $("role-kid-t").hidden = sub;
  $("bands").innerHTML = bandButtons(band); show("v-pick");
}
$("bands").addEventListener("click", (e) => {
  const b = e.target.closest("[data-band]"); if (!b) return;
  if (BANDS[b.dataset.band].adult && !vOn()) return;
  try { sessionStorage.removeItem("gks_pickfor"); } catch (e) {}
  band = b.dataset.band; store(K.band, band); TR.track("band_pick", null, band); goHome();
});

/* ---------- 2. home ---------- */
function paintHome() {
  item = currentItem();
  const B = BANDS[band], T = TYPES[item.type], s = streak(), xp = xpOf(band);
  $("band-pill").innerHTML = `${B.emoji} ${B.name}<span class="sr-only">, change age group</span>`;
  $("band-mini").innerHTML = `${B.emoji} ${B.name} ▾<span class="sr-only">, change age group</span>`;
  $("band-mini").setAttribute("aria-label", B.name + ", change age group");
  paintWhoChip();
  $("streak").textContent = s.n ? "🔥 " + s.n + (s.n === 1 ? " day" : " days") : "🔥 Start a streak";
  $("streak").classList.toggle("hot", s.today);
  $("streak").setAttribute("aria-label", s.n + "-day streak");
  // Funnel home (Oct 17 2026, : "Only one CTA one time"): player, streak, today's prompt and ONE big button. Everything else
  // (Leaderboard card, club card, Pitch Night, buddy, prompts, recordings...) sits behind the small "More" link, for kids and grown-ups.
  // Kids see challenge points on the finish screen (see ptsMoment). Points are the only number anyone sees (, Oct 18 2026):
  // the old "Lv N / N XP" bar is hidden for grown-ups too; levels/XP keep working silently (belts, path, kid code).
  const kid = !isAdult();
  document.querySelector("#v-home .xp").hidden = true;
  $("band-pill").hidden = kid; $("band-mini").hidden = !kid; $("home-share").hidden = kid; $("kicker").hidden = kid; $("type-chip").hidden = kid; $("plan-btn").hidden = kid;
  $("v-home").classList.toggle("kid", kid); $("more-btn").hidden = false; // one CTA on every home (Oct 17 2026): kids AND grown-ups get the small "More" link
  if (!paintHome.seen || paintHome.wasAdult !== !kid) $("more").open = false; // a home starts tidy (first paint, or after switching kid/grown-up)
  paintHome.seen = true; paintHome.wasAdult = !kid;
  $("lvl").textContent = "Lv " + level(xp);
  $("xp-fill").style.width = (xp % 100) + "%";
  $("xp-num").textContent = xp + " XP";
  const sh = shuffleN();
  $("today-label").textContent = sh ? "Bonus prompt" : "Today's challenge";
  $("type-chip").textContent = T.emoji + " " + T.label;
  $("prompt").textContent = item.p;
  $("prompt").classList.toggle("long", item.p.length > 95);
  paintLens();
  const dr = $("done-row");
  dr.classList.remove("nudge");
  const bt = load("gks_beat", {}), btO = bt && Number.isInteger(bt.o) ? bt.o : 0; // "Beat it tomorrow": today's best overall %
  if (s.today) { dr.hidden = false; dr.textContent = bt.date === today && btO ? `✅ Done today! Come back tomorrow and beat your ${btO}%.` : "✅ Done today! Come back tomorrow, or try another one."; }
  else if (s.n > 0) { dr.hidden = false; dr.classList.add("nudge"); dr.textContent = bt.date === addDays(today, -1) && btO ? `Beat yesterday's ${btO}% and keep your ${s.n}-day streak 🔥` : `Speak today to keep your ${s.n}-day streak 🔥`; }
  else dr.hidden = true;
  $("start-btn").textContent = isAdult() ? "🎤 Start recording" : "▶ Start";
  paintVoiceBits(); checkDuels(); syncProfileBand(); pnCard(); pzCard(kid); pzStartNote(kid); paintHomeCode(); paintBelt(kid);
  $("buddy-btn").hidden = !kid;
  $("feat-card").hidden = !(kid && FT.isOn(today) && !item.featured && !item.first);
  $("club-card").hidden = !(kid && s.n >= 7); // 7-day streak: a kid-friendly club card; the club website opens only after the grown-up check
  if (view !== "v-home" || trPromptKey !== band + ":" + item.i) { trPromptKey = band + ":" + item.i; TR.track("prompt_shown", item.i, band); }
  $("feat-row").hidden = true; // kid home stays simple: Pitch Night lives under More
  if (item.featured) { $("type-chip").hidden = false; $("type-chip").textContent = item.label; }
  if (item.club) { $("today-label").textContent = "Today's challenge"; $("type-chip").textContent = "🏫 Club skill · " + item.theme; }
  const first = !!item.first; $("v-home").classList.toggle("first", first); $("streak").hidden = false;
  if (first) { // first challenge: the prompt, one big Start, one line. Leaderboard, belt and More come after the first talk.
    $("kicker").hidden = false; $("today-label").textContent = "Your first challenge"; $("type-chip").hidden = true;
    $("start-btn").textContent = "🎤 Start"; $("start-note").hidden = false; $("start-note").textContent = "Talk until the ring fills. Get stars! ⭐";
    $("pz-card").hidden = true; $("club-card").hidden = true; $("belt-line").hidden = true; $("done-row").hidden = true; $("more").open = false; $("streak").hidden = true;
  }
  show("v-home");
  ping(); paintProof();
}
/* Grown-up check: "what is 14 x 7?" style (same as the store app's native ParentGate). Resolves true only for the right answer. */
// openUrl: opened right inside the Continue tap (phones, Safari most of all, block new tabs opened later than the tap itself).
window.gpsGrownUp = grownUp;
function grownUp(reason, openUrl) {
  if (inStoreApp()) return window.Capacitor.nativePromise("ParentGate", "ask", { reason }).then((r) => { const ok = !!(r && r.ok); if (ok && openUrl) window.open(openUrl, "_blank", "noopener"); return ok; }).catch(() => false);
  return new Promise((done) => {
    const a = 12 + Math.floor(Math.random() * 8), b = 3 + Math.floor(Math.random() * 7);
    $("gu-reason").textContent = reason; $("gu-q").textContent = `Grown-up, please answer: what is ${a} × ${b}?`;
    $("gu-in").value = ""; $("gu-err").textContent = ""; $("gu-sheet").hidden = false; $("gu-in").focus();
    const end = (ok) => { if (ok && openUrl) window.open(openUrl, "_blank", "noopener"); $("gu-sheet").hidden = true; $("gu-ok").onclick = $("gu-cancel").onclick = $("gu-in").onkeydown = null; done(ok); };
    $("gu-ok").onclick = () => { if (Number($("gu-in").value.trim()) === a * b) end(true); else { $("gu-err").textContent = "Not quite. Ask a grown-up to help."; $("gu-in").value = ""; } };
    $("gu-in").onkeydown = (e) => { if (e.key === "Enter") $("gu-ok").onclick(); };
    $("gu-cancel").onclick = () => end(false);
  });
}
$("feat-pn").addEventListener("click", () => { location.hash = "#pitch"; });
const CLUB_URL = BRAND.clubUrl || "";
$("club-card").addEventListener("click", () => { if (CLUB_URL) grownUp("This opens the club website.", CLUB_URL); });
$("band-pill").addEventListener("click", paintPick);
$("band-mini").addEventListener("click", paintPick); // kids: the small age-group label next to the player chip opens the same picker
$("feat-card").addEventListener("click", () => { TR.track("feat_pick"); store("gks_feat", { date: today }); store(K.shuffle, { date: today, n: 0 }); $("more").open = false; paintHome(); window.scrollTo(0, 0); toast("Halloween challenge on! Tap Today's challenge."); });
$("shuffle-btn").addEventListener("click", () => { TR.track("shuffle"); store("gks_feat", null); store(K.shuffle, { date: today, n: shuffleN() + 1 }); paintHome(); toast("New prompt! Same streak."); });
// Kids: Today's challenge -> the quick 4-part plan (a tester's plan step, one tap later) -> "Start talking" -> recording with the cues pinned.
// Quick start: kids go straight to talking in one tap; "Plan first" stays as the small link above.
$("start-btn").addEventListener("click", () => { primeAudio(); quickGo = !isAdult(); openRec("audio", true); });
/* One tap from the landing page: no age pick, no plan, no forms. Uses the saved age group, else Explorers (change it later on home). */
function quickStart() {
  primeAudio();
  try { sessionStorage.removeItem("gks_pickfor"); } catch (e) {}
  if (!band || (BANDS[band] && BANDS[band].adult)) { band = "explorers"; store(K.band, band); TR.track("band_pick", null, "quick"); }
  history.replaceState(null, "", location.pathname); paintHome();
  quickGo = true; openRec("audio", true);
}
window.gksQuickStart = quickStart;
$("age-btn").addEventListener("click", paintPick);
$("more").addEventListener("toggle", () => { if ($("more").open) TR.track("more_open", null, "home"); });
/* Talk time chips 30/60/90 s + "Plan first" (optional; Start = jump in) */
const chipRow = (label, list, on, what) => `<span class="lens-l">${label}</span>` + list.map((L) =>
  `<button type="button" class="len-chip${L === on ? " on" : ""}" data-len="${L}" aria-pressed="${L === on}" aria-label="${what} for ${L} seconds">${L}s</button>`).join("");
function paintLens() {
  const T = TYPES[item.type];
  $("goal").innerHTML = `🎯 Talk for <b>${item.s} seconds</b>. ${esc(T.tip)}`;
  $("lens").innerHTML = chipRow("Talk", PL.LENS, item.s, "Talk");
}
$("lens").addEventListener("click", (e) => {
  const b = e.target.closest("[data-len]"); if (!b || !item) return;
  const L = PL.clampLen(b.dataset.len, 0); if (!L || L === item.s) return;
  const m = load("gks_len", {}), all = m && typeof m === "object" ? m : {};
  all[band] = L; store("gks_len", all); item = currentItem(); paintLens(); count("time_choice"); TR.track("time_choice", L);
});
// Plan time chips: tapping one restarts the planning countdown at that length. "+30s" adds 30 s of planning per tap,
// up to 3:00 of planning in total (then it is disabled). Talk time never changes.
// kids: no plan-time chips / +30s on the plan step (the countdown is only a gentle guide)
const paintPrepLens = () => { $("prep-lens").hidden = !isAdult(); const can = PL.canAddPrep(prepLen); $("prep-lens").innerHTML = chipRow("Plan", PL.PREPS, prepBase, "Plan") +
  `<button type="button" class="len-chip plus" id="prep-plus"${can ? "" : " disabled"} aria-label="Add 30 seconds of planning time${can ? "" : " (3 minutes is the most)"}">+30s</button>`; };
$("prep-lens").addEventListener("click", (e) => {
  if (e.target.closest("#prep-plus")) { if (phase !== "prep" || !PL.canAddPrep(prepLen)) return; prepLen += 30; paintPrepLens(); paintTimer(); return; }
  const b = e.target.closest("[data-len]"); if (!b || phase !== "prep") return;
  const L = PL.prepSecs(b.dataset.len); if (L === prepBase) return;
  const m = load("gks_prep", {}), all = m && typeof m === "object" ? m : {};
  all[band] = L; store("gks_prep", all); prepBase = prepLen = L; prepT0 = Date.now();
  paintPrepLens(); paintTimer(); count("time_choice");
});
let wantPlan = false;
$("plan-btn").addEventListener("click", () => { wantPlan = true; openRec("audio", false); });
$("type-btn").addEventListener("click", () => openRec("typed", false));
$("prefer-type").addEventListener("click", () => openRec("typed", false));

/* ---------- 3. record (MediaRecorder; Web Speech captions only as an optional on-device extra) ---------- */
const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
const UA = navigator.userAgent;
const isIOS = /iPhone|iPad|iPod/i.test(UA) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
const inApp = /FBAN|FBAV|FB_IAB|Instagram|WhatsApp|Line\/|musical_ly|Bytedance|Snapchat|Twitter|LinkedInApp|GSA\//i.test(UA);
const canRecord = !!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia && window.MediaRecorder);
const MAX_SECS = PL.MAX_TALK; // 5:00 hard stop
let mode = "audio", phase = "idle", t0 = 0, elapsed = 0, tick = null;
let stream = null, recorder = null, chunks = [], mime = "", audioBlob = null, audioUrl = "", ac = null, raf = 0;
let cap = null, capText = "", capOK = false;
if (SR && SR.available) {
  // Live captions only when the browser can do speech-to-text on the device itself (keeps the privacy line true).
  try { SR.available({ langs: ["en-US"], processLocally: true }).then((s) => { capOK = s === "available"; }).catch(() => {}); } catch (e) {}
}
const ta = $("transcript");
function pickMime() {
  const c = ["audio/mp4;codecs=mp4a.40.2", "audio/mp4", "audio/webm;codecs=opus", "audio/webm", "audio/ogg;codecs=opus"];
  // iPhone Safari records audio/mp4; Chrome/Firefox record webm/ogg (Chrome 126+ can also do mp4; webm is smaller there)
  const order = isIOS ? c : [c[2], c[3], c[4], c[0], c[1]];
  for (const m of order) { try { if (MediaRecorder.isTypeSupported(m)) return m; } catch (e) {} }
  return "";
}
let noRecLater = false, quickGo = false;
let round = ""; // "" normal | "twist" funny twist replay | "duel" grown-up's turn in a Family duel (PREVIEW)
function openRec(m, autostart, push = true, r = push ? "" : round) {
  stopAll(); V.stop(); $("v-rec").classList.remove("first-met");
  round = vOn() ? r : "";
  mode = m === "typed" || !canRecord ? "typed" : "audio";
  phase = "idle"; elapsed = 0; capText = ""; ta.value = ""; audioBlob = null;
  const T = TYPES[item.type];
  $("rec-chip").textContent = item.club ? "🏫 Club skill · " + item.theme : T.emoji + " " + T.label;
  $("rec-prompt").textContent = item.p;
  if (push) pzScoring = pzCounts(); // first finished try each day counts (on the leaderboard); a retry of the same take (push = false) keeps it
  if (!PNA && !isAdult() && pzMe()) $("rec-chip").innerHTML = esc($("rec-chip").textContent) + `<span class="pz-mode" id="pz-mode">${pzScoring ? "⭐ Counts" : "Practice"}</span>`;
  $("pn-banner").hidden = !PNA; $("v-rec").classList.toggle("pn", PNA);
  if (PNA) { $("rec-chip").textContent = "🏆 Pitch Night"; $("pn-banner-p").textContent = pnBannerText(); }
  $("twist-banner").hidden = round !== "twist";
  if (round === "twist") $("twist-text").textContent = twistFor(item).text;
  $("duel-banner").hidden = round !== "duel";
  if (round === "duel" && duel) { $("duel-bh").textContent = duel.kind === "join" ? "Duel time!" : "Grown-up's turn!"; $("duel-text").textContent = `Same challenge. Beat ${duel.kidTotal} of 12 stars!`; }
  $("t-goal").style.left = (100 * item.s / barMax()) + "%";
  $("err-panel").hidden = true;
  // plan cues: shown again on "Try again" for the same prompt (nothing typed, nothing stored, nothing sent)
  const plan = wantPlan; wantPlan = false; prepEnded = false;
  if (plannedKey !== notesKey()) plannedKey = "";
  paintRec();
  if (push) history.pushState({ v: "rec" }, "", "#speak");
  show("v-rec");
  noRecLater = plan && m !== "typed" && !canRecord; // no recorder here: plan first, then the friendly "type instead" message
  if (!PNA && round === "" && push) TR.track("rec_open", item.s, isFirst() ? "first" : "daily");
  if (plan) { quickGo = false; count("prep_used"); startPrep(); }
  else if (m !== "typed" && !canRecord) micError("unsupported");
  else if (autostart && mode === "audio" && (store("gks_mic") === "1" || isFirst() || quickGo)) { quickGo = false; startAudio(); } // first challenge: the Start tap asks for the mic
}
const maxSecs = () => (PNA ? PN.MAX_SECS : MAX_SECS); // Pitch Night: 1-minute pitch, stops at 1:05
const barMax = () => (isFirst() ? item.s : mode === "audio" ? Math.min(maxSecs(), item.s * 1.5) : item.s * 1.5);
/* ---------- "Plan first": a planning countdown + a read-only example of Hook, Point, Example, Close for this prompt.
   Kids plan in their heads (no typing, a tester + , Oct 8 2026). The same 4 cues stay on screen while recording. ---------- */
let prepLen = 0, prepBase = 0, prepT0 = 0, prepEnded = false, plannedKey = "";
const notesKey = () => band + ":" + item.i + ":" + item.type + ":" + item.p.length;
const planned = () => PNA || (!!plannedKey && plannedKey === notesKey()); // Pitch Night: the 4 cues are always on
function paintPlanEx() {
  const ex = exOf(item);
  $("plan-ex").innerHTML = PARTS.map(([k, l, hint]) => `<li><b>${l}</b><small>${hint}</small><span>${esc(ex[k])}</span></li>`).join("");
}
function startPrep() {
  stopAll();
  $("err-panel").hidden = true;
  phase = "prep"; prepEnded = false; prepBase = prepLen = prepFor(band); prepT0 = Date.now();
  plannedKey = notesKey();
  paintPrepLens(); paintPlanEx();
  clearInterval(tick); tick = setInterval(paintTimer, 250);
  paintRec();
  TR.track("plan_open"); trPlanSeen();
}
// usage event per Hook/Point/Example/Close card the kid actually had on screen (once each per plan)
function trPlanSeen() {
  if (trPlanObs) trPlanObs.disconnect();
  if (!("IntersectionObserver" in window)) return;
  const seen = new Set(), cards = [...$("plan-ex").children];
  trPlanObs = new IntersectionObserver((list) => { for (const en of list) { const i = cards.indexOf(en.target); if (en.isIntersecting && i >= 0 && !seen.has(i)) { seen.add(i); TR.track("plan_part", i); } } }, { threshold: 0.6 });
  cards.forEach((li) => trPlanObs.observe(li));
}
function endPrep(auto) {
  if (phase !== "prep") return;
  if (trPlanObs) { trPlanObs.disconnect(); trPlanObs = null; }
  clearInterval(tick); phase = "idle"; prepEnded = true;
  paintRec();
  if (auto) { $("rec-status").textContent = isAdult() ? "⏰ Planning time is up! Tap Start when you're ready." : "⏰ Planning time is up! Tap Start talking when you're ready."; if (navigator.vibrate) navigator.vibrate([40, 60, 40]); }
}
$("notes-edit").addEventListener("click", () => { if (phase === "idle") { count("prep_used"); startPrep(); } });
function paintNotes() {
  const on = planned() && phase !== "prep" && $("err-panel").hidden, ex = PNA ? PN.EXAMPLE : exOf(item);
  $("notes-card").hidden = !on;
  $("notes-list").innerHTML = on ? PARTS.map(([k, l]) => `<li><b>${l}</b> ${esc(ex[k])}</li>`).join("") : "";
  $("v-rec").classList.toggle("has-notes", on);
}
function paintRec() {
  const btn = $("rec-btn"), st = $("rec-status"), audio = mode === "audio";
  const review = phase === "review", stopped = phase === "stopped", prep = phase === "prep";
  btn.classList.toggle("stop", phase === "rec");
  $("timer").classList.toggle("prep", prep);
  $("prep-panel").hidden = !prep;
  $("t-note").textContent = prep ? "Planning time, then talk until the ring fills" : "Talk until the ring fills";
  $("talk-plus").hidden = true;
  $("talk-plus").hidden = phase !== "rec"; $("talk-plus").disabled = !PL.canAddTalk(item.s);
  $("notes-edit").hidden = phase !== "idle" || !$("err-panel").hidden || planned() || round !== "" || isFirst(); // "Plan first" above Start, until the kid has planned
  $("v-rec").classList.toggle("easy", band === "sprouts");
  btn.disabled = phase === "asking" || phase === "processing";
  $("timer").classList.toggle("rec", phase === "rec");
  $("mic-panel").hidden = !audio || review || prep || !$("err-panel").hidden;
  $("mic-panel").classList.toggle("live", phase === "rec");
  $("meter").hidden = phase !== "rec";
  ta.hidden = prep || (audio && !review) || isFirst(); // first challenge without a mic: talk out loud, no typing
  ta.readOnly = false;
  $("play-wrap").hidden = !audioBlob || phase === "rec";
  $("redo-btn").hidden = phase === "idle" || phase === "asking" || phase === "rec" || prep;
  $("redo-btn").textContent = audio ? "↺ Record again" : "↺ Start over";
  $("tips-btn").hidden = !review;
  $("switch-btn").hidden = !audio || phase === "rec" || phase === "processing" || prep || !$("err-panel").hidden;
  $("captions").hidden = !(audio && phase === "rec" && capText);
  if (prep) {
    btn.textContent = !isAdult() ? (audio ? "🎤 Start talking" : "▶ Start talking") : audio ? "🎤 I'm ready: start now" : "▶ I'm ready: start timer"; // kids can start any time
    $("prep-h").textContent = band === "sprouts" ? "🧠 Plan your talk in your head" : `🧠 Plan your ${item.s}-second talk in your head`;
    $("prep-tip").textContent = "Now think of your own! " + PL.hpecHint(item.s) + " These stay on screen while you talk.";
    st.textContent = audio && store("gks_mic") !== "1" ? "🎤 After you tap Start talking, tap Allow so I can hear you." : "";
  } else if (audio) {
    if (phase === "idle") {
      btn.textContent = !isAdult() && planned() && !PNA ? "🎤 Start talking" : store("gks_mic") === "1" ? "🎤 Start recording" : "🎤 Allow mic & start";
      $("mic-msg").textContent = store("gks_mic") === "1" ? "Tap Start, then say your answer out loud." : "🎤 We'll ask to use your microphone. Tap Allow. Your recording stays on this phone.";
      st.textContent = "";
      if (prepEnded && planned()) st.textContent = "The 4 parts stay right here while you talk.";
    } else if (phase === "asking") { btn.textContent = "Waiting for the mic…"; $("mic-msg").textContent = "Tap Allow so I can hear you 🎤"; }
    else if (phase === "rec") { btn.textContent = "■ Stop"; $("mic-msg").textContent = "🔴 Recording… speak up, nice and clear!"; st.textContent = "Tap Stop when you finish."; }
    else if (phase === "processing") { btn.textContent = "Listening to your words…"; $("mic-msg").textContent = "🎧 Listening to your words…"; st.textContent = "This takes a few seconds."; }
    else if (review) btn.textContent = "✨ Get my feedback";
  } else {
    ta.placeholder = "Type what you said here…";
    if (phase === "idle") { btn.textContent = "▶ Start timer"; st.textContent = "Tap Start timer and say your answer OUT LOUD. Then type what you said."; }
    else if (phase === "rec") { btn.textContent = "■ Stop"; st.textContent = "🗣️ Say it out loud now. Tap Stop when you finish."; }
    else if (stopped) { btn.textContent = "✨ Get my feedback"; st.textContent = "Now type what you said (or the main ideas), then get feedback."; }
  }
  if (isFirst()) paintFirstRec();
  if (PNA) { // Pitch Night: fixed 1 minute (no +30s), recording only (the judges listen), honest mic note (the pitch is kept if submitted)
    $("talk-plus").hidden = true; $("switch-btn").hidden = true;
    if (audio && phase === "idle") $("mic-msg").textContent = "Tap Start and pitch out loud. You have 1 minute. You can record again before you submit.";
  }
  paintNotes();
  paintTimer();
}
function secs() { return phase === "rec" ? elapsed + (Date.now() - t0) / 1000 : elapsed; }
function paintRing(frac) {
  const c = $("timer-fill");
  if (!c) return;
  const f = Math.max(0, Math.min(1, frac));
  c.style.strokeDashoffset = String(314 * (1 - f));
}
function paintTimer() {
  if (phase === "prep") {
    const left = prepLen - (Date.now() - prepT0) / 1000;
    paintRing(1 - Math.max(0, left) / prepLen);
    const pf = $("t-fill"); pf.style.width = Math.min(100, Math.max(0, 1 - left / prepLen) * 100) + "%"; pf.classList.remove("met");
    $("t-goal").hidden = true;
    if (left <= 0) endPrep(true);
    return;
  }
  $("t-goal").hidden = true;
  const s = secs();
  if (isFirst()) {
    const left = Math.max(0, item.s - s);
    paintRing(item.s ? 1 - left / item.s : 1);
    if (phase === "rec" && left <= 0 && !$("v-rec").classList.contains("first-met")) { $("v-rec").classList.add("first-met"); $("rec-status").textContent = "🎉 You did it! Tap I'm done."; if (navigator.vibrate) navigator.vibrate(40); }
    if (phase === "rec" && s >= FIRST.max) { TR.track("auto_stop", s, mode === "audio" ? "audio" : "typed"); stopRec(false, true); return; }
  } else paintRing(Math.min(1, s / Math.max(1, item.s)));
  const f = $("t-fill"); f.style.width = Math.min(100, (s / barMax()) * 100) + "%"; f.classList.toggle("met", s >= item.s);
  if (phase === "rec" && mode === "audio" && s >= maxSecs()) { TR.track("auto_stop", s, "audio"); stopRec(false, true); }
  if (phase === "rec" && mode === "typed" && s >= Math.max(180, item.s * 3)) { TR.track("auto_stop", s, "typed"); stopRec(false, true); }
}
// "+30s" while talking: more talk time (the goal), up to 5:00. Planning has its own +30s (max 3:00).
$("talk-plus").addEventListener("click", () => {
  if (phase !== "rec" || !PL.canAddTalk(item.s)) return;
  item = { ...item, s: item.s + 30, s0: item.s0 || item.s };
  TR.track("talk_plus", item.s);
  $("t-goal").style.left = (100 * item.s / barMax()) + "%";
  paintRec(); paintTimer();
});
function startTimer() { count("challenge_started"); TR.track("rec_start", item.s, mode); ping(); phase = "rec"; t0 = Date.now(); clearInterval(tick); tick = setInterval(paintTimer, 250); }
async function startAudio() {
  if (!canRecord) return micError("unsupported");
  phase = "asking"; $("err-panel").hidden = true; paintRec();
  if (store("gks_mic") !== "1") TR.track("mic_ask"); // the phone is about to ask "Allow microphone?"
  if (vOn()) { V.stop(); V.session("play-and-record"); }
  try {
    stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true, channelCount: 1 } });
  } catch (e) {
    phase = "idle";
    const n = e && e.name;
    return micError(n === "NotAllowedError" || n === "SecurityError" ? (inApp ? "inapp" : "denied") : n === "NotFoundError" || n === "OverconstrainedError" ? "nomic" : n === "NotReadableError" ? "busy" : inApp ? "inapp" : "unsupported");
  }
  if (view !== "v-rec" || phase !== "asking") { stopAll(); return; }
  store("gks_mic", "1");
  mime = pickMime(); chunks = [];
  try { recorder = new MediaRecorder(stream, mime ? { mimeType: mime, audioBitsPerSecond: 32000 } : { audioBitsPerSecond: 32000 }); }
  catch (e) { try { recorder = new MediaRecorder(stream); } catch (e2) { stopAll(); return micError("unsupported"); } }
  recorder.ondataavailable = (ev) => { if (ev.data && ev.data.size) chunks.push(ev.data); };
  recorder.onstop = onAudioStop;
  recorder.start(1000);
  startTimer(); paintRec(); meter(); captions();
  if (navigator.vibrate) navigator.vibrate(40);
}
let acPre = null;
function primeAudio() { // inside the tap: iPhone only allows sound and a running AudioContext that start from a user gesture
  try { V.unlock(); } catch (e) {}
  try { const C = window.AudioContext || window.webkitAudioContext; if (C && !acPre) acPre = new C(); if (acPre && acPre.state === "suspended") acPre.resume().catch(() => {}); } catch (e) {}
}
function meter() {
  try {
    const C = window.AudioContext || window.webkitAudioContext; if (!C) return;
    ac = acPre || new C(); acPre = null; if (ac.state === "suspended") ac.resume().catch(() => {});
    const an = ac.createAnalyser(); an.fftSize = 256; ac.createMediaStreamSource(stream).connect(an);
    const buf = new Uint8Array(an.fftSize), bars = $("meter").children;
    const loop = () => {
      an.getByteTimeDomainData(buf); let peak = 0; for (const v of buf) peak = Math.max(peak, Math.abs(v - 128));
      const lvl = Math.min(1, peak / 64);
      for (let k = 0; k < bars.length; k++) { const w = 1 - Math.abs(k - 4) / 5; bars[k].style.height = Math.round(8 + 48 * lvl * w * (0.7 + Math.random() * 0.3)) + "px"; }
      raf = requestAnimationFrame(loop);
    };
    loop();
  } catch (e) {}
}
function captions() {
  if (!SR || !capOK) return;
  try {
    cap = new SR(); cap.lang = "en-US"; cap.continuous = true; cap.interimResults = true; cap.processLocally = true;
    cap.onresult = (e) => { let t = ""; for (let k = 0; k < e.results.length; k++) t += e.results[k][0].transcript + " "; capText = t.trim(); $("captions").textContent = capText; $("captions").hidden = !capText; };
    cap.onerror = () => {}; cap.onend = () => { cap = null; };
    cap.start();
  } catch (e) { cap = null; }
}
function stopAll() {
  clearInterval(tick); cancelAnimationFrame(raf);
  if (recorder && recorder.state !== "inactive") { recorder.onstop = null; try { recorder.stop(); } catch (e) {} }
  recorder = null;
  if (stream) { stream.getTracks().forEach((t) => t.stop()); stream = null; }
  if (ac) { ac.close().catch(() => {}); ac = null; }
  if (cap) { try { cap.abort(); } catch (e) {} cap = null; }
}
function stopRec(silent, auto) {
  if (phase !== "rec") { if (silent) { stopAll(); phase = "idle"; } return; }
  elapsed = secs(); clearInterval(tick); cancelAnimationFrame(raf);
  TR.track(silent ? "rec_cancel" : "rec_end", elapsed, silent ? null : auto ? "auto" : "tap");
  if (silent) { stopAll(); phase = "idle"; return; }
  if (mode === "audio") {
    phase = "processing"; paintRec();
    if (cap) { try { cap.stop(); } catch (e) {} }
    try { recorder.stop(); } catch (e) { onAudioStop(); }
    if (stream) { stream.getTracks().forEach((t) => t.stop()); stream = null; }
    if (ac) { ac.close().catch(() => {}); ac = null; }
  } else if (isFirst()) { phase = "stopped"; finish("", Math.max(1, elapsed), { first: true }); } // no mic: straight to "You did it!"
  else { phase = "stopped"; paintRec(); ta.focus({ preventScroll: true }); }
}
async function onAudioStop() {
  const type = (recorder && recorder.mimeType) || mime || "audio/webm";
  recorder = null;
  audioBlob = new Blob(chunks, { type }); chunks = [];
  if (audioUrl) URL.revokeObjectURL(audioUrl);
  audioUrl = URL.createObjectURL(audioBlob);
  $("playback").src = audioUrl;
  if (isFirst()) return firstHear(type); // first challenge: "You did it!" right away, the stars follow in a few seconds
  if (audioBlob.size < 1000 || elapsed < 1) return reviewFail("short");
  if (!round && !PNA) saveRecording(audioBlob, elapsed).catch(() => {}); // twist/duel takes never replace the kid's saved recording
  paintRec();
  let r = null, j = {};
  try {
    const ctl = new AbortController(), to = setTimeout(() => ctl.abort(), 35000 + elapsed * 400); // longer talks take longer to hear (5:00 -> ~2.5 min)
    r = await fetch("/api/transcribe", { method: "POST", headers: { "content-type": type.split(";")[0], "x-seconds": String(Math.round(elapsed)) }, body: audioBlob, signal: ctl.signal });
    clearTimeout(to);
    j = await r.json().catch(() => ({}));
  } catch (e) { return reviewFail("network"); }
  if (view !== "v-rec") return;
  const text = String(j.text || "").trim(), words = (text.match(/[A-Za-z0-9']+/g) || []).length;
  if (r.ok && words >= 3) return finish(text, elapsed, { heard: text });
  reviewFail(r.status === 429 ? "limit" : r.status === 403 ? "blocked" : r.ok ? "empty" : "error");
}
const FAIL_MSG = {
  short: "That was too short to hear. Try again and talk a little longer, or type it.",
  empty: "I couldn't hear that. Try again closer to the mic, or type it.",
  network: "I couldn't reach the coach (no internet?). Try again, or type it.",
  error: "I couldn't hear that. Try again closer to the mic, or type it.",
  blocked: "This browser couldn't reach the coach. Try again, or type it.",
  limit: "The listening robot is resting for today. Type what you said, or get quick tips.",
};
function reviewFail(why) {
  TR.track("rec_fail", null, why);
  phase = "review"; failWhy = why;
  if (!ta.value && capText) ta.value = capText;
  paintRec();
  $("rec-status").textContent = (capText ? "" : "") + FAIL_MSG[why];
  ta.placeholder = "Type what you said here…";
}
let failWhy = "";
const MIC_ERR = {
  denied: ["The mic is blocked", "Allow the microphone for this site in your browser settings, then tap Record again. Or type your answer."],
  nomic: ["No microphone found", "Plug in or turn on a mic, or type your answer instead."],
  busy: ["The mic is busy", "Another app is using the microphone. Close it and try again, or type your answer."],
  inapp: ["Open this page in your browser", ""],
  unsupported: ["Recording doesn't work here", ""],
};
function micError(kind) {
  TR.track("mic_error", null, kind);
  if (isFirst()) { // first challenge: never stuck. No mic? Talk out loud anyway with the timer, then finish.
    $("err-h").textContent = "🎤 No mic? That's OK!"; $("err-p").textContent = "Say it out loud anyway. Tap Start and talk.";
    $("err-copy").hidden = true; $("err-type").hidden = true;
    $("err-panel").hidden = false; $("err-panel").dataset.kind = kind; phase = "idle"; paintRec();
    $("rec-btn").textContent = "▶ Start"; $("rec-status").textContent = ""; return;
  }
  $("err-copy").hidden = false; $("err-type").hidden = false;
  const [h, p] = MIC_ERR[kind] || MIC_ERR.unsupported;
  const open = isIOS ? "Tap ••• or the Share button and choose “Open in Safari”." : "Tap ⋮ and choose “Open in Chrome”.";
  $("err-h").textContent = "🎤 " + h;
  $("err-p").textContent = p || ((inApp ? "This app's built-in browser can't use the microphone. " : "This browser can't record audio. ") + open + " Or copy the link, or just type your answer.");
  if (kind === "denied" && inApp) $("err-p").textContent += " " + open;
  $("err-panel").hidden = false; $("err-panel").dataset.kind = kind;
  phase = "idle"; paintRec();
  $("rec-btn").textContent = canRecord && kind !== "inapp" ? "🎤 Try again" : "⌨️ Type my answer";
  $("rec-status").textContent = "";
}
$("err-copy").addEventListener("click", async () => { const u = location.origin + "/"; try { await navigator.clipboard.writeText(u); toast("Link copied! Paste it in Safari or Chrome."); } catch (e) { prompt("Copy this link:", u); } });
$("err-type").addEventListener("click", () => { $("err-panel").hidden = true; openRec("typed", false, false); ta.hidden = false; ta.focus(); });
$("rec-btn").addEventListener("click", () => {
  if (isFirst() && phase === "idle" && !$("err-panel").hidden) { $("err-panel").hidden = true; mode = "typed"; startTimer(); paintRec(); return; } // no mic: talk out loud
  if (isFirst() && phase === "rec" && secs() < FIRST.minStop) { toast("Keep talking! Say a little more."); return; }
  if (phase === "idle" && !$("err-panel").hidden && (!canRecord || $("err-panel").dataset.kind === "inapp")) return $("err-type").click();
  if (phase === "prep") endPrep(false);
  if (phase === "idle" && noRecLater) { noRecLater = false; return micError("unsupported"); }
  if (phase === "idle") { $("err-panel").hidden = true; return mode === "audio" ? startAudio() : (startTimer(), paintRec(), ta.focus({ preventScroll: true })); }
  if (phase === "rec") return stopRec();
  if (phase !== "stopped" && phase !== "review") return;
  const words = (ta.value.match(/[A-Za-z0-9']+/g) || []).length;
  if (words < 3) { $("rec-status").textContent = phase === "review" ? "Type a few words of what you said, tap Record again, or get quick tips." : "Type a few more words of what you said."; ta.focus(); return; }
  finish(ta.value.trim(), Math.max(1, elapsed), { typed: true, why: phase === "review" ? failWhy : "" });
});
$("tips-btn").addEventListener("click", () => finish(ta.value.trim(), Math.max(1, elapsed), { why: failWhy }));
$("redo-btn").addEventListener("click", () => { TR.track("retry", null, "redo"); const m = mode; openRec(m, m === "audio", false); });
$("switch-btn").addEventListener("click", () => { const keep = audioBlob, secsKept = elapsed; stopAll(); mode = "typed"; $("err-panel").hidden = true; phase = keep ? "stopped" : "idle"; audioBlob = keep; elapsed = keep ? secsKept : 0; paintRec(); ta.hidden = false; ta.focus(); });
$("rec-close").addEventListener("click", () => { stopRec(true); history.back(); });

/* ---------- on-device recordings (IndexedDB, last 7 days, latest per day) ---------- */
function idb() {
  return new Promise((res, rej) => {
    if (!window.indexedDB) return rej(new Error("no idb"));
    const r = indexedDB.open("gks", 1);
    r.onupgradeneeded = () => r.result.createObjectStore("recs", { keyPath: "date" });
    r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error);
  });
}
async function tx(modeRW, fn) {
  const db = await idb();
  return new Promise((res, rej) => { const t = db.transaction("recs", modeRW), st = t.objectStore("recs"); const out = fn(st); t.oncomplete = () => { db.close(); res(out && out.result !== undefined ? out.result : out); }; t.onerror = () => { db.close(); rej(t.error); }; });
}
async function saveRecording(blob, seconds) {
  const buf = await blob.arrayBuffer(); // ArrayBuffer, not Blob: safest across Safari versions
  const cutoff = addDays(today, -6);
  await tx("readwrite", (st) => {
    // one recording per player per day: key "<day>" for the first player, "<day>@<id>" for the others
    st.put({ date: PID === "p1" ? today : today + "@" + PID, day: today, pid: PID, buf, type: blob.type, seconds: Math.round(seconds), band, ptype: item.type, p: item.p, ts: Date.now() });
    const c = st.openCursor(); c.onsuccess = () => { const cur = c.result; if (!cur) return; if ((cur.value.day || cur.value.date) < cutoff) cur.delete(); cur.continue(); };
  });
}
const recDay = (r) => r.day || r.date;
const listRecordings = () => tx("readonly", (st) => st.getAll()).then((a) => (a || []).filter((r) => (r.pid || "p1") === PID && recDay(r) >= addDays(today, -6)).sort((x, y) => (recDay(x) < recDay(y) ? 1 : -1)));
let recUrls = [];
async function paintRecs() {
  recUrls.forEach((u) => URL.revokeObjectURL(u)); recUrls = [];
  const ul = $("recs-list");
  let list = [];
  try { list = await listRecordings(); } catch (e) {}
  if (!list.length) { ul.innerHTML = '<li class="empty">No recordings yet. Record today\'s challenge and it shows up here, on this phone only.</li>'; return; }
  ul.innerHTML = "";
  for (const r of list) {
    const url = URL.createObjectURL(new Blob([r.buf], { type: r.type })); recUrls.push(url);
    const li = document.createElement("li"), T = TYPES[r.ptype] || { emoji: "🎤", label: "Challenge" };
    const d = new Date(recDay(r) + "T12:00:00");
    li.innerHTML = `<div class="rec-top"><span>${recDay(r) === today ? "Today" : d.toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" })} · ${fmt(r.seconds)}</span><span>${T.emoji} ${esc(T.label)}</span></div>` +
      `<p class="rec-p">${esc(r.p)}</p><div class="rec-row"><audio controls preload="metadata" src="${url}"></audio><button class="del" type="button" data-del="${r.date}" aria-label="Delete recording from ${recDay(r)}">🗑</button></div>`;
    ul.appendChild(li);
  }
}
$("recs-list").addEventListener("click", async (e) => {
  const b = e.target.closest("[data-del]"); if (!b) return;
  if (!confirm("Delete this recording from this phone?")) return;
  await tx("readwrite", (st) => st.delete(b.dataset.del)).catch(() => {});
  toast("Recording deleted"); paintRecs();
});
function openRecs() { history.pushState({ v: "recs" }, "", "#recordings"); show("v-recs"); paintRecs(); }
$("recs-btn").addEventListener("click", openRecs);
$("recs-close").addEventListener("click", () => history.back());
$("recs-go").addEventListener("click", () => { history.replaceState(null, "", location.pathname); paintHome(); openRec("audio", true); });

/* ---------- 4. local analysis ---------- */
const STOP = new Set("the a an and or but to of in on at for with is was are were be it its it's i i'm my me we you your they them he she his her this that there then so like um uh just very really have has had do did not no yes can will would if as from what when how why who our us all one".split(" "));
const LIKE_OK = new Set("i you we they would really also don't didn't do does to look looks looked feel feels felt sounds sound kids people what i'd you'd we'd".split(" "));
const NUMS = "zero one two three four five six seven eight nine ten eleven twelve thirteen fourteen fifteen sixteen seventeen eighteen nineteen twenty thirty forty fifty hundred thousand half times plus minus equals divided".split(" ");
const MARKERS = ["first", "second", "third", "then", "next", "after that", "finally", "last", "because", "so that", "that's why", "for example", "for instance", "in the end", "the end", "another", "also", "however", "but", "in conclusion", "to sum up", "which means", "my name is", "thank you", "that is why", "the answer is", "equals", "plus", "minus", "times", "divided"];
const HEDGES = ["i don't know", "i guess", "i'm not sure", "kind of", "sort of", "sorry", "maybe"];
function analyze(text, seconds, bandId = band) {
  const B = BANDS[bandId], low = text.toLowerCase().replace(/[’‘]/g, "'");
  const sentences = low.split(/[.!?]+/);
  const words = [], starts = new Set();
  sentences.forEach((s) => { const w = s.match(/[a-z0-9']+/g) || []; if (w.length) starts.add(words.length); words.push(...w); });
  const n = words.length, wpm = Math.round(n / (Math.max(seconds, 1) / 60));
  const fill = {};
  const add = (w) => { fill[w] = (fill[w] || 0) + 1; };
  words.forEach((w, k) => {
    const prev = words[k - 1] || "", next = words[k + 1] || "";
    if (/^(u+m+|u+h+|uhm+|e+rm+|h+mm+)$/.test(w)) add(/^u+h+$/.test(w) ? "uh" : "um");
    else if (w === "like" && !LIKE_OK.has(prev) && next !== "to" && next !== "a" && next !== "it" && next !== "this" && next !== "that") add("like");
    else if (w === "so" && (starts.has(k) || /^(um+|uh+|like|and)$/.test(prev) || /^(um+|uh+|like|yeah)$/.test(next))) add("so");
    else if (w === "you" && next === "know" && !/^(do|did|don't|if|as|i|what)$/.test(prev) && words[k + 2] !== "what" && words[k + 2] !== "how") add("you know");
  });
  const fillers = Object.values(fill).reduce((a, b) => a + b, 0);
  const counts = {}; let stutters = 0;
  // topic words from the prompt and number words are expected to repeat, so they don't count as repetition
  const topic = new Set((item.p.toLowerCase().match(/[a-z0-9']+/g) || []).concat(NUMS));
  words.forEach((w, k) => { if (w === words[k - 1] && w.length < 6) stutters++; if (!STOP.has(w) && !topic.has(w) && !/^\d+$/.test(w) && w.length > 2) counts[w] = (counts[w] || 0) + 1; });
  const top = Object.entries(counts).sort((a, b) => b[1] - a[1])[0];
  const repeat = top && top[1] >= 4 && top[1] / n >= 0.05 ? { w: top[0], c: top[1] } : null;
  const joined = " " + words.join(" ") + " ";
  const markers = MARKERS.filter((m) => joined.includes(" " + m + " "));
  if (item.type === "math" && /\d|one|two|three|four|five|six|seven|eight|nine|ten|twelve|half/.test(joined)) markers.push("#number");
  const hedges = HEDGES.filter((h) => joined.includes(" " + h + " ")).length;
  const ratio = seconds / item.s;
  // stars (1-3 each)
  const [lo, hi] = B.wpm;
  const pace = n < 5 ? 1 : wpm >= lo && wpm <= hi ? 3 : wpm >= lo - 25 && wpm <= hi + 30 ? 2 : 1;
  const rate = n ? (fillers / n) * 100 : 100;
  const clarity = Math.max(1, (rate <= 3 ? 3 : rate <= 8 ? 2 : 1) - (stutters >= 3 || repeat ? 1 : 0));
  let confidence = ratio >= 0.75 ? 3 : ratio >= 0.4 ? 2 : 1;
  if (ratio > 3) confidence = 2;
  if (hedges >= 2) confidence = Math.max(1, confidence - 1);
  const minWords = Math.round(item.s * (lo / 60) * 0.5);
  const structure = markers.length >= PL.marksNeeded(item.s) && n >= minWords ? 3 : markers.length >= 1 ? 2 : 1; // 2 linking words for a 30 s talk, 3 for longer
  const m = { n, wpm, seconds, fill, fillers, repeat, stutters, markers, hedges, ratio, stars: { clarity, pace, confidence, structure }, parts: PL.hpecParts(text) };
  m.pct = PL.percents(m, { len: item.s, lo, hi, minWords }); // what the kid sees ("Confidence 80%"); stars stay inside for XP and duels
  return m;
}

/* ---------- local coaching note (fallback, and when the free AI limit is used up) ---------- */
function localNote(a, focus) {
  const young = band === "sprouts" || band === "explorers", S = a.stars, well = [];
  const mk = a.markers.find((m) => m[0] !== "#");
  if (S.structure >= 2 && mk) well.push(young ? `You used the linking word "${mk}". That helps people follow you!` : `Linking words like "${mk}" gave your answer a clear path.`);
  if (S.clarity >= 3) well.push(young ? "You spoke clearly with almost no ums. Super clear!" : "Very few filler words, so you sounded clear and sure.");
  if (S.confidence >= 3) well.push(young ? "You kept going all the way to the goal. Brave!" : "You used your full time, which shows real confidence.");
  if (S.pace >= 3) well.push(young ? "Your speed was just right. Easy to follow!" : "Your pace was easy to follow: not too fast, not too slow.");
  if (a.n >= 20) well.push(young ? `You shared ${a.n} words of great ideas!` : `You put ${a.n} words of real ideas out there.`);
  well.push(young ? "You took on today's challenge. That's how speakers grow!" : "You showed up and spoke. Every rep makes you stronger.");
  const lowest = focus && S[focus] !== undefined ? focus : Object.entries(S).sort((x, y) => x[1] - y[1])[0][0];
  const B = BANDS[band];
  const tips = {
    pace: a.wpm < B.wpm[0] ? (young ? "Try talking a little faster, like you're telling a friend something exciting." : "Pick up the pace a little, as if you're telling a friend big news.")
      : (young ? "Take a breath between ideas so every word is easy to hear." : "Slow down and pause between ideas so each point lands."),
    clarity: young ? "When you need to think, take a quiet pause instead of saying 'um'." : "Swap fillers like 'um' and 'like' for a short pause. Pauses sound confident.",
    confidence: a.hedges >= 2 ? (young ? "Say your idea like you mean it. Skip 'I don't know'." : "Drop hedges like 'I guess' and say your point like you mean it.")
      : (young ? "Keep talking until you reach the goal line. Add one more example!" : "Aim for the goal time: add one more reason or example."),
    structure: item.type === "math" ? (young ? "Say the answer, then say 'because' and tell each step." : "State the answer first, then walk through each step with 'because'.")
      : (young ? "Try Hook, Point, Example, Close: a question, your big idea, one example, then say it again." : "Use Hook, Point, Example, Close: open with a question, state your point, give one example, and sum it up."),
  };
  return { well: well.slice(0, 2), next: tips[lowest] };
}

/* ---------- 5. feedback + rewards ---------- */
// The function rejects transcripts over 2,000 characters, so cut at a word boundary first.
function trim2000(t) { if (t.length <= 5000) return t; const c = t.slice(0, 5000); return c.slice(0, Math.max(c.lastIndexOf(" "), 4500)); } // up to 5:00 of talk
function totalStars(s) { return s.clarity + s.pace + s.confidence + s.structure; }
const WHY = {
  cap: "Free AI coach: 5 a day, so these are quick tips.",
  limit: "The AI coach is resting for today, so these are quick tips.",
  blocked: "This browser couldn't reach the AI coach, so these are quick tips.",
  network: "No connection to the AI coach, so these are quick tips.",
  error: "The AI coach had a hiccup, so these are quick tips.",
  nowords: "I couldn't hear the words, so these are general tips.",
};
function nowordsNote(seconds) {
  const young = band === "sprouts" || band === "explorers";
  return { well: [young ? "You pressed record and gave it a try. Brave!" : "You hit record and gave it a go. That's the hardest part.",
    seconds >= 5 ? `You kept going for ${fmt(seconds)}.` : (young ? "You showed up today. That counts!" : "You showed up today, and that counts.")],
    next: young ? "Hold the phone close and speak up, like you're talking across the table." : "Hold the phone about a hand away and speak up so every word comes through." };
}
async function finish(text, seconds, opts = {}) {
  if (round === "duel" && duel) return finishDuel(text, seconds, opts);
  stopRec(true); V.stop();
  const first = !!opts.first;
  const a = analyze(text || "", seconds), noWords = a.n < 3, effort = first && noWords;
  if (effort) a.stars = effortStars(seconds);
  const S = a.stars;
  const before = streak(), firstToday = !before.today && !PNA; // a Pitch Night take is not a daily challenge (no streak/XP)
  // streak + XP + badges (practicing counts even if no words were heard)
  const d = days(); if (firstToday) { d.push(today); store(dKey(K.days), d.slice(-400)); }
  const s = streak();
  const twist = round === "twist";
  const gained = PNA ? 0 : 10 + (noWords ? 0 : 5 * totalStars(S)) + (firstToday ? 20 : 0) + (twist && !noWords ? 15 : 0);
  const xpAll = load(K.xp, {}), oldXp = xpAll[band] || 0; xpAll[band] = oldXp + gained; store(K.xp, xpAll);
  // points per day (for weekly challenges/leaderboards if a parent signs in; stays on the device otherwise)
  const lg = load(dKey(K.log), {}); lg[today] = (lg[today] || 0) + gained;
  for (const k of Object.keys(lg)) if (k < addDays(today, -60)) delete lg[k];
  store(dKey(K.log), lg);
  const badges = load(dKey(K.badges), []);
  let newBadge = null;
  if (firstToday) for (const [n, id, emoji, name] of [[3, "streak3", "🔥", "3-Day Speaker"], [7, "streak7", "🏆", "Week Champion"]]) {
    if (s.n === n) { badges.push({ id, date: today }); newBadge = { emoji, name, n }; }
  }
  store(dKey(K.badges), badges);
  const pzRun = pzScoring && !isAdult() && !PNA; pzScoring = false; // leaderboard: only the first finished try of the day earns points
  const ptsRun = !PNA && !isAdult() && round === "" && !CLASS_CODE ? ptsMoment(pzRun, text || "", seconds, item.s) : (($("pts").hidden = true), null);
  const newCode = !PNA && ensureCode(); // first talk: this player gets a kid code (kept on this phone)
  if (!PNA) syncPush();
  result = { a, item, band, streak: s.n, gained, level: level(xpAll[band]), leveled: level(xpAll[band]) > level(oldXp), badge: newBadge, noWords,
    earned: !!(ptsRun && !ptsRun.practice), round, id: Date.now(), asked: false, neural: vOn() && !V.textOnly() && V.neuralForSession(VS.neural), newCode, first, effort };

  $("stars").hidden = noWords; $("nowords").hidden = !noWords;
  const P = a.pct;
  paintScores(a);
  const fl = Object.entries(a.fill).map(([w, c]) => `${w} ×${c}`).join(", ");
  const met = seconds >= item.s * 0.75;
  $("stats").innerHTML = (noWords ? [`⏱️ <b>${fmt(seconds)}</b> / ${fmt(item.s)} ${met ? "✓" : ""}`] : [
    `🗣️ <b>${a.n < 5 ? "–" : a.wpm}</b> words/min`,
    `🙊 <b>${a.fillers}</b> filler${a.fillers === 1 ? "" : "s"}${fl ? " (" + esc(fl) + ")" : ""}`,
    `⏱️ <b>${fmt(seconds)}</b> / ${fmt(item.s)} ${met ? "✓" : ""}`,
    a.repeat ? `🔁 "<b>${esc(a.repeat.w)}</b>" ×${a.repeat.c}` : "🔁 <b>No</b> big repeats",
  ]).map((x) => `<span class="stat">${x}</span>`).join("");
  const hasAudio = !!audioBlob && !opts.typed;
  $("fb-play").hidden = !audioBlob;
  if (audioBlob) $("fb-audio").src = audioUrl;
  $("heard").hidden = !opts.heard; $("heard-text").textContent = opts.heard || "";
  $("answer").hidden = !item.a;
  if (item.a) $("answer").textContent = "🧮 Answer: " + item.a;
  $("reward").innerHTML = `<span>🔥 ${s.n}-day streak</span>`; // nobody sees XP / level labels (Oct 18 2026)
  $("card-btn").hidden = noWords;
  paintFbHome(newCode);
  $("fb-main").hidden = PNA; // ONE big next step: Challenge a friend, or (talk 2+, earned points, no account yet) Make your account to win prizes
  // ONE "Fix next" line for the lowest percent (computed on the phone; only the area name goes to the coach)
  let imp = null;
  const fixOpts = { len: item.s, lo: BANDS[band].wpm[0], hi: BANDS[band].wpm[1], young: band === "sprouts" || band === "explorers", type: item.type };
  if (!noWords && !twist) imp = PL.fixNext(P, a, fixOpts);
  result.imp = imp; paintFix(imp);
  paintHooks(); $("vcoach").hidden = true;
  fbLayout(noWords);
  if (PNA) pnFeedback(text); else { $("pn-submit").hidden = true; $("premium-btn").hidden = false; $("reward").hidden = false; document.querySelector("#v-fb .voice-privacy").hidden = !vOn(); }
  $("again-btn").textContent = noWords || PNA ? "🎤 Record again" : "↺ Try again";
  setCoach("loading");
  history.replaceState({ v: "fb" }, "", "#feedback");
  show("v-fb");
  paintFirstDone(result, seconds);
  TR.track("feedback_view", noWords ? null : PL.overall(P), PNA ? "pitch" : first ? "first" : noWords ? "nowords" : twist ? "twist" : item.club ? "club" : "daily");
  count("challenge_finished");
  if (navigator.vibrate) navigator.vibrate(60);
  const beltUp = !PNA && !isAdult() ? beltCheck() : null;
  if (beltUp) setTimeout(() => openBelt(beltUp, newBadge), 500);
  else if (newBadge) setTimeout(() => openModal(newBadge.emoji, "New badge: " + newBadge.name + "!", `${newBadge.n} days in a row. You're becoming a real speaker!`, false), 500);
  else if (twist && !noWords) { toast("🌀 Plot twister!"); count("twist_done"); }
  const wantAsk = vOn() && !noWords && askLeft() > 0 && !PNA;

  // AI coaching note (few per day free). Every failure path still shows local tips plus a short reason.
  let note = null, why = "";
  if (noWords) why = "nowords";
  else if (first) why = "first"; // first challenge: instant, no AI note (it is not shown on that screen)
  else {
    const ai = load(K.ai, {}), used = ai.date === today ? ai.n : 0;
    if (used >= AI_PER_DAY && !PNA) why = "cap"; // Pitch Night takes skip the 5-a-day phone cap (the server cap still applies)
    else {
      if (!PNA) store(K.ai, { date: today, n: used + 1 });
      try {
        const ctl = new AbortController(), to = setTimeout(() => ctl.abort(), 35000);
        const r = await fetch("/api/feedback", {
          method: "POST", headers: { "content-type": "application/json" }, signal: ctl.signal,
          body: JSON.stringify({ band, i: item.i, transcript: trim2000(text), seconds: Math.round(seconds), wpm: a.wpm, fillers: a.fillers, goal: item.s,
            ...(imp && imp.cat ? { focus: imp.cat } : {}), ...(wantAsk ? { ask: 1 } : {}), ...(PNA ? { pn: 1 } : {}), ...(twist ? { tw: twistFor(item).t } : {}) }),
        });
        clearTimeout(to);
        const j = r.ok ? await r.json().catch(() => ({})) : {};
        if (r.ok && Array.isArray(j.well) && j.well.length && j.next) note = j;
        else why = r.status === 429 ? "limit" : r.status === 403 ? "blocked" : "error";
      } catch (e) { why = "network"; }
    }
  }
  if (!note) note = noWords ? nowordsNote(seconds) : localNote(a, imp && imp.cat);
  result.note = note; result.src = why ? "local" : "ai"; result.why = why;
  if (CLASS_CODE && !PNA) {
    const o = PL.overall(a.pct);
    const tip = String((note && note.next) || "").replace(/\s+/g, " ").trim().slice(0, 160);
    const prev = load("gks_ntalk", []);
    const rows = (Array.isArray(prev) ? prev : []).filter((x) => x && x.d === today);
    rows.push({ d: today, o, tip, xp: gained });
    store("gks_ntalk", rows.slice(-6)); // on this phone only: score + the coach's one line. No transcript, no name.
  }
  // Hidden level: one move per challenge, from the final scores (the coach's Hook/Point/Example/Close rating included).
  // Saved even if the kid already left this screen. Not for Pitch Night, twists, duels, grown-ups, or talks with no words.
  const fin = !why && !twist && !noWords && PL.validParts(note.parts) ? { ...a.pct, structure: Math.min(PL.partsPct(note.parts), a.n < 20 ? 80 : 100) } : a.pct;
  if (!PNA && !noWords && round === "") { const bt = load("gks_beat", {}), o = PL.overall(fin); store("gks_beat", { date: today, o: bt.date === today ? Math.max(bt.o || 0, o) : o }); } // "Beat it tomorrow"
  if (!PNA && !noWords && round === "" && !isAdult()) {
    const pr = PA.record(pathOf(), { key: item.club ? "club:" + item.club : "d:" + band + ":" + item.i + ":" + today, pct: fin, day: today, club: item.club || null });
    savePath(pr.path); TR.track("path_move", pr.lv, pr.mv);
  }
  if (view !== "v-fb" || result.a !== a) return;
  // The AI coach also rates Hook/Point/Example/Close: update the Structure score, its parts row, and Fix next (our own short wording, so it never contradicts the parts).
  if (!why && !noWords && !twist && PL.validParts(note.parts)) {
    a.parts = note.parts; a.pct.structure = Math.min(PL.partsPct(note.parts), a.n < 20 ? 80 : 100);
    imp = PL.fixNext(a.pct, a, fixOpts);
    result.imp = imp; paintScores(a); paintFix(imp);
  }
  setCoach(why ? "local" : "ai", note, why);
  if (vOn() && !PNA) paintVoiceCoach(wantAsk);
  if (PNA) pnReady();
}
function paintScores(a) {
  const P = a.pct, mark = { strong: "✓", weak: "~", missing: "✗" };
  const parts = a.parts ? `<i class="parts" aria-hidden="true">${PL.HPEC.map(([k, l]) => `<em class="${a.parts[k]}">${mark[a.parts[k]]} ${l}</em>`).join("")}</i>` : "";
  const said = a.parts ? ". " + PL.HPEC.map(([k, l]) => l + " " + a.parts[k]).join(", ") : "";
  $("stars").innerHTML = [["Clarity", P.clarity], ["Pace", P.pace], ["Confidence", P.confidence], ["Structure", P.structure]]
    .map(([l, v]) => `<div class="skill pct" role="img" aria-label="${l}: ${v}%${l === "Structure" ? said : ""}"><span>${l}</span><b aria-hidden="true">${v}%</b><i class="pbar" aria-hidden="true"><i style="width:${v}%"></i></i>${l === "Structure" ? parts : ""}</div>`).join("");
}
function paintFix(imp) {
  if (PNA && imp && !imp.cat) imp = { cat: null, text: "Great scores everywhere! Submit it, or record again to make it even stronger." }; // Pitch Night: fixed 1 minute, no "longer talk"
  $("fixnext").hidden = !imp;
  if (imp) $("fixnext").innerHTML = `🎯 <b>Fix next${imp.cat ? ": " + PL.CAT_LABEL[imp.cat] : ""}.</b> ${esc(imp.text)}`;
}
function setCoach(src, note, why) {
  const h = $("coach-h"), tag = $("coach-src"), list = $("coach-list"), w = $("coach-why");
  h.dataset.src = src === "loading" ? "" : src; h.dataset.why = why || "";
  h.textContent = src === "ai" ? "🧑‍🏫 Coach says" : src === "local" ? "🧑‍🏫 Quick tips" : "🧑‍🏫 Coach";
  tag.textContent = src === "ai" ? "Coach: AI" : src === "local" ? "Coach: quick tips" : "Coach: …";
  tag.classList.toggle("ai", src === "ai");
  w.hidden = !why; w.textContent = why ? WHY[why] || WHY.error : "";
  if (src === "loading") { list.innerHTML = '<li class="loading">Your coach is reading your words</li>'; return; }
  const well = (note.well || []).slice(0, 2), next = note.next || "Try again tomorrow and beat today's score!";
  list.innerHTML = well.map((x) => `<li class="well">${esc(x)}</li>`).join("") + `<li class="next"><b>Try next time:</b> ${esc(next)}</li>`;
}
$("fb-close").addEventListener("click", () => { if (PNA) { history.replaceState(null, "", location.pathname + "#pitch"); return route(); } goHome(); });
$("class-switch").addEventListener("click", () => { history.pushState({ v: "class" }, "", "#class"); paintClass(); });
$("again-btn").addEventListener("click", () => { TR.track("retry", null, PNA ? "pitch" : "again"); if (PNA) return pnRecord(); history.replaceState(null, "", location.pathname); const keep = item && item.club && !PNA ? item : null; paintHome(); if (keep) item = keep; openRec(mode === "typed" ? "typed" : "audio", mode !== "typed"); });
$("beat-btn").addEventListener("click", () => {
  TR.track("beat_tomorrow"); V.stop();
  const bt = load("gks_beat", {});
  goHome(); toast(bt.date === today && bt.o ? `See you tomorrow! Come back and beat ${bt.o}% 🔥` : "See you tomorrow! 🔥");
});
$("premium-btn").addEventListener("click", () => openModal("⭐", "Premium is coming", "Unlimited AI coaching, parent progress reports, and the full puzzle library. The daily challenge stays free.", true));


/* ---------- modal ---------- */
function openModal(emoji, h, p, wa) {
  $("modal-emoji").textContent = emoji; $("modal-h").textContent = h; $("modal-p").textContent = p;
  $("modal-wa").hidden = !wa; $("modal-ok").textContent = wa ? "Got it" : "Yay!";
  $("modal").hidden = false; $("modal-ok").focus();
}
$("modal-ok").addEventListener("click", () => { $("modal").hidden = true; });
$("modal").addEventListener("click", (e) => { if (e.target.id === "modal") $("modal").hidden = true; });

/* ---------- belts (belts.js): quiet line on the kid home, a party + share card on a belt-up ---------- */
const beltIn = () => [daysOf(K.days), load(K.xp, {})]; // kid practice days + points (never the Grown-ups ones)
function paintBelt(kid) {
  const el = $("belt-line"); el.hidden = !kid || !band; if (el.hidden) return;
  const [d, x] = beltIn(), B = BT.beltOf(d, x);
  if (!Number.isInteger(load("gks_belt", null))) store("gks_belt", BT.beltIndex(d, x)); // first time: remember quietly, no party
  $("belt-dot").style.setProperty("--belt", B.color);
  $("belt-name").textContent = B.name + " belt";
  $("belt-next").textContent = BT.nextText(d, x);
}
// after a finished kid talk: a new belt? (returns its index or null)
function beltCheck() {
  const [d, x] = beltIn(), c = BT.check(load("gks_belt", null), d, x);
  if (c.store) store("gks_belt", c.i);
  if (!c.up) return null;
  TR.track("belt_up", c.i);
  return c.i;
}
function beltCard(i, name) {
  const B = BT.BELTS[i], cv = document.createElement("canvas"); cv.width = 600; cv.height = 600;
  const x = cv.getContext("2d");
  x.fillStyle = "#fbf8ef"; x.fillRect(0, 0, 600, 600);
  x.fillStyle = "#14213d"; x.textAlign = "center";
  x.font = "800 30px " + FONT_SANS; x.fillText("GPS Kids Speak", 300, 70);
  x.font = "64px " + EMOJI; x.fillText("🥋", 300, 170);
  x.fillStyle = B.color; x.strokeStyle = "#14213d"; x.lineWidth = 6;
  x.beginPath(); x.roundRect ? x.roundRect(90, 220, 420, 90, 18) : x.rect(90, 220, 420, 90); x.fill(); x.stroke();
  x.fillStyle = B.ink; x.font = "800 44px " + FONT_SANS; x.fillText(B.name.toUpperCase() + " BELT", 300, 282);
  x.fillStyle = "#14213d"; x.font = "56px " + FONT_SERIF; x.fillText(BT.safeName(name) || "Speaker", 300, 400);
  x.font = "600 28px " + FONT_SANS; x.fillStyle = "#4c5873"; x.fillText("earned a new speaking belt!", 300, 450);
  x.font = "800 24px " + FONT_SANS; x.fillStyle = "#137a3c"; x.fillText("Free · practice speaking every day", 300, 540);
  return cv;
}
let beltNow = 0;
function openBelt(i, badge) {
  const B = BT.BELTS[i], me = PROFILES.list.find((p) => p.id === PID) || {}, nm = BT.safeName(me.nickname);
  beltNow = i;
  $("belt-big").style.setProperty("--belt", B.color);
  $("belt-h").textContent = `${B.name} belt${nm ? ", " + nm : ""}! 🎉`;
  const n = BT.next(...beltIn());
  $("belt-p").textContent = `You practiced ${BT.inputs(...beltIn()).days} days. ` + (n ? `Keep going for ${n.belt.name} belt!` : "That's the top belt!") + (badge ? ` You also got the ${badge.name} badge.` : "");
  try { const cv = beltCard(i, me.nickname); $("belt-card").src = cv.toDataURL("image/png"); $("belt-card").alt = `${B.name} belt card`; $("belt-card").hidden = false; } catch (e) { $("belt-card").hidden = true; }
  $("belt-sheet").hidden = false; $("belt-ok").focus();
}
$("belt-ok").addEventListener("click", () => { $("belt-sheet").hidden = true; });
$("belt-sheet").addEventListener("click", (e) => { if (e.target.id === "belt-sheet") $("belt-sheet").hidden = true; });
$("belt-share").addEventListener("click", async () => {
  const me = PROFILES.list.find((p) => p.id === PID) || {}, text = BT.shareText(me.nickname, beltNow);
  if (navigator.share) {
    try {
      const blob = await new Promise((r) => beltCard(beltNow, me.nickname).toBlob(r, "image/png"));
      const file = blob && new File([blob], "gps-kids-belt.png", { type: "image/png" });
      const data = file && navigator.canShare && navigator.canShare({ files: [file] }) ? { files: [file], text } : { text };
      await navigator.share(data); TR.track("belt_share", null, "native"); return;
    } catch (e) { if (e && e.name === "AbortError") return; }
  }
  try { await navigator.clipboard.writeText(text); TR.track("belt_share", null, "copy"); toast("Copied! Paste it in a message."); } catch (e) { toast(text); }
});

/* ---------- share card ---------- */
const FONT_SERIF = '"Young Serif", Georgia, serif', FONT_SANS = '"DM Sans", system-ui, sans-serif', EMOJI = '"Apple Color Emoji","Noto Color Emoji","Segoe UI Emoji"';
function wrap(ctx, text, maxW) {
  const words = text.split(" "), lines = []; let line = "";
  for (const w of words) { const t = line ? line + " " + w : w; if (ctx.measureText(t).width > maxW && line) { lines.push(line); line = w; } else line = t; }
  if (line) lines.push(line); return lines;
}
function star(ctx, cx, cy, r, fill) {
  ctx.beginPath();
  for (let k = 0; k < 10; k++) { const rr = k % 2 ? r * 0.45 : r, ang = -Math.PI / 2 + (k * Math.PI) / 5; ctx.lineTo(cx + rr * Math.cos(ang), cy + rr * Math.sin(ang)); }
  ctx.closePath(); ctx.fillStyle = fill; ctx.fill();
}
function rrect(ctx, x, y, w, h, r, fill) { ctx.beginPath(); ctx.roundRect(x, y, w, h, r); ctx.fillStyle = fill; ctx.fill(); }
async function drawCard() {
  try { await Promise.all([document.fonts.load('60px "Young Serif"'), document.fonts.load('800 40px "DM Sans"')]); } catch (e) {}
  const W = 1080, H = 1350, c = document.createElement("canvas"); c.width = W; c.height = H;
  const ctx = c.getContext("2d"), r = result, B = BANDS[r.band], T = TYPES[r.item.type], P = r.a.pct;
  ctx.fillStyle = "#fbf8ef"; ctx.fillRect(0, 0, W, H);
  rrect(ctx, 0, 0, W, 150, 0, "#14213d");
  ctx.fillStyle = "#fff"; ctx.font = `56px ${FONT_SERIF}`; ctx.textBaseline = "middle"; ctx.fillText("GPS Kids", 60, 77);
  const gw = ctx.measureText("GPS Kids ").width; ctx.fillStyle = "#f3bd35"; ctx.fillText("Speak", 60 + gw, 77);
  ctx.font = `800 40px ${FONT_SANS}, ${EMOJI}`; const st = `🔥 ${r.streak}-day streak`, sw = ctx.measureText(st).width + 56;
  rrect(ctx, W - 60 - sw, 42, sw, 72, 36, "#f3bd35"); ctx.fillStyle = "#14213d"; ctx.fillText(st, W - 60 - sw + 28, 79);
  ctx.font = `800 34px ${FONT_SANS}, ${EMOJI}`; ctx.fillStyle = "#4c5873";
  ctx.fillText(`${T.emoji} ${T.label.toUpperCase()}  ·  ${B.adult ? "GPS MOMS & DADS" : B.name.toUpperCase() + " " + B.ages}`, 60, 225);
  let size = 64, lines; ctx.fillStyle = "#14213d";
  // prompt fits in the band 270..670, the score box sits at 700..1100, total at 1155, footer at 1210..1300
  do { ctx.font = `${size}px ${FONT_SERIF}`; lines = wrap(ctx, "“" + r.item.p + "”", W - 120); size -= 2; } while (lines.length * size * 1.22 > 390 && size > 34);
  size += 2; const lh = size * 1.22; let y = 270 + (400 - lines.length * lh) / 2 + lh / 2;
  lines.forEach((l) => { ctx.fillText(l, 60, y); y += lh; });
  y = 700;
  rrect(ctx, 60, y, W - 120, 400, 36, "#ffffff");
  ctx.strokeStyle = "#dbe3ee"; ctx.lineWidth = 3; ctx.beginPath(); ctx.roundRect(60, y, W - 120, 400, 36); ctx.stroke();
  [["Clarity", P.clarity], ["Pace", P.pace], ["Confidence", P.confidence], ["Structure", P.structure]].forEach(([l, v], k) => {
    const ry = y + 65 + k * 90; ctx.font = `800 44px ${FONT_SANS}`; ctx.fillStyle = "#14213d"; ctx.fillText(l, 110, ry);
    rrect(ctx, W - 520, ry - 14, 230, 28, 14, "#e3e8f0"); rrect(ctx, W - 520, ry - 14, Math.max(28, 230 * v / 100), 28, 14, "#f3bd35");
    ctx.fillStyle = "#14213d"; ctx.textAlign = "right"; ctx.fillText(v + "%", W - 110, ry); ctx.textAlign = "left";
  });
  y = 1155;
  ctx.font = `800 46px ${FONT_SANS}, ${EMOJI}`; ctx.fillStyle = "#14213d"; ctx.textAlign = "center";
  ctx.fillText(`Overall ${PL.overall(P)}%`, W / 2, y); // no XP label for anyone
  rrect(ctx, 60, H - 150, W - 120, 100, 50, "#1458d4");
  ctx.fillStyle = "#fff"; ctx.font = `800 40px ${FONT_SANS}`; ctx.fillText("Your turn: " + location.host, W / 2, H - 99);
  ctx.textAlign = "left";
  return new Promise((res) => c.toBlob((b) => res(b), "image/png"));
}
let cardBlob = null, cardUrl = "";
$("card-btn").addEventListener("click", async () => {
  TR.track("card_open");
  $("card-btn").disabled = true;
  cardBlob = await drawCard();
  if (cardUrl) URL.revokeObjectURL(cardUrl);
  cardUrl = URL.createObjectURL(cardBlob);
  $("card-img").src = cardUrl;
  $("card-img").alt = `Share card: ${PL.overall(result.a.pct)}% overall and a ${result.streak}-day streak on today's challenge`;
  shareRow($("share-row"), resultText(), true);
  history.pushState({ v: "share" }, "", "#share");
  show("v-share");
  $("card-btn").disabled = false;
});
$("share-close").addEventListener("click", () => history.back());
$("share-home").addEventListener("click", goHome);

/* ---------- share buttons (native, WhatsApp, SMS, copy) on every screen ---------- */
const ICON = {
  share: '<svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8"/><polyline points="16 6 12 2 8 6"/><line x1="12" y1="2" x2="12" y2="15"/></svg>',
  wa: '<svg aria-hidden="true" viewBox="0 0 24 24" fill="currentColor"><path d="M17.5 14.4c-.3-.1-1.7-.8-2-.9-.3-.1-.5-.1-.7.1-.2.3-.8.9-.9 1.1-.2.2-.3.2-.6.1-.3-.1-1.2-.5-2.3-1.4-.9-.8-1.4-1.7-1.6-2-.2-.3 0-.5.1-.6l.4-.5c.2-.2.2-.3.3-.5.1-.2 0-.4 0-.5l-.9-2.2c-.2-.6-.5-.5-.7-.5h-.6c-.2 0-.5.1-.8.4-.3.3-1 1-1 2.4s1 2.8 1.2 3c.1.2 2 3.1 4.9 4.3 2.4 1 2.9.8 3.4.7.5-.1 1.7-.7 2-1.4.2-.7.2-1.3.2-1.4-.1-.1-.3-.2-.6-.3zM12 21.8c-1.8 0-3.5-.5-5-1.4l-.4-.2-3.7 1 1-3.6-.2-.4C2.6 15.6 2.1 13.8 2.1 12 2.1 6.6 6.6 2.2 12 2.2c2.6 0 5.1 1 7 2.9 1.9 1.9 2.9 4.3 2.9 7 0 5.4-4.4 9.7-9.9 9.7z"/></svg>',
  sms: '<svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>',
  link: '<svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M10 13a5 5 0 0 0 7.5.5l3-3a5 5 0 0 0-7-7l-1.7 1.7"/><path d="M14 11a5 5 0 0 0-7.5-.5l-3 3a5 5 0 0 0 7 7l1.7-1.7"/></svg>',
  save: '<svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3v12"/><polyline points="7 10 12 15 17 10"/><path d="M5 21h14"/></svg>',
};
function challengeText() {
  if (!band || !BANDS[band]) return "GPS Kids Speak: a free 1-minute speaking challenge for kids, every day. 🎤";
  const it = item || currentItem(), B = BANDS[band];
  if (B.adult) return `Today's GPS Moms & Dads speaking challenge: "${it.p}" Can you do it out loud in ${it.s} seconds? 🎤`;
  return band ? `Today's GPS Kids speaking challenge (${B.name}, ages ${B.ages}): "${it.p}" Can you answer it out loud in ${it.s} seconds? 🎤`
    : "GPS Kids Speak: a free 1-minute speaking challenge for kids, every day. 🎤";
}
function resultText() { return `I did today's GPS Kids speaking challenge: ${PL.overall(result.a.pct)}% and a ${result.streak}-day streak 🔥 Can you beat me?`; }
function shareRow(el, text, withCard, opts = {}) {
  const url = opts.url || shareUrl(), msg = text + " " + url;
  const cBlob = opts.card ? opts.card.blob : cardBlob, cUrl = opts.card ? opts.card.url : cardUrl;
  el.innerHTML = (navigator.share ? `<button type="button" class="sh native" data-a="native">${ICON.share}Share</button>` : "") +
    `<a class="sh wa" href="https://wa.me/?text=${encodeURIComponent(msg)}" target="_blank" rel="noopener">${ICON.wa}WhatsApp</a>` +
    `<a class="sh" href="sms:?&body=${encodeURIComponent(msg)}">${ICON.sms}Text</a>` +
    `<button type="button" class="sh" data-a="copy">${ICON.link}Copy link</button>` +
    (withCard ? `<a class="sh" href="${cUrl}" download="gpskids-speak-card.png">${ICON.save}Save card</a>` : "");
  el.onclick = async (e) => {
    const sh = e.target.closest(".sh");
    if (sh) { count("shared"); TR.track("share", null, sh.dataset.a === "native" ? "native" : sh.dataset.a === "copy" ? "copy" : sh.classList.contains("wa") ? "wa" : sh.hasAttribute("download") ? "card" : "sms"); }
    const b = e.target.closest("[data-a]"); if (!b) return;
    if (b.dataset.a === "native") {
      const data = { title: "GPS Kids Speak", text, url };
      if (withCard && cBlob) { const f = new File([cBlob], "gpskids-speak-card.png", { type: "image/png" }); if (navigator.canShare && navigator.canShare({ files: [f] })) data.files = [f]; }
      try { await navigator.share(data); } catch (err) {}
    } else {
      try { await navigator.clipboard.writeText(url); toast("Link copied!"); } catch (err) { prompt("Copy this link:", url); }
    }
  };
}
document.addEventListener("click", (e) => {
  if (!e.target.closest("[data-share]")) return;
  const pn = view === "v-pitch" || PNA;
  const text = pn ? pnShareText() : (view === "v-fb" || view === "v-share") && result ? resultText() : challengeText();
  $("sheet-text").textContent = text;
  shareRow($("sheet-row"), text, false, pn ? { url: pnUrl() } : {});
  $("sheet").hidden = false; $("sheet-close").focus();
});
$("sheet-close").addEventListener("click", () => { $("sheet").hidden = true; });
$("sheet").addEventListener("click", (e) => { if (e.target.id === "sheet") $("sheet").hidden = true; });
document.addEventListener("keydown", (e) => { if (e.key === "Escape") { $("sheet").hidden = true; $("modal").hidden = true; } });

/* ---------- PREVIEW (?voice=1): voice coach, follow-up question, funny twist, peek at tomorrow, Family duel ---------- */
const FREE_ASK_PER_DAY = 1; // free tier: 1 coach follow-up a day (Pro later: more). Server abuse cap is separate (/api/reply).
const ASK_MAX_SECS = 20;
const K_ASK = "gks_ask";
function askLeft() { const a = load(K_ASK, {}); return FREE_ASK_PER_DAY - (a.date === today ? a.n : 0); }
function useAsk() { const a = load(K_ASK, {}), n = a.date === today ? a.n : 0; store(K_ASK, { date: today, n: n + 1 }); }
const rateFor = (b = band) => (b === "sprouts" ? 0.88 : b === "explorers" ? 0.94 : 1);
const tomorrowItem = () => promptAt(band, todayIndex(addDays(today, 1), 0));
const FALLBACK_ASK = { math: "How would you explain your answer to a younger kid?", story: "What do you think happens next in your story?",
  explain: "What is the most surprising part of how it works?", persuade: "What would you say if someone disagreed with you?",
  intro: "What is one thing you would love to learn this year?", impromptu: "Can you give me one more example?",
  pitch: "Who would be the very first person to say yes?", toast: "What is one more moment you could have mentioned?",
  kidtalk: "How would you check that your kid understood?", sayno: "How would you say it if they asked twice?",
  feedbk: "What would a great next step look like?" };

function paintVoiceBits() {
  const on = vOn(), showHear = on && V.canSpeak() && !V.textOnly();
  document.querySelectorAll("[data-voice]").forEach((el) => { el.hidden = !on; });
  document.querySelectorAll("[data-ios]").forEach((el) => { el.hidden = !(on && isIOS); });
  $("hear-btn").hidden = !showHear; $("rec-hear").hidden = !showHear;
  if (on && band && item) {
    const t = tomorrowItem(), T = TYPES[t.type];
    const txt = `👀 Peek at tomorrow: ${T.emoji} ${T.label}. “${t.p.length > 90 ? t.p.slice(0, 88).replace(/\s+\S*$/, "") + "…" : t.p}”`;
    $("peek").textContent = txt; $("fb-peek").textContent = txt + " Come back to try it!";
  }
}
function hearPrompt() {
  V.unlock();
  const T = TYPES[item.type], tw = round === "twist" ? " Your twist: " + twistFor(item).text : "";
  V.sayBrowser(`${T.label}. ${item.p}${tw} Talk for ${item.s} seconds.`, { rate: rateFor() });
}
$("hear-btn").addEventListener("click", hearPrompt);
$("rec-hear").addEventListener("click", hearPrompt);

/* Kid feedback (v3,  Oct 8): score + 3 coach tips ("What I heard" collapsed), Hear my coach, Coach asks, ONE streak pill,
   then Beat it tomorrow + Challenge a friend. Talk stats, Fix next, playback, puzzle answer, twist, grown-up duel, peek, share card,
   Try again go behind one small "More" link (collapsed). Grown-ups and Pitch Night keep the full layout (More open, no link).
   No words heard = no score/tips, so More opens by itself (Try again + playback in view). */
const FB_EXTRAS = ["stats", "fixnext", "fb-play", "answer"];
function fbLayout(noWords) {
  const full = PNA, coach = document.querySelector("#v-fb .coach"); // Oct 17 2026: grown-ups get the same one-CTA finish (extras under More)
  if (full) { ["stats", "fixnext", "fb-play"].forEach((id) => coach.before($(id))); coach.after($("answer")); }
  else FB_EXTRAS.forEach((id) => $("fb-more-body").insertBefore($(id), $("fb-hooks")));
  $("v-fb").classList.toggle("kid", !full);
  $("fb-more-btn").hidden = full; $("fb-more").open = full || !!noWords;
  $("fb-share").hidden = !full;
  $("class-switch").hidden = !CLASS_CODE; $("fb-sum").hidden = !isAdult(); // kids: the streak pill is the only streak (no "1-day streak / Come back tomorrow" card)
}
$("fb-more").addEventListener("toggle", () => { if ($("fb-more").open && !$("fb-more-btn").hidden) TR.track("more_open", null, "fb"); });
// Kid funnel, finish step: the first finish = Challenge a friend. From the 2nd finished talk, a kid with no account yet gets
// "Make your account to win prizes" instead (the account IS the leaderboard join), but only after a finish that EARNED points
// (never right under a Practice line). Phone points never move to the board. A kid with an account goes back to Challenge a friend.
function saveTime(r) { return !!r && !r.first && !!r.earned && !isAdult() && !PNA && !CLASS_CODE && r.round === "" && !pzMe() && ptsLog().n >= 2; }
function paintHooks() {
  const r = result, on = vOn() && r && (!r.noWords || r.effort);
  $("fb-hooks").hidden = !on;
  const save = saveTime(r); $("save-btn").hidden = !save;
  $("friend-btn").hidden = !on || r.round !== "" || save;
  $("fb-main").classList.toggle("duo", !$("friend-btn").hidden); // Challenge a friend = big primary, Beat it tomorrow = second button
  paintOffer();
  if (!on) return;
  $("twist-btn").hidden = r.round !== ""; $("twist-preview").hidden = r.round !== "";
  $("twist-preview").textContent = "Same challenge, one silly rule: " + twistFor(r.item).text;
  $("duel-btn").hidden = isAdult() || r.round !== "";
  paintSummary(r);
  paintVoiceBits();
}
$("twist-btn").addEventListener("click", () => { TR.track("retry", null, "twist"); V.stop(); openRec(mode === "typed" ? "typed" : "audio", mode !== "typed", true, "twist"); });

/* coach talks back */
function coachSpeech() {
  const n = (result && result.note) || {}, ask = result.ask && !result.asked ? " Here's my question for you. " + result.ask : "";
  return (n.well || []).join(" ") + " Try this next time: " + (n.next || "") + ask;
}
function paintVoiceCoach(wantAsk) {
  const r = result;
  $("vcoach").hidden = false;
  $("hear-coach").hidden = V.textOnly() || !V.canSpeak() && !r.neural;
  $("hear-coach").textContent = "▶ Hear my coach";
  r.ask = wantAsk ? (r.note.ask || FALLBACK_ASK[r.item.type] || FALLBACK_ASK.impromptu) : "";
  $("ask-box").hidden = !r.ask;
  $("ask-q").textContent = r.ask; $("ask-status").textContent = ""; $("ask-reply").hidden = true;
  $("ask-btn").disabled = false; $("ask-btn").textContent = "🎤 Answer coach"; $("ask-typed").hidden = true; $("ask-type").hidden = false;
  paintVoiceBits();
}
$("hear-coach").addEventListener("click", async () => {
  const btn = $("hear-coach");
  if (btn.dataset.playing === "1") { V.stop(); btn.dataset.playing = ""; btn.textContent = "▶ Hear my coach"; return; }
  V.unlock(); // inside the tap: iPhone only allows sound that starts from a user gesture
  btn.dataset.playing = "1"; btn.textContent = "■ Stop coach";
  count("coach_heard"); TR.track("coach_heard");
  const myId = result.id;
  await V.say(coachSpeech(), { neural: result.neural, rate: rateFor() });
  if (result && result.id === myId) { btn.dataset.playing = ""; btn.textContent = "▶ Hear my coach again"; }
});

/* one follow-up answer: max 20 s, transcribed by /api/transcribe (audio dropped there, and never stored on the device) */
let ask = { stream: null, rec: null, chunks: [], t0: 0, tick: null, busy: false };
function askStopAll() {
  clearInterval(ask.tick);
  if (ask.rec && ask.rec.state !== "inactive") { ask.rec.onstop = null; try { ask.rec.stop(); } catch (e) {} }
  if (ask.stream) ask.stream.getTracks().forEach((t) => t.stop());
  ask = { stream: null, rec: null, chunks: [], t0: 0, tick: null, busy: false };
}
async function askStart() {
  if (!result || result.asked || ask.busy) return;
  if (!canRecord) { $("ask-type").click(); return; }
  V.stop(); V.unlock(); V.session("play-and-record");
  ask.busy = true; $("ask-btn").disabled = true; $("ask-status").textContent = "Tap Allow so Coach can hear you 🎤";
  try { ask.stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true, channelCount: 1 } }); }
  catch (e) { askStopAll(); $("ask-btn").disabled = false; $("ask-status").textContent = "The mic isn't available. You can type your answer instead."; $("ask-typed").hidden = false; return; }
  const m = pickMime();
  try { ask.rec = new MediaRecorder(ask.stream, m ? { mimeType: m, audioBitsPerSecond: 32000 } : undefined); } catch (e) { ask.rec = new MediaRecorder(ask.stream); }
  ask.chunks = []; ask.rec.ondataavailable = (ev) => { if (ev.data && ev.data.size) ask.chunks.push(ev.data); };
  ask.rec.onstop = askSend; ask.rec.start(1000); ask.t0 = Date.now();
  $("ask-btn").disabled = false; $("ask-btn").textContent = "■ Stop"; $("ask-btn").classList.add("stop");
  $("ask-status").textContent = "🔴 Coach is listening… answer out loud.";
  ask.tick = setInterval(() => { const s = (Date.now() - ask.t0) / 1000; if (s >= ASK_MAX_SECS) askStop(); }, 250);
}
function askStop() {
  if (!ask.rec || ask.rec.state === "inactive") return;
  clearInterval(ask.tick); ask.secs = (Date.now() - ask.t0) / 1000;
  try { ask.rec.stop(); } catch (e) {}
  if (ask.stream) { ask.stream.getTracks().forEach((t) => t.stop()); ask.stream = null; } // mic fully off before Coach talks
  $("ask-btn").classList.remove("stop"); $("ask-btn").disabled = true; $("ask-btn").textContent = "Coach is listening…";
}
async function askSend() {
  const type = (ask.rec && ask.rec.mimeType) || "audio/webm";
  let blob = new Blob(ask.chunks, { type }); const secs = ask.secs || 1; ask.chunks = []; ask.rec = null;
  V.session("playback");
  let text = "";
  try {
    if (blob.size >= 1000) {
      const r = await fetch("/api/transcribe", { method: "POST", headers: { "content-type": type.split(";")[0], "x-seconds": String(Math.round(secs)) }, body: blob });
      const j = await r.json().catch(() => ({})); text = r.ok ? String(j.text || "").trim() : "";
    }
  } catch (e) {}
  blob = null; // the answer recording is dropped right away (never saved on the device)
  askStopAll();
  if (!/[A-Za-z0-9]/.test(text)) { $("ask-btn").disabled = false; $("ask-btn").textContent = "🎤 Try again"; $("ask-status").textContent = "I couldn't hear that. Try once more closer to the mic, or type it."; return; }
  return askReply(text);
}
async function askReply(answer) {
  if (!result || result.asked) return;
  const myId = result.id;
  $("ask-btn").disabled = true; $("ask-status").textContent = "Coach is thinking…";
  let line = "";
  try {
    const r = await fetch("/api/reply", { method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ band, i: result.item.i, ask: result.ask, answer: answer.slice(0, 600) }) });
    const j = r.ok ? await r.json().catch(() => ({})) : {}; line = r.ok && j.line ? j.line : "";
  } catch (e) {}
  if (!result || result.id !== myId) return;
  if (!line) line = isAdult() ? "Thanks for answering. That was a clear, thoughtful reply." : "Great answer! Thanks for telling me more.";
  result.asked = true; useAsk(); count("coach_answered"); TR.track("coach_answered");
  const xpAll = load(K.xp, {}); xpAll[band] = (xpAll[band] || 0) + 10; store(K.xp, xpAll);
  if (result) paintSummary(result);
  const lg = load(dKey(K.log), {}); lg[today] = (lg[today] || 0) + 10; store(dKey(K.log), lg);
  $("ask-reply").hidden = false; $("ask-reply").textContent = "🧑‍🏫 " + line;
  $("ask-status").textContent = "Thanks for answering Coach!"; $("ask-btn").hidden = false; $("ask-btn").textContent = "✅ Answered"; $("ask-btn").disabled = true;
  $("ask-typed").hidden = true; $("ask-type").hidden = true;
  toast("Nice answer 🎉");
  V.say(line, { neural: result.neural, rate: rateFor() }); // audio was unlocked by the Answer/Stop/Send tap
}
$("ask-btn").addEventListener("click", () => { if (ask.rec && ask.rec.state === "recording") { V.unlock(); askStop(); } else askStart(); });
$("ask-type").addEventListener("click", () => { $("ask-typed").hidden = false; $("ask-input").focus(); });
$("ask-send").addEventListener("click", () => { const v = $("ask-input").value.trim(); if (!/[A-Za-z0-9]/.test(v)) { $("ask-input").focus(); return; } V.unlock(); askStopAll(); askReply(v); });

/* Family duel: kid finished -> "Challenge your grown-up" -> same prompt -> comparison card with the share/referral link */
let duel = null;
$("duel-btn").addEventListener("click", () => {
  if (!result || isAdult()) return;
  TR.track("family_duel");
  V.stop();
  duel = { kind: "local", band, item: result.item, kid: result.a.stars, kidTotal: totalStars(result.a.stars), gu: null, guTotal: 0, note: null, kl: "🧒 Kid", gl: "🧑 Grown-up" };
  paintDuelPass();
  history.pushState({ v: "duel" }, "", "#duel"); show("v-duel");
});
function duelRec(m) { if (!duel) return; item = duel.item; openRec(m, m === "audio", true, "duel"); }
$("duel-go").addEventListener("click", () => duelRec("audio"));
$("duel-typed").addEventListener("click", () => duelRec("typed"));
$("duel-again").addEventListener("click", () => duelRec(mode === "typed" ? "typed" : "audio"));
$("duel-close").addEventListener("click", () => { duel = null; round = ""; goHome(); });
$("duel-home").addEventListener("click", () => { duel = null; round = ""; goHome(); });
function paintDuelPass(extra = "") {
  const join = duel.kind === "join";
  $("duel-emoji").textContent = join ? "⚔️" : "📱➡️👩‍👧";
  $("duel-h").textContent = join ? "A friend challenged you!" : "Pass the phone to your grown-up!";
  $("duel-title").textContent = join ? "Friend duel" : "Family duel";
  $("duel-kid").innerHTML = `${join ? "👋 Your friend" : "🧒 Kid"}: <b>${duel.kidTotal} / 12 ⭐</b>` + extra;
  $("duel-prompt").textContent = "“" + duel.item.p + "”";
  $("duel-goal").textContent = join ? "Same challenge, same timer. Can you beat it?" : "Same challenge, same timer. Grown-up, can you beat it?";
  $("duel-go").textContent = join ? "🎤 Start" : "🎤 Grown-up, start";
  $("duel-adult-row").hidden = !join; if (join) $("duel-adult").checked = !!duel.adult;
  $("duel-pass").hidden = false; $("duel-result").hidden = true;
}
$("duel-adult").addEventListener("change", () => { if (duel) duel.adult = $("duel-adult").checked; });
const starsObj = (a) => ({ clarity: a[0], pace: a[1], confidence: a[2], structure: a[3] });
const starsArr = (s2) => [s2.clarity, s2.pace, s2.confidence, s2.structure];
async function finishDuel(text, seconds, opts = {}) {
  stopRec(true); V.stop();
  const join = duel.kind === "join";
  // grown-ups use the grown-up pace range; a kid friend uses the challenger's age-band range (same prompt, same goal time)
  const a = analyze(text || "", seconds, join && !duel.adult ? duel.band : "grownups");
  if (a.n < 3) { history.replaceState({ v: "duel" }, "", "#duel"); show("v-duel");
    paintDuelPass(`<br>🙉 I couldn't hear ${join ? "you" : "the grown-up"}. Try again a little louder, or type it.`); return; }
  duel.gu = a.stars; duel.guTotal = totalStars(a.stars); round = "";
  if (join) {
    let j = null;
    try { const r = await fetch("/api/duel", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ op: "finish", id: duel.id, stars: starsArr(a.stars) }) });
      j = await r.json().catch(() => null); if (!r.ok && !(r.status === 409 && j && j.done)) j = null; else if (r.status === 409) j.taken = true; } catch (e) {}
    if (j && j.taken) toast("Someone already took this duel. Here's how you did!");
    else if (j) {
      const xpAll = load(K.xp, {}), mine = band || duel.band; xpAll[mine] = (xpAll[mine] || 0) + DUEL_XP; store(K.xp, xpAll);
      toast("⚔️ Duel done! Your friend will see who won.");
    } else toast("Couldn't reach the duel. Your score is below.");
    TR.track("duel_join", null, j && j.taken ? "taken" : j ? "ok" : "offline", duel.id);
  }
  showDuelResult();
  count("duel_done");
  if (join) return;
  // Coach note for the grown-up (adult tone). Uses one of the device's free AI notes; skipped quietly if none left.
  const ai = load(K.ai, {}), used = ai.date === today ? ai.n : 0;
  if (used >= AI_PER_DAY) return;
  store(K.ai, { date: today, n: used + 1 });
  try {
    const r = await fetch("/api/feedback", { method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ band: duel.band, i: duel.item.i, who: "grownup", transcript: trim2000(text), seconds: Math.round(seconds), wpm: a.wpm, fillers: a.fillers }) });
    const j = r.ok ? await r.json().catch(() => ({})) : {};
    if (j.well && j.next && view === "v-duel") {
      $("duel-coach-list").innerHTML = `<li class="well">${esc(j.well[0])}</li><li class="next"><b>Try next time:</b> ${esc(j.next)}</li>`;
      $("duel-coach").hidden = false;
    }
  } catch (e) {}
}
// Shows the side-by-side result for any duel kind: "local" (pass the phone), "join" (friend opened a link), "sent" (my link came back done).
async function showDuelResult() {
  const k = duel.kidTotal, g = duel.guTotal, L = duel.kl.replace(/^\S+\s/, ""), R = duel.gl.replace(/^\S+\s/, "");
  $("duel-winner").textContent = k > g ? `🏆 ${L} wins! ${k} to ${g} stars` : g > k ? `🏆 ${R} win${R === "You" ? "" : "s"}! ${g} to ${k} stars` : `🤝 It's a tie! ${k} stars each`;
  history.replaceState({ v: "duel" }, "", "#duel"); show("v-duel");
  $("duel-pass").hidden = true; $("duel-result").hidden = false; $("duel-coach").hidden = true;
  $("duel-again").hidden = duel.kind !== "local";
  $("duel-title").textContent = duel.kind === "local" ? "Family duel" : "Friend duel";
  const blob = await drawDuelCard(), url = URL.createObjectURL(blob);
  $("duel-img").src = url;
  $("duel-img").alt = `Duel card: ${L} ${k} of 12 stars, ${R} ${g} of 12 stars`;
  shareRow($("duel-share"), duelText(), true, { card: { blob, url } });
}
function duelText() {
  const k = duel.kidTotal, g = duel.guTotal;
  if (duel.kind === "local") return `Family duel on GPS Kids Speak: Kid ${k}/12 ⭐ vs Grown-up ${g}/12 ⭐ on today's speaking challenge. Can your family beat us?`;
  return `Friend duel on GPS Kids Speak: ${k}/12 ⭐ vs ${g}/12 ⭐ on the same speaking challenge. Want to play? It's free:`;
}
async function drawDuelCard() {
  try { await Promise.all([document.fonts.load('60px "Young Serif"'), document.fonts.load('800 40px "DM Sans"')]); } catch (e) {}
  const W = 1080, H = 1350, c = document.createElement("canvas"); c.width = W; c.height = H;
  const ctx = c.getContext("2d"), T = TYPES[duel.item.type], k = duel.kidTotal, g = duel.guTotal;
  ctx.fillStyle = "#fbf8ef"; ctx.fillRect(0, 0, W, H);
  rrect(ctx, 0, 0, W, 150, 0, "#14213d");
  ctx.fillStyle = "#fff"; ctx.font = `56px ${FONT_SERIF}`; ctx.textBaseline = "middle"; ctx.fillText("GPS Kids", 60, 77);
  const gw = ctx.measureText("GPS Kids ").width; ctx.fillStyle = "#f3bd35"; ctx.fillText("Speak", 60 + gw, 77);
  ctx.font = `800 40px ${FONT_SANS}, ${EMOJI}`; const tag = duel.kind === "local" ? "👨‍👩‍👧 FAMILY DUEL" : "⚔️ FRIEND DUEL", tw = ctx.measureText(tag).width + 56;
  rrect(ctx, W - 60 - tw, 42, tw, 72, 36, "#f3bd35"); ctx.fillStyle = "#14213d"; ctx.fillText(tag, W - 60 - tw + 28, 79);
  ctx.font = `800 34px ${FONT_SANS}, ${EMOJI}`; ctx.fillStyle = "#4c5873"; ctx.fillText(`${T.emoji} ${T.label.toUpperCase()}`, 60, 225);
  let size = 56, lines; ctx.fillStyle = "#14213d";
  do { ctx.font = `${size}px ${FONT_SERIF}`; lines = wrap(ctx, "“" + duel.item.p + "”", W - 120); size -= 2; } while (lines.length * size * 1.22 > 300 && size > 30);
  size += 2; const lh = size * 1.22; let y = 270 + (310 - lines.length * lh) / 2 + lh / 2;
  lines.forEach((l) => { ctx.fillText(l, 60, y); y += lh; });
  const col = (x, label, stars, total, win) => {
    rrect(ctx, x, 610, 450, 470, 36, win ? "#fff4d1" : "#ffffff");
    ctx.strokeStyle = win ? "#f3bd35" : "#dbe3ee"; ctx.lineWidth = win ? 6 : 3; ctx.beginPath(); ctx.roundRect(x, 610, 450, 470, 36); ctx.stroke();
    ctx.textAlign = "center"; ctx.fillStyle = "#14213d"; ctx.font = `800 46px ${FONT_SANS}, ${EMOJI}`; ctx.fillText(label + (win ? " 🏆" : ""), x + 225, 670);
    ctx.font = `86px ${FONT_SERIF}`; ctx.fillText(`${total}`, x + 225, 775); ctx.font = `800 30px ${FONT_SANS}`; ctx.fillStyle = "#4c5873"; ctx.fillText("of 12 stars", x + 225, 838);
    [["Clarity", stars.clarity], ["Pace", stars.pace], ["Confidence", stars.confidence], ["Structure", stars.structure]].forEach(([l, v], j) => {
      const ry = 900 + j * 46; ctx.textAlign = "left"; ctx.font = `800 28px ${FONT_SANS}`; ctx.fillStyle = "#14213d"; ctx.fillText(l, x + 40, ry);
      for (let s2 = 0; s2 < 3; s2++) star(ctx, x + 300 + s2 * 44, ry, 18, s2 < v ? "#f3bd35" : "#d5dce7");
    });
    ctx.textAlign = "left";
  };
  col(60, duel.kl, duel.kid, k, k > g); col(570, duel.gl, duel.gu, g, g > k);
  ctx.textAlign = "center"; ctx.fillStyle = "#14213d"; ctx.font = `800 44px ${FONT_SANS}, ${EMOJI}`;
  const nm = (x) => x.replace(/^\S+\s/, "").toLowerCase();
  ctx.fillText(k > g ? (duel.kind === "local" ? "The kid wins this round!" : nm(duel.kl) === "you" ? "You win this round!" : "Your friend wins this round!")
    : g > k ? (duel.kind === "local" ? "The grown-up wins this round!" : nm(duel.gl) === "you" ? "You win this round!" : "Your friend wins this round!") : "It's a tie!", W / 2, 1140);
  rrect(ctx, 60, H - 150, W - 120, 100, 50, "#1458d4");
  const cta = (duel.kind === "local" ? "Your family's turn: " : "Your turn: ") + location.host;
  let fs = 40; do { ctx.font = `800 ${fs}px ${FONT_SANS}`; fs -= 2; } while (ctx.measureText(cta).width > W - 180 && fs > 20);
  ctx.fillStyle = "#fff"; ctx.fillText(cta, W / 2, H - 99);
  ctx.textAlign = "left";
  return new Promise((res) => c.toBlob((b) => res(b), "image/png"));
}

/* "Challenge a friend" (PREVIEW): any finished challenge -> duel link -> friend takes the same prompt ->
   both see the side-by-side card; both get +DUEL_XP when the friend finishes. The link is the normal referral link
   (?ref=<my code>&b=<band>) plus &d=<duel id>&voice=1. The server keeps only both star scores for 7 days (functions/api/duel.js). */
const DUEL_XP = 20, DUELS_KEY = "gks_duels";
const myDuels = () => { const l = load(DUELS_KEY, []); return Array.isArray(l) ? l : []; };
const duelUrl = (id, b) => location.origin + "/?ref=" + encodeURIComponent(MINE) + "&b=" + b + "&d=" + id + "&voice=1";
/* Oct 9: after a finished KID talk (not grown-ups, Pitch Night, twist or duel rounds, not the class tablet), a small card
   around Challenge a friend offers the duel once per finish. No auto share sheet (that needs a tap). "Maybe later" closes it. */
let offerFor = null, offerOpen = false;
function paintOffer() {
  const r = result, ok = !!r && !$("friend-btn").hidden && !isAdult() && !PNA && (!r.noWords || r.effort) && r.round === "" && !CLASS_CODE && !r.first;
  if (ok && offerFor !== r.id) { offerFor = r.id; offerOpen = true; }
  const on = ok && offerOpen && offerFor === r.id;
  $("fb-offer").hidden = $("friend-btn").hidden; $("fb-offer").classList.toggle("on", on); $("fb-offer-p").hidden = !on; $("fb-offer-x").hidden = !on;
}
function closeOffer() { offerOpen = false; paintOffer(); }
$("fb-offer-x").addEventListener("click", closeOffer);
$("friend-btn").addEventListener("click", () => { if (offerOpen) closeOffer(); });
$("friend-btn").addEventListener("click", async () => {
  if (!result || (result.noWords && !result.effort) || !vOn()) return;
  V.stop();
  const btn = $("friend-btn"), r0 = result;
  let d = myDuels().find((x) => x.rid === r0.id);
  if (!d) {
    btn.disabled = true; btn.textContent = "Making your duel link…";
    try {
      const r = await fetch("/api/duel", { method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ op: "create", band: r0.band, i: r0.item.i, stars: starsArr(r0.a.stars), p: (PROFILES.list.find((q) => q.id === PID) || {}).anon }) });
      const j = r.ok ? await r.json().catch(() => null) : null;
      if (j && j.id) { d = { id: j.id, rid: r0.id, band: r0.band, i: r0.item.i, a: starsArr(r0.a.stars), at: Date.now(), done: false }; store(DUELS_KEY, [d, ...myDuels()].slice(0, 20)); count("duel_sent"); TR.track("duel_sent", null, "friend", j.id); }
    } catch (e) {}
    btn.disabled = false; btn.textContent = "⚔️ Challenge a friend";
    if (!d) { toast("Couldn't make a duel link right now. Try again in a bit."); return; }
  }
  const text = `I got ${totalStars(starsObj(d.a))}/12 ⭐ on a GPS Kids Speak challenge. Can you beat me? Same challenge, about a minute, free:`;
  const url = duelUrl(d.id, d.band);
  // Oct 18 2026: one tap = the phone's own share sheet with the duel link (logged as a share only when it was really sent).
  // Closing the share sheet sends nothing. No share sheet on this phone (or the browser blocked it): the row below
  // with Copy link, WhatsApp and Text (each tap there is logged too).
  if (navigator.share) {
    try {
      await navigator.share({ title: "GPS Kids Speak", text, url });
      count("shared"); TR.track("share", null, "native");
      toast("Sent! Now your friend can try to beat you.");
      return;
    } catch (err) { if (err && err.name === "AbortError") return; }
  }
  $("sheet-text").textContent = text;
  shareRow($("sheet-row"), text, false, { url });
  $("sheet").hidden = false; $("sheet-close").focus();
});
// Sender side: when a sent duel comes back done, add the bonus XP once and show the side-by-side card.
let duelCheckAt = 0;
async function checkDuels(force) {
  if (!vOn() || checkDuels.busy || (!force && Date.now() - duelCheckAt < 60000)) return;
  duelCheckAt = Date.now(); checkDuels.busy = true;
  try { await checkDuelsNow(); } finally { checkDuels.busy = false; }
}
async function checkDuelsNow() {
  const week = Date.now() - 7 * 864e5;
  let list = myDuels().filter((d) => d.at > week || (d.done && !d.claimed));
  for (const d of list.filter((x) => !x.done).slice(0, 5)) {
    try {
      const r = await fetch("/api/duel?id=" + d.id, { cache: "no-store" });
      if (r.status === 404) { d.gone = true; continue; }
      const j = r.ok ? await r.json().catch(() => null) : null;
      if (j && j.done && Array.isArray(j.b)) { d.done = true; d.b = j.b; }
    } catch (e) {}
  }
  list = list.filter((d) => !d.gone);
  const fresh = list.filter((d) => d.done && !d.claimed);
  if (fresh.length) {
    const xpAll = load(K.xp, {});
    for (const d of fresh) { d.claimed = true; xpAll[d.band] = (xpAll[d.band] || 0) + DUEL_XP; count("friend_done", d.id); TR.track("friend_done", null, null, d.id); }
    store(K.xp, xpAll);
    toast(`⚔️ ${fresh.length === 1 ? "A friend" : fresh.length + " friends"} took your duel!`);
    const d = fresh[0];
    if (view === "v-home" && BANDS[d.band]) {
      duel = { kind: "sent", id: d.id, band: d.band, item: itemAt(d.band, d.i), kid: starsObj(d.a), kidTotal: totalStars(starsObj(d.a)),
        gu: starsObj(d.b), guTotal: totalStars(starsObj(d.b)), kl: "🙋 You", gl: "👋 Friend" };
      history.pushState({ v: "duel" }, "", "#duel"); showDuelResult();
    }
  }
  store(DUELS_KEY, list);
}
// Friend side: opened a duel link.
async function openJoin(id) {
  if (myDuels().some((d) => d.id === id)) { TR.track("duel_open", null, "own", id); toast("That's your own duel link. Send it to a friend!"); return; }
  let j = null, st = 0;
  try { const r = await fetch("/api/duel?id=" + id, { cache: "no-store" }); st = r.status; j = r.ok ? await r.json().catch(() => null) : null; } catch (e) {}
  if (!j || !BANDS[j.band]) { TR.track("duel_open", null, st === 404 ? "expired" : "error", id); toast(st === 404 ? "This duel link has expired. Try today's challenge!" : "Couldn't open the duel. Try today's challenge!"); return; }
  const a = starsObj(j.a);
  duel = { kind: "join", id, band: j.band, item: itemAt(j.band, j.i), kid: a, kidTotal: totalStars(a), gu: null, guTotal: 0, kl: "👋 Friend", gl: "🙋 You", adult: isAdult() };
  if (j.done) { TR.track("duel_open", null, "done", id); duel.gu = starsObj(j.b); duel.guTotal = totalStars(duel.gu); toast("Someone already took this duel. Here's the score!"); history.pushState({ v: "duel" }, "", "#duel"); return showDuelResult(); }
  count("duel_joined"); TR.track("duel_open", null, "ok", id);
  history.pushState({ v: "duel" }, "", "#duel"); show("v-duel"); paintDuelPass();
}
// End-of-session summary: streak, duels out, and (in #fb-peek) tomorrow's challenge.
function paintSummary(r) {
  const n = r.streak || 0;
  const pend = myDuels().filter((d) => !d.done).length;
  $("fb-sum").innerHTML =
    `<div class="sum-row"><span>🔥 <b>${n}-day streak</b></span><span>Come back tomorrow for day ${n + 1}!</span></div>` +
    // levels work silently for everyone (Oct 18 2026: points are the only number shown)
    (pend ? `<div class="sum-row"><span>⚔️ <b>${pend} duel${pend === 1 ? "" : "s"} out</b></span><span>See who wins when they finish</span></div>` : "");
}

/* ---------- "Who's playing?" (local players) ---------- */
const P_EMOJI = ["🦊", "🐼", "🦁", "🐸", "🐙", "🦄", "🐯", "🐵", "🐧", "🐢", "🚀", "⚽", "🎨", "🌟", "☕", "🙂"];
const pName = (p) => "Player " + Math.max(1, PROFILES.list.indexOf(p) + 1);
const rawLoad = (k, d) => { try { const v = JSON.parse(rawGet(k)); return v == null ? d : v; } catch (e) { return d; } };
function pStats(p) {
  const b = rawGet(pk("gks_band", p.id)) || "", adult = !!(BANDS[b] && BANDS[b].adult);
  const days = rawLoad(pk(adult ? "gks_days_gu" : "gks_days", p.id), []);
  const xpAll = rawLoad(pk("gks_xp", p.id), {});
  return { band: b, streak: streakOf(Array.isArray(days) ? days : []).n, lv: level((xpAll && xpAll[b]) || 0) };
}
function saveProfiles() { rawSet(P_KEY, PROFILES); }
function switchTo(id) {
  TR.track("profile_pick", null, id === PID ? "same" : "switch");
  try { sessionStorage.setItem("gks_who", "1"); } catch (e) {}
  if (id === PID) { history.replaceState(null, "", location.pathname); route(); return; }
  PROFILES.cur = id; saveProfiles(); V.stop(); TR.flush(true);
  if (CLASS_CODE) { try { sessionStorage.setItem("gks_class_keep", "1"); } catch (e) {} }
  location.replace(location.pathname); // fresh start so every module-level value belongs to the new player
}
function paintWhoChip() {
  const me = PROFILES.list.find((p) => p.id === PID);
  const sub = CLASS_CODE ? "Not you? Switch" : (PROFILES.list.length > 1 ? "Switch player" : "Add a player");
  $("who-btn").innerHTML = `<span class="who-e" aria-hidden="true">${esc(me.emoji)}</span> <b>${esc(pName(me))}</b> <small>${sub}</small>`;
}
let whoEdit = null, whoEmoji = "🦊";
function paintWho() {
  show("v-who");
  $("who-form").hidden = true; $("who-add").hidden = PROFILES.list.length >= P_MAX; $("who-list").hidden = false; $("who-parent").hidden = false;
  $("who-close").hidden = !band;
  $("who-list").innerHTML = PROFILES.list.map((p) => {
    const st = pStats(p), B = BANDS[st.band];
    return `<li class="who-item${p.id === PID ? " on" : ""}"><button type="button" class="who-pick" data-pid="${p.id}"><span class="who-e" aria-hidden="true">${esc(p.emoji)}</span>` +
      `<span class="who-t"><b>${esc(pName(p))}</b><small>${B ? esc(B.name) + " · " : ""}🔥 ${st.streak}</small></span></button>` +
      `<button type="button" class="who-edit" data-edit="${p.id}" aria-label="Edit ${esc(pName(p))}">✏️</button></li>`;
  }).join("");
  $("who-max").hidden = PROFILES.list.length < P_MAX;
}
function openWhoForm(p) {
  whoEdit = p ? p.id : null; whoEmoji = p ? p.emoji : P_EMOJI.find((e) => !PROFILES.list.some((q) => q.emoji === e)) || "🦊";
  $("who-list").hidden = true; $("who-add").hidden = true; $("who-max").hidden = true; $("who-form").hidden = false; $("who-parent").hidden = true;
  $("who-form-h").textContent = p ? "Edit player" : "New player";
  $("who-name").value = p ? p.nickname : ""; $("who-err").textContent = "";
  $("who-del").hidden = !p || p.id === PID || PROFILES.list.length < 2;
  $("who-save").textContent = p ? "Save" : "Add player";
  const wb = $("who-bands"); wb.hidden = false; wb.innerHTML = `<p class="who-band-h">Age group</p>` + bandButtons(p ? p.band : ""); // new and edit: every age group, Grown-ups included
  paintEmojis(); $("who-name").focus();
}
function paintEmojis() {
  $("who-emojis").innerHTML = P_EMOJI.map((e) => `<button type="button" class="who-em${e === whoEmoji ? " on" : ""}" data-em="${e}" aria-label="Avatar ${e}" aria-pressed="${e === whoEmoji}">${e}</button>`).join("");
}
// First name or nickname, kept on this phone only. Short, letters first, no emails/links/long numbers.
function checkName() { return { ok: true, nickname: "" }; }
$("who-btn").addEventListener("click", () => {
  if (CLASS_CODE) { history.pushState({ v: "class" }, "", "#class"); paintClass(); return; } // one tap back to the name grid
  history.pushState({ v: "who" }, "", "#who"); paintWho();
});
$("who-close").addEventListener("click", () => switchTo(PID));
$("who-list").addEventListener("click", (e) => {
  const ed = e.target.closest("[data-edit]"); if (ed) return openWhoForm(PROFILES.list.find((p) => p.id === ed.dataset.edit));
  const b = e.target.closest("[data-pid]"); if (b) switchTo(b.dataset.pid);
});
$("who-parent").addEventListener("click", () => openRole("parent"));
$("who-add").addEventListener("click", () => { if (PROFILES.list.length < P_MAX) openWhoForm(null); });
$("who-emojis").addEventListener("click", (e) => { const b = e.target.closest("[data-em]"); if (b) { whoEmoji = b.dataset.em; paintEmojis(); } });
$("who-bands").addEventListener("click", (e) => { const b = e.target.closest("[data-band]"); if (!b) return; $("who-bands").querySelectorAll(".band").forEach((x) => x.classList.toggle("on", x === b)); });
$("who-cancel").addEventListener("click", () => paintWho());
$("who-name").addEventListener("keydown", (e) => { if (e.key === "Enter") $("who-save").click(); });
$("who-save").addEventListener("click", () => {
  const c = checkName($("who-name").value);
  if (!c.ok) { $("who-err").textContent = c.why; $("who-name").focus(); return; }
  if (whoEdit) {
    const p = PROFILES.list.find((q) => q.id === whoEdit);
    const nb = $("who-bands").querySelector(".band.on"), newBand = nb ? nb.dataset.band : p.band;
    if (BANDS[newBand] && BANDS[newBand].adult && !vOn()) { $("who-err").textContent = "Grown-ups isn't available right now."; return; }
    p.nickname = c.nickname; p.emoji = whoEmoji; p.band = newBand; saveProfiles();
    if (p.id === PID && newBand !== band) { band = newBand; store(K.band, band); TR.track("band_pick", null, band); return goHome(); }
    if (p.id !== PID && newBand) rawSet(pk("gks_band", p.id), newBand); // the age group that player actually loads
    paintWho(); return;
  }
  if (PROFILES.list.length >= P_MAX) return paintWho();
  let n = 1; while (PROFILES.list.some((p) => p.id === "p" + n)) n++;
  const id = "p" + n;
  for (const k of PER_PROFILE) { try { localStorage.removeItem(pk(k, id)); } catch (e) {} } // a fresh start for the new player
  try { Object.keys(localStorage).filter((k) => k.startsWith("gks_c_") && k.endsWith("@" + id)).forEach((k) => localStorage.removeItem(k)); } catch (e) {}
  const nb = $("who-bands").querySelector(".band.on"), chosen = nb ? nb.dataset.band : "";
  if (chosen && BANDS[chosen].adult && !vOn()) { $("who-err").textContent = "Grown-ups isn't available right now."; return; }
  PROFILES.list.push({ id, nickname: c.nickname, emoji: whoEmoji, band: chosen, created_at: Date.now(), kid_id: null, anon: uuid() });
  if (chosen) rawSet(pk("gks_band", id), chosen); // age group picked here
  else { try { sessionStorage.setItem("gks_pickfor", c.nickname); } catch (e) {} } // picker says whose age group
  saveProfiles(); switchTo(id);
});
$("who-del").addEventListener("click", async () => {
  const p = PROFILES.list.find((q) => q.id === whoEdit); if (!p || p.id === PID) return;
  if (!confirm(`Remove ${pName(p)} and all of ${pName(p)}'s progress and recordings from this phone?`)) return;
  for (const k of PER_PROFILE) { try { localStorage.removeItem(pk(k, p.id)); } catch (e) {} }
  await tx("readwrite", (st) => { const c = st.openCursor(); c.onsuccess = () => { const cur = c.result; if (!cur) return; if ((cur.value.pid || "p1") === p.id) cur.delete(); cur.continue(); }; }).catch(() => {});
  PROFILES.list = PROFILES.list.filter((q) => q.id !== p.id); saveProfiles();
  toast(`${pName(p)} removed`); paintWho();
});
// keep the profile's age group in the list in sync (used by the picker labels)
function syncProfileBand() { const me = PROFILES.list.find((p) => p.id === PID); if (me && band && me.band !== band) { me.band = band; saveProfiles(); } }
// With 2+ players, ask "Who's playing?" once per app session (not when a duel link opened the app).
if (!CLASS_CODE && PROFILES.list.length > 1 && !inDuel && !location.hash) { let seen = null; try { seen = sessionStorage.getItem("gks_who"); } catch (e) {} if (!seen) history.replaceState(null, "", "#who"); }


/* ---------- class night: tap your name (no parent, no account) ---------- */
let classEmoji = "🦊";
// Grown-ups (Grown-ups age group) are never kids: never on the class name grid, class report or parent kid list.
const isKidP = (p) => (rawGet(p.id === "p1" ? "gks_band" : "gks_band@" + p.id) || p.band) !== "grownups";
function paintClass() {
  const night = CN.byCode(CLASS_CODE);
  show("v-class");
  $("class-form").hidden = true; $("class-report").hidden = true; $("class-main").hidden = false;
  $("class-sub").textContent = night.label;
  const tiles = PROFILES.list.filter((p) => isKidP(p)).map((p) =>
    `<button type="button" class="class-tile" data-cid="${p.id}"><span class="e" aria-hidden="true">${esc(p.emoji || "🙂")}</span><b>${esc(pName(p))}</b></button>`).join("");
  $("class-grid").innerHTML = tiles + `<button type="button" class="class-tile new" id="class-new"><span class="e" aria-hidden="true">＋</span><b>I'm new</b></button>`;
  paintClass.empty = !tiles; // a brand-new phone: no names here at all
  if (paintClass.empty && !paintClass.auto) { paintClass.auto = true; openClassForm(); } // new phone: straight to "I'm new" (once)

}
function openClassForm() {
  $("class-main").hidden = true; $("class-report").hidden = true; $("class-form").hidden = false;
  $("class-name").value = ""; $("class-err").textContent = "";
  classEmoji = P_EMOJI.find((e) => !PROFILES.list.some((q) => q.emoji === e)) || "🦊";
  $("class-emojis").innerHTML = P_EMOJI.slice(0, 8).map((e) => `<button type="button" class="who-em${e === classEmoji ? " on" : ""}" data-cem="${e}" aria-label="Avatar ${e}">${e}</button>`).join("");
  $("class-cancel").textContent = paintClass.empty ? "Back" : "Back to names";
  $("class-bands").innerHTML = Object.entries(BANDS).filter(([, b]) => !b.adult).map(([id, b]) =>
    `<button type="button" class="band" data-cband="${id}"><span class="e">${b.emoji}</span><span><strong>${esc(b.name)}</strong><small>Ages ${esc(b.ages)}</small></span></button>`).join("");
  $("class-name").focus();
}
function paintClassReport() {
  const night = CN.byCode(CLASS_CODE);
  show("v-class");
  $("class-main").hidden = true; $("class-form").hidden = true; $("class-report").hidden = false;
  const cards = PROFILES.list.filter((p) => isKidP(p)).map((p) => {
    if (!p.code && hasProg(p.id)) ensureCode(p); // every kid who talked has a code (and a Take me home QR)
    const key = (k) => rawGet(p.id === "p1" ? k : k + "@" + p.id);
    let talks = []; try { talks = JSON.parse(key("gks_ntalk") || "[]"); } catch (e) {}
    talks = (Array.isArray(talks) ? talks : []).filter((t) => t && t.d === today);
    let days = []; try { days = JSON.parse(key("gks_days") || "[]"); } catch (e) {}
    let xpAll = {}; try { xpAll = JSON.parse(key("gks_xp") || "{}"); } catch (e) {}
    const bandId = key("gks_band") || p.band || "explorers";
    const xp = (xpAll && xpAll[bandId]) || 0;
    const streak = streakOf(Array.isArray(days) ? days : []).n;
    const best = talks.length ? Math.max(...talks.map((t) => t.o || 0)) : 0;
    const lines = talks.length ? talks.map((t, i) => `<li>Talk ${i + 1}: <b>${t.o}%</b>${t.tip ? " · " + esc(t.tip) : ""}</li>`).join("") : "<li>No talk yet tonight</li>";
    const notes = NT.tidy(p.notes), todayN = notes.filter((n) => n.d === today);
    const text = CN.parentSummary({ name: pName(p), talks, streak }) /* no XP number (Oct 18 2026): it is not the kid's points */ + NT.forParent(notes, today);
    const wa = "https://wa.me/?text=" + encodeURIComponent(text);
    const sms = "sms:?&body=" + encodeURIComponent(text);
    return `<article class="crep"><header><span class="e">${esc(p.emoji || "🙂")}</span><b>${esc(pName(p))}</b></header>` +
      `<p>${talks.length ? talks.length + " talk" + (talks.length > 1 ? "s" : "") + " · best " + best + "%" : "No talk yet"} · 🔥 ${streak}</p>` +
      `<ul>${lines}</ul>` +
      `<div class="crep-notes">${todayN.map((n) => `<span class="cnote">📝 ${esc(n.t)}</span>`).join("")}<button type="button" class="link-btn" data-cnote="${p.id}">📝 ${todayN.length ? "Edit notes" : "Add coach notes"}</button></div>` +
      `<div class="crep-share"><a class="sh wa" data-sharetext="1" href="${wa}" target="_blank" rel="noopener">WhatsApp</a><a class="sh sms" data-sharetext="1" href="${sms}">Text</a></div>` +
      (p.code ? `<div class="crep-home"><button type="button" class="crep-qr" data-homeqr="${p.id}" aria-label="Take me home QR for ${esc(pName(p))}">${qrSvg(homeLink(p), 132)}</button>` +
        `<p><b>🏠 Take me home</b><small>${esc(pName(p))} scans this with the camera on the home phone to keep the streak. Tap to make it bigger.</small></p></div>` : "") + `</article>`;
  }).join("");
  $("class-report-list").innerHTML = cards || "<p>No kids on this phone yet.</p>";
  $("class-report-h").textContent = night.label; // "Only kids who used this phone" is in the note under it
}
$("v-class").addEventListener("click", (e) => {
  const cn = e.target.closest("[data-cnote]"); if (cn) return openNotes(cn.dataset.cnote);
  const hq = e.target.closest("[data-homeqr]"); if (hq) return openHomeSheet(PROFILES.list.find((p) => p.id === hq.dataset.homeqr), "report");
  const t = e.target.closest("[data-cid]"); if (t) return switchTo(t.dataset.cid);
  if (e.target.closest("#class-new")) return openClassForm();
  const em = e.target.closest("[data-cem]"); if (em) { classEmoji = em.dataset.cem; $("class-emojis").querySelectorAll(".who-em").forEach((x) => x.classList.toggle("on", x === em)); return; }
  const bd = e.target.closest("[data-cband]"); if (bd) return classJoin(bd.dataset.cband); // one tap on the age = join the class
});
$("class-cancel").addEventListener("click", () => paintClass());
$("class-report-btn").addEventListener("click", () => paintClassReport());
$("class-kids").addEventListener("click", () => { history.replaceState(null, "", location.pathname + location.search); paintClass(); window.scrollTo(0, 0); }); // class phone: the kids' home is the names
// I'm new: tap the age group to join. No name is collected. A player number stays on this phone for next time.
function classJoin(chosen) {
  const c = checkName();
  if (PROFILES.list.length >= P_MAX) { $("class-err").textContent = "This phone is full. Ask the coach."; return; }
  let n = 1; while (PROFILES.list.some((p) => p.id === "p" + n)) n++;
  const id = "p" + n;
  for (const k of PER_PROFILE) { try { localStorage.removeItem(k + "@" + id); } catch (e) {} }
  PROFILES.list.push({ id, nickname: c.nickname, emoji: classEmoji, band: chosen, created_at: Date.now(), kid_id: null, anon: uuid() });
  rawSet("gks_band@" + id, chosen);
  saveProfiles(); TR.track("class_join", null, chosen); switchTo(id);
}
$("class-name").addEventListener("keydown", (e) => { if (e.key === "Enter") { e.preventDefault(); $("class-name").blur(); } });

/* ---------- kid code + "Take me home" (DEVICE-ONLY: progress moves inside a link's #fragment, never through our server) ----------
   After a player's first talk they get a friendly code (ROAR-4821) saved on their player on this phone. "Take me home" shows a QR
   of gpskids.app/#home=<progress>; the home phone's camera opens it and the app asks "Bring your progress here?". */
const meP = () => PROFILES.list.find((p) => p.id === PID);
const hasProg = (id) => { const g = (k) => rawLoad(pk(k, id), null); const xp = g("gks_xp"); return (Array.isArray(g("gks_days")) && g("gks_days").length > 0) || (Array.isArray(g("gks_days_gu")) && g("gks_days_gu").length > 0) || (!!xp && Object.values(xp).some((n) => n > 0)); };
function ensureCode(p = meP()) { if (!p || p.code) return false; p.code = KC.makeCode(); saveProfiles(); return true; }
function snapOf(p) {
  const g = (k, d) => { const v = rawLoad(pk(k, p.id), d); return v == null ? d : v; };
  const arr = (v) => (Array.isArray(v) ? v : []), obj = (v) => (v && typeof v === "object" && !Array.isArray(v) ? v : {});
  const path = {}; for (const [b, v] of Object.entries(obj(g("gks_path", {})))) if (BANDS[b]) path[b] = PA.ensure(v);
  const bt = obj(g("gks_beat", {}));
  return { name: "", emoji: p.emoji || "🙂", band: rawGet(pk("gks_band", p.id)) || p.band || "", code: p.code || "",
    days: arr(g("gks_days", [])), daysGu: arr(g("gks_days_gu", [])), xp: obj(g("gks_xp", {})), badges: arr(g("gks_badges", [])),
    path, beat: bt.date && Number.isInteger(bt.o) ? { date: bt.date, o: bt.o } : null, notes: NT.tidy(p.notes) };
}
const homeLink = (p) => KC.linkFor(location.origin, snapOf(p));
// Layer 2 (paid families, later): KC.sync is off today, so this sends nothing.
function syncPush(p = meP()) { try { if (p && KC.sync.enabled(p)) KC.sync.push(p, snapOf(p)); } catch (e) {} }
function qrSvg(text, px = 240) {
  const q = qrcode(0, "M"); q.addData(text); q.make();
  const n = q.getModuleCount(), m = 4, size = n + 2 * m; let d = "";
  for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) if (q.isDark(r, c)) d += `M${c + m} ${r + m}h1v1h-1z`;
  return `<svg class="qr" viewBox="0 0 ${size} ${size}" width="${px}" height="${px}" role="img" aria-label="QR code" shape-rendering="crispEdges"><rect width="${size}" height="${size}" fill="#fff"/><path d="${d}" fill="#000"/></svg>`;
}
// Kids see the streak and their challenge points (gks_pts: same rules as the leaderboard, Oct 17 2026), never XP or levels.
// A grown-up player has no challenge points, so the line shows only the streak (Oct 18 2026: XP is never shown as a number).
const snapLine = (s, pts = 0) => {
  const adult = !!(BANDS[s.band] && BANDS[s.band].adult), list = adult ? s.daysGu : s.days, st = streakOf(list).n;
  return (st ? `🔥 ${st}-day streak` : list.length ? `✅ ${list.length} practice day${list.length === 1 ? "" : "s"}` : "✅ Ready to go") + (!adult && pts ? " · ⭐ " + nf(pts) + " points" : "");
};
// Home (More): the button + a soft line with the code. Existing players with progress get their code here.
function paintHomeCode() {
  const me = meP(); if (!me) return;
  if (!me.code && hasProg(PID)) ensureCode(me);
  $("home-btn").hidden = !me.code; $("kcode").hidden = !me.code;
  if (me.code) $("kcode").textContent = "🎟️ Your kid code: " + me.code;
}
// Feedback: the first time, a soft note with the new code; in class, a gentle "Take me home" nudge.
function paintFbHome(newCode) {
  const me = meP(), cls = !!CLASS_CODE && !PNA && !!(me && me.code);
  $("kc-note").hidden = !(newCode && me && me.code) || cls;
  if (newCode && me) $("kc-note").textContent = `🎟️ New! Your kid code is ${me.code}. It's saved on this phone.`;
  $("home-nudge").hidden = !cls;
  if (cls) $("home-nudge").innerHTML = `<b>🏠 Take me home</b><small>Keep your ${newCode ? "new " : ""}streak on your home phone${newCode ? " · code " + esc(me.code) : ""}</small>`;
}
let homeFor = null;
function openHomeSheet(p, where) {
  if (!p) return; ensureCode(p); homeFor = p;
  const s = snapOf(p), url = KC.linkFor(location.origin, s);
  $("home-h").textContent = "🏠 Take me home" + (s.name ? ", " + s.name : "");
  $("home-qr").innerHTML = qrSvg(url, 248);
  $("home-who").innerHTML = `${esc(s.emoji)} ${esc(snapLine(s))}<small>🎟️ Kid code: ${esc(p.code)}</small>`;
  $("home-link").hidden = true; $("home-link").value = url;
  $("home-sheet").hidden = false; TR.track("home_qr", null, where);
}
const closeHome = () => { $("home-sheet").hidden = true; homeFor = null; };
$("home-btn").addEventListener("click", () => openHomeSheet(meP(), "home"));
$("home-nudge").addEventListener("click", () => openHomeSheet(meP(), "fb"));
$("home-close").addEventListener("click", closeHome);
$("home-sheet").addEventListener("click", (e) => { if (e.target.id === "home-sheet") closeHome(); });
$("home-send").addEventListener("click", async () => {
  if (!homeFor) return;
  const url = homeLink(homeFor), nm = (homeFor.nickname || "").trim();
  if (navigator.share) {
    try { await navigator.share({ title: "GPS Kids Speak", text: (nm ? nm + "'s" : "My") + " GPS Kids progress. Open this on the home phone:", url }); TR.track("home_link", null, "native"); return; }
    catch (e) { if (e && e.name === "AbortError") return; }
  }
  try { await navigator.clipboard.writeText(url); TR.track("home_link", null, "copy"); toast("Link copied. Open it on your home phone."); return; } catch (e) {}
  $("home-link").hidden = false; $("home-link").select(); TR.track("home_link", null, "show");
});
// New phone: "Welcome back, Maya! Bring your progress here?" One big Yes. Merge safely (union / bigger number, nothing doubled).
function paintWelcome() {
  if (!HOME_IN.ok) {
    TR.track("home_import", null, "bad");
    history.replaceState(null, "", location.pathname); route();
    toast("That link didn't work. Ask for a new Take me home QR."); return;
  }
  const s = HOME_IN.snap, t = KC.findTarget(PROFILES.list, s, hasProg);
  show("v-welcome");
  $("welcome-e").textContent = s.emoji || "🙂";
  $("welcome-h").textContent = s.name ? `Welcome back, ${s.name}!` : "Welcome back!";
  $("welcome-sum").textContent = snapLine(s);
  const wn = NT.tidy(s.notes);
  $("welcome-notes").hidden = !wn.length;
  $("welcome-notes").innerHTML = wn.length ? "<b>📝 Coach notes</b>" + wn.map((n) => `<span class="cnote">${esc(n.t)} <small>(${esc(n.d)})</small></span>`).join("") : "";
  const full = t.how === "new" && PROFILES.list.length >= P_MAX;
  $("welcome-yes").hidden = full; $("welcome-q").hidden = full;
  $("welcome-err").hidden = !full;
  if (full) $("welcome-err").textContent = `This phone already has ${P_MAX} players. Remove one in Who's playing, then scan again.`;
}
function importHome() {
  const s = HOME_IN.snap, t = KC.findTarget(PROFILES.list, s, hasProg);
  let p;
  if (t.how === "new") {
    if (PROFILES.list.length >= P_MAX) { TR.track("home_import", null, "full"); return paintWelcome(); }
    let n = 1; while (PROFILES.list.some((q) => q.id === "p" + n)) n++;
    const id = "p" + n;
    for (const k of PER_PROFILE) { try { localStorage.removeItem(pk(k, id)); } catch (e) {} } // a clean slate for the new player
    p = { id, nickname: s.name, emoji: s.emoji || "🙂", band: s.band, created_at: Date.now(), kid_id: null, anon: uuid(), code: s.code };
    PROFILES.list.push(p);
  } else {
    p = PROFILES.list.find((q) => q.id === t.id);
    if (t.how === "blank") { p.nickname = s.name; if (s.emoji) p.emoji = s.emoji; }
  }
  const fresh = t.how === "new" || t.how === "blank"; // a fresh player takes the link's age group; an existing one keeps their own
  const local = fresh ? KC.emptySnap() : snapOf(p);
  const m = KC.merge(local, s);
  if (!p.code) p.code = s.code;
  else if (p.code !== s.code) p.codes = [...new Set([...(Array.isArray(p.codes) ? p.codes : []), s.code])].slice(-5); // remember it: the next scan finds this player
  const put = (k, v) => rawSet(pk(k, p.id), v);
  put("gks_days", m.days);
  if (m.daysGu.length) put("gks_days_gu", m.daysGu);
  const xpRaw = fresh ? {} : rawLoad(pk("gks_xp", p.id), {});
  put("gks_xp", { ...(xpRaw && typeof xpRaw === "object" ? xpRaw : {}), ...m.xp });
  if (m.badges.length) put("gks_badges", m.badges);
  const allP = fresh ? {} : rawLoad(pk("gks_path", p.id), {}), outP = allP && typeof allP === "object" && !Array.isArray(allP) ? { ...allP } : {};
  for (const [b, v] of Object.entries(m.path)) outP[b] = PA.ensure({ ...v, cur: outP[b] && outP[b].cur }); // the in-progress retry stays local
  put("gks_path", outP);
  if (m.beat) put("gks_beat", m.beat);
  if (m.notes.length) p.notes = m.notes;
  const bandNow = fresh ? m.band : rawGet(pk("gks_band", p.id)) || m.band;
  if (bandNow && BANDS[bandNow]) { put("gks_band", bandNow); p.band = bandNow; }
  saveProfiles(); syncPush(p);
  TR.track("home_import", null, t.how);
  try { sessionStorage.setItem("gks_welcome", s.name || "1"); sessionStorage.setItem("gks_who", "1"); } catch (e) {}
  PROFILES.cur = p.id; saveProfiles(); V.stop(); TR.flush(true);
  if (CLASS_CODE) { try { sessionStorage.setItem("gks_class_keep", "1"); } catch (e) {} }
  location.replace(location.pathname); // always a fresh start (even for this same player) so every value is the merged one
}
$("welcome-yes").addEventListener("click", importHome);
$("welcome-no").addEventListener("click", () => { TR.track("home_import", null, "no"); history.replaceState(null, "", location.pathname); route(); });

/* voice settings sheet */
function paintVSheet() {
  $("vs-on").checked = !V.textOnly();
  const sel = $("vs-voice"), list = V.englishVoices(), cur = V.chosenVoice();
  sel.innerHTML = list.length ? list.map((v) => `<option value="${esc(v.name)}"${cur && cur.name === v.name ? " selected" : ""}>${esc(v.name)} (${esc(v.lang)})${v.localService ? "" : " · online"}</option>`).join("") : '<option value="">Device default</option>';
  sel.disabled = !V.canSpeak();
  const left = V.neuralLeft();
  $("vs-note").textContent = !V.canSpeak() ? "This browser has no built-in voice. Coach's words are always on screen." :
    VS.neural && left > 0 ? `Your first ${left} more session${left === 1 ? "" : "s"} use our studio voice for Coach, then this device voice.` : "Coach uses this device's voice.";
}
$("vset-btn").addEventListener("click", () => { paintVSheet(); $("vsheet").hidden = false; });
$("vs-close").addEventListener("click", () => { $("vsheet").hidden = true; paintVoiceBits(); });
$("vsheet").addEventListener("click", (e) => { if (e.target.id === "vsheet") { $("vsheet").hidden = true; paintVoiceBits(); } });
$("vs-on").addEventListener("change", () => { V.setTextOnly(!$("vs-on").checked); if (!$("vs-on").checked) V.stop(); });
$("vs-voice").addEventListener("change", () => V.setVoice($("vs-voice").value));
$("vs-test").addEventListener("click", () => { V.unlock(); V.sayBrowser("Hi! I'm your speaking coach. Let's give it a go!", { rate: rateFor() }); });

// Server switch: the preview features show only when /api/voice says on (kill switch: lib/voice.js).
const vReady = VLOCAL ? fetch("/api/voice", { cache: "no-store" }).then((r) => r.json()).then((j) => { VS = { on: !!j.on, neural: !!j.neural }; }).catch(() => {}) : Promise.resolve();
vReady.then(() => {
  if (isAdult() && !vOn()) band = null; // grown-ups mode needs the preview switch
  if (VLOCAL && (view === "v-home" || view === "v-pick" || !view)) route();
  if (inDuel && vOn() && band) openJoin(inDuel); else checkDuels(true);
});


/* ---------- Kids Pitch Night (prelims): home card or /pitch -> entry form -> record a 1-minute pitch (same recorder, cues,
   transcription and coach) -> feedback + "Submit my pitch" -> confirmation. The ONE place the app stores personal info and
   audio, and only when the parent submits (POST /api/pitch). The form is also remembered on this phone (gks_pitch) so a
   family can re-record; the consent box is ticked fresh each time. A pitch take never counts toward streaks/XP. ---------- */
const PN_KEY = "gks_pitch";
let pnForm = null, pnSent = null, pnText = "";
const pnUrl = () => location.origin + "/pitch";
const pnShareText = () => "Kids Pitch Night by GPS Kids. Practice a 1-minute pitch. Tips stay on this phone.";
const pnDraft = () => { const d = rawLoad(PN_KEY, {}); return d && typeof d === "object" ? d : {}; };
const pnBannerText = () => (pnForm ? `${pnForm.kid}, age ${pnForm.age} · 1 minute · you can re-record` : "1 minute · you can re-record");
function pnExit() { if (!PNA) return; PNA = false; band = pnBand0; pnBand0 = null; }
// Home card: "Enter" until entries close (Sun Nov 1, 11:59:59 PM ET), then finals mode through Sat Nov 7 (end of day ET), then gone.
function pnCard() {
  const el = $("pn-card"), now = Date.now(), open = PN.isOpen(now), finals = !open && now <= Date.parse(PN.SHOW_UNTIL);
  el.hidden = !open && !finals;
  el.classList.toggle("finals", finals);
  if (finals) { el.querySelector("small").textContent = "Practice a pitch. Tips stay on this phone."; el.querySelector(".pn-go").textContent = "Details ›"; }
  $("pn-finals").hidden = true;
}
$("pn-card").addEventListener("click", () => { history.pushState({ v: "pitch" }, "", "#pitch"); route(); });
(() => { const sel = $("pn-age"); for (let a = 5; a <= 17; a++) sel.insertAdjacentHTML("beforeend", `<option value="${a}">${a}</option>`); })();
$("pn-consent-t").textContent = PN.CONSENT;
if (PN.EVENT.map) $("pn-map").href = PN.EVENT.map;
const PN_FIELDS = ["parent", "email", "kid", "age", "phone"];
function pnPaint() {
  pnExit();
  const open = PN.isOpen(), sent = !!pnSent;
  $("pn-form").hidden = !open || sent || !pnGateOK();
  $("pn-gate").hidden = !open || sent || pnGateOK(); // store app only: the entry form sits behind the grown-up check
  $("pn-closed").hidden = open; if (!open) pnCard(); // fills the finals line (through Sat Nov 7)
  $("pn-done").hidden = !open || !sent;
  if (open && !sent) {
    const d = pnDraft();
    for (const k of PN_FIELDS) { const el = $("pn-" + k); if (!el.value && d[k] != null) el.value = String(d[k]); }
  }
  if (sent) {
    $("pn-done-p").textContent = "Nice pitch. The tips stay on this phone. We do not keep a name or a recording.";
    $("pn-again").hidden = !(pnSent.left > 0);
    shareRow($("pn-share"), pnShareText(), false, { url: pnUrl() });
  }
  show("v-pitch");
  TR.track("pn_open", null, !open ? "closed" : sent ? "done" : "open");
}
/* Store app (native shell, see speak-native): the Pitch Night entry form asks for a parent's contact details, so Apple Kids /
   Play Families rules want it behind the grown-up check. The web site is unchanged (no shell = no gate). */
function inStoreApp() { return !!(window.GPSKidsApp && window.GPSKidsApp.native && window.Capacitor && window.Capacitor.nativePromise); }
var pnGatePassed = false; // var + function declarations: safe even if Pitch Night paints before this line runs
function pnGateOK() { return pnGatePassed || !inStoreApp(); }
$("pn-gate-btn").addEventListener("click", async () => {
  let ok = false;
  try { const r = await window.Capacitor.nativePromise("ParentGate", "ask", { reason: "Pitch Night entries are for grown-ups." }); ok = !!(r && r.ok); } catch (e) {}
  if (!ok) return;
  pnGatePassed = true; $("pn-gate").hidden = true; $("pn-form").hidden = false; $("pn-parent").focus();
});
const pnStarted = () => { if (!pnStage) { pnStage = "form"; TR.track("pn_form"); } };
$("pn-form").addEventListener("focusin", pnStarted);
window.addEventListener("pagehide", () => { if (pnStage) { TR.track("pn_abandon", null, pnStage); pnStage = ""; TR.flush(true); } });
function pnErrors(errs) {
  document.querySelectorAll("#pn-form [data-err]").forEach((p) => { p.textContent = errs[p.dataset.err] || ""; });
  PN_FIELDS.concat("consent").forEach((k) => $("pn-" + k).setAttribute("aria-invalid", errs[k] ? "true" : "false"));
}
$("pn-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  if (!pnGateOK()) return;
  if (!(await grownUp("Pitch practice is saved on this phone by a grown-up."))) return;
  pnStarted();
  const f = Object.fromEntries(PN_FIELDS.map((k) => [k, $("pn-" + k).value]));
  f.consent = $("pn-consent").checked;
  const c = PN.checkForm(f);
  pnErrors(c.errors);
  if (!c.ok) { const k = PN_FIELDS.concat("consent").find((x) => c.errors[x]); if (k) $("pn-" + k).focus(); return; }
  const v = c.v;
  rawSet(PN_KEY, { parent: v.parent, email: v.email, kid: v.kid, age: v.age, phone: v.phone });
  pnForm = v;
  pnRecord();
});
// a field's error clears as soon as it is fixed
$("pn-form").addEventListener("input", (e) => {
  const k = e.target.name, p = k && document.querySelector(`#pn-form [data-err="${k}"]`);
  if (!p || !p.textContent) return;
  const f = Object.fromEntries(PN_FIELDS.map((x) => [x, $("pn-" + x).value])); f.consent = $("pn-consent").checked;
  const msg = PN.checkForm(f).errors[k] || "";
  p.textContent = msg; e.target.setAttribute("aria-invalid", msg ? "true" : "false");
});
function pnRecord() {
  if (!PN.isOpen()) { history.replaceState(null, "", location.pathname + "#pitch"); return route(); }
  if (!pnForm) { history.replaceState(null, "", location.pathname + "#pitch"); pnSent = null; return route(); }
  if (!PNA) { pnBand0 = band; PNA = true; }
  pnStage = "record";
  band = PN.bandForAge(pnForm.age);
  item = { ...PN.ITEM };
  history.replaceState(null, "", location.pathname + "#pitch");
  openRec("audio", false); // pushes #speak (back = the form); no autostart, so the kid can read the prompt and the 4 cues first
}
const pnCanSend = () => PNA && !!result && !result.noWords && !!audioBlob;
function pnFeedback(text) {
  pnText = String(text || "");
  pnStage = "feedback";
  ["fb-hooks", "card-btn", "premium-btn", "reward"].forEach((id) => { $(id).hidden = true; });
  document.querySelector("#v-fb .voice-privacy").hidden = true; // its "Nothing is saved" is not true for a submitted pitch
  $("pn-submit").hidden = false; $("pn-send-err").hidden = true;
  $("again-btn").textContent = "🎤 Record again";
  const can = pnCanSend();
  $("pn-send").disabled = true;
  $("pn-send").textContent = can ? "⏳ Coach is scoring…" : "Keep this pitch on this phone";
  $("pn-sub-p").textContent = can ? "Tips stay on this phone. Nothing is uploaded. Tap Record again to try once more."
    : "We need a recording with words we can hear. Tap Record again and speak close to the mic.";
}
function pnReady() { if (!PNA || $("pn-submit").hidden) return; document.querySelector("#v-fb .voice-privacy").hidden = true; $("pn-send").disabled = !pnCanSend(); $("pn-send").textContent = "Keep this pitch on this phone"; }
const PN_FAIL = {
  closed: "Sorry, entries closed on Sun, Nov 1.",
  not_open: "Pitch Night entries aren't open yet. Please try again soon.",
  limit: "Too many entries from this connection today. Please try again tomorrow.",
  max_subs: `This entry was already sent ${PN.MAX_SUBS} times, the most we allow. Your latest pitch is the one we judge.`,
  invalid: "Some details need fixing. Tap ✕ to go back to the form.",
  too_large: "That recording is too big. Please record a shorter pitch (1 minute).",
};
$("pn-send").addEventListener("click", async () => {
  if (!pnCanSend() || !pnForm) return;
  const btn = $("pn-send");
  btn.disabled = true; btn.textContent = "Saved on this phone";
  pnSent = { kid: "", subs: 1, left: 0 };
  TR.track("pn_local"); pnStage = "";
  if (navigator.vibrate) navigator.vibrate([40, 60, 80]);
  history.replaceState(null, "", location.pathname + "#pitch");
  route();
});
$("pn-close").addEventListener("click", goHome);
$("pn-closed-home").addEventListener("click", goHome);
$("pn-done-home").addEventListener("click", () => {
  if (!band && pnForm) { band = PN.bandForAge(pnForm.age); store(K.band, band); } // first-time visitors land in the kid's age group
  pnSent = null; goHome();
});
$("pn-again").addEventListener("click", () => { pnSent = null; pnRecord(); });
$("pn-another").addEventListener("click", () => { pnSent = null; pnForm = null; pnStage = ""; $("pn-kid").value = ""; $("pn-age").value = ""; $("pn-consent").checked = false; pnPaint(); $("pn-age").focus(); });

/* ---------- Buddy play (buddy.js) ---------- */
BD.init({ show, goHome, esc, track: TR.track, band: () => band || "explorers",
  players: () => [] });
route.buddyResume = BUDDY_IN;
$("buddy-btn").addEventListener("click", () => { history.pushState({ v: "buddy" }, "", "#buddy"); BD.open("home"); });
$("class-buddy").addEventListener("click", () => { history.pushState({ v: "buddy" }, "", "#buddy"); BD.open("class"); });

/* ---------- Parent teaser "This week in class" (Oct 18 2026): theme + power line only (the full plan is for coaches).
   It sits UNDER the one big button as a small card with a quiet text link, so it never competes with the main button.
   Families already in class (a kid on this phone has coach notes) see the teaser with no link. ---------- */
function weekTeaser(kids) {
  const c = CL.weekClass(iso()); if (!c) return "";
  const inClass = kids.some((p) => NT.tidy(p.notes).length > 0);
  const d = new Date(c.date + "T12:00:00"), when = d.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
  return `<div class="wk-card" id="wk-card"><p class="wk-h">📅 This week in class <small>${esc(when)}</small></p>` +
    `<p class="wk-theme">${esc(c.theme)}</p><p class="wk-line">“${esc(c.line)}”</p>` +
    (inClass ? "" : `<button class="link-btn wk-join" id="wk-join" type="button">Join the class</button>`) + `</div>`;
}
/* ---------- One-stop "Who are you?" (ONE-STOP-PLAN step 1): parent / coach / partner sheets ---------- */
function openRole(role) {
  TR.track("role_pick", null, role);
  let h = "", b = "";
  if (role === "parent") {
    h = "👪 For parents";
    const kids = PROFILES.list.filter((p) => ((p.nickname || "").trim() || hasProg(p.id)) && isKidP(p));
    const rows = kids.map((p) => { const s = snapOf(p), ns = NT.tidy(p.notes);
      return `<li><b>${esc(p.emoji || "🙂")} ${esc(pName(p))}</b><br><small>${esc(snapLine(s, ptsLog(p.id).total))}</small>` +
        (ns.length ? ns.map((n) => `<span class="cnote">📝 ${esc(n.t)} <small>(${esc(n.d)})</small></span>`).join("") : `<span class="cnote"><small>No coach notes yet.</small></span>`) + `</li>`; }).join("");
    b = `<p class="role-p"><b>Your child's progress</b></p>` + (rows ? `<ul class="role-list">${rows}</ul>` :
      `<p class="role-p">No kids on this phone yet. After class, open the "Take me home" link or QR from the coach. Progress and coach notes show up here.</p>`) +
      `<p class="role-p">Coach notes come from class. Nothing is sent to us. It all stays on this phone.</p>` +
      `<button class="btn btn-go role-go" id="role-trial" type="button">🎤 Book a free trial class</button>` + weekTeaser(kids) +
      `<details class="more role-more" id="role-more"><summary class="more-sum" id="role-more-btn">More</summary><div class="more-body">` +
      `<button class="link-btn role-club" id="role-club" type="button">🏫 Classes and sign up</button></div></details>`;
  } else if (role === "coach") {
    h = "🎤 For coaches";
    b = `<p class="role-p">Read the script for each class up to a week before, straight off your phone. After class, open the class report to send each parent a note.</p>` +
      `<button class="link-btn role-go" id="role-report" type="button">📝 Class report</button>` +
      `<p class="role-p">Notes stay on this phone. A grown-up check opens them. There is no shared code.</p>`;
  } else {
    h = "🏫 For partners";
    b = `<p class="role-p">Run GPS Kids at your school or center. The app teaches, scores each kid and gives your coach a word-for-word script. You bring the room and the kids.</p>` +
      (BRAND.contactEmail ? `<a class="btn btn-go role-go" href="mailto:${encodeURIComponent(BRAND.contactEmail)}">✉️ Talk to us</a>` : `<p class="role-p">Add a contact email in brand.js if families should reach you.</p>`);
  }
  $("role-h").textContent = h; $("role-body").innerHTML = b; $("role-sheet").hidden = false;
}
const closeRole = () => { $("role-sheet").hidden = true; };
$("roles").addEventListener("click", (e) => { const r = e.target.closest("[data-role]"); if (r) openRole(r.dataset.role); });
// "Back to kids": one tap from any grown-up screen to the kids' home (first visit: the "tap your age" start)
$("role-kids").addEventListener("click", () => { closeRole(); if (band && view !== "v-pick") goHome(); else window.scrollTo(0, 0); });
$("role-sheet").addEventListener("click", async (e) => {
  if (e.target.id === "role-sheet") return closeRole();
  if (e.target.closest("#role-report")) { closeRole(); location.href = "/?c=" + (CLASS_CODE || "thu") + "#report"; return; }
  if (e.target.closest("#role-club")) { if (CLUB_URL && await grownUp("This opens the club website.", CLUB_URL)) TR.track("club_open", null, "parent"); }
  if (e.target.closest("#role-trial")) { closeRole(); trOpen("parent"); }
  if (e.target.closest("#wk-join")) { closeRole(); trOpen("teaser"); }
});

/* ---------- Book a free trial class (trial.js + functions/api/trial.js). One form, no grown-up check (it is for grown-ups).
   Direct link: /#trial. Nothing is kept on the phone. ---------- */
let trStart = 0;
function trOpen(from) { TR.track("trial_open", null, from); history.pushState({ v: "trial" }, "", "#trial"); trPaint(); }
function trPaint() {
  const sel = $("tr-age");
  if (sel.options.length < 2) for (let a = TRL.AGE_MIN; a <= TRL.AGE_MAX; a++) sel.add(new Option(String(a), String(a)));
  $("tr-form").hidden = false; $("tr-done").hidden = true; $("tr-err").textContent = "";
  trStart = Date.now(); show("v-trial");
}
function trErrors(errs) {
  document.querySelectorAll("#tr-form [data-err]").forEach((p) => { p.textContent = errs[p.dataset.err] || ""; });
  for (const k of ["parent", "phone", "kid", "age"]) $("tr-" + k).setAttribute("aria-invalid", errs[k] ? "true" : "false");
  document.querySelector(".tr-days").setAttribute("aria-invalid", errs.day ? "true" : "false");
  const first = ["parent", "phone", "kid", "age", "day"].find((k) => errs[k]);
  if (first) { const el = first === "day" ? document.querySelector(".tr-day input") : $("tr-" + first); el.focus(); el.scrollIntoView({ block: "center" }); }
}
$("tr-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  if (!(await grownUp("Booking a class is for a grown-up."))) return;
  const fd = new FormData($("tr-form"));
  const f = { parent: fd.get("parent"), phone: fd.get("phone"), kid: "", age: fd.get("age"), day: fd.get("day") || "", website: fd.get("website") || "", ms: Date.now() - trStart };
  const c = TRL.checkTrial(f); trErrors(c.errors); $("tr-err").textContent = "";
  if (!c.ok) return;
  const btn = $("tr-send"); btn.disabled = true; btn.textContent = "Sending...";
  let r = null;
  try { const res = await fetch("/api/trial", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(f) }); r = await res.json().catch(() => null); if (!res.ok && !(r && r.error)) r = { error: "x" }; } catch (err) { r = null; }
  btn.disabled = false; btn.textContent = "✅ Book my free class";
  if (r && r.ok) {
    TR.track("trial_sent", null, c.v.day);
    $("tr-done-s").textContent = `${TRL.DAYS[c.v.day]}\nYour phone: ${TRL.prettyPhone(c.v.phone)}`;
    $("tr-form").hidden = true; $("tr-done").hidden = false; $("tr-form").reset(); window.scrollTo(0, 0); return;
  }
  if (r && r.error === "invalid" && r.fields) return trErrors(r.fields);
  $("tr-err").textContent = r && r.error === "limit" ? "Too many tries today. Please call or text us instead." : "That didn't send. Check your internet and tap again.";
});
const trKids = () => { if (band) goHome(); else { history.replaceState(null, "", location.pathname); route(); } };
$("tr-kids").addEventListener("click", trKids);
// Parent funnel, last step: after booking the trial, the one next step is classes and sign up (club website, after the grown-up check)
$("tr-done-club").addEventListener("click", async () => { if (CLUB_URL && await grownUp("This opens the club website.", CLUB_URL)) TR.track("club_open", null, "thanks"); });

/* ---------- Coach notes (class report): simple coach code once per visit, then tap quick notes or type one ---------- */
let noteFor = null;
const coachIn = () => { try { return sessionStorage.getItem("gks_coach") === "1"; } catch (e) { return false; } };
async function openNotes(id) {
  noteFor = PROFILES.list.find((p) => p.id === id); if (!noteFor) return;
  if (!coachIn()) {
    const ok = await grownUp("Coach notes are for a grown-up.");
    if (!ok) return;
    try { sessionStorage.setItem("gks_coach", "1"); } catch (e) {}
  }
  $("note-h").textContent = "📝 Notes for " + pName(noteFor);
  $("note-sheet").hidden = false; $("note-err").textContent = "";
  $("note-gate").hidden = true; $("note-main").hidden = false; paintNotesSheet();
}
function paintNotesSheet() {
  const ns = NT.tidy(noteFor.notes), mine = ns.filter((n) => n.d === today).map((n) => n.t);
  $("note-chips").innerHTML = NT.QUICK.map((q) => `<button type="button" class="note-chip${mine.includes(q) ? " on" : ""}" data-q="${esc(q)}" aria-pressed="${mine.includes(q)}">${esc(q)}</button>`).join("");
  $("note-list").innerHTML = ns.filter((n) => n.d === today).map((n) => `<li>${esc(n.t)}<button type="button" class="link-btn" data-rm="${esc(n.t)}" aria-label="Remove ${esc(n.t)}">✕</button></li>`).join("");
}
function saveNotes(list) { noteFor.notes = list; saveProfiles(); paintNotesSheet(); }
$("note-code-go").addEventListener("click", () => {
  if (!NT.codeOk($("note-code").value)) { $("note-code-err").textContent = "That code didn't work. Ask GPS Kids for the coach code."; return; }
  try { sessionStorage.setItem("gks_coach", "1"); } catch (e) {}
  TR.track("coach_in"); openNotes(noteFor.id);
});
$("note-code").addEventListener("keydown", (e) => { if (e.key === "Enter") $("note-code-go").click(); });
$("note-chips").addEventListener("click", (e) => {
  const c = e.target.closest("[data-q]"); if (!c) return;
  const q = c.dataset.q, on = NT.tidy(noteFor.notes).some((n) => n.d === today && n.t === q);
  saveNotes(on ? NT.remove(noteFor.notes, today, q) : NT.add(noteFor.notes, today, q).list);
  if (!on) TR.track("coach_note", null, "quick");
});
$("note-add").addEventListener("click", () => {
  const r = NT.add(noteFor.notes, today, $("note-text").value);
  if (!r.ok) { $("note-err").textContent = "Keep it short and simple: words only, no links, emails or phone numbers."; return; }
  $("note-err").textContent = ""; $("note-text").value = ""; saveNotes(r.list); TR.track("coach_note", null, "typed");
});
$("note-text").addEventListener("keydown", (e) => { if (e.key === "Enter") $("note-add").click(); });
$("note-list").addEventListener("click", (e) => { const r = e.target.closest("[data-rm]"); if (r) saveNotes(NT.remove(noteFor.notes, today, r.dataset.rm)); });
const closeNotes = () => { $("note-sheet").hidden = true; noteFor = null; if (!$("class-report").hidden) paintClassReport(); };
$("note-close").addEventListener("click", closeNotes);
$("note-sheet").addEventListener("click", (e) => { if (e.target.id === "note-sheet") closeNotes(); });

route();
// Back from "Bring your progress here?": one soft hello on the player's own home.
{ let w = null; try { w = sessionStorage.getItem("gks_welcome"); sessionStorage.removeItem("gks_welcome"); } catch (e) {}
  if (w) setTimeout(() => toast(w === "1" ? "🎉 Your progress is here!" : `🎉 Your progress is here, ${w}!`), 300); }


/* ---------- Speaking Leaderboard (PREVIEW, prize.js + functions/api/prize.js) ----------
   On the phone (per player): gks_prize = { token, name, shown, ref } once a grown-up joined. The email is never kept on the phone.
   gks_ref = a friend's invite code from a ?friend= link (one per phone). gks_dev = a random id for this phone (duplicate friend checks).
   Only "Today's Scored Challenge" sends a score. Every other turn is Practice and sends nothing. The plan is never sent. */
var pzScoring = false, pzTab = "week", pzBoard = null;
{ const m = /[?&]friend=([a-km-np-z2-9]{8})\b/.exec(location.search); if (m) rawSet("gks_ref", m[1]); } // ?ref= is the kid-code link
function pzDev() { let d = rawGet("gks_dev"); if (!/^[0-9a-f]{32}$/.test(d || "")) { d = Array.from(crypto.getRandomValues(new Uint8Array(16)), (x) => x.toString(16).padStart(2, "0")).join(""); rawSet("gks_dev", d); } return d; }
function pzCounts() { const me = pzMe(); return !PNA && !isAdult() && !!me && me.done !== PZ.etDate(); }
function pzDone() { const me = pzMe(); if (me) store("gks_prize", { ...me, done: PZ.etDate() }); }
function pzStartNote(kid) {
  const el = $("start-note"), me = kid && pzMe(); el.hidden = !me; if (!me) return;
  el.textContent = pzCounts() ? "⭐ Counts for the Leaderboard" : "More tries today are Practice (no points).";
}
function pzMe() { const v = load("gks_prize", null); return v && typeof v.token === "string" ? v : null; }
function pzPost(body) {
  return fetch("/api/prize", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) })
    .then(async (r) => ({ s: r.status, j: await r.json().catch(() => ({})) })).catch(() => ({ s: 0, j: {} }));
}
/* Points on the finish screen (Oct 17 2026, : "Free to play, no opt-in"). Every kid earns points from the first talk, with the
   leaderboard's own rules (PZ.serverStars + PZ.scored: 10 a day, +5 if yesterday too, up to +10 quality; the first finished try of
   the day only, later tries are Practice). No account: kept on this phone (gks_pts). With an account (the grown-up's leaderboard
   join): the SERVER works the points out and confirms them; phone points never move to the board (the rules count server-scored
   challenges only), so an account counts from the day it is made. */
function ptsLog(pid = PID) { const v = rawLoad(pk("gks_pts", pid), null); return v && typeof v === "object" && v.days && typeof v.days === "object" ? { total: +v.total || 0, n: +v.n || 0, days: v.days } : { total: 0, n: 0, days: {} }; }
function ptsPhone(text, seconds, goal) {
  const L = ptsLog(); L.n += 1;
  let out = { practice: true, total: L.total };
  if (L.days[today] == null) {
    const st = PZ.serverStars({ text, seconds, band, goal });
    if (st) { const sc = PZ.scored({ stars: st, didYesterday: L.days[addDays(today, -1)] != null, heard: st.n >= 3 }); L.days[today] = sc.points; L.total += sc.points; out = { ...sc, total: L.total }; }
  }
  for (const k of Object.keys(L.days)) if (k < addDays(today, -60)) delete L.days[k];
  store("gks_pts", L); return out;
}
function ptsPaint(big, sub, practice) { $("pts").hidden = false; $("pts").classList.toggle("practice", !!practice); $("pts-big").textContent = big; $("pts-sub").textContent = sub; }
// Synchronous on purpose: finish() needs to know right away whether this finish earned phone points (result.earned).
function ptsMoment(scoredRun, text, seconds, goal) {
  const me = pzMe();
  if (!me) { // no account yet: points on this phone
    const r = ptsPhone(text, seconds, goal);
    if (r.practice) { ptsPaint("Practice", "Practice: no points today, come back tomorrow!", true); TR.track("pts_view", 0, "practice"); }
    else { ptsPaint(`+${r.points} points!` + (r.streak ? " 🔥" : ""), `You have ${nf(r.total)} points.`); TR.track("pts_view", r.points, "phone"); }
    return r;
  }
  { const L = ptsLog(); L.n += 1; store("gks_pts", L); } // count the talk (Make your account shows from the 2nd)
  ptsLb(me, scoredRun, text, seconds, goal); return null; // with an account: the server confirms (async)
}
async function ptsLb(me, scoredRun, text, seconds, goal) {
  if (!scoredRun) { ptsPaint("Practice", "Practice: no points today, come back tomorrow!", true); TR.track("pts_view", 0, "practice"); return null; }
  ptsPaint("⭐ Saving your points…", "");
  const r = await pzPost({ op: "score", token: me.token, text: String(text).slice(0, 4000), seconds, band, goal });
  if (r.s === 200 || r.s === 409) pzDone();
  if (r.s === 200) {
    TR.track("lb_score"); TR.track("pts_view", r.j.points, "lb");
    ptsPaint(`+${r.j.points} points!` + (r.j.streak ? " 🔥" : ""), "Saved on the leaderboard.");
    const m = await pzPost({ op: "me", token: me.token });
    if (m.s === 200 && m.j.week) $("pts-sub").textContent = `Saved! You have ${nf(m.j.week.points)} points this week.`;
  } else if (r.s === 409) { ptsPaint("Practice", "You already did today's challenge on another phone. Come back tomorrow!", true); TR.track("pts_view", 0, "practice"); }
  else if (r.s === 404) { store("gks_prize", "null"); $("pts").hidden = true; }
  else { ptsPaint("Points not saved", "Couldn't reach the leaderboard. Please try again tomorrow.", true); TR.track("pts_view", 0, "error"); }
  return null;
}
function pzCard(kid) {
  const el = $("pz-card"); el.hidden = !kid || !(pzMe() || myDuels().length); if (el.hidden) return; // kid funnel: the leaderboard comes after Challenge a friend
  $("pz-card-s").textContent = pzMe() ? "Do today's challenge and climb the board!" : "Your first challenge each day counts. Free.";
}
$("pz-card").addEventListener("click", () => { TR.track("prize_open"); history.pushState({ v: "prize" }, "", "#prize"); route(); });
$("pz-close").addEventListener("click", goHome);
$("pz-go").addEventListener("click", () => { if (isAdult()) return; goHome(); $("start-btn").click(); }); // the same one Today's challenge
function pzPaintBoard() {
  const bd = pzBoard && pzBoard[pzTab], me = pzMe();
  $("pz-t-week").classList.toggle("on", pzTab === "week"); $("pz-t-month").classList.toggle("on", pzTab === "month");
  $("pz-bh").textContent = pzTab === "week" ? "🏆 This week" : "🏆 This month";
  $("pz-week").textContent = bd ? "(" + bd.label + ")" : "";
  const rows = (bd && bd.rows) || [];
  $("pz-list").innerHTML = rows.map((r) => `<li${me && me.shown && r.name === me.name ? ' class="me"' : ""}><span><b>${esc(r.name)}</b></span><span class="pz-p">${r.points}</span></li>`).join("");
  $("pz-empty").hidden = rows.length > 0;
}
$("pz-t-week").addEventListener("click", () => { pzTab = "week"; pzPaintBoard(); });
$("pz-t-month").addEventListener("click", () => { pzTab = "month"; pzPaintBoard(); });
async function pzPaint() {
  show("v-prize"); $("v-prize").classList.remove("acct"); $("pz-bar-t").textContent = "Leaderboard";
  const me = pzMe();
  $("pz-gate").hidden = !!me; $("pz-form").hidden = true; $("pz-grown").hidden = !me; $("pz-me").hidden = !me;
  if (me) { $("pz-me-h").textContent = `${me.name} is on the board!`; $("pz-pts").textContent = "…"; $("pz-me-s").textContent = ""; $("pz-go").hidden = true; $("pz-done").hidden = true;
    $("pz-hide").textContent = me.shown ? "Grown-ups: hide from the board" : "Grown-ups: show on the board"; }
  const [st, bd] = await Promise.all([me ? pzPost({ op: "me", token: me.token }) : null,
    fetch("/api/prize", { cache: "no-store" }).then((r) => (r.ok ? r.json() : null)).catch(() => null)]);
  if (view !== "v-prize") return;
  if (st && st.s === 404) { store("gks_prize", "null"); return pzPaint(); }
  pzBoard = bd; pzPaintBoard();
  if (!me) return;
  if (st && st.s === 200) {
    const j = st.j;
    store("gks_prize", { ...me, name: j.name, shown: j.shown, ref: j.ref, done: j.done ? j.today : (me.done === j.today ? me.done : "") });
    $("pz-pts").textContent = j.week.points;
    $("pz-me-s").textContent = `${j.month.points} points this month` + (!j.shown ? " · hidden from the board" : j.week.rank ? ` · #${j.week.rank} this week` : "");
    $("pz-go").hidden = j.done; $("pz-done").hidden = !j.done;
    $("pz-friend").textContent = j.friends ? `🤝 Bring a Friend badge! ${j.friends} friend${j.friends === 1 ? "" : "s"} joined.` : "Bring a friend: +25 points when they join and do a challenge.";
  } else $("pz-me-s").textContent = "Couldn't reach the leaderboard. Try again in a bit.";
}
$("pz-invite").addEventListener("click", async () => {
  const me = pzMe(); if (!me || !me.ref) return;
  const url = location.origin + "/?friend=" + me.ref, text = "Come practice speaking with me on GPS Kids! A grown-up signs you up. It's free.";
  TR.track("lb_invite");
  try { if (navigator.share) { await navigator.share({ title: "GPS Kids", text, url }); return; } } catch (e) { return; }
  try { await navigator.clipboard.writeText(text + " " + url); toast("Link copied! Send it to a friend's grown-up."); } catch (e) { toast(url); }
});
$("pz-start").addEventListener("click", () => { goHome(); $("start-btn").click(); }); // not joined: back into the kid funnel (Today's challenge)
// "Make your account to win prizes" (finish, talk 2+, points earned): grown-up check, then the account form (= the leaderboard join). No other way in.
$("save-btn").addEventListener("click", async () => {
  TR.track("acct_ask"); V.stop();
  if (!(await grownUp("Making your child's account asks for your email."))) return;
  TR.track("acct_open"); history.pushState({ v: "account" }, "", "#account"); acctPaint();
});
async function acctPaint() {
  if (pzMe()) return pzPaint();
  show("v-prize"); $("v-prize").classList.add("acct"); $("pz-bar-t").textContent = "Your account";
  $("pz-gate").hidden = true; $("pz-me").hidden = true; $("pz-grown").hidden = true;
  const me = PROFILES.list.find((p) => p.id === PID) || {};
  $("pz-kid").value = BT.safeName(me.nickname).replace(/[ ]/g, ""); $("pz-init").value = "";
  const sel = $("pz-age"); if (sel.options.length < 3) for (let a = 5; a <= 17; a++) sel.insertAdjacentHTML("beforeend", `<option value="${a}">${a}</option>`);
  $("pz-consent-t").textContent = PZ.CONSENT; $("pz-consent").checked = false; $("pz-show").checked = false;
  document.querySelectorAll("#pz-form [data-err]").forEach((e) => { e.textContent = ""; });
  $("pz-form").hidden = false; $("pz-kid").focus();
}
$("pz-form-x").addEventListener("click", () => { $("v-prize").classList.remove("acct"); goHome(); });
$("pz-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  const ok = $("pz-consent").checked;
  const f = { email: $("pz-email").value, kid: $("pz-kid").value, init: $("pz-init").value, age: $("pz-age").value, adult: ok, consent: ok, show: $("pz-show").checked };
  const c = PZ.checkEntry(f);
  document.querySelectorAll("#pz-form [data-err]").forEach((el) => { el.textContent = c.errors[el.dataset.err] || ""; });
  if (!c.ok) return;
  $("pz-send").disabled = true;
  const r = await pzPost({ op: "enter", ...f, ref: rawGet("gks_ref") || undefined, dev: pzDev() });
  $("pz-send").disabled = false;
  if (r.s !== 200 || !r.j.token) {
    if (r.j.fields) document.querySelectorAll("#pz-form [data-err]").forEach((el) => { el.textContent = r.j.fields[el.dataset.err] || ""; });
    else toast("Couldn't sign up right now. Please try again in a bit.");
    return;
  }
  store("gks_prize", { token: r.j.token, name: r.j.name, shown: !!r.j.shown, ref: r.j.ref });
  $("pz-email").value = "";
  TR.track("prize_enter");
  toast(`🎉 ${r.j.name}'s account is made! Points count on the leaderboard from today.`);
  history.replaceState(null, "", location.pathname + "#prize"); pzPaint();
});
$("pz-hide").addEventListener("click", async () => {
  const me = pzMe(); if (!me) return;
  if (!(await grownUp("The public board is off. We do not show a child's name."))) return;
  const r = await pzPost({ op: "show", token: me.token, show: !me.shown });
  if (r.s === 200) { store("gks_prize", { ...me, shown: r.j.shown }); toast(r.j.shown ? "Now on the board." : "Hidden from the board."); pzPaint(); }
  else toast("Couldn't change that right now. Try again in a bit.");
});
$("pz-leave").addEventListener("click", async () => {
  const me = pzMe(); if (!me) return;
  if (!(await grownUp("Leave this phone's points? This public copy does not store a child's name."))) return;
  const r = await pzPost({ op: "leave", token: me.token });
  if (r.s === 200 || r.s === 404) { store("gks_prize", "null"); toast("Done. We deleted your leaderboard info."); pzPaint(); }
  else toast("Couldn't reach GPS Kids. Try again in a bit.");
});
