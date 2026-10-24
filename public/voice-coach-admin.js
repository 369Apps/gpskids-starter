const $ = (id) => document.getElementById(id);
const short = (s) => String(s).slice(-8);
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
function table(el, cols, rows) {
  el.innerHTML = "<tr>" + cols.map((c) => `<th>${c[0]}</th>`).join("") + "</tr>" + (rows.length ? rows.map((r) => "<tr>" + cols.map((c) => `<td>${c[1](r)}</td>`).join("") + "</tr>").join("") : `<tr><td colspan="${cols.length}">None</td></tr>`);
}
const T = (r) => (r.test ? ' <span class="tag">TEST</span>' : "");
$("k").value = sessionStorage.getItem("vcak") || "";
$("f").onsubmit = async (e) => {
  e.preventDefault(); sessionStorage.setItem("vcak", $("k").value);
  const r = await fetch("/api/vc/admin" + ($("t").checked ? "?test=1" : ""), { headers: { authorization: "Bearer " + $("k").value } });
  if (!r.ok) { $("msg").textContent = r.status === 401 ? "Wrong key." : "Error " + r.status; $("out").hidden = true; return; }
  const d = await r.json(); $("msg").textContent = "Month " + d.month; $("out").hidden = false;
  $("banner").hidden = !d.kids.some((k) => k.test);
  const sum = (a, f) => a.reduce((x, y) => x + (y[f] || 0), 0);
  $("cards").innerHTML = `<div>Minutes<b>${Math.round(sum(d.kids, "usedMin") * 10) / 10}</b></div><div>Sessions<b>${sum(d.kids, "sessions")}</b></div><div>Est. cost<b>$${sum(d.kids, "cost").toFixed(2)}</b></div><div>Families<b>${d.families.length}</b></div><div>Near cap<b>${d.near.length}</b></div>
    <div class="${d.spend.paused ? "stop" : ""}">Voice spend today<b>$${d.spend.today.toFixed(2)} / $${d.spend.cap}</b>${d.spend.paused ? "PAUSED: live off, recorded uses Workers AI" : "running"}</div>
    <div>Safety alerts (30 days)<b>${d.alerts.n || 0}</b>emails sent: ${d.alerts.sent || 0}</div><div>Referrals<b>${d.referrals}</b></div><div>Consents saved<b>${d.consents}</b></div>`;
  const kidCols = [["Kid profile", (r) => esc(short(r.kid)) + T(r)], ["Family", (r) => esc(short(r.acct))], ["Plan", (r) => esc(r.plan)], ["Used min", (r) => r.usedMin], ["Cap", (r) => r.daily ? r.capMin + " a day" : r.capMin + " a month"], ["% of cap", (r) => `<span class="${r.pct >= 80 ? "hot" : ""}">${r.pct}%</span>`], ["Sessions", (r) => r.sessions], ["Feedback / Answer back / Live", (r) => `${r.feedback} / ${r.rebuttal} / ${r.live}`], ["Est. cost", (r) => "$" + r.cost.toFixed(4)]];
  const F = d.funnel; table($("funnel"), [["Taste offered", () => F.offered], ["Taste started", () => F.started], ["Taste finished", () => F.finished], ["Upgrade clicked", () => F.clicked], ["Upgraded", () => F.upgraded], ["Started to upgraded", () => F.conversion + "%"]], [F]);
  table($("near"), kidCols, d.near); table($("top"), kidCols, d.top); table($("kids"), kidCols, d.kids);
  table($("fams"), [["Family", (r) => esc(short(r.acct)) + T(r)], ["Plan", (r) => esc(r.plan)], ["Kids", (r) => r.kids], ["Used min", (r) => r.usedMin], ["Sessions", (r) => r.sessions], ["Est. cost", (r) => "$" + r.cost.toFixed(4)]], d.families);
  table($("daily"), [["Day (ET)", (r) => r.day], ["Minutes", (r) => r.minutes], ["Sessions", (r) => r.sessions], ["Est. cost", (r) => "$" + r.cost.toFixed(4)]], d.daily);
};
