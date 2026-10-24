// Funnel + session math for the anonymous usage events (D1 table ev, migrations-events/0001_events.sql).
// Used by /api/stats (the /stats admin page) and tools/funnel.mjs (the daily DAU report), so both always show the same numbers.
// Three read-only queries (?1 = from day, ?2 = to day, ?3 = test 0/1), then pure JS.
import { AWAY, NOT_END } from "../public/steps.js";

export const MAX_ROWS = 250000;      // events per query (about 30 days at today's traffic); "truncated" is set if hit
export const STEP_CAP_MS = 30 * 60e3; // a single step counts at most 30 min (longer = left the phone open)
export const FUNNEL = [
  ["open", "Opened the app"], ["recorded", "Recorded a talk"], ["feedback", "Saw feedback"],
  ["duel_sent", "Sent a friend duel"], ["friend_joined", "A friend joined"],
];
export const SQL = {
  events: `SELECT sid, p, n, ts, day, step, v, k, x FROM ev WHERE test = ?3 AND sid IN
    (SELECT DISTINCT sid FROM ev WHERE test = ?3 AND day BETWEEN ?1 AND ?2) ORDER BY sid, n LIMIT ${MAX_ROWS + 1}`,
  joins: `SELECT s.p AS sender, s.x AS x, j.p AS joiner FROM ev s JOIN ev j ON j.x = s.x AND j.step = 'duel_join' AND j.k = 'ok'
    AND j.test = s.test AND j.p <> s.p WHERE s.step = 'duel_sent' AND s.test = ?3 AND s.day BETWEEN ?1 AND ?2`,
  // ?1 here = the day before "from" (see args)
  ret: `WITH a AS (SELECT DISTINCT day, p FROM ev WHERE test = ?3 AND day BETWEEN ?1 AND ?2)
    SELECT COUNT(*) AS base, COALESCE(SUM(EXISTS (SELECT 1 FROM a b WHERE b.p = a.p AND b.day = date(a.day, '+1 day'))), 0) AS ret
    FROM a WHERE a.day BETWEEN ?1 AND date(?2, '-1 day')`,
};
// bound values per query (D1 wants exactly the parameters a query uses)
export const args = (name, p) => (name === "ret" ? [p[3], p[1], p[2]] : p.slice(0, 3));
export const DAY_RE = /^\d{4}-\d{2}-\d{2}$/;
export const addDay = (day, n) => new Date(Date.parse(day + "T12:00:00Z") + n * 864e5).toISOString().slice(0, 10);
export function params(from, to, test) {
  if (!DAY_RE.test(from) || !DAY_RE.test(to) || from > to) throw new Error("bad range");
  return [from, to, test ? 1 : 0, addDay(from, -1)];
}
// For the wrangler CLI (no bound params): inline the already-validated values.
export const inline = (sql, p) => sql.replace(/\?(\d)/g, (_, i) => (typeof p[i - 1] === "number" ? String(p[i - 1]) : `'${p[i - 1]}'`)).replace(/\s+/g, " ");

export function median(a) {
  if (!a.length) return null;
  const s = [...a].sort((x, y) => x - y), m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}
const pct = (a, b) => (b ? Math.round((1000 * a) / b) / 10 : null);
const r1 = (x) => (x == null ? null : Math.round(x * 10) / 10);

