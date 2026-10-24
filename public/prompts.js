// GPS Kids Speak: prompt bank + deterministic daily rotation.
// Shared by the browser (app.js) and the Pages Function (functions/api/feedback.js). Pure data, no side effects.
export const BANDS = {
  sprouts:      { name: "Sprouts",      ages: "5-7",   emoji: "🌱", target: 30, wpm: [70, 150] },
  explorers:    { name: "Explorers",    ages: "8-10",  emoji: "🧭", target: 45, wpm: [85, 160] },
  leaders:      { name: "Leaders",      ages: "11-13", emoji: "🚀", target: 60, wpm: [100, 165] },
  trailblazers: { name: "Trailblazers", ages: "14-18", emoji: "🔥", target: 90, wpm: [110, 170] },
};
export const TYPES = {
  math:      { label: "Puzzle of the day",    emoji: "🧮", tip: "Say the answer, then say HOW you got it: first, then, because." },
  story:     { label: "Tell a story",         emoji: "📖", tip: "Beginning, middle, end. Make us feel something." },
  explain:   { label: "Explain how it works", emoji: "⚙️", tip: "Go step by step: first, next, last." },
  persuade:  { label: "Persuade me",          emoji: "📣", tip: "Say what you want, give 2 reasons, ask for a yes." },
  intro:     { label: "30-second intro",      emoji: "👋", tip: "Smile, then say one thing you love. You do not need to say your name.", seconds: 30 },
  impromptu: { label: "Impromptu topic",      emoji: "🎲", tip: "Pick a side fast, give one reason and one example." },
  // Grown-ups (GPS Moms & Dads, PREVIEW) challenge types
  pitch:     { label: "60-second pitch",       emoji: "💼", tip: "Who it's for, the problem, your fix, and one proof point.", seconds: 60 },
  toast:     { label: "Toast or short speech", emoji: "🥂", tip: "Open warm, share one specific moment, end with a clear line.", seconds: 45 },
  kidtalk:   { label: "Explain it to your kid", emoji: "🧒", tip: "Short words, one everyday example, then check they got it.", seconds: 60 },
  sayno:     { label: "Say no politely",       emoji: "✋", tip: "Thank them, say no clearly, give one reason, offer another way if you can.", seconds: 30 },
  feedbk:    { label: "Kind, honest feedback", emoji: "🤝", tip: "What happened, why it matters, and one clear next step.", seconds: 45 },
};
// "Grown-ups (GPS Moms & Dads)" mode, PREVIEW only (behind ?voice=1 and the server voice switch). Kept OUT of BANDS so
// parent accounts, leaderboards and the server account code (BAND_IDS) only ever see the four kid groups.
export const GROWNUPS = { grownups: { name: "Grown-ups", ages: "18+", emoji: "☕", target: 60, wpm: [120, 175], adult: true, label: "GPS Moms & Dads" } };
export const ALL_BANDS = { ...BANDS, ...GROWNUPS };
const G = (type, p) => ({ type, p });
export const ADULT_LIST = [
  G("pitch", "Pitch what you do at work in 60 seconds, so someone you just met really gets it."),
  G("toast", "Give a short toast at a good friend's birthday dinner."),
  G("kidtalk", "Explain to your kid why people pay taxes, in words a 9-year-old understands."),
  G("sayno", "Say no, politely and clearly, to a colleague who asks you to take on one more project."),
  G("intro", "Introduce yourself at a school parents' meeting: who you are and one thing you care about."),
  G("story", "Tell the story of a mistake that taught you something useful."),
  G("feedbk", "Give kind but honest feedback to a teammate whose work keeps arriving late."),
  G("kidtalk", "Explain to your kid how the internet works, in under a minute."),
  G("pitch", "Pitch one idea to make your neighborhood better to the local council."),
  G("toast", "Thank a team that just finished a big, hard project."),
  G("sayno", "Turn down a sales call politely in three sentences, then end the call."),
  G("impromptu", "What is one skill every child should learn before 18? Defend your choice."),
  G("persuade", "Ask your manager for a raise: state your case with two clear reasons."),
  G("kidtalk", "Explain to your kid why it is okay to make mistakes."),
  G("story", "Tell your kid the story of how you got your first job."),
  G("intro", "Answer \"So, what do you do?\" in 30 seconds without using your job title."),
  G("pitch", "Pitch a family weekend plan to a tired, unconvinced family."),
  G("sayno", "Say no to your kid's request for more screen time, kindly and firmly."),
  G("impromptu", "Should every family have one screen-free day a week? Take a side."),
  G("toast", "Welcome a new neighbor to the street in 30 seconds."),
];
// One 7-day pattern, repeated 5x = 35 days (10 puzzles + 5 of each other type). Puzzles are the hook, so 2 per week.
export const PATTERN = ["math", "story", "explain", "math", "persuade", "intro", "impromptu"];
export const EXPLAIN_TAIL = " Explain your answer out loud.";

