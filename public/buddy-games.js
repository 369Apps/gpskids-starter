// Buddy play: two kids, one phone, no mic, no AI. Pure data + the game state (no page code here, so tests can load it).
// Turns: 0 = first buddy, 1 = second buddy, 2 = both together. Prompts come in 3 paces picked from the age group.
// Ideas from the 369Apps Kids Speaking Coach buddy games, rewritten for GPS Kids.
export const PACE = { sprouts: "short", explorers: "mid", leaders: "long", trailblazers: "long", grownups: "long" };
export const GAMES = [
  { id: "story", title: "Story swap", emoji: "📖", blurb: "Build a story together, one turn each.",
    tip: { short: "Say one short sentence.", mid: "Say one or two sentences.", long: "Talk for about 20 seconds." },
    steps: [
      [0, { short: "Start the story: \"One morning we found a tiny door in the playground...\" What did you see?", mid: "Start the story: \"One morning we found a tiny door in the playground...\" What happened next?", long: "Start the story: \"One morning we found a tiny door in the playground...\" Paint the scene with one big detail." }],
      [1, { short: "Add a funny friend who came out of the door. What do they look like?", mid: "Add a surprise character. Give them one fun detail.", long: "Bring in a surprise character. Give them a detail that hints at a secret." }],
      [0, { short: "Uh oh, a problem! What went wrong?", mid: "A problem shows up. What is it?", long: "Something goes wrong. Make it a real problem for everyone." }],
      [1, { short: "How did you fix it?", mid: "How do you and your buddy fix it?", long: "Solve the problem in a clever way." }],
      [2, { short: "Take turns saying one last sentence to end the story.", mid: "Take turns saying one last sentence to end the story.", long: "Each of you says one last sentence. Make the ending feel great." }],
    ], finish: "You made a story nobody else in the world has!" },
  { id: "word", title: "One-word story", emoji: "🔤", blurb: "A silly story, one word at a time.",
    tip: { short: "Just one word!", mid: "Just one word!", long: "Just one word, but make it count." },
    steps: [
      [0, { short: "Say the first word of a story. Any word!", mid: "Say the first word of a story. Pick one that could go anywhere.", long: "Say the first word of a story. Pick one that sets up something big." }],
      [1, { short: "Add one word.", mid: "Add one word that keeps it going.", long: "Add one word that changes where it goes." }],
      [0, { short: "Add one more word. Silly is great!", mid: "Add one more word. Try to surprise your buddy.", long: "Add one word that makes it stranger." }],
      [1, { short: "Add one more word.", mid: "Add one more word.", long: "Add one more word." }],
      [2, { short: "Keep going, one word each, until the story ends. Then say the whole story together!", mid: "Keep going, one word each, until the story ends. Then say it all together!", long: "Keep going, one word each, until the story ends. Then retell it together in your own words." }],
    ], finish: "That was one wild story!" },
  { id: "invent", title: "Invention duo", emoji: "💡", blurb: "Invent something weird and pitch it.",
    tip: { short: "Say one or two sentences.", mid: "Say two sentences.", long: "Talk for about 20 seconds, like a pitch." },
    steps: [
      [0, { short: "Invent something silly that makes a normal day more fun. What is it?", mid: "Invent something silly that makes a normal day more fun. What is it?", long: "Invent something that fixes an everyday problem in a silly way. What is it?" }],
      [1, { short: "What surprising thing can it do?", mid: "Tell one surprising thing it can do.", long: "Explain one surprising thing it can do, and show how it works." }],
      [0, { short: "Why would people want it?", mid: "Why should people want it? Give one reason.", long: "Make your case: why would people buy it? Give two reasons." }],
      [1, { short: "How much does it cost?", mid: "How much does it cost, and who is it for?", long: "Who is it for, and what does it cost? Make it sound like a deal." }],
      [2, { short: "Make up a name for it. Shout the name together!", mid: "Make up a catchy name. Say it together like an ad!", long: "Pick a catchy name and a slogan. Say them together like a TV ad!" }],
    ], finish: "Best invention pitch of the day!" },
  { id: "trip", title: "Mystery trip", emoji: "🧭", blurb: "Plan a pretend trip somewhere surprising.",
    tip: { short: "Say one short sentence.", mid: "Say one or two sentences.", long: "Talk for about 20 seconds." },
    steps: [
      [0, { short: "Pick a surprise place to visit. Where are you going?", mid: "Pick a surprising place for your trip. Why go there?", long: "Pick a surprising place for your trip and sell it: why go there?" }],
      [1, { short: "What one thing will you bring?", mid: "Pick one unusual thing to bring. Why will it help?", long: "Pick one unusual thing to pack and explain how it will save the day." }],
      [0, { short: "Oh no, a funny problem on the way! What is it?", mid: "A funny problem shows up on the way. What is it?", long: "A funny problem blocks the way. Describe it so we can picture it." }],
      [1, { short: "How do you get past it?", mid: "How do you get past it?", long: "Get past it with the thing you packed." }],
      [2, { short: "Say together: why should everyone come next time?", mid: "Invite everyone along with one exciting sentence each.", long: "Each of you says one exciting sentence to invite everyone on the next trip." }],
    ], finish: "What a trip! Pack your bags for next time." },
];
export const byId = (id) => GAMES.find((g) => g.id === id) || null;
export const paceFor = (band) => PACE[band] || "mid";
export const NAME_RE = /^[\p{L}\p{M}' -]{1,16}$/u;
export function cleanName(n) { const s = String(n || "").replace(/\s+/g, " ").trim(); return NAME_RE.test(s) ? s : ""; }
export const DRAFT_KEY = "gks_buddy", DRAFT_TTL = 24 * 3600e3;
// a new game: names = [first, second] (first names only), band picks the pace
export function start(gameId, names, band, now = Date.now()) {
  const g = byId(gameId), a = cleanName(names && names[0]), b = cleanName(names && names[1]);
  if (!g || !a || !b) return null;
  return { v: 1, g: g.id, n: [a, b], pace: paceFor(band), i: 0, pass: false, at: now };
}
// the screen for this state: { kind: "turn"|"pass"|"done", who, name, prompt, tip, step, of }
export function screen(s) {
  const g = byId(s.g), of = g.steps.length;
  if (s.i >= of) return { kind: "done", text: g.finish, names: s.n, of };
  const [who, p] = g.steps[s.i], name = who === 2 ? s.n[0] + " and " + s.n[1] : s.n[who];
  if (s.pass) return { kind: "pass", who, name, step: s.i + 1, of };
  return { kind: "turn", who, name, prompt: p[s.pace] || p.mid, tip: g.tip[s.pace] || g.tip.mid, step: s.i + 1, of, both: who === 2 };
}
// "Done": next turn. When the next turn is someone else's, show the pass-the-phone screen first.
export function advance(s, now = Date.now()) {
  const g = byId(s.g); if (s.pass) return { ...s, pass: false, at: now };
  const i = s.i + 1; if (i >= g.steps.length) return { ...s, i, pass: false, at: now };
  const cur = g.steps[s.i][0], nxt = g.steps[i][0];
  return { ...s, i, pass: nxt !== cur, at: now };
}
export const isDone = (s) => !!s && byId(s.g) && s.i >= byId(s.g).steps.length;
// a saved game from localStorage: only resume a valid, unfinished one from the last 24 hours
export function revive(raw, now = Date.now()) {
  let s = raw; if (typeof raw === "string") { try { s = JSON.parse(raw); } catch (e) { return null; } }
  if (!s || s.v !== 1 || !byId(s.g) || !Array.isArray(s.n) || s.n.length !== 2 || !s.n.every((x) => cleanName(x) === x)) return null;
  if (!["short", "mid", "long"].includes(s.pace) || !Number.isInteger(s.i) || s.i < 0 || s.i >= byId(s.g).steps.length) return null;
  if (!(now - (s.at || 0) < DRAFT_TTL)) return null;
  return { v: 1, g: s.g, n: s.n, pace: s.pace, i: s.i, pass: !!s.pass, at: s.at };
}
