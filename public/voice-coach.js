import { COACH_LABEL } from "/vc-config.js";
// AI coach + Answer back! (PREVIEW ONLY). No names, no storage of sound. Points are kept on this phone for the leaderboard only.
const $ = (id) => document.getElementById(id);
const S = { band: "middle", mode: "pitch", round: 1, pitch: "", q: "", tips: [], line: "", points: 0 };
const PER_ROUND = 10;
// Track config (public/tracks/<id>.json): challenges shown here; the server reads the same file for prompts and tip types.
const TRACK_ID = (new URLSearchParams(location.search).get("track") || "speak").replace(/[^a-z-]/g, "");
let TRACK = { challenges: ["Tell us about an idea you love. You have 1 minute."] };
fetch(`/tracks/${TRACK_ID}.json`).then((r) => (r.ok ? r.json() : null)).then((t) => { if (t) TRACK = t; }).catch(() => {});
const challenge = () => TRACK.challenges[new Date().getDate() % TRACK.challenges.length];
// Random ids only (no names): parent account id + child profile id, kept on this phone. Real login replaces these later.
const rid = (k) => { let v = localStorage.getItem(k); if (!v) { v = crypto.randomUUID(); localStorage.setItem(k, v); } return v; };
const IDS = { "x-acct": rid("gks_vc_acct"), "x-kid": rid("gks_vc_kid") };
const vfetch = (u, o = {}) => fetch(u, { ...o, headers: { ...IDS, ...(o.headers || {}) } });
const ev = (e) => vfetch("/api/vc/usage", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ ev: e }) }).catch(() => {});
// "upgraded" is counted by the Stripe webhook, not the page
async function upgrade(note, plan = "founding") {
  const o = await (await vfetch("/api/vc/checkout", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ plan }) })).json().catch(() => ({}));
  if (o.url) return (location.href = o.url);
  note.hidden = false; note.textContent = o.comingSoon ? "Checkout coming soon." : "Something went wrong. Try again later.";
}
const mm = (sec) => { const m = Math.floor(sec / 60); return m >= 1 ? `${m} minute${m === 1 ? "" : "s"}` : `${Math.max(0, Math.round(sec))} seconds`; };
let U = null;
function showUsage(u) {
  if (!u || u.error) return; U = u; $("plan").value = u.plan;
  const F = u.features || {}; // launch: plans, live and referral are off (server flags), so their screens stay hidden
  $("plan").closest("label").hidden = !F.plans; $("upgrades").hidden = !F.plans; if (!F.plans) $("pcard").hidden = true;
  if (!F.referral) $("ref").hidden = true; document.querySelectorAll(".pv").forEach((e) => (e.hidden = F.candidate || !F.plans));
  const low = u.leftSec < 120;
  $("mins").classList.toggle("low", low);
  $("mins").textContent = u.founding
    ? `${u.planLabel}: recorded Coach is unlimited (up to ${u.dayMin} minutes a day). ${mm(u.liveLeftSec)} of live talk left this month.`
    : u.daily
    ? (u.leftSec <= 0 ? "No Coach minutes left today. More tomorrow!" : `${mm(u.leftSec)} of Coach left today (Free: 10 minutes every day).`) + (u.liveTasteSec ? " Live talk: one free 3 minute try this week." : "")
    : u.leftSec <= 0 ? "No Coach minutes left right now."
    : `${mm(u.monthLeftSec)} left this month (${u.planLabel}: ${u.planMin} minutes). Up to ${mm(u.dayLeftSec)} more today.`;
}
const loadUsage = () => {
  vfetch("/api/vc/usage").then((r) => r.json()).then(showUsage).catch(() => {});
  vfetch("/api/vc/usage?family=1").then((r) => r.json()).then((f) => { // this family's own kids only
    const ks = (f && f.kids) || []; $("fam").hidden = ks.length < 1; $("fam").innerHTML = "";
    ks.forEach((k, i) => { const li = document.createElement("li"); li.textContent = `${k.kid === IDS["x-kid"] ? "This child" : "Child " + (i + 1)}: used ${k.usedMin} min, ${k.leftMin} min left this month`; $("fam").append(li); });
  }).catch(() => {});
};
loadUsage();
$("plan").onchange = () => vfetch("/api/vc/usage", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ plan: $("plan").value }) }).then((r) => r.json()).then(showUsage);
function rest(u, daily) {
  if (u) showUsage(u);
  const day = daily || (U && (U.daily || U.founding || U.dayLeftSec <= 0) && !(U.monthLeftSec <= 0 && !U.daily && !U.founding));
  $("rest-title").textContent = day ? "Great work today! Come back tomorrow!" : "Coach is resting. Ask your grown-up!"; $("rest-emoji").textContent = day ? "🌟" : "😴";
  $("rest-why").textContent = U && U.founding ? "Your child used today's 60 Coach minutes. More tomorrow!" : U && U.daily ? "Your child used today's 10 free Coach minutes. More tomorrow!" + (U.features && U.features.plans ? " Live talk is on paid plans." : "")
    : U && U.monthLeftSec <= 0 ? `Your child used all ${U.planMin} Coach minutes for this month.` : `Your child used today's ${U ? U.dayMin : 20} Coach minutes. More minutes tomorrow!`;
  show("s-rest");
}
$("upgrade").onclick = () => upgrade($("upgrade-note"));
$("upgrade-pro").onclick = () => upgrade($("upgrade-note"), "pro");
$("upgrade-all").onclick = () => upgrade($("upgrade-note"), "allaccess");
if (new URLSearchParams(location.search).get("paid") === "1") { $("paid").hidden = false; setTimeout(loadUsage, 2500); }
$("pcard-up").onclick = () => upgrade($("pcard-note"));
$("tasted-ok").onclick = () => show("s-tips");
$("rest-back").onclick = () => { loadUsage(); show("s-consent"); };
const show = (id) => { document.querySelectorAll(".scr").forEach((s) => (s.hidden = s.id !== id)); window.scrollTo(0, 0); };

