/* /stats admin page: the same numbers as the daily report (lib/funnel.js via GET /api/stats). Key handling as /pitch-admin:
   typed once (or /stats#k=<key>, removed from the address bar at once), kept in sessionStorage for this tab only. */
(() => {
  const $ = (id) => document.getElementById(id);
  const esc = (s) => String(s == null ? "" : s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const SK = "pn_admin_key";
  const LABEL = { app_open: "Opened the app", app_back: "Came back", app_hide: "Hid the app", app_close: "Closed the app", band_pick: "Picked age group",
    profile_pick: "Picked a player", prompt_shown: "Home: saw today's prompt", shuffle: "New prompt", time_choice: "Chose talk time", plan_open: "Opened Plan first",
    plan_part: "Saw a plan card", rec_start: "Started recording", talk_plus: "Tapped +30s", auto_stop: "Auto-stopped at max", rec_end: "Finished recording",
    rec_cancel: "Closed while recording", mic_error: "Mic problem", rec_fail: "Couldn't hear / no coach", feedback_view: "Saw feedback", coach_heard: "Heard the coach",
    coach_answered: "Answered the coach", retry: "Tried again", card_open: "Opened share card", share: "Tapped share", family_duel: "Started a grown-up duel",
    duel_sent: "Sent a friend duel", duel_open: "Opened a duel link", duel_join: "Finished a friend's duel", friend_done: "Friend finished my duel",
    pn_open: "Pitch Night page", pn_form: "Pitch Night form started", pn_submit: "Pitch Night submitted", pn_error: "Pitch Night send error", pn_abandon: "Left Pitch Night", beat_tomorrow: "Tapped Beat it tomorrow", more_open: "Opened More (home)", path_move: "Hidden level moved", home_qr: "Take me home QR shown", home_link: "Take me home link sent", home_import: "Take me home link opened" };
  const L = (s) => LABEL[s] || s;
  let key = "", from = "", to = "";
  const etToday = () => new Intl.DateTimeFormat("en-CA", { timeZone: "America/New_York", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
  const addDay = (d, n) => new Date(Date.parse(d + "T12:00:00Z") + n * 864e5).toISOString().slice(0, 10);
  const fromHash = () => {
    const m = /^#k=([A-Za-z0-9_-]{24,200})$/.exec(location.hash);
    if (m) { try { sessionStorage.setItem(SK, m[1]); } catch (e) {} history.replaceState(null, "", location.pathname); }
    try { key = sessionStorage.getItem(SK) || ""; } catch (e) {}
    return !!m;
  };
  fromHash();
  window.addEventListener("hashchange", () => { if (fromHash()) load(); });
  const showLogin = (msg) => { $("app").hidden = true; $("login").hidden = false; $("login-err").hidden = !msg; $("login-err").textContent = msg || ""; $("key").focus(); };
  function setRange(r) {
    const t = etToday();
    if (r === "1") { from = to = t; } else if (r === "y") { from = to = addDay(t, -1); } else { to = t; from = addDay(t, -(Number(r) - 1)); }
    document.querySelectorAll("#ranges [data-r]").forEach((b) => b.classList.toggle("on", b.dataset.r === r));
    $("from").value = from; $("to").value = to;
  }
  async function load() {
    $("err").hidden = true;
    let r;
    try { r = await fetch(`/api/stats?from=${from}&to=${to}${$("show-test").checked ? "&test=1" : ""}`, { headers: { authorization: "Bearer " + key }, cache: "no-store" }); }
    catch (e) { $("err").textContent = "No connection."; $("err").hidden = false; return; }
    if (r.status === 401 || r.status === 429 || (r.status === 503 && !key)) { try { sessionStorage.removeItem(SK); } catch (e) {} key = ""; return showLogin(r.status === 429 ? "Too many wrong keys today." : "That key didn't work."); }
    const j = await r.json().catch(() => ({}));
    if (!r.ok) { $("err").textContent = "Couldn't load stats (" + (j.error || r.status) + ")."; $("err").hidden = false; return; }
    $("login").hidden = true; $("app").hidden = false;
    paint(j);
    loadGrowth();
  }
  // Growth table: always the last 14 ET days (own request, so the range buttons above don't change it)
  const G = [["new_players", "New players"], ["came_back", "Came back"], ["invites_shared", "Invites sent"], ["invite_opens", "Invite links opened"], ["new_from_invite", "New from an invite"]];
  const shortDay = (d) => { const t = new Date(d + "T12:00:00Z"); return t.toLocaleDateString("en-US", { timeZone: "UTC", weekday: "short" }) + " " + t.toLocaleDateString("en-US", { timeZone: "UTC", month: "numeric", day: "numeric" }); };
  async function loadGrowth() {
    let r, j = {};
    try { r = await fetch(`/api/stats?view=growth${$("show-test").checked ? "&test=1" : ""}`, { headers: { authorization: "Bearer " + key }, cache: "no-store" }); j = await r.json().catch(() => ({})); } catch (e) {}
    if (!r || !r.ok || !Array.isArray(j.days)) { $("growth-msg").textContent = "Couldn't load the growth counts."; $("growth-out").innerHTML = ""; return; }
    $("growth-msg").textContent = `${shortDay(j.from)} to ${shortDay(j.to)} (ET), newest first.` + ($("show-test").checked ? " TEST TRAFFIC." : "");
    $("growth-out").innerHTML = `<table><tr><th>Day</th>${G.map(([k, l]) => `<th class="r" data-g="${k}">${l}</th>`).join("")}</tr>
      ${j.days.map((d) => `<tr data-day="${esc(d.day)}"><td>${esc(shortDay(d.day))}</td>${G.map(([k]) => `<td class="r">${d[k] ? `<b>${d[k]}</b>` : "0"}</td>`).join("")}</tr>`).join("")}
      <tr class="tot"><td>14 days</td>${G.map(([k]) => `<td class="r" data-t="${k}">${j.total[k]}</td>`).join("")}</tr></table>
      <dl><dt>New players</dt><dd>played for the first time that day</dd><dt>Came back</dt><dd>played that day and on an earlier day too</dd>
      <dt>Invites sent</dt><dd>times a kid tapped a share button (every shared link is an invite)</dd><dt>Invite links opened</dt><dd>times the app was opened from a friend's link</dd>
      <dt>New from an invite</dt><dd>new players whose first visit came from a friend's link</dd></dl>`;
  }
  function paint(s) {
    $("range-line").innerHTML = `${s.from === s.to ? esc(s.from) : esc(s.from) + " to " + esc(s.to)} (ET) · ${s.events} events` + ($("show-test").checked ? ' <span class="tag">TEST TRAFFIC</span>' : "") + (s.truncated ? ' <span class="tag">TRUNCATED</span>' : "");
    const open = s.funnel[0].n || 0, mins = (x) => (x == null ? "–" : x >= 60 ? Math.floor(x / 60) + "m " + Math.round(x % 60) + "s" : Math.round(x) + "s");
    const nd = s.next_day_return;
    $("out").innerHTML = `
      <div class="cards">
        <div class="card"><b>${s.players}</b><span>players</span></div>
        <div class="card"><b>${s.sessions}</b><span>sessions</span></div>
        <div class="card"><b>${mins(s.median_session_s)}</b><span>median session</span></div>
        <div class="card"><b>${nd.pct == null ? "–" : nd.pct + "%"}</b><span>${nd.base ? `next-day return (${nd.returned} of ${nd.base} came back)` : "next-day return (no players the day before)"}</span></div>
        <div class="card"><b>${s.friends.per_sender}</b><span>friends per kid who sent a duel (${s.friends.friends_joined} joined)</span></div>
      </div>
      <div class="grid">
        <section class="box" id="funnel"><h2>Funnel (players)</h2><div class="fun">${s.funnel.map((f) => `
          <div class="fr" data-k="${esc(f.key)}"><span>${esc(f.label)}</span><span class="bar"><i style="width:${open ? Math.max(1, (100 * f.n) / open) : 0}%"></i></span><span class="n">${f.n}</span>${f.key === "open" ? "" : `<em>${f.step_pct ?? "–"}% of previous · ${f.of_open_pct ?? "–"}% of opens</em>`}</div>`).join("")}</div></section>
        <section class="box" id="drops"><h2>Top drop-off steps</h2><p class="muted">Where sessions end (last step before leaving).</p>
          <ol class="drops">${s.drop_offs.map((d) => `<li><b>${esc(L(d.step))}</b> · ${d.pct}% (${d.n})</li>`).join("") || "<li>none yet</li>"}</ol>
          <details><summary>All session ends</summary><table>${s.session_ends.map((d) => `<tr><td>${esc(L(d.step))}</td><td class="r">${d.n}</td><td class="r">${d.pct}%</td></tr>`).join("")}</table></details></section>
        <section class="box" id="steptime"><h2>Time on each step</h2><table><tr><th>Step</th><th class="r">times</th><th class="r">median</th><th class="r">average</th></tr>
          ${s.step_time.map((t) => `<tr><td>${esc(L(t.step))}</td><td class="r">${t.n}</td><td class="r">${mins(t.median_s)}</td><td class="r">${mins(t.avg_s)}</td></tr>`).join("") || "<tr><td>none yet</td></tr>"}</table></section>
        <section class="box" id="pitch"><h2>🏆 Pitch Night</h2><table>
          <tr><td>Started the form</td><td class="r">${s.pitch.started}</td></tr><tr><td>Submitted</td><td class="r">${s.pitch.submitted}</td></tr>
          <tr><td>Abandoned</td><td class="r">${s.pitch.abandoned}</td></tr>
          <tr><td class="muted">… on the form / recording / feedback</td><td class="r">${s.pitch.abandoned_at.form} / ${s.pitch.abandoned_at.record} / ${s.pitch.abandoned_at.feedback}</td></tr></table>
          <h2 style="margin-top:12px">By day</h2><table><tr><th>Day</th><th class="r">players</th><th class="r">sessions</th><th class="r">recorded</th></tr>
          ${s.days.map((d) => `<tr><td>${esc(d.day)}</td><td class="r">${d.players}</td><td class="r">${d.sessions}</td><td class="r">${d.recorded}</td></tr>`).join("")}</table>
          <details><summary>Every step (count)</summary><table>${s.step_counts.map((c) => `<tr><td>${esc(L(c.step))}</td><td class="r">${c.n}</td></tr>`).join("")}</table></details></section>
      </div>`;
  }
  $("login").addEventListener("submit", (e) => { e.preventDefault(); key = $("key").value.trim(); try { sessionStorage.setItem(SK, key); } catch (x) {} $("key").value = ""; load(); });
  $("ranges").addEventListener("click", (e) => { const b = e.target.closest("[data-r]"); if (b) { setRange(b.dataset.r); load(); } });
  $("apply").addEventListener("click", () => { if ($("from").value && $("to").value) { from = $("from").value; to = $("to").value; document.querySelectorAll("#ranges [data-r]").forEach((b) => b.classList.remove("on")); load(); } });
  $("show-test").addEventListener("change", load);
  $("logout").addEventListener("click", () => { try { sessionStorage.removeItem(SK); } catch (e) {} key = ""; showLogin(""); });
  setRange("7");
  if (key) load(); else showLogin("");
})();
