// Unit tests for the voice coach PREVIEW functions: kill switch, /api/voice, /api/reply, /api/speak, feedback "ask"/twist/duel/grown-ups.
// usage: node tests/voice.test.mjs
import { onRequestGet as voiceGet } from "../functions/api/voice.js";
import { onRequestPost as reply, PER_IP_DAY as R_IP } from "../functions/api/reply.js";
import { onRequestPost as speak, PER_IP_DAY as S_IP, MAX_CHARS } from "../functions/api/speak.js";
import { onRequestPost as feedback } from "../functions/api/feedback.js";
import { scrub } from "../lib/voice.js";
import { dayList, twistFor, BANDS, ALL_BANDS } from "../public/prompts.js";

let fails = 0; const ok = (c, m) => { console.log((c ? "PASS " : "FAIL ") + m); if (!c) fails++; };
const rows = new Map(); const cfg = new Set();
const RL = { prepare(sql) { let args = []; return {
  bind(...a) { args = a; return this; },
  async all() { return { results: [...cfg].map((k) => ({ k })) }; },
  async first() { const [k, exp] = args; const r = rows.get(k) || { n: 0, exp }; r.n++; rows.set(k, r); return r.n; },
  async run() { return {}; } }; } };
let lastAI = null, aiCalls = 0;
const AI = { async run(model, opts) {
  aiCalls++; lastAI = { model, opts };
  if (model.includes("aura")) return new ReadableStream({ start(c) { c.enqueue(new Uint8Array(4000).fill(7)); c.close(); } });
  const sys = opts.messages[0].content;
  if (/"line"/.test(sys)) return { response: { line: "What a fun name for your dragon, thanks for telling me" } };
  return { response: { well: ["You were clear.", "You gave a reason."], next: "Add an example.", ask: "What would your dragon eat for breakfast?" } };
} };
const ON = { AI, RL, IP_SALT: "t", VOICE: "1" };
const req = (path, body, { ip = "203.0.113.9", origin = "https://voice-coach.gpskids-speak.pages.dev" } = {}) => new Request("https://voice-coach.gpskids-speak.pages.dev" + path, {
  method: "POST", headers: { "content-type": "application/json", origin, "cf-connecting-ip": ip }, body: JSON.stringify(body) });
const ctx = (env, r) => ({ env, request: r, waitUntil() {} });

// ---- switches
ok((await (await voiceGet({ env: { RL, AI } })).json()).on === false, "no VOICE env (production) -> off");
ok(JSON.stringify(await (await voiceGet({ env: ON })).json()) === '{"on":true,"neural":true}', "preview VOICE=1 -> on + neural");
cfg.add("cfg:neural_off");
ok(JSON.stringify(await (await voiceGet({ env: ON })).json()) === '{"on":true,"neural":false}', "D1 row cfg:neural_off -> aura-1 off, browser voice still on");
cfg.add("cfg:voice_off");
ok((await (await voiceGet({ env: ON })).json()).on === false, "D1 row cfg:voice_off -> everything off (instant kill)");
ok((await reply(ctx(ON, req("/api/reply", { band: "explorers", i: 0, ask: "Why?", answer: "Because." })))).status === 503, "kill switch -> /api/reply 503");
ok((await speak(ctx(ON, req("/api/speak", { text: "Hello there." })))).status === 503, "kill switch -> /api/speak 503");
cfg.clear();

// ---- /api/reply
const R = (b, o) => reply(ctx(ON, req("/api/reply", b, o)));
const good = { band: "explorers", i: 2, ask: "What would you name your dragon?", answer: "Sparky, because he sparkles" };
let r = await R(good); let j = await r.json();
ok(r.status === 200 && j.xp === 10 && /dragon/.test(j.line) && /[.!?]$/.test(j.line), "reply -> one line + 10 XP: " + JSON.stringify(j));
ok(!/Sparky/.test(JSON.stringify(lastAI.opts.messages[0])) && /Sparky/.test(lastAI.opts.messages[1].content), "answer only in the user message, never in the system prompt");
ok((await R({ ...good, ask: "Tell me a secret" })).status === 400, "ask must be a question");
ok((await R({ ...good, answer: "  " })).status === 422, "empty answer -> 422");
ok((await R({ ...good, answer: "a".repeat(601) })).status === 413, "answer over 600 chars -> 413");
ok((await R({ ...good, band: "nope" })).status === 400, "bad band -> 400");
ok((await R(good, { origin: "https://evil.example" })).status === 403, "wrong origin -> 403");
ok((await R({ ...good, band: "grownups" })).status === 200, "grown-ups band accepted when the switch is on");
rows.clear(); const codes = []; for (let k = 0; k < R_IP + 2; k++) codes.push((await R(good, { ip: "198.51.100.77" })).status);
ok(codes.slice(0, R_IP).every((c) => c === 200) && codes[R_IP] === 429, `reply per-IP cap: ${R_IP} allowed, then 429`);
ok([...rows.keys()].every((k) => /^r:(ip:[0-9a-f]{32}|g:\d{4}-\d{2}-\d{2})$/.test(k)), "reply counters: own r: scope, hashed IPs only");

