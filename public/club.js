// GPS Kids Speak: "This week's club skill" on My path. ONE small weekly config, shared by app.js (browser) and
// functions/api/feedback.js (the coach knows the club prompt + skills), so the server never trusts free text.
// Source: the Tue/Thu in-person class plan (https://club.joingpskids.com/class-plan, repo 369Apps/gps-kids-pages,
// class-plan/<date>/index.html: the theme is in the "class-kicker" line, the skills in the Welcome-circle step of #runData).
// `node tools/club-sync.mjs` reads the latest class plan and says whether this file is behind (and prints a draft entry).
// Kid-facing wording is written here by hand: the class plan is coach-facing (paper, markers, timers).
// Rules: newest last (never reorder or delete: the position is the friend-duel slot); `date` = class day (YYYY-MM-DD, ET).
// "When it fits" (app.js): the latest class on or before today, within FIT_DAYS, becomes a kid's Today's challenge ONCE, on a day
// they haven't played yet, after their first talk has set their level. Kids see no extra screen; the record screen just says "Club skill".
export const SHOW_DAYS = 6;
export const SKILLS = {
  eyes:   { label: "Eyes",   emoji: "👀" },
  voice:  { label: "Voice",  emoji: "📢" },
  pause:  { label: "Pause",  emoji: "⏸️" },
  reason: { label: "Reason", emoji: "💡" },
  hands:  { label: "Hands",  emoji: "🙌" },
};
export const CLUB = [
  { date: "2026-09-24", day: "Thu", theme: "Voice Carries", skills: ["voice", "eyes"], line: "MY VOICE CARRIES!", type: "persuade",
    p: "Sell us the best snack ever in a voice that reaches the back row: a 4, not a scream. Give one reason, then one line we'll remember.",
    py: "Tell us about your favorite snack in a big, clear voice that reaches the back of the room.",
    ex: { hook: "Who wants a snack that never gets soggy?", point: "Crunch Sticks are the best snack ever, because they stay crunchy all day.", example: "I packed some at 8 AM and they still crunched at lunch.", close: "Crunch Sticks: loud, proud, and still crunchy!" } },
  { date: "2026-09-29", day: "Tue", theme: "Pause is Power", skills: ["pause", "eyes"], line: "PAUSE IS POWER!", type: "story",
    p: "Be a news anchor: give us the top story from your week. Say the headline, take one full pause, then tell what happened and why it matters.",
    py: "Be a news reporter! Say one big headline from your week, stop for one second, then tell us what happened.",
    ex: { hook: "Breaking news from my kitchen!", point: "Headline: the cookies are gone. (pause) Here's what happened.", example: "My little brother found the jar on the top shelf by stacking three chairs.", close: "That's the news: hide the cookies higher. Back to you!" } },
  { date: "2026-10-01", day: "Thu", theme: "Make Your Case", skills: ["reason", "pause"], line: "CASE CLOSED!", type: "persuade",
    p: "Your honor: make your case for one new rule at home or at school. Say your claim, pause, then give your reason starting with “because”.",
    py: "Tell us one new rule you'd make at home, then say why with the word “because”.",
    ex: { hook: "Your honor, I have a case to make.", point: "Every Friday should be pajama day, because comfy kids think better.", example: "On pajama day last year, our whole class finished the puzzle early.", close: "So make Friday pajama day. I rest my case!" } },
  { date: "2026-10-06", day: "Tue", theme: "Hands Out of Pockets", skills: ["hands", "reason"], line: "MY HANDS TALK!", type: "persuade",
    p: "Sell us one thing from your room. Pick the word that matters most and give it one big hand gesture. Hands never hide!",
    py: "Show and tell: tell us about one toy, and use your hands to show how big or fast it is!",
    ex: { hook: "Want to see the fastest thing in my room?", point: "My yo-yo is the best toy ever, because it comes back every time.", example: "I can make it sleep for five seconds, then snap it back up.", close: "So get a yo-yo. It always comes back, just like you will!" } },
  { date: "2026-10-08", day: "Thu", theme: "The Full Package", skills: ["eyes", "voice", "pause", "reason", "hands"], line: "I AM THE FULL PACKAGE!", type: "persuade",
    p: "Make your case: what is one thing every kid should get to do? Use the full package: eyes up, a big voice, one pause, a clear reason (say “because”), and hands that talk.",
    py: "Tell us one thing every kid should get to do, and say why with “because”. Big voice, eyes up, hands out!",
    ex: { hook: "What if every kid got one hour a week to build anything they want?", point: "Every kid should get a build hour, because building makes you brave.", example: "Last week I built a cardboard robot. It fell apart twice, and I fixed it.", close: "So give every kid a build hour. I am the full package!" } },
  { date: "2026-10-13", day: "Tue", theme: "Three Beats", skills: ["pause", "eyes"], line: "I AM A STORYTELLER!", type: "story",
    p: "Tell us a true story from your life in three beats: what happened, what you did, and what you learned. Take a pause between each beat and keep your eyes up.",
    py: "Tell us a true story in three parts: what happened, what you did, and what you learned. Stop for a second between parts.",
    ex: { hook: "Let me tell you about the day I got lost at the zoo.", point: "What happened: I stopped to watch the penguins, and when I looked up, my family was gone.", example: "What I did: I took a deep breath, found a zookeeper, and told her my mom's name.", close: "What I learned: when you feel scared, stop, breathe, and ask for help. I am a storyteller!" } },
  // Oct 15: from the reviewed draft speak-app-path/public/club.draft.js (class plan "The Full Speech", Oct 18 2026)
  { date: "2026-10-15", day: "Thu", theme: "The Full Speech", skills: ["eyes", "voice", "pause", "reason", "hands"], line: "I START STRONG, I END STRONG!", type: "story",
    p: "Give us a full speech about a time you tried something new. Start with a hook that grabs us, tell three beats (what happened, what you did, what you learned), then finish with a strong closing line. Eyes up, big voice, one pause, and hands that talk.",
    py: "Tell us about a time you tried something new. Start with a fun first line, tell what happened, and end with a strong last line.",
    ex: { hook: "Have you ever been scared of a bike with no training wheels?", point: "What happened: last summer my dad took my training wheels off, and I fell three times in one minute.", example: "What I did: I got back on, looked far ahead, and kept pedaling. What I learned: falling is just part of learning.", close: "So next time you fall, get back on. I start strong, and I end strong!" } },
  // Oct 20 + Oct 22: the approved drafts (club.draft-1020-1022.js,  OK Oct 18 2026). "teaser" is not read by the app yet.
  { date: "2026-10-20", day: "Tue", theme: "Paint the Picture", skills: ["hands", "voice"], line: "I PAINT THE PICTURE!", type: "story",
    teaser: "This week kids learn to paint a picture with words: what you see, hear and smell, so the room feels like it is there.",
    p: "Take us to your favorite place. Start with a first line that pulls us in, then tell us three things: what you see, what you hear, and what you smell. Use your hands to show how big things are. End with one strong last line.",
    py: "Tell us about your favorite place. Say one thing you see, one thing you hear, and one thing you smell there. Show how big it is with your hands!",
    ex: { hook: "Close your eyes. We are at my grandma's kitchen.", point: "It is the best place in the world, because it feels warm the second you walk in.", example: "I see a big pot this wide on the stove. I hear it bubbling. I smell fresh bread.", close: "So if you ever feel cold, go find a kitchen like that. I paint the picture!" } },
  { date: "2026-10-22", day: "Thu", theme: "The Spooky Story", skills: ["voice", "pause"], line: "I KEEP THEM LISTENING!", type: "story",
    teaser: "This week kids tell a not-too-scary story: soft voice for the spooky part, a pause before the surprise, and a strong ending.",
    p: "Tell us a not-too-scary story: a strange sound or shadow that turned out to be something silly. Go soft and slow when it gets spooky, take one big pause right before the surprise, then end with a strong last line.",
    py: "Tell us a silly spooky story: you heard a strange noise, and it was something funny! Talk soft for the spooky part, stop for a second, then say the surprise.",
    ex: { hook: "It was a dark night, and I heard a scratch, scratch, scratch at my door.", point: "I was sure it was a monster, so I hid under my blanket.", example: "The scratching got louder. I opened the door very slowly. (pause) It was my cat, holding a sock.", close: "So the next time you hear a monster, check for a cat first. I keep them listening!" } },
];
const DAY_RE = /^\d{4}-\d{2}-\d{2}$/;
const dayNum = (s) => { const [y, m, d] = s.split("-").map(Number); return Date.UTC(y, m - 1, d) / 864e5; };
export const byId = (id) => CLUB.find((c) => c.date === id) || null;
// The latest class on or before `day` (YYYY-MM-DD), if it was within SHOW_DAYS; otherwise null (no card).
export function clubFor(day, list = CLUB) {
  if (!DAY_RE.test(day || "")) return null;
  let best = null;
  for (const c of list) if (c.date <= day && (!best || c.date > best.date)) best = c;
  return best && dayNum(day) - dayNum(best.date) <= SHOW_DAYS ? best : null;
}
// Parent teaser "This week in class" (Oct 18 2026, : parents get only a teaser, the full plan is for coaches).
// Only real class plans: the class in this Mon-Sun week (ET) that is today or still ahead, else the next class within 7 days,
// else this week's class that already happened. No plan in that window -> null (no card). Never invents a class.
const weekday = (s) => (dayNum(s) + 3) % 7; // 0 = Monday
export function weekClass(day, list = CLUB) {
  if (!DAY_RE.test(day || "")) return null;
  const t = dayNum(day), mon = t - weekday(day);
  const ahead = list.filter((c) => dayNum(c.date) >= t && dayNum(c.date) - t <= 7).sort((a, b) => (a.date < b.date ? -1 : 1));
  if (ahead.length) return ahead[0];
  const past = list.filter((c) => dayNum(c.date) < t && dayNum(c.date) >= mon).sort((a, b) => (a.date < b.date ? 1 : -1));
  return past[0] || null;
}
const YOUNG = new Set(["sprouts", "explorers"]);
// Friend duels store a prompt number 0-127 (functions/api/duel.js); daily prompts use 0-34, so club classes use 100-127 (a slot per class).
export const DUEL_BASE = 100, DUEL_SLOTS = 28;
export const duelI = (c) => DUEL_BASE + (CLUB.indexOf(c) % DUEL_SLOTS);
export function byDuelI(i, day = "9999-12-31") {
  if (!Number.isInteger(i) || i < DUEL_BASE || i >= DUEL_BASE + DUEL_SLOTS) return null;
  let best = null;
  CLUB.forEach((c, k) => { if (k % DUEL_SLOTS === i - DUEL_BASE && c.date <= day && (!best || c.date > best.date)) best = c; });
  return best;
}
// The challenge item (same shape as prompts.js items): Sprouts/Explorers get the short version. Talk time: the kid's level
// picks it (app.js passes s); without one, 30 s for young kids and 60 s for older kids.
export function clubItem(c, band, s = 0) {
  const young = YOUNG.has(band);
  return { type: c.type, label: "Club skill: " + c.theme, p: young ? c.py : c.p, s: s || (young ? 30 : 60), i: duelI(c), club: c.date, theme: c.theme, skills: c.skills, ex: c.ex };
}