// ---- screen 1: age + grown-up switch ----
document.querySelectorAll(".age").forEach((b) => b.onclick = () => {
  document.querySelectorAll(".age").forEach((x) => { x.classList.toggle("on", x === b); x.setAttribute("aria-checked", x === b); });
  S.band = b.dataset.band; $("optin-row").hidden = !(S.band === "teen" && LIVE);
});
// ---- grown-up check + consent saved per child profile on the server (with a timestamp) ----
const sync = () => ($("go").disabled = !$("consent").checked);
let GA = 0, GB = 0;
const fmtT = (t) => new Date(t * 1000).toLocaleString("en-US", { dateStyle: "medium", timeStyle: "short" });
function consentShown(c) {
  $("consent").checked = !!(c && c.ok); $("gate").hidden = true; sync();
  $("consent-at").hidden = !(c && c.ok); if (c && c.ok) $("consent-at").textContent = `Grown-up said OK on ${fmtT(c.at)}. Tap the switch to turn it off.`;
  if (c && c.liveOptIn) $("optin").checked = true;
}
$("consent").onchange = async () => {
  if ($("consent").checked) { // show the grown-up check; the switch stays off until it is passed
    $("consent").checked = false; GA = 6 + Math.floor(Math.random() * 13); GB = 6 + Math.floor(Math.random() * 13);
    $("ga").textContent = GA; $("gb").textContent = GB; $("gans").value = ""; $("gerr").hidden = true; $("gate").hidden = false; $("gans").focus();
  } else { await vfetch("/api/vc/consent", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ withdraw: true }) }); consentShown(null); }
  sync();
};
$("gok").onclick = async () => {
  const r = await vfetch("/api/vc/consent", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ a: GA, b: GB, answer: Number($("gans").value), liveOptIn: $("optin").checked }) });
  const c = await r.json(); if (!c.ok) { $("gerr").hidden = false; return; } consentShown(c); loadReferral();
};
$("optin").onchange = () => { if ($("consent").checked) vfetch("/api/vc/consent", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ update: true, liveOptIn: $("optin").checked }) }); };
vfetch("/api/vc/consent").then((r) => r.json()).then(consentShown).catch(() => {}); sync();
// ---- parent alerts (in app) ----
vfetch("/api/vc/alert").then((r) => r.json()).then((a) => { $("pcard").hidden = !(a.alerts || []).some((x) => x.kind === "upsell" && !x.seen);
  const xs = (a.alerts || []).filter((x) => !x.seen && x.kind === "safety"); $("alerts").hidden = !xs.length; $("alerts").innerHTML = "";
  xs.forEach((x) => { const li = document.createElement("li"); li.textContent = `${fmtT(x.at)}: Coach paused a talk so a grown-up could check in${x.thisChild ? " with this child" : ""}. Call or text 988 for support.`; $("alerts").append(li); }); }).catch(() => {});
