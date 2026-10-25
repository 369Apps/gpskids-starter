// Talk to the AI Coach. Audio is not stored. Live voice, when configured, goes through this site's own socket.
// Works on /try and inline on the home page (#vh-root): a missing element gets a detached stand-in so nothing throws.
const STUB = {}; const $ = (id) => document.getElementById(id) || (STUB[id] = STUB[id] || document.createElement(id === "l-band" ? "select" : "div"));
const INLINE = !!document.getElementById("vh-root");
const post = (u, b) => fetch(u, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(b) }).then((r) => r.json().catch(() => ({})));
const evt = (ev, prop) => post("/api/try/config", { ev, prop }).catch(() => {});
const utm = Object.fromEntries([...new URLSearchParams(location.search)].filter(([k]) => /^utm_(source|medium|campaign)$/.test(k)).map(([k, v]) => [k, v.slice(0, 80)]));
let device = localStorage.getItem("gks-try-dev"); if (!device) { device = crypto.randomUUID(); localStorage.setItem("gks-try-dev", device); }
let CFG = { voice: false }, tsGate = null, tsLead = null, tsGateTok = "", tsLeadTok = "";
const show = (id, on = true) => { $(id).hidden = !on; };
const EMBED = INLINE; // home page inline voice widget (gpskids.app/)
if (EMBED) document.body.classList.add("embed");
evt("page_view", INLINE ? "home" : utm.utm_source ? "utm" : document.referrer ? "ref" : "direct");

