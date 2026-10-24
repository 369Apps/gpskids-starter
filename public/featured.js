// GPS Kids Speak: a featured free challenge for a few days (, Oct 15 2026: Halloween trash pitch through Oct 31).
// Shared by app.js and functions/api/feedback.js. Prompt number 99 (daily prompts use 0-34, club classes 100-127).
// Kid words for Gap / Process / System: the problem and who it bothers, what you'd do step by step, how it keeps working every year.
export const FEATURED = {
  id: "halloween-trash", from: "2026-10-15", to: "2026-10-31", i: 99, type: "pitch", label: "🎃 Halloween challenge",
  p: "Stop Halloween trash: pitch your idea in 1 minute. What's the problem and who does it bother? What would you do, step by step? How does it keep working every year?",
  py: "Stop Halloween trash! What's the mess, and who does it bother? What would you do? How would it work every year?",
  ex: { hook: "Every November 1st, our street is covered in candy wrappers.", point: "The problem: wrappers blow into yards and the park, and it bothers neighbors, dogs and birds.",
    example: "My idea: put a bright orange Wrapper Bucket at every house that gives out candy. Kids drop wrappers in. On Nov 1, my team empties them.",
    close: "To keep it working every year, the buckets get stored in my garage and the team signs up in October. Let's stop Halloween trash!" },
};
const DAY_RE = /^\d{4}-\d{2}-\d{2}$/;
export const isOn = (day, f = FEATURED) => DAY_RE.test(day || "") && day >= f.from && day <= f.to;
const YOUNG = new Set(["sprouts", "explorers"]);
export const byI = (i) => (i === FEATURED.i ? FEATURED : null);
export function item(band, s = 0, f = FEATURED) {
  const young = YOUNG.has(band);
  return { type: f.type, label: f.label, p: young ? f.py : f.p, s: s || 60, i: f.i, featured: f.id, ex: f.ex };
}
