// GPS Kids Speak: "Plan first" (30/60/90 s to jot Hook/Point/Example/Close notes), the 30/60/90 s talk time, percent scores, and one "Fix next" line. Pure functions only: no storage, no network.
// Used by app.js (browser), functions/api/feedback.js (goal/focus checks) and tests/plan.test.mjs (node).
export const LENS = [30, 45, 60, 90];           // talk time chips (seconds); no choice = DEFAULT_LEN
export const DEFAULT_LEN = 60;
export const PREPS = [30, 60, 90];              // "Plan first" time chips (seconds), chosen separately; no choice = DEFAULT_PREP
export const DEFAULT_PREP = 30;
export const PREP_MAX = 180;                    // "+30s" while planning can be tapped again and again, up to 3:00 of planning in total
export const canAddPrep = (len) => len + 30 <= PREP_MAX;
// Every valid talk goal: prompt defaults (45 included) + 30/60/90 chips + "+30s" taps while talking, up to 5:00. The server accepts only these.
export const GOALS = [30, 45, 60, 90, 120, 150, 180, 210, 240, 270, 300];
export const MAX_TALK = 300;                    // hard recording stop 5:00 (server caps clips at 305 s)
export const canAddTalk = (s) => s + 30 <= MAX_TALK;   // "+30s" while talking: tap again and again up to 5:00 of talk time
export const CATS = ["clarity", "pace", "confidence", "structure"];
export const CAT_LABEL = { clarity: "Clarity", pace: "Pace", confidence: "Confidence", structure: "Structure" };
export const clampLen = (n, d = DEFAULT_LEN) => (LENS.includes(Number(n)) ? Number(n) : d);
export const prepSecs = (n) => (PREPS.includes(Number(n)) ? Number(n) : DEFAULT_PREP);
// How many main points fit: 30 s = 2, 45 s = 2-3, 60 s = 3, 90 s = 3-4. n = bullet slots to prefill.
export function pointsFor(len) {
  if (len <= 30) return { n: 2, label: "2 points" };
  if (len <= 45) return { n: 2, label: "2-3 points" };
  if (len <= 60) return { n: 3, label: "3 points" };
  return { n: 3, label: "3-4 points" };
}
// Linking words needed for 3 structure stars: 2 for a 30 s talk, 3 for longer ones.
export const marksNeeded = (len) => (len <= 30 ? 2 : 3);
// Prefilled bullet lines for the notes box. Sprouts get the easy "First... Then... The end!" version.
export function slotsFor(len, band, type) {
  if (band === "sprouts") return ["First…", "Then…", "The end!"];
  const n = pointsFor(len).n;
  if (type === "math") return ["Answer:", "First,", "Then,", ...(n > 2 ? ["Because"] : []), "So:"].slice(0, n + 2);
  const pts = Array.from({ length: n }, (_, k) => "Point " + (k + 1) + ":");
  return len <= 30 ? [...pts, "Close:"] : ["Opening:", ...pts, "Close:"];
}
export const slotText = (slots) => slots.map((s) => "• " + s + " ").join("\n");
// Lines worth pinning while recording: drop empty template bullets, keep what the speaker actually wrote.
export function noteLines(text, slots = []) {
  const bare = new Set(slots.map((s) => s.replace(/[…:.,!\s]+$/, "").toLowerCase()));
  return String(text || "").split(/\n/).map((l) => l.replace(/^\s*[•*\-–]\s*/, "").trim()).filter((l) => {
    if (!l) return false;
    return !bare.has(l.replace(/[…:.,!\s]+$/, "").toLowerCase());
  }).slice(0, 8);
}

/* ---------- Percent scores (shown instead of stars): "Confidence 80%". Same rules as the 1-3 stars, just finer. ----------
   m = analysis {n,wpm,fillers,stutters,repeat,markers,hedges,ratio}; o = {len, lo, hi, minWords}. Each area 20-100 in steps of 5. */