// Turnstile (explicit render). Preview uses Cloudflare's always-pass test sitekey unless a real one is set.
function loadTs() { return new Promise((ok) => { if (window.turnstile) return ok(); const s = document.createElement("script"); s.src = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit"; s.onload = () => ok(); s.onerror = () => ok(); document.head.appendChild(s); }); }
let tsErr = false;
function renderTs(el, cb) { if (!window.turnstile) return null; return window.turnstile.render(el, { sitekey: CFG.sitekey, ...(el.id === "g-ts" && INLINE ? { size: "compact", appearance: "interaction-only" } : {}), callback: (t) => { tsErr = false; cb(t); }, "expired-callback": () => cb(""), "error-callback": () => { tsErr = true; cb(""); evt("turnstile_failed"); } }); }
const resetTs = (w) => { try { if (w != null) window.turnstile.reset(w); } catch (e) {} };

(async () => {
  CFG = await fetch("/api/try/config").then((r) => r.json()).catch(() => ({ voice: false })); window.__cfgReady = true;
  if (!CFG.voice) { $("talk").textContent = "Try it free"; show("paused"); }
  // Turnstile is not needed for first paint: load it when the sign-up form is near (the send button also loads it on demand).
  const near = new IntersectionObserver(async (es) => { if (!es.some((e) => e.isIntersecting)) return; near.disconnect(); await loadTs(); if (tsLead == null) tsLead = renderTs($("l-ts"), onLeadTs); }, { rootMargin: "900px 0px" });
  near.observe($("signup"));
})();
// Sticky one-button bar: "Start free" only while no other main button (hero, plan table, form, paid card) is on screen.
(() => {
  const watch = ["talk", "plans", "signup", "paid", "m-gate", "m-done"].map((id) => $(id)).filter(Boolean), on = new Set();
  const upd = () => { const show_ = on.size === 0 && !document.body.classList.contains("paid-mode") && scrollY > 200; $("stick").hidden = !show_; document.body.classList.toggle("stick-on", show_); };
  const io = new IntersectionObserver((es) => { es.forEach((e) => (e.isIntersecting && !e.target.hidden ? on.add(e.target.id) : on.delete(e.target.id))); upd(); });
  watch.forEach((el) => io.observe(el)); addEventListener("scroll", upd, { passive: true });
  $("stick-btn").onclick = () => { evt("sticky_start_free"); pickPlan("free"); };
})();

// ---------- gate ----------
const gateReady = () => { $("g-start").disabled = !($("g-adult").checked && $("g-ai").checked && tsGateTok); };
$("g-adult").onchange = $("g-ai").onchange = gateReady;
$("talk").onclick = async () => {
  evt("demo_button_click");
  if (!CFG.voice) { if (INLINE) return embedChoice(); location.hash = "signup"; $("l-email").focus(); return; }
  show("m-gate"); evt("gate_shown"); $("g-err").textContent = "";
  if (tsGate == null) { await loadTs(); tsGate = renderTs($("g-ts"), (t) => { tsGateTok = t; gateReady(); }); }
};
$("g-close").onclick = () => show("m-gate", false);
$("tryfree").onclick = $("d-free").onclick = () => { show("m-done", false); evt("free_signup_started"); };

// ---------- live demo ----------
let ws, ac, mic, src, proc, playAt = 0, sid = null, t0 = 0, tick, wrapT, stopT, said = "", ended = false, leadId = null, pending = false, closing = false, respDone = false, inflight = 0;
const SAFETY = /\b(kill (myself|me)|hurt (myself|me)|suicid\w*|self[- ]harm|want to die|abus\w*|988)\b/i;
$("g-start").onclick = async () => {
  if ($("g-start").disabled) return; $("g-start").disabled = true; evt("gate_completed");
  // mic permission only after the gate and Turnstile
  try { mic = await navigator.mediaDevices.getUserMedia({ audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true } }); }
  catch (e) { evt("mic_denied"); $("g-err").textContent = "We need your microphone to talk. Tap Allow when your browser asks, or turn the microphone on in your browser settings, then tap again."; gateReady(); return; }
  const tc = new URLSearchParams(location.search).get("test_cap"); // honored on preview hosts only
  const t = await post("/api/try/session", { turnstile: tsGateTok, adult: true, ai: true, device, ...(tc ? { test_cap: Number(tc) } : {}) });
  tsGateTok = ""; resetTs(tsGate); // Turnstile tokens are single use
  if (!t.connect_url) { stopMic(); $("g-err").textContent = t.message || "The AI Coach can't start right now. You can still start free."; if (t.error === "device_limit" || t.error === "voice_paused") { show("m-gate", false); done(t.message); } return; }
  show("m-gate", false); if (INLINE) show("talk", false); show("m-live"); $("v-state").textContent = "Connecting..."; sid = t.session_id; ended = false; said = "";
  try {
    ac = new AudioContext({ sampleRate: 24000 }); playAt = 0;
    const open = () => new Promise((ok, bad) => {
      const u = new URL(t.connect_url, location.origin); u.protocol = location.protocol === "https:" ? "wss:" : "ws:";
      const w = new WebSocket(u.href); let ready = false;
      w.onopen = () => w.send(JSON.stringify({ type: "session.update", session: { tools: t.tools, instructions: t.instructions, ...(t.voice ? { voice: t.voice } : {}),
        audio: { input: { format: { type: "audio/pcm", rate: 24000 } }, output: { format: { type: "audio/pcm", rate: 24000 } } }, turn_detection: { type: "server_vad" } } }));
      w.onmessage = (m) => { if (!ready && /"session\.updated"/.test(m.data)) { ready = true; ok(w); } };
      w.onerror = w.onclose = () => { if (!ready) bad(); };
      setTimeout(() => { if (!ready) { try { w.close(); } catch (e) {} bad(); } }, 8000);
    });
    ws = await open();
    // session.updated received: now it is safe to send
    t0 = Date.now(); startTimer(t.max_seconds);
    ws.onmessage = onMsg; ws.onclose = () => { if (!ended) finish("user_left"); };
    // the agent greets on its own; sending anything while that greeting runs cancels it. Only nudge if no greeting starts.
    let greeted = false; const g0 = ws.onmessage; ws.onmessage = (m) => { if (/"response\.created"/.test(m.data)) greeted = true; return g0(m); };
    setTimeout(() => { if (!greeted && ws && ws.readyState === 1) ws.send(JSON.stringify({ type: "response.create" })); }, 300);
    src = ac.createMediaStreamSource(mic); proc = ac.createScriptProcessor(4096, 1, 1);
    proc.onaudioprocess = (e) => { if (!ws || ws.readyState !== 1) return; const f = e.inputBuffer.getChannelData(0), p = new Int16Array(f.length);
      for (let i = 0; i < f.length; i++) p[i] = Math.max(-1, Math.min(1, f[i])) * 0x7fff;
      let s = ""; const u = new Uint8Array(p.buffer); for (let i = 0; i < u.length; i++) s += String.fromCharCode(u[i]);
      ws.send(JSON.stringify({ type: "input_audio_buffer.append", audio: btoa(s) })); };
    src.connect(proc); proc.connect(ac.destination);
    $("v-state").textContent = "Say hi to the AI Coach!";
  } catch (e) { finish("user_left", "The AI Coach couldn't connect. You can still start free."); }
};
function startTimer(max) {
  tick = setInterval(() => {}, 500);
  // quiet cap (no timer on screen): about 45 s before the end the coach wraps up warmly, then the form shows
  wrapT = setTimeout(() => sendText("We are near the end of our time today. Do not mention a timer. Finish your current thought, then wrap up warmly in two short sentences. If you are talking with a grown-up, say the free plan is on the screen. If you are talking with a kid, say: Ask your grown-up to tap the button to keep going. Then call end_session with reason time_limit."), Math.max(10, max - 45) * 1000);
  stopT = setTimeout(() => finish("time_limit"), (max + 10) * 1000);
}
function sendText(text) { if (ws && ws.readyState === 1) { ws.send(JSON.stringify({ type: "conversation.item.create", item: { type: "message", role: "user", content: [{ type: "input_text", text }] } })); ws.send(JSON.stringify({ type: "response.create" })); } }
const checkSafe = (s) => { if (SAFETY.test(s)) { evt("safety_handoff", "crisis"); show("m-safe"); } };
async function onMsg(m) {
  let e; try { e = JSON.parse(m.data); } catch (x) { return; }
  if (e.type === "response.created") { said = ""; $("v-orb").classList.add("talk"); }
  if (e.type === "response.created") respDone = false;
  if (e.type === "response.done") { $("v-orb").classList.remove("talk"); respDone = true; kick(); }
  if (e.type === "response.output_audio.delta" && ac) playPcm(e.delta);
  if (e.type === "response.output_audio_transcript.delta") { said += e.delta; $("v-said").textContent = (INLINE ? "Coach: " : "") + said.replace(/\s*[\u2014\u2013]\s*/g, ", ").slice(-220); }
  if (e.type === "conversation.item.input_audio_transcription.completed") { checkSafe(String(e.transcript || "")); const h = String(e.transcript || "").trim(); if (h) $("v-heard").textContent = "You: " + h.slice(-160); } // checked on this phone only, never sent to us
  if (e.type === "response.function_call_arguments.done") await runTool(e.name, e.call_id, e.arguments);
}
const kick = () => { if (pending && respDone && inflight === 0) { pending = false; if (ws && ws.readyState === 1 && !closing) ws.send(JSON.stringify({ type: "response.create" })); } };
async function runTool(name, callId, argStr) {
  inflight++;
  let args = {}; try { args = JSON.parse(argStr || "{}"); } catch (x) {}
  if (name === "transfer_call") { name = "request_human_callback"; args = { reason: "question" }; } // the agent's built-in transfer becomes a callback request
  let out = { ok: false };
  if (name === "start_free_signup") { out = await post("/api/try/tool", { session_id: sid, name, args }); if (leadId) prefill(); }
  else out = await post("/api/try/tool", { session_id: sid, name, args, utm });
  if ((name === "capture_lead" || name === "save_lead") && out.ok) { leadId = out.lead_id; window.__lead = { ...(window.__lead || {}), ...args }; }
  if (name === "set_speaker" && out.ok) speaker = args.speaker;
  if (out.ghl_stub) window.__ghlStub = out.ghl_stub; // preview only: the exact GHL payload (never sent)
  if (name === "show_plan" && out.ok) highlight(args.plan);
  // one response.create after the whole response is done (several tools can be called at once)
  if (ws && ws.readyState === 1) { ws.send(JSON.stringify({ type: "conversation.item.create", item: { type: "function_call_output", call_id: callId, output: JSON.stringify(out) } })); if (!out.end) pending = true; }
  if (out.end) closing = true;
  inflight--; kick();
  if (out.end) setTimeout(() => finish(args.reason || "completed"), 4000); // let the goodbye line play
}
let speaker = null;
function prefill() { const l = window.__lead || {}; if (l.email) $("l-email").value = l.email; if (l.phone) $("l-phone").value = l.phone; if (l.parent_name && !$("l-name").value) $("l-name").value = l.parent_name; if (l.child_age_band && $("l-band")) $("l-band").value = l.child_age_band; }
// After a kid-only talk: kids are never asked for contact info. One big card asks a grown-up to tap; the tap opens the grown-up form.
function kidCard() {
  if (speaker !== "kid" || leadId || document.getElementById("kid-card")) return false;
  const c = document.createElement("div"); c.id = "kid-card"; c.className = "kid-card"; c.setAttribute("role", "dialog");
  c.innerHTML = '<p class="kc-big">🙌 You did great!</p><p class="kc-sub">Now pass the phone to your <span style="white-space:nowrap">grown-up</span>.</p><button type="button" class="big btn btn-go" id="kc-go">👋 Grown-up, tap here</button>';
  document.body.appendChild(c); evt("kid_card_shown");
  $("kc-go").onclick = () => { evt("kid_card_tap"); c.remove(); speaker = "parent"; if (EMBED) embedChoice(); else { show("signup"); $("signup").scrollIntoView({ behavior: "smooth" }); } setTimeout(() => $("l-name").focus(), 400); };
  return true;
}
function highlight(plan) { document.querySelectorAll(".plan").forEach((p) => p.classList.toggle("flash", p.dataset.plan === plan)); setTimeout(() => document.querySelectorAll(".plan.flash").forEach((p) => p.classList.remove("flash")), 2500); pickPlan(plan, false); }
// plan picker: all 3 cards tappable, Free picked by default (free first)
const PLAN_NAME = { free: "Free forever", founding_family: "Founding Family ($20/mo)", pro: "Pro ($100/mo)", all_access: "All Access ($200/mo)" };
const PLAN_SHOW = { free: "Free forever $0", founding_family: "Founding Family $20/mo", pro: "Pro $100/mo", all_access: "All Access $200/mo" };
// only 2 plans visible at once: tab Online (Free vs Founding) or In person (Pro vs All Access)
const showTab = (inp) => { show("tab-online", !inp); show("tab-inperson", inp); $("t-online").classList.toggle("on", !inp); $("t-inperson").classList.toggle("on", inp); $("t-online").setAttribute("aria-selected", String(!inp)); $("t-inperson").setAttribute("aria-selected", String(inp)); };
$("t-online").onclick = () => showTab(false); $("t-inperson").onclick = () => { showTab(true); evt("plans_explained", "inperson"); };
const showPair = showTab;
let plan = "free";
function pickPlan(v, jump = true) {
  if (!PLAN_NAME[v]) return; plan = v; showPair(v === "pro" || v === "all_access");
  document.querySelectorAll(".plan").forEach((p) => { const on = p.dataset.plan === v; p.classList.toggle("sel", on); p.setAttribute("aria-pressed", on ? "true" : "false"); });
  $("l-plan").textContent = PLAN_SHOW[v]; $("l-msg").textContent = "";
  mode = v === "free" ? "free" : "pay"; setLabels();
  if (jump) {
    // one tap = obvious feedback: focus email in the same tap (so iPhone opens the keyboard), scroll the box to the top, pulse "You picked"
    const box = $("signup"), em = $("l-name");
    try { em.focus({ preventScroll: true }); } catch (x) { em.focus(); }
    const top = box.getBoundingClientRect().top + window.pageYOffset - 8;
    try { window.scrollTo({ top, behavior: "smooth" }); } catch (x) { window.scrollTo(0, top); }
    setTimeout(() => { if (Math.abs(box.getBoundingClientRect().top - 8) > 40) window.scrollTo(0, box.getBoundingClientRect().top + window.pageYOffset - 8); }, 700); // smooth scroll can be cancelled on iOS
    box.classList.remove("pulse"); void box.offsetWidth; box.classList.add("pulse");
    evt("show_plan", v);
  }
}
// every CTA -> the sign-up box with the plan picked; paid plans continue to Stripe from there
let mode = "free"; // free | pay | call
function setLabels() {
  $("l-h").textContent = mode === "call" ? "Request a call" : mode === "pay" ? "Join " + PLAN_NAME[plan].split(" (")[0] : "Start free";
  $("l-send").textContent = mode === "call" ? "Request a call" : mode === "pay" ? "Continue to payment" : "Start free";
}
document.querySelectorAll("th.plan,.pick[data-plan]").forEach((p) => { p.onclick = () => { if (p.classList.contains("pay")) evt("show_plan", p.dataset.plan + ":join"); pickPlan(p.dataset.plan); }; });
$("l-usephone").onclick = () => { const ph = $("l-phone-l").hidden; show("l-phone-l", ph); $("l-email-t").textContent = ph ? "Email (optional)" : "Email"; $("l-usephone").textContent = ph ? "Use my email instead" : "Use my phone instead"; (ph ? $("l-phone") : $("l-email")).focus(); };
// keep the main button visible above the on-screen keyboard
const keepBtn = () => { const vv = window.visualViewport, b = $("l-send"); if (!vv || !b) return; const r = b.getBoundingClientRect(); if (r.bottom > vv.height - 8) window.scrollBy(0, r.bottom - vv.height + 16); };
if (window.visualViewport) visualViewport.addEventListener("resize", () => { const a = document.activeElement; if (a && a.closest && a.closest("#lead")) keepBtn(); });
["l-name", "l-email", "l-phone", "l-band"].forEach((id) => $(id).addEventListener("focus", () => setTimeout(keepBtn, 350)));
// paid plans: one tap -> Stripe Checkout. If checkout is off (prod for now) or fails, fall back to the call request form.
async function pay(btn) {
  const v = btn.dataset.plan, label = btn.textContent; btn.disabled = true; btn.textContent = "Opening checkout...";
  let r = {}; try { r = await post("/api/try/checkout", { plan: v }); } catch (x) {}
  if (r.url) { window.location.href = r.url; return; }
  btn.disabled = false; btn.textContent = label; pickPlan(v); if (!r.off) $("l-msg").textContent = "Checkout didn't open. Leave your email and we'll call you.";
}
$("l-call").onclick = () => { show("signup"); if (plan === "free") pickPlan("founding_family"); else pickPlan(plan); mode = "call"; setLabels(); };
// back from Stripe: ?paid=<plan>&session_id=...
(async () => {
  const q = new URLSearchParams(location.search), sid = q.get("session_id"); if (!q.get("paid") || !sid) return;
  // Paid view: move the card to the top and hide the rest, so late layout (fonts, Turnstile, iOS scroll restore) can't push it off screen.
  try { history.scrollRestoration = "manual"; } catch (x) {}
  const card = $("paid"), main = card.parentNode; main.insertBefore(card, main.firstChild);
  document.body.classList.add("paid-mode"); show("paid"); show("signup", false); window.scrollTo(0, 0);
  const top = () => { if (document.body.classList.contains("paid-mode")) window.scrollTo(0, 0); };
  window.addEventListener("load", top); setTimeout(top, 600); setTimeout(top, 1800);
  $("pd-more").onclick = () => { document.body.classList.remove("paid-mode"); show("signup"); };
  $("pd-msg").textContent = "Confirming your payment…";
  let r = {};
  for (let i = 0; i < 6 && !r.paid; i++) { // slow check or a brief lag: retry for ~15s
    r = await fetch("/api/try/checkout?session_id=" + encodeURIComponent(sid), { cache: "no-store" }).then((x) => x.json()).catch(() => ({}));
    if (!r.paid) { if (i === 1) $("pd-msg").textContent = "Still confirming your payment…"; await new Promise((ok) => setTimeout(ok, 1000 + i * 800)); }
  }
  if (!r.paid) { $("pd-msg").textContent = "We couldn't confirm the payment yet. If you paid, you're all set and we'll email you. Questions? Tap below to see the page and request a call."; return; }
  $("pd-msg").innerHTML = "You're in: <b>" + (PLAN_SHOW[r.plan] || "your plan") + "</b>. 30-day money-back guarantee.";
  if (r.plan === "pro" || r.plan === "all_access") {
    show("pd-day");
    if (r.class_day) $("pd-day-msg").textContent = "Your class day: " + (r.class_day === "tue" ? "Tuesday" : "Thursday") + ", 6 to 7 PM.";
    document.querySelectorAll("[data-day]").forEach((b) => { b.onclick = async () => {
      document.querySelectorAll("[data-day]").forEach((x) => x.classList.toggle("sel", x === b));
      const s = await post("/api/try/checkout", { session_id: sid, class_day: b.dataset.day }).catch(() => ({}));
      $("pd-day-msg").textContent = s.ok ? "See you " + (b.dataset.day === "tue" ? "Tuesday" : "Thursday") + ", 6 to 7 PM at HQ!" : "Couldn't save that. Please tap again.";
    }; });
  }
})();
function playPcm(b64) {
  const s = atob(b64), n = s.length / 2, buf = ac.createBuffer(1, n, 24000), d = buf.getChannelData(0), v = new DataView(new ArrayBuffer(s.length));
  for (let i = 0; i < s.length; i++) v.setUint8(i, s.charCodeAt(i));
  for (let i = 0; i < n; i++) d[i] = v.getInt16(i * 2, true) / 0x8000;
  const node = ac.createBufferSource(); node.buffer = buf; node.connect(ac.destination); playAt = Math.max(playAt, ac.currentTime); node.start(playAt); playAt += buf.duration;
}
function stopMic() { try { mic && mic.getTracks().forEach((x) => x.stop()); } catch (e) {} mic = null; }
function finish(reason, msg) {
  if (ended) return; ended = true; clearInterval(tick); clearTimeout(wrapT); clearTimeout(stopT);
  try { ws && ws.close(); } catch (e) {} ws = null; try { proc && proc.disconnect(); src && src.disconnect(); } catch (e) {} try { ac && ac.close(); } catch (e) {} ac = null; stopMic();
  const secs = t0 ? Math.round((Date.now() - t0) / 1000) : 0;
  if (sid) post("/api/try/end", { session_id: sid, seconds: secs, reason }).catch(() => {});
  show("m-live", false); done(msg, reason);
}
function done(msg, reason) {
  if (kidCard()) return;
  if (EMBED) return embedChoice(reason);
  $("d-h").textContent = reason === "time_limit" ? "Time's up. Great job!" : "Thanks for trying the AI Coach!";
  $("d-p").textContent = msg || (leadId ? "We saved your info. Here's how to keep going." : "Pick a plan below, or start free.");
  if (leadId) prefill(); highlight("founding_family"); show("m-done");
}
$("v-stop").onclick = () => finish("user_left");
$("s-ok").onclick = () => { show("m-safe", false); finish("safety"); };
$("d-plans").onclick = () => { show("m-done", false); $("plans").scrollIntoView({ behavior: "smooth" }); };

// ---------- web form fallback ----------
let sendWanted = false, sending = false;
$("lead").onsubmit = async (e) => {
  if (e) e.preventDefault(); const msg = $("l-msg"); msg.classList.remove("bad");
  const say = (t, bad) => { msg.textContent = t; msg.classList.toggle("bad", !!bad); msg.scrollIntoView({ block: "nearest", behavior: "smooth" }); };
  if (sending) return;
  if (INLINE && !$("l-name").value.trim()) { say("Please add your first name.", true); $("l-name").focus(); return; }
  if (INLINE && $("l-email").value.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test($("l-email").value.trim())) { say("That email doesn't look right.", true); $("l-email").focus(); return; }
  if (INLINE && !$("l-band").value) { say("Please pick your child's age.", true); $("l-band").focus(); return; }
  if (!$("l-email").value.trim() && !$("l-phone").value.trim()) { say("Please add an email or phone.", true); $("l-email").focus(); return; }
  if (!$("l-ok").checked) { say("Please check the box so we can contact you.", true); return; }
  if (!tsLeadTok) {
    // widget missing (script blocked, slow, or never rendered): render it now; send as soon as it's solved
    if (!window.turnstile) await loadTs();
    if (tsLead == null) tsLead = renderTs($("l-ts"), onLeadTs);
    sendWanted = true; $("l-ts").scrollIntoView({ block: "center", behavior: "smooth" });
    say(tsErr ? "The robot check didn't pass. Tap \"Troubleshoot\" in the box above, or refresh the page and try again." : window.turnstile ? "Almost there. Please tap the \"Verify you are human\" box above, then we send it." : "We couldn't load the robot check. Please refresh the page and try again.", true);
    return;
  }
  sending = true; sendWanted = false; const btn = $("l-send"), label = btn.textContent; btn.disabled = true; btn.textContent = "Sending...";
  const email = $("l-email").value.trim() || undefined, phone = $("l-phone-l").hidden ? undefined : $("l-phone").value.trim() || undefined, toPay = mode === "pay";
  let r = {}; try { r = await post("/api/try/lead", { email, phone, parent_name: $("l-name").value.trim() || undefined, child_age_band: $("l-band").value || undefined, consent: true, adult: true, signup: plan === "free", plan, checkout: toPay, turnstile: tsLeadTok, utm }); } catch (x) { r = { error: "network" }; }
  tsLeadTok = ""; resetTs(tsLead);
  if (r.ok && toPay) { // lead saved (and sent to GHL on prod) -> Stripe
    btn.textContent = "Opening secure checkout...";
    const c = await post("/api/try/checkout", { plan, email, lead_id: r.lead_id }).catch(() => ({}));
    if (c.url) { window.location.href = c.url; return; }
    sending = false; btn.disabled = false; btn.textContent = label; say("Checkout didn't open. We saved your info and will call you about " + PLAN_NAME[plan].split(" (")[0] + ".", true); return;
  }
  sending = false; btn.disabled = false; btn.textContent = label;
  if (r.ok) say(plan === "free" ? "Thanks! We saved your info and will send you the free plan." : "Thanks! Our team will call you about " + PLAN_NAME[plan].split(" (")[0] + ".");
  else say(r.error === "bad_email" ? "That email doesn't look right." : r.error === "bad_phone" ? "That phone number doesn't look right." : r.error === "turnstile_failed" ? "The robot check expired. Please tap the box above again, then send." : r.error === "rate_limited" ? "Too many tries today. Please try again tomorrow." : r.error === "network" ? "No connection. Please try again." : "Something went wrong. Please try again.", true);
};
function onLeadTs(t) { tsLeadTok = t; if (t && sendWanted) $("lead").onsubmit(); }

// ---------- embed mode: the home page opens /try?embed=1&talk=1 in an overlay ----------
// One tap "I'm a grown-up" (it covers both consents, shown in plain words), Turnstile in the background, same 3-minute cap.
// After the talk: Free vs Founding $20 with first name, email and child's age (same form, same GHL fields, same checkout).
function embedChoice(reason) {
  document.body.classList.add("embed-choice"); show("m-done", false); show("m-gate", false); showTab(false); pickPlan("free", false);
  if (leadId) prefill(); // voice-captured details fill the form, so the grown-up only checks and taps once
  $("plans").querySelector("h2").textContent = reason === "time_limit" ? "Time's up. Great job! Keep going:" : "Nice talking! Keep going:";
  const a = $("vh-after"); if (a.scrollIntoView) setTimeout(() => a.scrollIntoView({ behavior: "smooth", block: "start" }), 50);
}
if (EMBED) { // grown-up pop-up (Oct 21): centered modal, dimmed background, focus trapped, Esc / outside tap close
  const gs = $("g-start"), lbl = "Yes, I'm a grown-up", gate = $("m-gate"); let back = null;
  $("g-h").textContent = "Is a grown-up here?";
  document.querySelectorAll("#m-gate .ck, #m-gate .fine:not(.bad)").forEach((l) => { l.hidden = true; });
  const note = document.createElement("p"); note.className = "g-line"; note.id = "g-note"; note.textContent = "A grown-up starts the talk with the AI Coach.";
  $("g-h").after(note);
  gate.setAttribute("role", "dialog"); gate.setAttribute("aria-modal", "true");
  $("g-adult").checked = $("g-ai").checked = true;
  const sync = () => { gs.textContent = gs.disabled && !$("g-err").textContent && !gs.dataset.busy ? "One sec..." : lbl; };
  new MutationObserver(sync).observe(gs, { attributes: true, attributeFilter: ["disabled"] }); sync();
  const close = () => { show("m-gate", false); document.body.classList.remove("gate-open"); show("talk"); if (back && back.focus) back.focus(); };
  $("g-close").onclick = close;
  gate.addEventListener("click", (e) => { if (e.target === gate) close(); });
  new MutationObserver(() => { const open = !gate.hidden; document.body.classList.toggle("gate-open", open); if (open) { back = document.activeElement; setTimeout(() => (gs.disabled ? $("g-close") : gs).focus(), 30); } }).observe(gate, { attributes: true, attributeFilter: ["hidden"] });
  document.addEventListener("keydown", (e) => { if (gate.hidden) return;
    if (e.key === "Escape") { e.preventDefault(); close(); return; }
    if (e.key === "Tab") { const f = [...gate.querySelectorAll("button:not([disabled]),iframe,[tabindex]:not([tabindex='-1'])")].filter((x) => x.offsetParent); if (!f.length) return;
      const a = f[0], z = f[f.length - 1]; if (e.shiftKey && document.activeElement === a) { e.preventDefault(); z.focus(); } else if (!e.shiftKey && document.activeElement === z) { e.preventDefault(); a.focus(); } } });
}
// deep link from the home page: /try?plan=<plan> opens the sign-up box with that plan picked
{ const pl = new URLSearchParams(location.search).get("plan"); if (!EMBED && PLAN_NAME[pl]) setTimeout(() => pickPlan(pl), 300); }

// home: "I'm a kid, let's play" shows the existing kid age pick (app.js handles the tap on an age)
{ const k = document.getElementById("vh-kid"), vp = document.getElementById("v-pick"); if (k && vp) k.onclick = () => { evt("kid_link_click"); if (window.gksQuickStart) return window.gksQuickStart(); vp.classList.add("kid-mode"); try { history.pushState({ kid: 1 }, "", location.pathname + location.search); } catch (x) {} window.scrollTo(0, 0); };
  window.addEventListener("popstate", () => { if (vp.classList.contains("kid-mode")) { vp.classList.remove("kid-mode"); window.scrollTo(0, 0); } }); }

// orb-pulse: the pill under the orb starts the same talk
{ const tp = document.getElementById("talk-pill"); if (tp) tp.onclick = () => $("talk").click(); }