// ---- referral (preview: on) ----
const REF = new URLSearchParams(location.search).get("ref");
function loadReferral() {
  if (U && U.features && !U.features.referral) return;
  vfetch("/api/vc/referral").then((r) => r.json()).then((d) => { if (!d.code) return; $("ref").hidden = false; $("refcode").textContent = d.code;
    $("refstat").textContent = `${d.joined} friend${d.joined === 1 ? "" : "s"} joined. Free months: ${d.freeMonths}.`;
    $("refshare").onclick = () => { const t = { title: "GPS Kids Coach", text: "Practice speaking with Coach. We both get a free month!", url: d.link }; navigator.share ? navigator.share(t).catch(() => {}) : navigator.clipboard.writeText(d.link).then(() => ($("refstat").textContent = "Link copied!")); }; });
  if (REF && $("consent").checked) vfetch("/api/vc/referral", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ code: REF }) }).then((r) => r.json()).then((o) => { if (o.ok) $("refstat").textContent = "Welcome! You and your friend each got 1 free month."; });
}
loadReferral();
let LIVE = false, FLAG = false;
fetch("/api/vc/live").then((r) => r.json()).then((o) => { LIVE = !!o.live; FLAG = !!o.flag; $("optin-row").hidden = !(S.band === "teen" && LIVE); }).catch(() => {});
$("go").onclick = () => { if (U && U.leftSec <= 0) return rest(); S.mode = "pitch"; S.round = 1; S.points = 0; recScreen(); };

// ---- screen 2: record ----
function recScreen() {
  const reb = S.mode === "rebut";
  $("round-tag").textContent = reb ? `Answer back! Round ${S.round} of 3` : "Your pitch";
  $("rec-title").textContent = reb ? "Your answer!" : "Pitch your idea!";
  $("rec-q").textContent = reb ? S.line : challenge();
  $("rec-hint").textContent = reb ? "Talk until the ring fills." : "Tap again when you are done.";
  const ring = $("timer-fill"); if (ring) ring.style.strokeDashoffset = "314";
  $("rec").textContent = "Start talking"; $("rec").classList.remove("on");
  show("s-rec");
}
let mr = null, chunks = [], t0 = 0, tick = null, stream = null;
const pickType = () => ["audio/mp4", "audio/webm;codecs=opus", "audio/webm", "audio/ogg"].find((t) => window.MediaRecorder && MediaRecorder.isTypeSupported(t)) || "";
$("rec").onclick = async () => {
  if (mr && mr.state === "recording") return mr.stop();
  if (!$("consent").checked) return show("s-consent"); // never record without the grown-up switch
  try { stream = await navigator.mediaDevices.getUserMedia({ audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true } }); } catch (e) { $("rec-hint").textContent = "Please let the app use the microphone."; return; }
  chunks = []; mr = new MediaRecorder(stream, pickType() ? { mimeType: pickType(), audioBitsPerSecond: 32000 } : {});
  mr.ondataavailable = (e) => e.data.size && chunks.push(e.data);
  mr.onstop = send;
  mr.start(); t0 = Date.now(); $("rec").textContent = "I'm done"; $("rec").classList.add("on");
  tick = setInterval(() => { const gone = Math.min(60, (Date.now() - t0) / 1000); const ring = $("timer-fill"); if (ring) ring.style.strokeDashoffset = String(314 * (1 - gone / 60)); if (gone >= 60) mr.stop(); }, 250);
};
async function send() {
  clearInterval(tick); stream && stream.getTracks().forEach((t) => t.stop());
  const type = (mr.mimeType || "audio/webm").split(";")[0];
  let blob = new Blob(chunks, { type }); chunks = [];
  show("s-think"); const steps = ["Listening to you...", "Thinking...", "Writing your 3 tips..."]; let k = 0;
  $("think-t").textContent = steps[0]; $("think-bar").style.width = "8%";
  const prog = setInterval(() => { k++; $("think-t").textContent = steps[Math.min(2, Math.floor(k / 4))]; $("think-bar").style.width = Math.min(92, 8 + k * 7) + "%"; }, 500);
  let o;
  try {
    const h = { "x-track": TRACK_ID, "content-type": type, "x-consent": "yes", "x-band": S.band, "x-mode": S.mode, "x-round": String(S.round), "x-seconds": String(Math.round((Date.now() - t0) / 1000)) };
    if (S.mode === "rebut") { h["x-pitch"] = encodeURIComponent(S.pitch.slice(0, 1200)); h["x-q"] = encodeURIComponent(S.line); }
    o = await (await vfetch("/api/vc/coach", { method: "POST", headers: h, body: blob })).json();
  } catch (e) { o = { error: "net" }; }
  clearInterval(prog); $("think-bar").style.width = "100%";
  blob = null; // the sound is gone from this phone too
  if (o.resting) return rest(o.usage, o.daily);
  if (o.error === "consent_needed") return show("s-consent");
  if (o.usage) showUsage(o.usage);
  if (!o.heard) { recScreen(); $("rec-hint").textContent = o.message || "Oops, try again!"; return; }
  tipsScreen(o);
}

