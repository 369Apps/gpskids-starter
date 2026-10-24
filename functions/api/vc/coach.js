// POST /api/vc/coach   body = raw audio. Headers: x-consent: yes (required), x-band: little|middle|teen,
//   x-mode: pitch|rebut, x-round: 1..3, x-seconds. For rebut, x-pitch carries the pitch words (URI-encoded) held by the browser.
// -> { heard, words, tips:[3], line?: next friendly opponent question, transcript }. PREVIEW ONLY. Nothing stored, audio dropped.
// Tips never affect finals, prizes or scores: this endpoint has no access to the pitch DB or prize tables.
import { json, allowedOrigin, overLimit, isPreview, band, transcribe, chatJSON, tipsSystem, opponentSystem, cleanTips, cleanLine,
  FALLBACK_TIPS, FALLBACK_LINES, AGAINST_TOPIC, OFF_TOPIC, scrubText, logEngine, track , vcOn, feat, engine, features } from "../../../lib/vcoach.js";
import { gate, add, status, paused, noXai, addSpend, cost, kidOverLimit } from "../../../lib/vcusage.js";

const MAX_BYTES = 4 * 1024 * 1024, TYPES = /^audio\/(mp4|m4a|x-m4a|aac|webm|ogg|wav|x-wav|wave|mpeg|mp3)$/;

export async function onRequestPost(context) {
  const { request, env } = context;
  if (!vcOn(env, request) || !allowedOrigin(request)) return json({ error: "forbidden" }, 403);
  if (request.headers.get("x-consent") !== "yes") return json({ error: "consent_needed" }, 412); // no audio leaves without the grown-up switch
  const type = (request.headers.get("content-type") || "").split(";")[0].trim().toLowerCase();
  if (!TYPES.test(type)) return json({ error: "bad_type" }, 415);
  if (Number(request.headers.get("content-length") || 0) > MAX_BYTES) return json({ error: "too_large" }, 413);
  const secs = Number(request.headers.get("x-seconds") || 0);
  if (secs > 75) return json({ error: "too_long" }, 413);
  const g = await gate(env, request, Math.max(5, secs)); if (g instanceof Response) return g;
  if (await kidOverLimit(env, g.who, 40)) // per kid per day: at most 40 recordings
    return json({ error: "limit", resting: true, daily: true, message: "Great work today! Come back tomorrow!" }, 429);
  const b = band(request.headers.get("x-band")), rebut = request.headers.get("x-mode") === "rebut";
  const T = track(request.headers.get("x-track"));
  const round = Math.min(3, Math.max(1, Number(request.headers.get("x-round") || 1) | 0));
  let pitch = ""; try { pitch = scrubText(decodeURIComponent(request.headers.get("x-pitch") || ""), 1500); } catch (e) {}
  let u8 = new Uint8Array(await request.arrayBuffer());
  if (u8.length < 800 || u8.length > MAX_BYTES) return json({ heard: false, error: "empty" });
  const limited = await overLimit(request, env, context, "vc:", 60, 200000); // per IP per day (a class can share one IP) + global
  if (limited) return json({ error: "limit", resting: true, daily: true, message: "Great work today! Come back tomorrow!" }, 429);

  const off = await paused(env); if (off) logEngine("spend", "paused");
  const E = off || engine(env, request) !== "xai" ? noXai(env) : env; // spend cap hit: Workers AI only
  const stt = await transcribe(E, u8, type); u8 = null; // drop the audio now
  await add(env, g.who, "turn", Math.min(75, stt.duration || secs || 30), null, { mode: rebut ? "rebuttal" : "feedback" }); // count the recording length
  logEngine("stt", stt.engine);
  const text = scrubText(stt.text, 4000);
  if (!text) return json({ heard: false, tips: [], message: "I could not hear you. Try again a bit closer to the phone!" });
  if (OFF_TOPIC.test(text)) { logEngine("filter", "topic"); return json({ heard: true, offTopic: true, tips: [AGAINST_TOPIC], transcript: "" }); }

  let q = ""; try { q = scrubText(decodeURIComponent(request.headers.get("x-q") || ""), 300); } catch (e) {}
  const user = rebut ? `Friendly question they answered (round ${round}): ${q}\nTheir answer: """${text}"""`
    : `Pitch transcript: """${text}"""`;
  const t = await chatJSON(E, tipsSystem(b, rebut, T), user);
  logEngine("tips", t.engine);
  const tips = cleanTips(t.out) || FALLBACK_TIPS[b];

  let line = "";
  if (!rebut || round < 3) {
    const nextRound = rebut ? round + 1 : 1;
    const o = await chatJSON(E, opponentSystem(b, nextRound, T), `Pitch: """${rebut ? pitch : text}"""${rebut ? `\nTheir last answer: """${text}"""\nDo NOT repeat this earlier question, ask about something new: ${q}` : ""}`);
    logEngine("opponent", o.engine);
    line = cleanLine(o.out);
    const w = (x) => new Set(x.toLowerCase().match(/[a-z']+/g) || []), a = w(line), qq = w(q);
    const same = rebut && a.size && [...a].filter((x) => qq.has(x)).length / a.size > 0.6; // repeated the last question
    if (!line || same) line = FALLBACK_LINES[(nextRound - 1) % 3];
  }
  if (String(stt.engine).startsWith("xai")) await addSpend(env, cost.turn(Math.min(75, stt.duration || secs || 30)));
  const usage = await status(env, g.who).catch(() => null);
  return json({ usage, heard: true, words: text.split(" ").length, tips, line, transcript: rebut ? "" : text });
}
export const onRequestGet = () => json({ error: "method_not_allowed" }, 405);