const r5 = (x) => Math.max(20, Math.min(100, Math.round(x / 5) * 5));
export function percents(m, o) {
  const off = m.wpm < o.lo ? (o.lo - m.wpm) / 25 : m.wpm > o.hi ? (m.wpm - o.hi) / 30 : 0;   // in range = 100
  const pace = m.n < 5 ? 20 : r5(100 - off * 35);
  const rate = m.n ? (m.fillers / m.n) * 100 : 100;                                              // fillers per 100 words
  const clarity = r5(100 - rate * 5 - (m.stutters >= 3 || m.repeat ? 15 : 0));
  let conf = m.ratio >= 0.75 ? 100 : 30 + (m.ratio / 0.75) * 70;                                // reached 3/4 of the goal = 100
  if (m.ratio > 3) conf = 70;
  if (m.hedges >= 2) conf -= 15;
  const need = marksNeeded(o.len), mk = (m.markers || []).length;
  let st = m.parts ? partsPct(m.parts) : 40 + (Math.min(mk, need) / need) * 60;                  // Hook/Point/Example/Close (else linking words)
  if (m.n < (o.minWords || 0)) st = Math.min(st, 80);
  return { clarity, pace, confidence: r5(conf), structure: r5(st) };
}
export const overall = (p) => Math.round((p.clarity + p.pace + p.confidence + p.structure) / 4);
export const GREAT = 85;                        // every area at 85%+ = "great everywhere"