const M = (p, a) => ({ p, a });
export const BANK = {
  sprouts: {
    math: [
      M("You have 3 red apples and 2 green apples. How many apples in all?", "5 apples. 3 + 2 = 5."),
      M("A dog has 4 legs. How many legs do 2 dogs have?", "8 legs. 4 + 4 = 8."),
      M("There are 6 birds on a fence. 2 fly away. How many are left?", "4 birds. 6 - 2 = 4."),
      M("What comes next: 2, 4, 6, 8, ...?", "10. You add 2 each time."),
      M("Which is more: 7 cookies or 5 cookies? How many more?", "7 is more, by 2 cookies."),
      M("A triangle has 3 sides. How many sides do 2 triangles have?", "6 sides. 3 + 3 = 6."),
      M("You have 10 fingers. If you hide 4, how many can you still see?", "6 fingers. 10 - 4 = 6."),
      M("Mia is 6. Her brother is 2 years older. How old is he?", "8 years old. 6 + 2 = 8."),
      M("What comes next: circle, square, circle, square, ...?", "Circle. The shapes take turns."),
      M("5 kids each have 2 shoes. How many shoes in all?", "10 shoes. 2 + 2 + 2 + 2 + 2 = 10."),
    ],
    story: [
      "Tell a story about a puppy who gets lost at the park. How does it get home?",
      "Tell a story about the best day ever. What happened first, next, and last?",
      "Tell a story about a dragon who is scared of the dark.",
      "Tell a story about a time you helped someone.",
      "Tell a story about a magic backpack. What is inside?",
    ],
    explain: [
      "Explain how to brush your teeth, step by step.",
      "Explain how a seed grows into a plant.",
      "Explain how to make your favorite sandwich.",
      "Explain how to be a good friend.",
      "Explain why we wash our hands.",
    ],
    persuade: [
      "Persuade me that your favorite animal is the best animal.",
      "Persuade me to try your favorite food.",
      "Persuade your family to go to the park this weekend.",
      "Persuade me that recess should be longer.",
      "Persuade me to read your favorite book.",
    ],
    intro: [
      "Say hi! Tell me one thing you love. You do not need to say your name.",
      "Introduce yourself like you are meeting a new friend at school. Skip your name.",
      "Tell me your favorite color, food, and game.",
      "Introduce yourself and tell me what you want to be when you grow up.",
      "Introduce yourself like a superhero. What is your super power?",
    ],
    impromptu: [
      "If you could fly for one day, where would you go?",
      "What would you do if you were the teacher for a day?",
      "What is the funniest thing that ever happened to you?",
      "If animals could talk, which one would you talk to first? Why?",
      "What makes you happy? Tell me 3 things.",
    ],
  },
  explorers: {
    math: [
      M("A pizza has 8 slices. You and 3 friends share it equally. How many slices does each person get?", "2 slices each. 4 people share 8 slices, and 8 ÷ 4 = 2."),
      M("What is the next number: 3, 6, 12, 24, ...?", "48. Each number doubles."),
      M("A pencil costs 25 cents. How much do 6 pencils cost?", "$1.50. 6 × 25 = 150 cents."),
      M("You read 15 pages a day. How many days to finish a 90-page book?", "6 days. 90 ÷ 15 = 6."),
      M("A rectangle is 7 cm long and 3 cm wide. What is its perimeter?", "20 cm. 7 + 3 + 7 + 3 = 20."),
      M("Sam has twice as many marbles as Leo. Together they have 18. How many does Sam have?", "12. Leo has 6, Sam has 12, and 6 + 12 = 18."),
      M("What is half of half of 40?", "10. Half of 40 is 20, and half of 20 is 10."),
      M("A movie starts at 3:45 and lasts 1 hour 30 minutes. When does it end?", "5:15. 3:45 + 1 hour = 4:45, + 30 minutes = 5:15."),
      M("Which is bigger: 3/4 or 2/3?", "3/4. 3/4 = 9/12 and 2/3 = 8/12."),
      M("24 kids make teams of 5. How many full teams, and how many kids are left over?", "4 full teams, 4 kids left over. 4 × 5 = 20 and 24 - 20 = 4."),
    ],
    story: [
      "Tell a story about a kid who finds a door at school that wasn't there yesterday.",
      "Tell a story where a robot learns how to make friends.",
      "Tell a true story about a time you tried something hard. What did you learn?",
      "Tell a story that starts with: 'The map was not supposed to glow...'",
      "Tell a story about a team that almost gave up, but didn't.",
    ],
    explain: [
      "Explain how a rainbow forms.",
      "Explain how to play your favorite game to someone who has never played it.",
      "Explain why we have day and night.",
      "Explain how bees help make our food.",
      "Explain how you would save up money for something you want.",
    ],
    persuade: [
      "Persuade your class to pick your idea for the next field trip.",
      "Persuade me that kids should get to choose one subject they learn at school.",
      "Persuade your parents to let you have a pet. Give 3 reasons.",
      "Persuade me that reading is more fun than watching TV, or the other way around.",
      "Persuade your school to start a new club. Which club, and why?",
    ],
    intro: [
      "Give a 30-second intro: one thing you're really good at. You do not need to say your name.",
      "Introduce yourself to a new team. What should they know about you?",
      "Introduce yourself and share one goal you have this year.",
      "Introduce your favorite hobby like you're on TV.",
      "Introduce yourself with 3 words that describe you, and explain each one.",
    ],
    impromptu: [
      "Should homework be banned? Pick a side and say why.",
      "If you could invent anything, what would it be?",
      "What is one rule you would add at home, and why?",
      "Would you rather live in the ocean or in space? Why?",
      "Who is someone you look up to, and why?",
    ],
  },
  leaders: {
    math: [
      M("A shirt costs $40 and is 25% off. What is the sale price?", "$30. 25% of 40 is 10, and 40 - 10 = 30."),
      M("The average of three numbers is 12. Two of them are 10 and 15. What is the third?", "11. The total must be 3 × 12 = 36, and 36 - 25 = 11."),
      M("A train goes 180 miles in 3 hours. At that speed, how far does it go in 5 hours?", "300 miles. 180 ÷ 3 = 60 miles per hour, × 5 = 300."),
      M("What is the next number: 1, 1, 2, 3, 5, 8, ...?", "13. Each number is the sum of the two before it."),
      M("If 3x + 5 = 20, what is x?", "x = 5. Subtract 5 to get 3x = 15, then divide by 3."),
      M("A recipe uses 2 cups of flour for 12 cookies. How much flour for 30 cookies?", "5 cups. 30 cookies is 2.5 batches, and 2.5 × 2 = 5."),
      M("5 people each shake hands with everyone else once. How many handshakes?", "10. 4 + 3 + 2 + 1 = 10."),
      M("A square has an area of 49 square inches. What is its perimeter?", "28 inches. Each side is 7, and 4 × 7 = 28."),
      M("You flip a coin twice. What is the chance of getting two heads?", "1 in 4 (25%). The outcomes are HH, HT, TH, TT."),
      M("A phone battery drops 15 points every hour, starting at 100%. After how many full hours is it under 50%?", "4 hours. After 3 hours it is 55%, after 4 hours it is 40%."),
    ],
    story: [
      "Tell a story about a time you had to lead, even when you didn't feel ready.",
      "Tell a story set 20 years from now, when AI does most jobs. What do people do?",
      "Tell a story about a mistake that turned into something good.",
      "Tell a story about two friends who disagree and find a way to work it out.",
      "Tell a story that ends with: 'And that's when everyone finally listened.'",
    ],
    explain: [
      "Explain how the internet gets a video to your screen.",
      "Explain how a vaccine helps your body fight sickness.",
      "Explain how to give a good apology.",
      "Explain how compound interest works, with a simple example.",
      "Explain how a leader is different from a boss.",
    ],
    persuade: [
      "Persuade your principal to start school one hour later.",
      "Persuade me that every kid should learn public speaking.",
      "Pitch a new app that would help kids at your school. Why should we use it?",
      "Persuade your city to build something new for kids. What, and why?",
      "Persuade me that phones should, or should not, be allowed in class.",
    ],
    intro: [
      "Give a 30-second intro as if you're running for class president.",
      "Introduce yourself at an interview for your dream summer job.",
      "Introduce yourself to a new team you'll be leading on a project.",
      "Introduce yourself with a fun fact most people don't know about you.",
      "Give a 30-second intro about what you care about most, and why.",
    ],
    impromptu: [
      "AI can write essays now. Should students still learn to write? Why?",
      "What is the most important skill for the future?",
      "If you could fix one problem in the world, what would it be?",
      "Is it better to be a leader or a great team player?",
      "What is something adults don't understand about kids your age?",
    ],
  },
  trailblazers: {
    math: [
      M("A $200 item goes up 10%, then down 10%. What is the final price? Is it back to $200?", "$198, so no. Up 10% is $220, and 10% off $220 is $22 off."),
      M("Find two numbers whose sum is 20 and whose product is 96.", "12 and 8. 12 + 8 = 20 and 12 × 8 = 96."),
      M("A car loses 20% of its value each year. What percent of its value is left after 2 years?", "64%. 0.8 × 0.8 = 0.64."),
      M("In a class of 30, 18 play sports, 12 play music, and 5 do both. How many do neither?", "5. 18 + 12 - 5 = 25 do at least one, and 30 - 25 = 5."),
      M("What is the sum of the whole numbers from 1 to 100?", "5,050. Pair 1 + 100, 2 + 99, ... that's 50 pairs of 101."),
      M("Solve: 2x - 7 = x + 4.", "x = 11. Subtract x from both sides, then add 7."),
      M("You roll two dice. What is the probability that they add up to 7?", "1/6. 6 of the 36 possible rolls add up to 7."),
      M("$1,000 grows 5% a year. How much is it after 2 years?", "$1,102.50. 1000 × 1.05 × 1.05."),
      M("A rectangle's length is twice its width, and its perimeter is 36. What is its area?", "72. Width 6, length 12, and 6 × 12 = 72."),
      M("How many different 3-letter arrangements can you make from A, B, C, D with no repeats?", "24. 4 × 3 × 2 = 24."),
    ],
    story: [
      "Tell a story about a moment that changed how you see yourself.",
      "Tell a story about a time you stood up for someone or something.",
      "Tell the story of a failure and what it taught you, like you would in a college interview.",
      "Tell a story about a leader you admire, and one moment that shows who they are.",
      "Tell a short story set in a world where everyone works with an AI partner.",
    ],
    explain: [
      "Explain how supply and demand set the price of concert tickets.",
      "Explain, in simple words, how an AI chatbot comes up with an answer.",
      "Explain how credit scores work and why they matter.",
      "Explain how to run a great team meeting.",
      "Explain the scientific method using an everyday example.",
    ],
    persuade: [
      "Persuade a panel to fund your startup idea.",
      "Persuade your school board to make public speaking a required class.",
      "Make the case for or against a 4-day school week.",
      "Persuade me that kindness is a leadership skill.",
      "Persuade a skeptical adult that teens should have a say in local decisions.",
    ],
    intro: [
      "Give your 30-second elevator pitch: who you are, what you're good at, and what you want next.",
      "Answer the interview classic: 'Tell me about yourself.'",
      "Introduce yourself to a mentor you'd love to learn from.",
      "Introduce yourself as the captain of a new team on day one.",
      "Introduce yourself at a networking event for young founders.",
    ],
    impromptu: [
      "If AI can do most jobs, what makes a human valuable?",
      "Should social media have an age limit? Defend your view.",
      "What is one belief you've changed your mind about?",
      "What does good leadership look like in a group chat?",
      "Is it more important to be liked or respected?",
    ],
  },
};

