// Free coaching taste (home page hero, PREVIEW). Kid talks to Coach for up to 3 minutes (no timer on screen: a soft fill ring),
// gets a summary card, then a grown-up can save it with their email. No child name, email, photo, audio or words are stored.
const $ = (id) => document.getElementById(id);
const root = $("fc"); if (root) init();
function init() {
  document.body.classList.add("fc-on");
  const post = (u, b) => fetch(u, { method: "POST", headers: { "content-type": "application/json", ...(window.__fcTest ? { "x-gks-test": "count" } : {}) }, body: JSON.stringify(b) }).then(async (r) => ({ status: r.status, ...(await r.json().catch(() => ({}))) }));
  let device = localStorage.getItem("gks-fc-dev"); if (!device) { device = crypto.randomUUID(); localStorage.setItem("gks-fc-dev", device); }
  let topic = "me", heard = "", ws, ac, mic, proc, src, playAt = 0, t0 = 0, raf, wrapT, stopT, ended = true;
  const show = (id, on = true) => { $(id).hidden = !on; };
  const stage = (s) => { ["fc-start", "fc-live", "fc-type", "fc-sum"].forEach((id) => show(id, id === s)); };
  // topic chips
  root.querySelectorAll(".fc-chip").forEach((c) => c.addEventListener("click", () => {
    topic = c.dataset.topic; root.querySelectorAll(".fc-chip").forEach((x) => x.setAttribute("aria-pressed", String(x === c)));
    $("fc-q").textContent = c.textContent.replace(/^\S+\s/, ""); }));
  // iOS: audio only plays after a tap, so unlock an AudioContext inside the tap itself
  function unlock() { try { ac = ac || new (window.AudioContext || window.webkitAudioContext)({ sampleRate: 24000 }); if (ac.state === "suspended") ac.resume(); const b = ac.createBuffer(1, 1, 24000), s = ac.createBufferSource(); s.buffer = b; s.connect(ac.destination); s.start(0); } catch (e) {} }
  $("fc-orb").addEventListener("click", start);
  $("fc-typebtn").addEventListener("click", () => openType(""));
  async function start() {
    if (!ended) return stop("done"); unlock(); $("fc-err").textContent = "";
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) return openType("This phone can't use the microphone here. Type your answer instead!");
    try { mic = await navigator.mediaDevices.getUserMedia({ audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true } }); }
    catch (e) { return openType("The microphone is off. That's OK! Type your answer below. To talk next time, tap Allow when your phone asks, or turn the microphone on in settings."); }
    const t = await post("/api/fc/session", { device, topic }).catch(() => ({}));
    if (!t.connect_url) { stopMic(); return openType(t.message || "Coach can't talk right now. Type your answer below!"); }
    stage("fc-live"); $("fc-state").textContent = "Connecting..."; heard = ""; ended = false; $("fc-wrap").hidden = true;
    try {
      ws = await new Promise((ok, bad) => {
        const u = new URL(t.connect_url, location.origin); u.protocol = location.protocol === "https:" ? "wss:" : "ws:";
        const w = new WebSocket(u.href); let r = false;
        w.onopen = () => w.send(JSON.stringify({ type: "session.update", session: { instructions: t.instructions, ...(t.voice ? { voice: t.voice } : {}), turn_detection: { type: "server_vad" },
          audio: { input: { format: { type: "audio/pcm", rate: 24000 } }, output: { format: { type: "audio/pcm", rate: 24000 } } } } }));
        w.onmessage = (m) => { if (!r && /"session\.updated"/.test(m.data)) { r = true; ok(w); } };
        w.onerror = w.onclose = () => { if (!r) bad(); }; setTimeout(() => { if (!r) { try { w.close(); } catch (e) {} bad(); } }, 8000);
      });
      ws.onmessage = onMsg; ws.onclose = () => { if (!ended) stop("done"); };
      ws.send(JSON.stringify({ type: "response.create" }));
      src = ac.createMediaStreamSource(mic); proc = ac.createScriptProcessor(4096, 1, 1);
      proc.onaudioprocess = (e) => { if (!ws || ws.readyState !== 1) return; const f = e.inputBuffer.getChannelData(0), p = new Int16Array(f.length);
        for (let i = 0; i < f.length; i++) p[i] = Math.max(-1, Math.min(1, f[i])) * 0x7fff; let s = ""; const u = new Uint8Array(p.buffer);
        for (let i = 0; i < u.length; i++) s += String.fromCharCode(u[i]); ws.send(JSON.stringify({ type: "input_audio_buffer.append", audio: btoa(s) })); };
      src.connect(proc); proc.connect(ac.destination);
      $("fc-state").textContent = "Coach is listening. Talk to me!"; t0 = Date.now(); ring(t.max_seconds);
      wrapT = setTimeout(() => { $("fc-wrap").hidden = false; say("Time is nearly up. Do not mention a timer. Wrap up warmly in two short sentences with one big win."); }, (t.max_seconds - 20) * 1000);
      stopT = setTimeout(() => stop("done"), t.max_seconds * 1000);
    } catch (e) { stop("fail"); openType("Coach couldn't connect. Type your answer below!"); }
  }
  function ring(max) { const c = $("fc-fill"); const draw = () => { const f = Math.min(1, (Date.now() - t0) / (max * 1000)); c.style.strokeDashoffset = String(314 * (1 - f)); if (!ended) raf = requestAnimationFrame(draw); }; draw(); }
  function say(text) { if (ws && ws.readyState === 1) { ws.send(JSON.stringify({ type: "conversation.item.create", item: { type: "message", role: "user", content: [{ type: "input_text", text }] } })); ws.send(JSON.stringify({ type: "response.create" })); } }
  function onMsg(m) { let e; try { e = JSON.parse(m.data); } catch (x) { return; }
    if (e.type === "response.created") $("fc-live-orb").classList.add("talk");
    if (e.type === "response.done") $("fc-live-orb").classList.remove("talk");
    if (e.type === "response.output_audio.delta" && ac) play(e.delta);
    if (e.type === "conversation.item.input_audio_transcription.completed") heard += " " + String(e.transcript || ""); }
  function play(b64) { const s = atob(b64), n = s.length >> 1, f = new Float32Array(n); for (let i = 0; i < n; i++) { let v = s.charCodeAt(2 * i) | (s.charCodeAt(2 * i + 1) << 8); if (v > 32767) v -= 65536; f[i] = v / 32768; }
    const buf = ac.createBuffer(1, n, 24000); buf.copyToChannel(f, 0); const sN = ac.createBufferSource(); sN.buffer = buf; sN.connect(ac.destination); playAt = Math.max(playAt, ac.currentTime); sN.start(playAt); playAt += buf.duration; }
  function stopMic() { try { mic && mic.getTracks().forEach((t) => t.stop()); } catch (e) {} mic = null; }
  function stop(why) { if (ended) return; ended = true; clearTimeout(wrapT); clearTimeout(stopT); cancelAnimationFrame(raf);
    try { proc && proc.disconnect(); src && src.disconnect(); } catch (e) {} try { ws && ws.close(); } catch (e) {} ws = null; stopMic();
    if (why === "done") summary(heard, Math.round((Date.now() - t0) / 1000)); }
  $("fc-end").addEventListener("click", () => stop("done"));
  // text fallback
  function openType(msg) { stage("fc-type"); $("fc-type-msg").textContent = msg || "Type what you would say. Coach will give you stars!"; $("fc-type-q").textContent = $("fc-q").textContent; setTimeout(() => $("fc-text").focus(), 50); }
  $("fc-type-go").addEventListener("click", () => { const v = $("fc-text").value.trim(); if (v.split(/\s+/).filter(Boolean).length < 3) { $("fc-type-err").textContent = "Write a few more words, then tap again."; return; } $("fc-type-err").textContent = ""; summary(v, 0); });
  $("fc-back").addEventListener("click", () => stage("fc-start"));
  // summary card: worked out on this phone only (the words never leave it)
  function score(text, secs) {
    const w = text.toLowerCase().match(/[a-z']+/g) || [], n = w.length, fill = w.filter((x) => /^(um+|uh+|like|so|basically)$/.test(x)).length;
    const sent = text.split(/[.!?]+/).map((s) => s.trim()).filter((s) => s.split(/\s+/).length >= 3), why = /\b(because|so that|that's why)\b/i.test(text), feel = /\b(love|like|fun|happy|excited|favorite|best)\b/i.test(text);
    let pts = 50 + Math.min(25, n / 2) + (why ? 10 : 0) + (feel ? 5 : 0) + Math.min(10, sent.length * 3) - Math.min(20, fill * 3) + (secs > 60 ? 5 : 0);
    pts = Math.max(40, Math.min(100, Math.round(pts)));
    const best = why ? "You gave a reason with \"because\". That makes people believe you!" : feel ? "You told us how you feel. That makes it fun to listen!" : n >= 25 ? "You kept going and filled your talk with ideas!" : "You were brave and started talking. That's the hardest part!";
    const tip = fill >= 3 ? "Try a quiet pause instead of \"um\". Pauses sound smart!" : !why ? "Add one \"because\" to tell us why." : sent.length < 3 ? "Add one more sentence with a fun detail." : "End with a big finish line, then smile.";
    return { pts, stars: pts >= 85 ? 3 : pts >= 65 ? 2 : 1, best, tip };
  }
  function summary(text, secs) {
    const s = score(text || "", secs); stage("fc-sum");
    $("fc-score").textContent = s.pts; $("fc-stars").textContent = "⭐".repeat(s.stars) + "☆".repeat(3 - s.stars); $("fc-best").textContent = s.best; $("fc-tip").textContent = s.tip;
    localStorage.setItem("gks-fc-last", JSON.stringify({ pts: s.pts, at: Date.now() }));
    setTimeout(() => { if (!localStorage.getItem("gks-fc-lead")) show("fc-pop"); }, 900);
  }
  $("fc-again").addEventListener("click", () => stage("fc-start"));
  $("fc-keep").addEventListener("click", () => show("fc-pop"));
  // grown-up popup + lead form
  $("fc-no").addEventListener("click", () => show("fc-pop", false));
  $("fc-yes").addEventListener("click", async () => {
    const gate = window.gpsGrownUp;
    if (gate && !(await gate("Saving a practice note is for a grown-up."))) return;
    $("fc-pop-ask").hidden = true; $("fc-form").hidden = false; setTimeout(() => $("fc-first").focus(), 50);
  });
  let band = "";
  root.querySelectorAll(".fc-age").forEach((c) => c.addEventListener("click", () => { band = c.dataset.band; root.querySelectorAll(".fc-age").forEach((x) => x.setAttribute("aria-pressed", String(x === c))); }));
  $("fc-form").addEventListener("submit", async (e) => { e.preventDefault();
    const first = $("fc-first").value.trim(), email = $("fc-email").value.trim(), err = $("fc-form-err");
    if (!first) return (err.textContent = "Please add your first name.");
    if (!/^\S+@\S+\.\S+$/.test(email)) return (err.textContent = "Please add a good email.");
    if (!band) return (err.textContent = "Please tap your kid's age.");
    if (!$("fc-consent").checked) return (err.textContent = "Please tick the box so we can email you.");
    err.textContent = ""; $("fc-send").disabled = true;
    const r = await post("/api/fc/lead", { first, email, band, consent: true }).catch(() => ({}));
    $("fc-send").disabled = false;
    if (!r.ok) return (err.textContent = "That didn't save. Please try again.");
    localStorage.setItem("gks-fc-lead", "1"); window.__fcLead = { first, email, band }; try { localStorage.setItem("gks-fc-band", band); } catch (_) {}
    $("fc-form").hidden = true; $("fc-thanks").hidden = false; });
  $("fc-startfree").addEventListener("click", () => { show("fc-pop", false); document.body.classList.add("embed-choice");
    const l = window.__fcLead || {}; const free = document.querySelector('.pick[data-plan="free"]'); if (free) free.click();
    setTimeout(() => { if ($("l-email")) $("l-email").value = l.email || ""; if ($("l-name") && !$("l-name").value) $("l-name").value = l.first || ""; const lb = $("l-band"), map = { "5-7": "5-8", "8-10": "9-12", "11-13": "9-12", "14-17": "13-17" }; if (lb && l.band && map[l.band] && !lb.value) { lb.value = map[l.band]; lb.dispatchEvent(new Event("change", { bubbles: true })); } const s = $("signup"); if (s) s.scrollIntoView({ behavior: "smooth", block: "start" }); }, 60); });
}
// Fit to the visible screen (keyboard aware): --fc-vh follows visualViewport so the main button stays above the keyboard.
(() => { const vv = window.visualViewport, set = () => document.documentElement.style.setProperty("--fc-vh", (vv ? vv.height : innerHeight) + "px");
  set(); (vv || window).addEventListener("resize", set);
  document.addEventListener("focusin", (e) => { if (e.target.closest && e.target.closest(".fc-pop")) setTimeout(() => e.target.scrollIntoView({ block: "center" }), 250); }); })();
