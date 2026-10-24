// GPS Kids Speak: coach notes per kid (ONE-STOP-PLAN step 1). Pure functions only: no storage, no network, no UI.
// DEVICE-ONLY, like the rest of class mode: a note is saved on the kid's player on the class phone. It reaches the parent
// two ways, both from the coach's own phone: inside the parent text (WhatsApp / Text) and inside the "Take me home" link.
// Nothing is sent to our server. A note is short, plain words: no digits runs, no emails, no links (COPPA: first name only).
export const MAX_NOTES = 5, MAX_LEN = 60;
// The quick notes a first-day coach can tap. Plain actions a kid understands.
export const QUICK = ["Great eye contact", "Speak louder", "Strong start", "Strong end", "Slow down", "Great energy",
  "Brave job today", "Stand tall", "Good pause", "Clear story"];
// There is no shared coach PIN. Notes stay on this device and open after the grown-up check.
export const codeOk = () => false;
export function clean(t) { return String(t || "").replace(/\s+/g, " ").trim(); }
// ok: letters, spaces, simple punctuation; no @, no links, no long numbers, no em dashes
export function okNote(t) {
  t = clean(t);
  return t.length >= 2 && t.length <= MAX_LEN && /^[\p{L}\p{N} '’.,!?-]+$/u.test(t) && /\p{L}/u.test(t) && !/\d{3,}/.test(t) && !/(www|http|\.com)/i.test(t);
}
const ISO = /^\d{4}-\d{2}-\d{2}$/;
// list of {d: "YYYY-MM-DD", t} -> valid, unique, newest last, at most MAX_NOTES
export function tidy(list) {
  const seen = new Set(), out = [];
  for (const n of Array.isArray(list) ? list : []) {
    if (!n || !ISO.test(n.d) || !okNote(n.t)) continue;
    const k = n.d + "|" + clean(n.t).toLowerCase(); if (seen.has(k)) continue;
    seen.add(k); out.push({ d: n.d, t: clean(n.t) });
  }
  out.sort((a, b) => (a.d < b.d ? -1 : a.d > b.d ? 1 : 0));
  return out.slice(-MAX_NOTES);
}
export function add(list, day, text) { if (!okNote(text)) return { ok: false, list: tidy(list) }; return { ok: true, list: tidy([...(list || []), { d: day, t: text }]) }; }
export const remove = (list, day, text) => tidy((list || []).filter((n) => !(n.d === day && clean(n.t) === clean(text))));
// one line for the parent text, newest notes from today
export function forParent(list, day) { const t = tidy(list).filter((n) => n.d === day).map((n) => n.t); return t.length ? " Coach notes: " + t.join(". ") + "." : ""; }