// ---- screen 4: tips ----
function tipsScreen(o) {
  S.tips = o.tips || []; const reb = S.mode === "rebut";
  if (S.mode === "pitch") S.pitch = o.transcript || "";
  if (reb) { S.points += PER_ROUND; savePoints(PER_ROUND); }
  S.line = o.line || "";
  const sn = bumpStreak(); $("streak").hidden = false; $("streak").textContent = streakText(sn); $("done-streak").textContent = streakText(sn);
  $("tips-tag").textContent = reb ? `Round ${S.round} of 3` : "Your tips";
  $("tips-title").textContent = o.offTopic ? "Let's try a new idea!" : reb ? "Nice answer!" : "Great job!";
  $("pts").hidden = !reb; $("pts").textContent = `+${PER_ROUND} points! You have ${S.points}.`;
  $("tips").innerHTML = ""; S.tips.forEach((t) => { const li = document.createElement("li"); li.textContent = t; $("tips").append(li); });
  const more = !o.offTopic && !!S.line;
  $("next").textContent = more ? (reb ? "Next round!" : "Answer back!") : reb ? "See my points" : "Try again";
  $("next").onclick = () => {
    if (!more) return reb ? done() : (S.mode = "pitch", recScreen());
    if (reb) S.round += 1; S.mode = "rebut"; oppScreen();
  };
  // Live is ages 13 to 17 with the parent's live OK only. Free kids: offer the 3 minute taste after their first pitch
  // or a strong one (45+ seconds); paid kids always see it.
  const firstPitch = !localStorage.getItem("gks_vc_pitched"); if (S.mode === "pitch") localStorage.setItem("gks_vc_pitched", "1");
  const strong = S.mode === "pitch" && (o.words || 0) >= 90;
  const offer = LIVE && S.band === "teen" && $("optin").checked && S.mode === "pitch" && !o.offTopic &&
    (U && U.daily ? U.liveTasteSec > 0 && (firstPitch || strong) : !!U);
  $("upsell").hidden = !offer;
  $("upsell").querySelector("p").textContent = U && U.daily ? "Want to practice live with your Coach? Try 3 minutes free." : "Want to practice live with your Coach?";
  if (offer && U && U.daily) ev("taste_offered");
  $("live-soon").hidden = !(!LIVE && FLAG && S.band === "teen" && S.mode === "pitch"); // no key yet: say "coming soon", never a broken button
  show("s-tips");
}
$("hear").onclick = () => say(S.tips.join(" "));
$("again").onclick = () => show("s-consent");

// ---- screen 5: friendly challenger ----
function oppScreen() { $("opp-round").textContent = `Round ${S.round} of 3`; $("opp-line").textContent = S.line; show("s-opp"); say(S.line, true); } // auto-play uses the free phone voice; taps use the Coach voice
$("opp-hear").onclick = () => say(S.line);
$("opp-go").onclick = () => { stopSay(); recScreen(); };
function done() { $("done-pts").textContent = `${S.points} points`; show("s-done"); }
$("done-again").onclick = () => show("s-consent");
// Daily streak, on this phone only: days in a row with at least one finished talk.
function bumpStreak() { try { const d = new Date().toLocaleDateString("en-CA"), y = new Date(Date.now() - 864e5).toLocaleDateString("en-CA");
  const s = JSON.parse(localStorage.getItem("gks_vc_streak") || "{}"); if (s.last !== d) { s.n = s.last === y ? (s.n || 0) + 1 : 1; s.last = d; localStorage.setItem("gks_vc_streak", JSON.stringify(s)); } return s.n; } catch (e) { return 1; } }