// events: rows from SQL.events (sorted by sid, n); joins: rows from SQL.joins; ret: the one SQL.ret row.
export function summarize({ events = [], joins = [], ret = { base: 0, ret: 0 }, from, to }) {
  const truncated = events.length > MAX_ROWS;
  if (truncated) events = events.slice(0, MAX_ROWS);
  const inRange = (e) => (!from || e.day >= from) && (!to || e.day <= to);
  // ---- sessions
  const bySid = new Map();
  for (const e of events) { let s = bySid.get(e.sid); if (!s) bySid.set(e.sid, (s = [])); s.push(e); }
  const stepMs = {}, sessions = [];
  for (const [sid, list] of bySid) {
    list.sort((a, b) => a.n - b.n);
    let ms = 0;
    for (let i = 0; i < list.length; i++) {
      const e = list[i], nx = list[i + 1];
      if (AWAY.has(e.step)) continue;
      if (!nx) continue; // the last step has no measured time
      const dt = Math.max(0, Math.min(STEP_CAP_MS, nx.ts - e.ts));
      ms += dt;
      (stepMs[e.step] ||= []).push(dt);
    }
    let end = null;
    for (let i = list.length - 1; i >= 0; i--) if (!NOT_END.has(list[i].step)) { end = list[i].step; break; }
    sessions.push({ sid, p: list[0].p, t0: list[0].ts, ms, end: end || list[list.length - 1].step, steps: list.map((e) => e.step), list });
  }
  // ---- funnel (players = distinct anonymous player hashes with that step inside the date range)
  const has = { open: new Set(), recorded: new Set(), feedback: new Set(), duel_sent: new Set() };
  const stepCount = {}, perDay = {};
  for (const e of events) {
    if (!inRange(e)) continue;
    stepCount[e.step] = (stepCount[e.step] || 0) + 1;
    const d = (perDay[e.day] ||= { day: e.day, players: new Set(), sessions: new Set(), recorded: new Set(), events: 0 });
    d.players.add(e.p); d.sessions.add(e.sid); d.events++;
    has.open.add(e.p);
    if (e.step === "rec_end") { has.recorded.add(e.p); d.recorded.add(e.p); }
    if (e.step === "feedback_view") has.feedback.add(e.p);
    if (e.step === "duel_sent") has.duel_sent.add(e.p);
  }
  const joinedSenders = new Set(joins.map((j) => j.sender)), friendPairs = new Set(joins.map((j) => j.x + "|" + j.joiner));
  const counts = { open: has.open.size, recorded: has.recorded.size, feedback: has.feedback.size, duel_sent: has.duel_sent.size, friend_joined: joinedSenders.size };
  const funnel = FUNNEL.map(([key, label], i) => ({ key, label, n: counts[key], step_pct: i ? pct(counts[key], counts[FUNNEL[i - 1][0]]) : 100, of_open_pct: pct(counts[key], counts.open) }));
  // ---- where sessions end
  const ends = {};
  for (const s of sessions) ends[s.end] = (ends[s.end] || 0) + 1;
  const endList = Object.entries(ends).map(([step, n]) => ({ step, n, pct: pct(n, sessions.length) })).sort((a, b) => b.n - a.n || (a.step < b.step ? -1 : 1));
  // ---- time on each step
  const stepTime = Object.entries(stepMs).map(([step, a]) => ({ step, n: a.length, median_s: r1(median(a) / 1000), avg_s: r1(a.reduce((x, y) => x + y, 0) / a.length / 1000) }))
    .sort((a, b) => b.n - a.n);
  // ---- Pitch Night
  let pnStarted = 0, pnSubmitted = 0; const pnLeft = { form: 0, record: 0, feedback: 0 };
  for (const s of sessions) {
    const i = s.steps.indexOf("pn_form"); if (i < 0) continue;
    pnStarted++;
    const after = s.steps.slice(i);
    if (after.includes("pn_submit")) { pnSubmitted++; continue; }
    // the app's own pn_abandon stage (form / record / feedback) wins; otherwise infer it from what happened after the form
    const ab = s.list.slice(i).filter((e) => e.step === "pn_abandon" && pnLeft.hasOwnProperty(e.k)).pop();
    const fbPitch = s.list.slice(i).some((e) => e.step === "feedback_view" && e.k === "pitch");
    pnLeft[ab ? ab.k : fbPitch ? "feedback" : after.includes("rec_start") ? "record" : "form"]++;
  }
  const msList = sessions.map((s) => s.ms);
  return {
    from, to, truncated, events: events.filter(inRange).length,
    sessions: sessions.length,
    players: counts.open,
    funnel,
    drop_offs: endList.slice(0, 3),
    session_ends: endList,
    median_session_s: r1(median(msList) / 1000 || 0),
    avg_session_s: r1(msList.length ? msList.reduce((a, b) => a + b, 0) / msList.length / 1000 : 0),
    next_day_return: { base: ret.base || 0, returned: ret.ret || 0, pct: pct(ret.ret || 0, ret.base || 0) },
    friends: { senders: counts.duel_sent, senders_with_friend: joinedSenders.size, friends_joined: friendPairs.size,
      per_sender: counts.duel_sent ? r1(friendPairs.size / counts.duel_sent) : 0, per_kid: counts.open ? Math.round((100 * friendPairs.size) / counts.open) / 100 : 0 },
    pitch: { started: pnStarted, submitted: pnSubmitted, abandoned: pnStarted - pnSubmitted, abandoned_at: pnLeft, abandon_events: stepCount.pn_abandon || 0 },
    step_time: stepTime,
    step_counts: Object.entries(stepCount).map(([step, n]) => ({ step, n })).sort((a, b) => b.n - a.n),
    days: Object.values(perDay).sort((a, b) => (a.day < b.day ? -1 : 1)).map((d) => ({ day: d.day, players: d.players.size, sessions: d.sessions.size, recorded: d.recorded.size, events: d.events })),
  };
}
// Run the 3 queries on a D1 binding (Pages Function) and summarize.
export async function funnelFromD1(db, from, to, test) {
  const p = params(from, to, test);
  const [e, j, r] = await db.batch(["events", "joins", "ret"].map((q) => db.prepare(SQL[q]).bind(...args(q, p))));
  return summarize({ events: e.results || [], joins: j.results || [], ret: (r.results || [])[0] || {}, from, to });
}
// Plain-text lines for the daily report.
export function reportLines(s) {
  const L = [];
  const range = s.from === s.to ? s.from : `${s.from} to ${s.to}`;
  L.push(`Funnel (anonymous usage events, ${range}, ET): ${s.players} players, ${s.sessions} sessions${s.truncated ? " (TRUNCATED)" : ""}`);
  for (const f of s.funnel) L.push(`  ${f.label.padEnd(20)} ${String(f.n).padStart(5)}  ${f.key === "open" ? "" : `${f.step_pct ?? "-"}% of previous step, ${f.of_open_pct ?? "-"}% of opens`}`.trimEnd());
  L.push("Top drop-off steps (where sessions end): " + (s.drop_offs.map((d) => `${d.step} ${d.pct}% (${d.n})`).join(", ") || "none"));
  L.push(`Median session time: ${s.median_session_s} s (average ${s.avg_session_s} s)`);
  L.push(s.next_day_return.base ? `Next-day return: ${s.next_day_return.pct}% (${s.next_day_return.returned} of ${s.next_day_return.base} players from the day before came back)` : "Next-day return: n/a (no players the day before)");
  L.push(`Friends brought: ${s.friends.friends_joined} (per kid who sent a duel: ${s.friends.per_sender}, per player: ${s.friends.per_kid})`);
  L.push(`Pitch Night: ${s.pitch.started} started the form, ${s.pitch.submitted} submitted, ${s.pitch.abandoned} abandoned (form ${s.pitch.abandoned_at.form}, record ${s.pitch.abandoned_at.record}, feedback ${s.pitch.abandoned_at.feedback})`);
  L.push("Time on step (median s): " + (s.step_time.slice(0, 10).map((t) => `${t.step} ${t.median_s}`).join(", ") || "none"));
  return L;
}