/* ---------- ONE structure framework: Hook, Point, Example, Close (other frameworks are a later unlock) ---------- */
export const HPEC = [["hook", "Hook"], ["point", "Point"], ["example", "Example"], ["close", "Close"]];
export const HPEC_SLOTS = HPEC.map(([, l]) => l + ":");          // for noteLines(): an empty "Hook:" line is not a note
const HPEC_L = Object.fromEntries(HPEC);
// The small hint scales with talk time.
export function hpecHint(len) {
  if (len <= 30) return "One sentence each.";
  if (len <= 60) return "1-2 sentences each.";
  return "1-2 sentences each. Your example can be a short story.";
}
export function hpecPlaceholders(len, young) {
  return { hook: young ? "A question or a fun fact" : "A question or a surprising fact",
    point: young ? "Your big idea" : "Your main idea in one line",
    example: len >= 90 ? "A short story" : (young ? "One thing that happened" : "One real example"),
    close: young ? "Say your big idea again" : "Your point again, in one line" };
}
// Notes are stored as plain lines "Hook: ..." so the old pinned-notes code (noteLines) keeps working.
export const notesToText = (v) => HPEC.map(([k, l]) => (v[k] || "").trim() ? l + ": " + v[k].trim() : "").filter(Boolean).join("\n");
export function textToNotes(t) {
  const v = { hook: "", point: "", example: "", close: "" };
  String(t || "").split(/\n/).forEach((line) => { const m = /^\s*(Hook|Point|Example|Close):\s*(.*)$/.exec(line); if (m) v[m[1].toLowerCase()] = m[2].trim(); });
  return v;
}
// Quick on-phone check of which parts a talk had ("strong" or "missing"). The AI coach can refine this to strong/weak/missing.
export function hpecParts(text) {
  const t = " " + String(text || "").toLowerCase().replace(/[’‘]/g, "'") + " ";
  const sents = t.split(/(?<=[.!?])\s+/).map((s) => s.trim()).filter(Boolean), w = t.match(/[a-z0-9']+/g) || [];
  const head = " " + w.slice(0, 25).join(" ") + " ", tail = " " + w.slice(-25).join(" ") + " ";
  const hook = /\?/.test(sents[0] || "") || /\b(imagine|did you know|have you ever|what if|picture this|guess what|fun fact|believe it or not|raise your hand|who here)\b/.test(head);
  const point = /\b(i think|i believe|in my opinion|my (big )?(idea|point)|the answer is|the (main|big) (idea|reason)|the best|should|because|the reason)\b/.test(t);
  const example = /\b(for example|for instance|such as|like when|one time|once|last (week|year|summer|night)|my (mom|dad|sister|brother|friend|grandma|grandpa|teacher)|let's say|the time)\b/.test(t);
  const close = w.length >= 12 && /\b(so|that's why|that is why|in conclusion|to sum up|finally|in the end|the end|thank you|remember|next time|that's how)\b/.test(tail);
  const s = (x) => (x ? "strong" : "missing");
  return { hook: s(hook), point: s(point), example: s(example), close: s(close) };
}
const PART_VALS = ["strong", "weak", "missing"];
export const validParts = (p) => !!p && typeof p === "object" && HPEC.every(([k]) => PART_VALS.includes(p[k]));
export function partsPct(p) { return Math.max(20, HPEC.reduce((n, [k]) => n + (p[k] === "strong" ? 25 : p[k] === "weak" ? 15 : 0), 0)); }
// One short line naming the best part and the missing/weak one, e.g. "Strong example, but you skipped the close. End with ..."
export function structureFix(p, young) {
  const order = HPEC.map(([k]) => k), miss = order.find((k) => p[k] === "missing") || order.find((k) => p[k] === "weak"), good = order.find((k) => p[k] === "strong");
  if (!miss) return young ? "Hook, point, example, close: you did all 4! Next time, try a longer talk." : "You used all 4 parts: hook, point, example, close. Next time, try a longer talk.";
  const tip = { hook: young ? "Start with a question or a fun fact." : "Open with a question or a surprising fact.",
    point: young ? "Say your big idea: “I think…”" : "State your main point clearly: “I think…”",
    example: young ? "Add one example: “One time…”" : "Add one real example: “For example…”",
    close: young ? "End by saying your big idea again." : "End with a close: your point again, in one line." };
  const name = HPEC_L[miss].toLowerCase(), what = p[miss] === "weak" ? `your ${name} was weak` : `you skipped the ${name}`;
  return (good && good !== miss ? `Strong ${HPEC_L[good].toLowerCase()}, but ${what}. ` : `${what[0].toUpperCase() + what.slice(1)}. `) + tip[miss];
}

/* ---------- ONE "Fix next" line after each try (from the existing star categories + the measured numbers) ---------- */
const ORDER_FIX = ["structure", "confidence", "clarity", "pace"];   // tie-break
const mmss = (s) => { s = Math.max(0, Math.round(s)); return Math.floor(s / 60) + ":" + String(s % 60).padStart(2, "0"); };
const q = (s) => "“" + s + "”";
// P = percent scores {clarity,pace,confidence,structure 20-100} (lowest one is the fix); m = analysis {wpm,fillers,fill,repeat,markers,hedges,ratio,seconds};
// o = {len, lo, hi, young, type}. Returns {cat, text} (cat null when every area has 3 stars).
export function fixNext(P, m, o) {
  const young = !!o.young, len = o.len;
  const worst = [...ORDER_FIX].sort((a, b) => P[a] - P[b])[0];
  if (P[worst] >= GREAT) return { cat: null, text: young ? "Great scores everywhere! Next time, try a longer talk." : "Great scores everywhere. Next time, try a longer talk or a tougher prompt." };
  if (worst === "pace") {
    const slow = m.wpm < o.lo;
    return { cat: "pace", text: young ? `You said ${m.wpm} words a minute. Try ${o.lo}-${o.hi}: ${slow ? "a little faster" : "a little slower, with a breath after each sentence"}.`
      : `You spoke at ${m.wpm} words a minute. Aim for ${o.lo}-${o.hi}: ${slow ? "pick it up a little" : "slow down and breathe after each sentence"}.` };
  }
  if (worst === "clarity") {
    const top = Object.entries(m.fill || {}).sort((a, b) => b[1] - a[1])[0];
    if (m.repeat && (!top || top[1] < 3)) return { cat: "clarity", text: `You said ${q(m.repeat.w)} ${m.repeat.c} times. Swap in a different word next time.` };
    return { cat: "clarity", text: top ? (young ? `${m.fillers} ums (most: ${q(top[0])}). Close your lips and pause instead.` : `${m.fillers} filler words (most: ${q(top[0])} ×${top[1]}). Pause for a beat instead.`)
      : (young ? "Some words got stuck. Slow down and take a quiet pause." : "A few words got stuck or repeated. Pause for a beat instead.") };
  }
  if (worst === "confidence") {
    if (m.ratio > 3) return { cat: "confidence", text: young ? `You talked way past your ${len} seconds. Pick your 2 best ideas.` : `You went well past your ${len}-second goal. Keep your 2 strongest points.` };
    if (m.hedges >= 2) return { cat: "confidence", text: young ? "Skip “I don't know”. Say your big idea like you mean it." : "Drop hedges like “I guess” and “maybe”. Say your point like you mean it." };
    return { cat: "confidence", text: young ? `You spoke ${mmss(m.seconds)} of your ${len} seconds. Add one more example!` : `You spoke ${mmss(m.seconds)} of your ${len}-second goal. Add one more example or reason.` };
  }
  if (validParts(m.parts)) return { cat: "structure", text: structureFix(m.parts, young) };
  const mk = (m.markers || []).filter((x) => x[0] !== "#");
  if (o.type === "math") return { cat: "structure", text: young ? "Say the answer first, then “because” and each step." : "Lead with the answer, then walk through each step with “because”." };
  return { cat: "structure", text: young ? "Use joining words: “First… Then… The end!”" : `${mk.length} linking word${mk.length === 1 ? "" : "s"}. Use ${marksNeeded(len)}+ like “first”, “because”, “finally”.` };
}