const streakText = (n) => `🔥 ${n} day${n === 1 ? "" : "s"} in a row!`;
function savePoints(n) { try { localStorage.setItem("gks_answerback_pts", String(Number(localStorage.getItem("gks_answerback_pts") || 0) + n)); } catch (e) {} }

// ---- voice: server voice first, phone voice if that fails ----
let audio = null;
function stopSay() { audio && audio.pause(); window.speechSynthesis && speechSynthesis.cancel(); }
async function say(text, phoneVoice) {
  stopSay(); if (!text) return;
  try {
    if (phoneVoice && window.speechSynthesis) throw 0; // keeps a session under $0.01
    const r = await vfetch("/api/vc/hear", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ text }) });
    if (!r.ok) throw 0; audio = new Audio(URL.createObjectURL(await r.blob())); await audio.play();
  } catch (e) { if (window.speechSynthesis) { const u = new SpeechSynthesisUtterance(text); u.rate = 0.95; speechSynthesis.speak(u); } }
}

// Live talk (ages 13 to 17, parent opt-in). The browser opens a same-origin socket. No API key here.
const SAFETY_LINE = /get a parent or trusted adult to join you/i;
const SAFETY_OWN = /\b(kill (myself|me)|want to die|end my life|suicid\w*|hurt (myself|me)|self[- ]?harm|cut myself|nobody (loves|cares about) me|someone (hurts|is hurting|touched) me|abuse\w*|run away from home)\b/i;
let ws = null, ac = null, src = null, proc = null, playAt = 0, mic = null, said = "", liveSid = null, liveStart = 0, wrapT = null, stopT = null;
function endLive() {
  clearTimeout(wrapT); clearTimeout(stopT);
  if (liveSid) { const secs = (Date.now() - liveStart) / 1000, sid = liveSid; liveSid = null;
    vfetch("/api/vc/usage", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ sid, secs }) }).then((r) => r.json()).then(showUsage).catch(() => {}); } try { ws && ws.close(); } catch (e) {} ws = null; mic && mic.getTracks().forEach((x) => x.stop()); proc && proc.disconnect(); ac && ac.close().catch(() => {}); ac = null; }
