// Anonymous first-party usage events (see public/steps.js for the full list and functions/api/ev.js for what is stored).
// Each event = [sequence number, step, time, small number, short code, duel id]. Never names, ages, words, audio or text.
// Events are queued in memory and sent in small batches: 4 s after the first one, at 20 events, and when the app is hidden
// or closed (sendBeacon, so leaving is never delayed). Nothing here waits on the network; a failed send is simply dropped.
// Test runs (localStorage gks_test = 1) send nothing, like the daily counts.
import { STEPS, AWAY, MAX_BATCH, MAX_BYTES } from "./steps.js";

const SESSION_GAP = 30 * 60e3;          // hidden longer than this = a new session
const UUID = () => (crypto.randomUUID ? crypto.randomUUID() : "10000000-1000-4000-8000-100000000000".replace(/[018]/g, (c) => (c ^ (crypto.getRandomValues(new Uint8Array(1))[0] & (15 >> (c / 4)))).toString(16)));
let ids = null, q = [], timer = 0, last = "", hiddenAt = 0, off = false;
try { off = localStorage.getItem("gks_test") === "1"; } catch (e) { off = true; }

function session() {
  let s = null;
  try { s = JSON.parse(sessionStorage.getItem("gks_sess") || "null"); } catch (e) {}
  const now = Date.now(), fresh = !s || typeof s.id !== "string" || now - (s.at || 0) > SESSION_GAP;
  if (fresh) s = { id: UUID(), n: 0, at: now };
  return { s, fresh };
}
function save(s) { s.at = Date.now(); try { sessionStorage.setItem("gks_sess", JSON.stringify(s)); } catch (e) {} }
let S = null;
export function init(player, device) {
  ids = { p: player, d: device };
  const r = session(); S = r.s; save(S);
  return r.fresh;
}
export const lastStep = () => last;
// track("rec_end", 58, "tap")  -- v and k optional; x only for duel steps
export function track(step, v, k, x) {
  if (off || !ids || !S || !STEPS.hasOwnProperty(step)) return;
  if (Date.now() - S.at > SESSION_GAP && !AWAY.has(step)) { S = { id: UUID(), n: 0, at: Date.now() }; q.push([S.n++, "app_open", Date.now(), null, "resume", null]); }
  q.push([S.n++, step, Date.now(), v == null ? null : Math.round(v), k == null ? null : k, x == null ? null : x]);
  if (!AWAY.has(step) && step !== "app_back") last = step;
  save(S);
  if (q.length >= 20) flush(false);
  else if (!timer) timer = setTimeout(() => flush(false), 4000);
}
function body(list) { return JSON.stringify({ sid: S.id, p: ids.p, d: ids.d, now: Date.now(), e: list }); }
export function flush(leaving) {
  clearTimeout(timer); timer = 0;
  while (q.length) {
    let list = q.splice(0, MAX_BATCH), b = body(list);
    while (b.length > MAX_BYTES && list.length > 1) { q.unshift(...list.splice(Math.ceil(list.length / 2))); b = body(list); }
    try {
      const blob = new Blob([b], { type: "application/json" });
      if (leaving && navigator.sendBeacon && navigator.sendBeacon("/api/ev", blob)) continue;
      fetch("/api/ev", { method: "POST", body: blob, keepalive: true, headers: { "content-type": "application/json" } }).catch(() => {});
    } catch (e) {}
  }
}
// app hidden / back / closed
document.addEventListener("visibilitychange", () => {
  if (document.hidden) { hiddenAt = Date.now(); track("app_hide", null, last || null); flush(true); }
  else if (hiddenAt) {
    const away = Date.now() - hiddenAt; hiddenAt = 0;
    if (away > SESSION_GAP) { S = { id: UUID(), n: 0, at: Date.now() }; save(S); track("app_open", null, "resume"); }
    else track("app_back");
  }
});
window.addEventListener("pagehide", () => { track("app_close", null, last || null); flush(true); });
