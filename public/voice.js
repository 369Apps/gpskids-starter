/* GPS Kids Speak voice coach (PREVIEW, ?voice=1). The coach talks back:
   - Browser voice (speechSynthesis, free, on the device) for "Hear it", and for the coach after a new user's first 3 sessions.
   - Cloudflare aura-1 voice via /api/speak (coach's own words only, never the kid's voice) for a new user's first 3 sessions.
     Any error, limit or timeout -> browser voice.
   iPhone Safari rules followed here:
   1. Sound only starts from a tap: unlock() runs inside tap handlers (plays a tiny same-origin silent clip on the ONE shared
      <audio> element and primes speechSynthesis), so later play() calls on that element are allowed.
   2. The mic must be fully off before the coach talks (app stops all tracks first); navigator.audioSession.type is set to
      "play-and-record" before recording and "playback" before the coach talks, where supported (newer Safari).
   3. Play through an <audio> element (not Web Audio), which the silent switch is less likely to mute; the app shows a
      "Can't hear Coach?" hint on iPhone.
   4. Speak one sentence per utterance (long utterances can get cut off); voices load async (voiceschanged).
   5. Stop all speech when the page is hidden. Never autoplay. */
const K = { mode: "gks_vmode", text: "gks_vtext", voice: "gks_vvoice", ns: "gks_vns" };
const get = (k) => { try { return localStorage.getItem(k); } catch (e) { return null; } };
const set = (k, v) => { try { v == null ? localStorage.removeItem(k) : localStorage.setItem(k, String(v)); } catch (e) {} };
const synth = typeof window !== "undefined" && window.speechSynthesis && typeof window.SpeechSynthesisUtterance === "function" ? window.speechSynthesis : null;
export const NEURAL_SESSIONS = 3;
let el = null, voices = [], token = 0, objUrl = "";

function audioEl() {
  if (el) return el;
  el = document.getElementById("coach-audio") || document.createElement("audio");
  el.setAttribute("playsinline", ""); el.preload = "auto";
  return el;
}
function loadVoices() { try { voices = synth ? synth.getVoices() : []; } catch (e) { voices = []; } return voices; }
if (synth) { loadVoices(); try { synth.addEventListener ? synth.addEventListener("voiceschanged", loadVoices) : (synth.onvoiceschanged = loadVoices); } catch (e) {} }
document.addEventListener("visibilitychange", () => { if (document.hidden) stop(); });
window.addEventListener("pagehide", () => stop());

export const canSpeak = () => !!synth;
export const textOnly = () => get(K.text) === "1";
export const setTextOnly = (on) => set(K.text, on ? "1" : null);
export function englishVoices() { return loadVoices().filter((v) => /^en(-|_|$)/i.test(v.lang)); }
export function chosenVoice() {
  const list = englishVoices(), saved = get(K.voice);
  if (saved) { const v = list.find((x) => x.name === saved); if (v) return v; }
  const pref = ["Samantha", "Google US English", "Microsoft Aria", "Karen", "Moira", "Daniel", "Google UK English Female"];
  for (const n of pref) { const v = list.find((x) => x.name.startsWith(n)); if (v) return v; }
  return list.find((v) => v.localService && /en-US/i.test(v.lang)) || list.find((v) => /en-US/i.test(v.lang)) || list[0] || null;
}
export const setVoice = (name) => set(K.voice, name || null);

export function session(type) { try { if (navigator.audioSession) navigator.audioSession.type = type; } catch (e) {} }

// Call inside a tap handler (iPhone: sound may only start from a user gesture).
export function unlock() {
  const a = audioEl();
  try { if (!a.src || /silence\.wav/.test(a.src) || a.ended || a.paused) { a.src = "/silence.wav"; const p = a.play(); if (p && p.catch) p.catch(() => {}); } } catch (e) {}
  try { if (synth) { synth.cancel(); const u = new SpeechSynthesisUtterance(" "); u.volume = 0; synth.speak(u); } } catch (e) {}
}
export function stop() {
  token++;
  try { if (synth) synth.cancel(); } catch (e) {}
  try { if (el) el.pause(); } catch (e) {}
}
const sentences = (t) => (String(t).replace(/\s+/g, " ").trim().match(/[^.!?]+[.!?]*["”']?\s*/g) || []).map((x) => x.trim()).filter(Boolean);

// Browser voice, one sentence per utterance. Resolves true when done, false if stopped/failed.
export function sayBrowser(text, { rate = 1, pitch = 1.05 } = {}) {
  if (!synth) return Promise.resolve(false);
  const my = ++token; try { synth.cancel(); } catch (e) {}
  const parts = sentences(text), v = chosenVoice();
  if (!parts.length) return Promise.resolve(false);
  return new Promise((res) => {
    let k = 0, guard = null;
    const next = () => {
      clearTimeout(guard);
      if (my !== token) return res(false);
      if (k >= parts.length) return res(true);
      const u = new SpeechSynthesisUtterance(parts[k++]);
      if (v) { u.voice = v; u.lang = v.lang; } else u.lang = "en-US";
      u.rate = rate; u.pitch = pitch;
      u.onend = next; u.onerror = () => { clearTimeout(guard); res(false); };
      guard = setTimeout(next, 12000 + parts[k - 1].length * 120); // some engines never fire onend
      try { synth.speak(u); } catch (e) { res(false); }
    };
    next();
  });
}
// Cloudflare aura-1 voice through /api/speak. Throws on any failure so the caller can fall back.
export async function sayNeural(text) {
  const my = ++token; try { if (synth) synth.cancel(); } catch (e) {}
  const ctl = new AbortController(), to = setTimeout(() => ctl.abort(), 15000);
  let r;
  try { r = await fetch("/api/speak", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ text: String(text).slice(0, 700) }), signal: ctl.signal }); }
  finally { clearTimeout(to); }
  if (!r.ok || !/audio/.test(r.headers.get("content-type") || "")) throw new Error("tts " + r.status);
  const blob = await r.blob();
  if (my !== token) return false;
  if (objUrl) URL.revokeObjectURL(objUrl);
  objUrl = URL.createObjectURL(blob);
  const a = audioEl(); a.src = objUrl;
  await a.play();
  return new Promise((res) => { a.onended = () => res(true); a.onpause = () => res(false); a.onerror = () => res(false); });
}
// Speak with the session's engine. Returns "neural" | "browser" | "" (nothing played).
export async function say(text, { neural = false, rate = 1 } = {}) {
  if (textOnly() || !text) return "";
  session("playback");
  if (neural) { try { await sayNeural(text); return "neural"; } catch (e) { /* fall back to the browser voice */ } }
  return (await sayBrowser(text, { rate })) ? "browser" : "";
}
// New users hear aura-1 for their first 3 sessions, then the browser voice. ?voice=neural / ?voice=browser force one (A/B).
export function neuralForSession(serverNeural) {
  const mode = get(K.mode) || "auto";
  if (!serverNeural || mode === "browser") return false;
  if (mode === "neural") return true;
  const n = +(get(K.ns) || 0);
  if (n >= NEURAL_SESSIONS) return false;
  set(K.ns, n + 1); return true;
}
export const neuralLeft = () => Math.max(0, NEURAL_SESSIONS - +(get(K.ns) || 0));
export const isSpeaking = () => !!((synth && synth.speaking) || (el && !el.paused && !el.ended && !/silence\.wav/.test(el.src)));