function tasteOver() { // the free 3 minutes are used: kid screen + in-app card (and preview test email) for the grown-up
  show("s-tasted");
  vfetch("/api/vc/alert", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ kind: "upsell" }) }).catch(() => {});
}
function safetyStop() {
  endLive(); show("s-safe");
  vfetch("/api/vc/alert", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ kind: "safety" }) }).catch(() => {});
}
const check = (t) => { if (SAFETY_LINE.test(t) || SAFETY_OWN.test(t)) { safetyStop(); return true; } return false; };
$("live").onclick = async () => {
  if (S.band !== "teen" || !$("optin").checked || !$("consent").checked) return;
  show("s-live"); $("live-title").textContent = "Connecting..."; $("live-text").textContent = ""; said = "";
  try {
    const t = await (await vfetch("/api/vc/live", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ band: S.band, parentOptIn: $("optin").checked, consent: $("consent").checked }) })).json();
    if (t.resting) return rest(t.usage);
    if (!t.connect_url) throw 0;
    liveSid = t.sid; liveStart = Date.now();
    // Wrap up with a friendly line 20 s before the limit, then close.
    wrapT = setTimeout(() => { if (ws && ws.readyState === 1) { ws.send(JSON.stringify({ type: "conversation.item.create", item: { type: "message", role: "user", content: [{ type: "input_text", text: "Time is almost up. Say one short, friendly goodbye line and cheer me on." }] } })); ws.send(JSON.stringify({ type: "response.create" })); } }, Math.max(5, t.maxSecs - 20) * 1000);
    stopT = setTimeout(() => { endLive(); if (t.taste) tasteOver(); else $("live-title").textContent = "Great practice!"; }, t.maxSecs * 1000);
    mic = await navigator.mediaDevices.getUserMedia({ audio: true });
    ac = new AudioContext({ sampleRate: 24000 });
    const open = (url, voice, instructions) => new Promise((ok, bad) => {
      const u = new URL(url, location.origin); u.protocol = location.protocol === "https:" ? "wss:" : "ws:";
      const w = new WebSocket(u.href); let ready = false;
      w.onopen = () => w.send(JSON.stringify({ type: "session.update", session: { instructions, ...(voice ? { voice } : {}), audio: { input: { format: { type: "audio/pcm", rate: 24000 } }, output: { format: { type: "audio/pcm", rate: 24000 } } }, turn_detection: { type: "server_vad" } } }));
      w.onmessage = (m) => { if (!ready && /"session\.updated"/.test(m.data)) { ready = true; ok(w); } };
      w.onerror = w.onclose = () => { if (!ready) bad(); };
      setTimeout(() => { if (!ready) { try { w.close(); } catch (e) {} bad(); } }, 8000);
    });
    ws = await open(t.connect_url, t.voice, t.instructions);
    {
      // wait for session.updated before sending, or the agent cancels our response
      ws.send(JSON.stringify({ type: "conversation.item.create", item: { type: "message", role: "user", content: [{ type: "input_text", text: "Hi coach! I am ready to practice my pitch and play Answer back." }] } }));
      ws.send(JSON.stringify({ type: "response.create" }));
      src = ac.createMediaStreamSource(mic); proc = ac.createScriptProcessor(4096, 1, 1);
      proc.onaudioprocess = (e) => { if (!ws || ws.readyState !== 1) return; const f = e.inputBuffer.getChannelData(0), p = new Int16Array(f.length);
        for (let i = 0; i < f.length; i++) p[i] = Math.max(-1, Math.min(1, f[i])) * 0x7fff;
        let s = ""; const u = new Uint8Array(p.buffer); for (let i = 0; i < u.length; i++) s += String.fromCharCode(u[i]);
        ws.send(JSON.stringify({ type: "input_audio_buffer.append", audio: btoa(s) })); };
      src.connect(proc); proc.connect(ac.destination);
      $("live-title").textContent = "Say your pitch!";
    }
    ws.onmessage = (m) => { let e; try { e = JSON.parse(m.data); } catch (x) { return; }
      if (e.type === "response.created") { said = ""; $("live-text").textContent = ""; }
      if (e.type === "response.output_audio.delta" && ac) playPcm(e.delta);
      if (e.type === "response.output_audio_transcript.delta") { said += e.delta; $("live-text").textContent = said; check(said); }
      if (e.type === "conversation.item.input_audio_transcription.completed") check(String(e.transcript || "")); // kid's words, checked on this phone only
    };
    ws.onclose = () => { if (!$("s-safe").hidden) return; $("live-title").textContent = "All done!"; };
    $("live-stop").onclick = () => { endLive(); show("s-tips"); };
  } catch (e) { endLive(); $("live-title").textContent = "Live talk is not ready yet."; $("live-stop").onclick = () => show("s-tips"); }
};
function playPcm(b64) {
  const s = atob(b64), n = s.length / 2, buf = ac.createBuffer(1, n, 24000), d = buf.getChannelData(0), v = new DataView(new ArrayBuffer(s.length));
  for (let i = 0; i < s.length; i++) v.setUint8(i, s.charCodeAt(i));
  for (let i = 0; i < n; i++) d[i] = v.getInt16(i * 2, true) / 0x8000;
  const node = ac.createBufferSource(); node.buffer = buf; node.connect(ac.destination);
  playAt = Math.max(playAt, ac.currentTime); node.start(playAt); playAt += buf.duration;
}
// Preview-only test hook so the safety screen can be checked without anyone saying anything unsafe.
if (/\.gpskids-speak\.pages\.dev$/.test(location.hostname) && location.hostname !== "gpskids-speak.pages.dev") window.__vcSafetyTest = () => check("Let's get a parent or trusted adult to join you.");

// Coach's name: one constant (public/vc-config.js). Every "Coach" on screen, including text set later, uses it.
const LBL = new RegExp("(?<!" + COACH_LABEL.replace(/Coach$/, "").replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + ")\\bCoach\\b", "g");
const relabel = (root) => { if (COACH_LABEL === "Coach") return; const w = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  for (let n; (n = w.nextNode());) { const v = n.nodeValue.replace(LBL, COACH_LABEL); if (v !== n.nodeValue) n.nodeValue = v; } };
relabel(document.body);
new MutationObserver((ms) => ms.forEach((x) => x.addedNodes.forEach((n) => relabel(n.nodeType === 3 ? n.parentNode || document.body : n)))).observe(document.body, { childList: true, subtree: true });
document.title = COACH_LABEL + " (preview) | GPS Kids Speak";