// The 35-day list for a band, in rotation order. Each item: { i, type, p, a?, s }
const cache = {};
export function dayList(band) {
  if (cache[band]) return cache[band];
  if (GROWNUPS[band]) return (cache[band] = ADULT_LIST.map((x, i) => ({ i, type: x.type, p: x.p, s: TYPES[x.type].seconds || GROWNUPS[band].target })));
  const b = BANK[band], used = {}, out = [];
  for (let w = 0; w < 5; w++) for (const type of PATTERN) {
    const k = used[type] = (used[type] || 0), raw = b[type][k];
    used[type]++;
    const it = typeof raw === "string" ? { p: raw } : { p: raw.p + EXPLAIN_TAIL, a: raw.a };
    out.push({ i: out.length, type, p: it.p, a: it.a, s: TYPES[type].seconds || BANDS[band].target });
  }
  return (cache[band] = out);
}
export function promptAt(band, i) {
  const list = dayList(band);
  return list[((i % list.length) + list.length) % list.length];
}
// Day number from a local YYYY-MM-DD (same date = same challenge for everyone in that band).
export function dayNumber(iso) {
  const [y, m, d] = iso.split("-").map(Number);
  return Math.floor(Date.UTC(y, m - 1, d) / 86400000);
}
// Launch day (Oct 6, 2026) = item 0, the first puzzle. "New prompt" steps by 11 (coprime with 35, so it visits every item).
export const LAUNCH = dayNumber("2026-10-06");
export function todayIndex(iso, shuffle = 0) { return dayNumber(iso) - LAUNCH + shuffle * 11; }

