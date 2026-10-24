// Buddy play screens (v-buddy). Two kids take turns on one phone: big "Your turn, <name>!" screens, a pass-the-phone
// moment and a fun finish. No mic, no AI, no server: the game is saved on this phone (localStorage gks_buddy) so it
// resumes if the page closes. The only things sent are the anonymous app steps buddy_open / buddy_start / buddy_done.
import * as G from "./buddy-games.js";

let C = null, S = null, from = "home";
const SECS = ["bd-setup", "bd-resume", "bd-games", "bd-turn", "bd-pass", "bd-finish"];
const $ = (id) => document.getElementById(id);
function sec(id) { SECS.forEach((s) => { $(s).hidden = s !== id; }); window.scrollTo(0, 0); }
function save() { try { if (S && !G.isDone(S)) localStorage.setItem(G.DRAFT_KEY, JSON.stringify(S)); else localStorage.removeItem(G.DRAFT_KEY); } catch (e) {} }
function saved() { try { return G.revive(localStorage.getItem(G.DRAFT_KEY)); } catch (e) { return null; } }

export function init(ctx) {
  C = ctx;
  $("bd-close").addEventListener("click", () => C.goHome());
  $("bd-home").addEventListener("click", () => C.goHome());
  $("bd-next").addEventListener("click", toGames);
  $("bd-change").addEventListener("click", paintSetup);
  $("bd-resume-yes").addEventListener("click", () => { S = saved(); if (S) paintTurn(); else paintSetup(); });
  $("bd-resume-new").addEventListener("click", () => { try { localStorage.removeItem(G.DRAFT_KEY); } catch (e) {} S = null; paintSetup(); });
  $("bd-again").addEventListener("click", () => { const n = S ? S.n : null; S = null; if (n) { $("bd-n1").value = n[0]; $("bd-n2").value = n[1]; toGames(); } else paintSetup(); });
  $("bd-done").addEventListener("click", step);
  $("bd-ready").addEventListener("click", step);
  $("bd-players").addEventListener("click", (e) => {
    const b = e.target.closest("[data-bdname]"); if (!b) return;
    const n = b.dataset.bdname, i1 = $("bd-n1"), i2 = $("bd-n2");
    if (i1.value.trim() === n) i1.value = ""; else if (i2.value.trim() === n) i2.value = "";
    else if (!i1.value.trim()) i1.value = n; else i2.value = n;
    paintChips(); $("bd-err").textContent = "";
  });
  ["bd-n1", "bd-n2"].forEach((id) => $(id).addEventListener("input", () => { paintChips(); $("bd-err").textContent = ""; }));
  $("bd-game-list").addEventListener("click", (e) => {
    const b = e.target.closest("[data-bdgame]"); if (!b) return;
    S = G.start(b.dataset.bdgame, [$("bd-n1").value, $("bd-n2").value], C.band());
    if (!S) return paintSetup();
    C.track("buddy_start", null, S.g); save(); paintTurn();
  });
}
// where = "home" | "class" (what opened it)
export function open(where) {
  from = where || from; C.show("v-buddy"); C.track("buddy_open", null, from);
  if (S && !G.isDone(S) && G.revive(S)) return paintTurn(); // same page: carry on
  const d = saved();
  if (d) {
    const g = G.byId(d.g);
    $("bd-resume-h").textContent = `Keep playing ${g.title} with ${d.n[0]} and ${d.n[1]}?`;
    return sec("bd-resume");
  }
  paintSetup();
}
// resume straight into the saved game (page reopened on #buddy)
export function resume() { const d = saved(); if (!d) return open("resume"); S = d; C.show("v-buddy"); C.track("buddy_open", null, "resume"); paintTurn(); }
function paintSetup() {
  sec("bd-setup");
  const names = C.players().map((n) => G.cleanName(n)).filter(Boolean);
  const uniq = [...new Set(names)].slice(0, 8);
  $("bd-players").innerHTML = uniq.map((n) => `<button type="button" class="bd-chip" data-bdname="${C.esc(n)}">${C.esc(n)}</button>`).join("");
  $("bd-n1").value = $("bd-n1").value || "Buddy A";
  $("bd-n2").value = $("bd-n2").value || "Buddy B";
  const nameRow = $("bd-n1").closest(".bd-names"); if (nameRow) nameRow.hidden = true;
  $("bd-type-lbl").textContent = "Two buddies on this phone";
  $("bd-type-lbl").hidden = true;
  $("bd-players").hidden = !uniq.length;
  paintChips();
}
function paintChips() {
  const v = [$("bd-n1").value.trim(), $("bd-n2").value.trim()];
  $("bd-players").querySelectorAll("[data-bdname]").forEach((b) => { const on = v.includes(b.dataset.bdname); b.classList.toggle("on", on); b.setAttribute("aria-pressed", on); });
}
function toGames() {
  const a = G.cleanName($("bd-n1").value), b = G.cleanName($("bd-n2").value);
  if (!a || !b) { $("bd-err").textContent = "Pick two buddies (letters only)."; sec("bd-setup"); return; }
  if (a.toLowerCase() === b.toLowerCase()) { $("bd-err").textContent = "Pick two different buddies."; sec("bd-setup"); return; }
  $("bd-n1").value = a; $("bd-n2").value = b;
  $("bd-games-h").textContent = `${a} and ${b}, pick a game`;
  $("bd-game-list").innerHTML = G.GAMES.map((g) => `<button type="button" class="bd-game" data-bdgame="${g.id}"><span class="e" aria-hidden="true">${g.emoji}</span><span><strong>${C.esc(g.title)}</strong><small>${C.esc(g.blurb)}</small></span></button>`).join("");
  sec("bd-games");
}
function step() { S = G.advance(S); save(); if (G.isDone(S)) { C.track("buddy_done", null, S.g); return paintFinish(); } paintTurn(); }
function paintTurn() {
  const v = G.screen(S);
  if (v.kind === "done") return paintFinish();
  if (v.kind === "pass") {
    sec("bd-pass");
    $("bd-pass-h").textContent = v.who === 2 ? "Sit together for the last turn!" : `Pass the phone to ${v.name}`;
    $("bd-ready").textContent = v.who === 2 ? "We're ready!" : `I'm ${v.name}. Show me!`;
    return $("bd-ready").focus();
  }
  sec("bd-turn");
  $("bd-count").textContent = `${G.byId(S.g).title} · turn ${v.step} of ${v.of}`;
  $("bd-your").textContent = v.both ? `Together, ${v.name}!` : `Your turn, ${v.name}!`;
  $("bd-prompt").textContent = v.prompt;
  $("bd-tip").textContent = v.tip + " Say it out loud. No wrong answers.";
  $("bd-done").textContent = v.step === v.of ? "We did it! 🎉" : "Done!";
}
function paintFinish() {
  sec("bd-finish");
  $("bd-fin-h").textContent = `Great teamwork, ${S.n[0]} and ${S.n[1]}!`;
  $("bd-fin-p").textContent = G.byId(S.g).finish;
  save();
}
