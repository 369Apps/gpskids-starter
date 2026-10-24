// Book a free trial class: one form for grown-ups, after the grown-up check.
// Kept: parent name + phone, the child's age, and the day picked. Never a child's name, email, or photo.
// Place comes from brand.js (empty until a school fills it in).
export const PLACE = (typeof window !== "undefined" && window.GPS_BRAND && window.GPS_BRAND.address) || "";
export const DAYS = { tue: "Tuesday, 6 to 7 PM", thu: "Thursday, 6 to 7 PM" };
export const AGE_MIN = 5, AGE_MAX = 17;
const NAME_RE = /^[\p{L}][\p{L}\p{M} .'-]{0,39}$/u;
const tidy = (s) => String(s == null ? "" : s).replace(/\s+/g, " ").trim();

// Phone: a US number (10 digits, or 11 starting with 1) or an international number written with + (8 to 15 digits).
// Returns "+1XXXXXXXXXX" / "+<digits>" or "" when it is not a real-looking number.
export function cleanPhone(raw) {
  const s = tidy(raw);
  if (!s || s.length > 25 || /[^0-9+().\-\s]/.test(s)) return "";
  const d = s.replace(/\D/g, "");
  if (s.startsWith("+") && !s.startsWith("+1")) return d.length >= 8 && d.length <= 15 ? "+" + d : "";
  const n = d.length === 11 && d[0] === "1" ? d.slice(1) : d;
  if (n.length !== 10 || /^[01]/.test(n) || /^\d{3}[01]/.test(n)) return ""; // area code and exchange can't start with 0 or 1
  return "+1" + n;
}
export const prettyPhone = (p) => (/^\+1\d{10}$/.test(p) ? `(${p.slice(2, 5)}) ${p.slice(5, 8)}-${p.slice(8)}` : p);

// -> { ok, v: { parent, phone, kid, age, day }, errors: { field: "plain message" } }
export function checkTrial(f) {
  f = f || {};
  const v = { parent: tidy(f.parent), phone: cleanPhone(f.phone), kid: tidy(f.kid), age: Number(f.age), day: String(f.day || "") }, e = {};
  if (!NAME_RE.test(v.parent)) e.parent = "Please type your name.";
  if (!v.phone) e.phone = tidy(f.phone) ? "That phone number doesn't look right. Try 10 digits, like 555 010 0123." : "Please type your phone number.";
  if (v.kid) e.kid = "We don't collect a child's name.";
  v.kid = "";
  if (!Number.isInteger(v.age) || v.age < AGE_MIN || v.age > AGE_MAX) e.age = `Please pick your child's age (${AGE_MIN} to ${AGE_MAX}).`;
  if (!DAYS[v.day]) e.day = "Please pick a day.";
  return { ok: !Object.keys(e).length, v, errors: e };
}
// Spam guard (page + server): the hidden "website" box must stay empty and a real person takes at least 3 seconds.
export const MIN_MS = 3000;
export const looksLikeBot = (f) => !!tidy(f && f.website) || !(Number(f && f.ms) >= MIN_MS);