// "Try a funny twist" replay round (idea borrowed from SpeakUp): same prompt, one silly constraint. Shared with
// functions/api/feedback.js (the coach is told the twist) via index, so the server never trusts free text for it.
export const TWISTS = {
  math: ["Now explain it like a sports announcer calling the big game!", "Now explain it to a friendly alien who has never seen numbers.",
    "Now explain it in a whisper, like a secret agent.", "Now explain it like a superhero saving the day with math."],
  story: ["Now tell it as a pirate captain. Arr!", "Now the main character is a talking sandwich.",
    "Now tell it as a breaking news report.", "Now add a surprise: it all happens on the Moon."],
  explain: ["Now explain it to a curious 5-year-old.", "Now explain it like a nature documentary narrator.",
    "Now explain it as a robot from the future.", "Now explain it in exactly 3 steps, like a recipe."],
  persuade: ["Now persuade a very grumpy cat.", "Now persuade a busy king who has only 20 seconds.",
    "Now sell it like a TV commercial!", "Now persuade your future self, 10 years from now."],
  intro: ["Now introduce yourself like a game show host.", "Now introduce yourself as if you just landed from Mars.",
    "Now introduce yourself to a dinosaur who loves new friends.", "Now introduce yourself like a famous explorer."],
  impromptu: ["Now argue the opposite side!", "Now answer as a wise old owl.",
    "Now answer like a sports coach at halftime.", "Now answer like a news reporter on live TV."],
  pitch: ["Now pitch it to a 7-year-old.", "Now pitch it in 20 seconds, like the elevator is closing.",
    "Now pitch it as a movie trailer voice.", "Now pitch it to your harshest critic."],
  toast: ["Now give it as a sports commentator.", "Now give it in exactly three sentences.",
    "Now give it as if you're accepting an award.", "Now make it rhyme, just a little."],
  kidtalk: ["Now explain it using only food examples.", "Now explain it like a bedtime story.",
    "Now explain it to a curious 5-year-old.", "Now explain it as a cartoon superhero."],
  sayno: ["Now say no like a calm airline pilot.", "Now say no in exactly two sentences.",
    "Now say no like a very polite robot.", "Now say no and offer a better idea."],
  feedbk: ["Now give it like a friendly football coach.", "Now give it in three sentences or fewer.",
    "Now start with a genuine compliment.", "Now give it like a calm news anchor."],
};
// Deterministic twist for an item (same prompt = same twist), returned with its index for the server.
export function twistFor(item) {
  const list = TWISTS[item.type] || TWISTS.impromptu, t = ((item.i * 7) % list.length + list.length) % list.length;
  return { t, text: list[t] };
}