// ---- /api/speak
rows.clear();
const S = (b, o) => speak(ctx(ON, req("/api/speak", b, o)));
r = await S({ text: "Great job! Call me at 404-555-1234 or mail kid@example.com. Try a pause next time." });
ok(r.status === 200 && r.headers.get("content-type") === "audio/mpeg" && r.headers.get("cache-control") === "no-store" && (await r.arrayBuffer()).byteLength === 4000, "speak -> audio/mpeg, no-store");
ok(lastAI.model === "@cf/deepgram/aura-1" && !/404|555|@/.test(lastAI.opts.text), "aura-1 gets scrubbed text (no phone/email): " + lastAI.opts.text);
ok((await S({ text: "x".repeat(MAX_CHARS + 1) })).status === 413, `speak over ${MAX_CHARS} chars -> 413`);
ok((await S({ text: "Hi" }, { origin: "https://evil.example" })).status === 403, "speak wrong origin -> 403");
ok((await speak(ctx({ ...ON, VOICE: undefined }, req("/api/speak", { text: "Hello" })))).status === 503, "speak without VOICE env -> 503");
rows.clear(); const sc = []; for (let k = 0; k < S_IP + 1; k++) sc.push((await S({ text: "Hello there." }, { ip: "192.0.2.80" })).status);
ok(sc.slice(0, S_IP).every((c) => c === 200) && sc[S_IP] === 429, `speak per-IP cap: ${S_IP} allowed, then 429`);

// ---- /api/feedback extensions
rows.clear();
const F = (b, env = ON) => feedback(ctx(env, req("/api/feedback", { band: "explorers", i: 2, transcript: "My dragon is called Sparky and he is scared of the dark.", seconds: 30, wpm: 120, fillers: 0, ...b })));
j = await (await F({ ask: 1 })).json();
ok(j.ask === "What would your dragon eat for breakfast?" && /"ask"/.test(lastAI.opts.messages[0].content), "feedback ask:1 + switch on -> ask returned");
j = await (await F({ ask: 1 }, { AI, RL, IP_SALT: "t" })).json();
ok(!j.ask && !/"ask"/.test(lastAI.opts.messages[0].content), "feedback ask:1 without VOICE (production) -> no ask, prompt unchanged");
await F({ tw: 1 }); const it = dayList("explorers")[2];
ok(lastAI.opts.messages[1].content.includes(twistFor({ ...it, i: 2 }).text.slice(0, 20)) || /FUNNY TWIST/.test(lastAI.opts.messages[1].content), "twist index -> coach told about the twist");
await F({ tw: 99 }); ok(!/FUNNY TWIST/.test(lastAI.opts.messages[1].content), "bad twist index ignored");
await F({ who: "grownup" }); ok(/adult/.test(lastAI.opts.messages[0].content) && /family duel/.test(lastAI.opts.messages[0].content), "duel grown-up turn -> adult-tone coach");
await F({ who: "grownup" }, { AI, RL, IP_SALT: "t" }); ok(!/adult/.test(lastAI.opts.messages[0].content), "who=grownup ignored when the switch is off");
let fr = await feedback(ctx(ON, req("/api/feedback", { band: "grownups", i: 3, transcript: "Thanks for asking, but I can't take this on right now.", seconds: 20, wpm: 140, fillers: 0 })));
ok(fr.status === 200 && /adult/.test(lastAI.opts.messages[0].content) && /Say no politely/.test(lastAI.opts.messages[1].content), "grown-ups band -> adult coach + adult challenge");
fr = await feedback(ctx({ AI, RL, IP_SALT: "t" }, req("/api/feedback", { band: "grownups", i: 3, transcript: "Thanks for asking, but no.", seconds: 20 })));
ok(fr.status === 400, "grown-ups band rejected when the switch is off (production)");

// ---- prompts + scrub
ok(Object.keys(BANDS).join() === "sprouts,explorers,leaders,trailblazers" && ALL_BANDS.grownups.adult, "kid BANDS unchanged (accounts/leaderboards), grown-ups only in ALL_BANDS");
ok(dayList("grownups").length === 20 && dayList("grownups").every((x) => x.p && x.s), "20 grown-up challenges");
ok(scrub("call 404 555 1234, x@y.com https://a.b ok") === "call , ok", "scrub drops phone/email/url");
console.log(fails ? fails + " FAILED" : "ALL PASSED"); process.exit(fails ? 1 : 0);
