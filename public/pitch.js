// Kids Pitch Night (prelims): shared by the browser (app.js) and the Pages Functions (functions/api/pitch*.js).
// Pure data + validation, no side effects. Pitch tips stay on this phone. The server does not store a name or a recording.
export const PROMPT = "Pitch an idea, product or invention that would make life better. Tell us the problem, your idea, why it works, and ask us to say yes.";
export const SECS = 60;                 // talk goal (1-minute pitch)
export const MAX_SECS = 65;             // recording stops by itself at 1:05 (small grace so nobody is cut off mid-word)
export const MAX_SUBS = 5;              // submissions per parent email + kid name (latest one wins)
export const MAX_AUDIO = 3 * 1024 * 1024;
export const MAX_FINALISTS = 12;
export const CLOSES = "2026-11-02T04:59:59Z"; // Sun Nov 1, 2026, 11:59:59 PM ET (EST: clocks fall back that morning)
export const SHOW_UNTIL = "2026-11-08T04:59:59Z"; // home card: finals mode after entries close, gone after Sat Nov 7, 11:59:59 PM ET (EST)
export const closeAt = (env) => Date.parse((env && env.PITCH_CLOSES) || CLOSES);
export const isOpen = (now = Date.now(), env) => now <= closeAt(env);
export const EVENT = {
  name: "Kids Pitch Night",
  deadline: "Sun, Nov 1",
  results: "Nov 3",
  finals: "Sat, Nov 7, 2-4 PM",
  place: "",
  map: "",
};
// The prompt as a challenge item for the recorder + coach (type "persuade" = same local scoring as a persuade talk).
export const ITEM = Object.freeze({ i: 0, type: "persuade", p: PROMPT, s: SECS, pn: 1, label: "Kids Pitch Night pitch (1 minute)" });
// One worked Hook / Point / Example / Close example, shown as the 4 cues while recording (read-only, nothing typed).
export const EXAMPLE = Object.freeze({
  hook: "Have you ever lost a shoe right before school?",
  point: "My idea is a shoe shelf that beeps when a shoe is missing.",
  example: "Last week my family was late because of one lost shoe. The Beep Shelf would fix that.",
  close: "So please say yes to the Beep Shelf, and never be late again!",
});
export const CONSENT_V = "pn1";
export const CONSENT = "I'm a parent or guardian. Pitch tips stay on this device. GPS Kids does not keep a child's name, photo, or recording.";

export function bandForAge(age) {
  age = Number(age);
  return age <= 7 ? "sprouts" : age <= 10 ? "explorers" : age <= 13 ? "leaders" : "trailblazers";
}
const sq = (s) => String(s == null ? "" : s).replace(/[\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ").trim();
const NAME_RE = /^[\p{L}][\p{L}\p{M}' .-]*$/u;
const EMAIL_RE = /^[^\s@<>()",;:\\[\]]+@[^\s@<>()",;:\\[\]]+\.[a-z]{2,}$/i;
const PHONE_RE = /^\+?[0-9 ().-]{7,22}$/;
const int = (v) => (typeof v === "number" || (typeof v === "string" && /^\d+$/.test(v)) ? Number(v) : NaN);

// The entry form (parent name, email, kid first name, age, optional phone, consent). Same rules on the phone and the server.
// -> { ok, errors: {field: message}, v: cleaned values }
export function checkForm(f) {
  f = f || {};
  const v = { parent: sq(f.parent), email: sq(f.email).toLowerCase(), kid: sq(f.kid), age: int(f.age), phone: sq(f.phone), consent: f.consent === true || f.consent === 1 || f.consent === "1" };
  const e = {};
  if (v.parent.length < 2 || v.parent.length > 60 || !NAME_RE.test(v.parent)) e.parent = "Please enter your name (letters only).";
  if (v.email.length > 120 || !EMAIL_RE.test(v.email)) e.email = "Please enter a real email so we can reach you.";
  if (v.kid) e.kid = "We don't collect a child's name.";
  v.kid = "";
  if (!Number.isInteger(v.age) || v.age < 5 || v.age > 17) e.age = "Pitch practice is for ages 5 to 17.";
  if (v.phone) { const d = v.phone.replace(/\D/g, "").length; if (!PHONE_RE.test(v.phone) || d < 7 || d > 15) e.phone = "Please check the phone number, or leave it empty."; }
  if (!v.consent) e.consent = "Please tick the box. Tips stay on this phone.";
  return { ok: !Object.keys(e).length, errors: e, v };
}
const SCORE_KEYS = ["clarity", "pace", "confidence", "structure"];
export const overall = (s) => Math.round(SCORE_KEYS.reduce((n, k) => n + s[k], 0) / 4);
// The recording's results from the phone (transcript, seconds, words/min, fillers, percent scores, coach source).
export function checkResult(r) {
  r = r || {};
  const e = {}, s = {};
  for (const k of SCORE_KEYS) { const n = int(r.scores && r.scores[k]); if (!Number.isInteger(n) || n < 0 || n > 100) e.scores = "bad scores"; s[k] = n; }
  const v = {
    transcript: String(r.transcript == null ? "" : r.transcript).replace(/[\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ").trim(),
    seconds: int(r.seconds), wpm: int(r.wpm), fillers: int(r.fillers), coach: r.coach === "ai" ? "ai" : "local", scores: s,
  };
  if (v.transcript.length > 3000) e.transcript = "too long";
  if (!Number.isInteger(v.seconds) || v.seconds < 1 || v.seconds > MAX_SECS + 5) e.seconds = "bad seconds";
  if (!Number.isInteger(v.wpm) || v.wpm < 0 || v.wpm > 400) e.wpm = "bad wpm";
  if (!Number.isInteger(v.fillers) || v.fillers < 0 || v.fillers > 300) e.fillers = "bad fillers";
  if (!e.scores) v.overall = overall(s);
  return { ok: !Object.keys(e).length, errors: e, v };
}
export const AUDIO_TYPES = /^audio\/(mp4|m4a|x-m4a|aac|webm|ogg|wav|x-wav|wave|mpeg|mp3)$/;
// Key for "same entry": parent email + kid first name (case-insensitive). Resubmitting replaces the entry.
export const entryKey = (email, kid) => String(email).toLowerCase().trim() + "|" + String(kid).toLowerCase().replace(/\s+/g, " ").trim();
