// POST /api/try/tool {session_id, name, args} -> tool result for the voice session.   preview, or prod when TRYNOW_ENABLED=1
import { json, validateLead, saveLead, mergeLead, ghlPush, ghlStub, ev, PLANS, MAX_SECONDS, hash } from "../../../lib/trynow.js";
import { guard, body, sidOk } from "./_shared.js";
const REASONS = ["in_person_booking", "question", "safety", "other"], ENDS = ["completed", "time_limit", "no_adult", "safety", "user_left"];
export async function onRequestPost({ request, env, waitUntil }) {
  const g = guard(request, env); if (g) return g;
  const b = await body(request); if (!b || !sidOk(b.session_id)) return json({ ok: false, error: "bad_request" }, 400);
  const s = await env.VCU.prepare("SELECT * FROM td_sessions WHERE id=?1").bind(b.session_id).first();
  if (!s) return json({ ok: false, error: "no_session" }, 404);
  if (s.tool_calls >= 10) return json({ ok: false, error: "too_many_calls" }, 429);
  await env.VCU.prepare("UPDATE td_sessions SET tool_calls=tool_calls+1 WHERE id=?1").bind(s.id).run();
  const now = Math.floor(Date.now() / 1000), late = now > s.deadline_ts, a = b.args && typeof b.args === "object" ? b.args : {};
  // server timer: after 3 min (+10 s grace) only end_session works, and the client is told to close
  if (late && b.name !== "end_session") return json({ ok: false, error: "time_up", end: true });
  switch (b.name) {
    case "set_speaker": {
      if (!["parent", "kid", "unclear"].includes(a.speaker)) return json({ ok: false, error: "bad_speaker" });
      await env.VCU.prepare("UPDATE td_sessions SET speaker=?2 WHERE id=?1").bind(s.id, a.speaker).run();
      await ev(env, "speaker_set", a.speaker); return json({ ok: true, speaker: a.speaker });
    }
    case "capture_lead": // older tool name; same handler as save_lead
    case "save_lead": {
      if (s.speaker === "kid") return json({ ok: false, error: "kid_speaker", message: "This is a kid. Never ask a kid for contact info. Ask them to get a grown-up." });
      if (s.lead_id) { // second save_lead in the same talk: merge
        const m = validateLead(a, true); if (!m.ok) return json(m);
        await mergeLead(env, s.lead_id, m.lead); const g = ghlPush(env, s.lead_id, [], { voice: true });
        if (ghlStub(env)) return json({ ok: true, lead_id: s.lead_id, merged: true, ghl_stub: await g });
        waitUntil(g); return json({ ok: true, lead_id: s.lead_id, merged: true });
      }
      const v = validateLead(a); if (!v.ok) return json(v);
      const ip = request.headers.get("cf-connecting-ip") || "";
      const id = await saveLead(env, s.id, v.lead, b.utm || {}, { adult: true, ai: true, child: a.child_participation_ok, plan: s.plan_interest, ip: await hash("ip|" + ip, env) });
      await env.VCU.prepare("UPDATE td_sessions SET lead_id=?2 WHERE id=?1").bind(s.id, id).run();
      await env.VCU.prepare("UPDATE td_leads SET source='voice-agent' WHERE id=?1").bind(id).run();
      await ev(env, "lead_captured", (v.lead.child_age_band || "none") + ":" + (v.lead.email ? "e" : "") + (v.lead.phone ? "p" : ""));
      const g = ghlPush(env, id, [], { voice: true });
      if (ghlStub(env)) return json({ ok: true, lead_id: id, ghl_stub: await g });
      waitUntil(g); return json({ ok: true, lead_id: id });
    }
    case "start_free_signup": await ev(env, "free_signup_started"); return json({ ok: true });
    case "show_plan": {
      if (s.speaker === "kid") return json({ ok: false, error: "kid_speaker", message: "Never show plans or prices to a kid." });
      if (!PLANS.includes(a.plan)) return json({ ok: false, error: "bad_plan" });
      await env.VCU.prepare("UPDATE td_sessions SET plan_interest=?2 WHERE id=?1").bind(s.id, a.plan).run();
      if (s.lead_id) await env.VCU.prepare("UPDATE td_leads SET plan_interest=?2 WHERE id=?1").bind(s.lead_id, a.plan).run();
      await ev(env, "show_plan", a.plan); return json({ ok: true });
    }
    case "request_human_callback": {
      if (!REASONS.includes(a.reason)) return json({ ok: false, error: "bad_reason" });
      if (!s.lead_id) return json({ ok: false, error: "need_contact", message: "Ask the parent for an email or phone first, with their OK." });
      await env.VCU.prepare("INSERT INTO td_callbacks (id,created_at,lead_id,reason,preferred_time) VALUES (?1,?2,?3,?4,?5)").bind(crypto.randomUUID(), new Date().toISOString(), s.lead_id, a.reason, String(a.preferred_time || "").slice(0, 60) || null).run();
      await ev(env, "callback_requested", a.reason); if (a.reason === "safety") await ev(env, "safety_handoff", "crisis");
      const g = ghlPush(env, s.lead_id, ["gpskids-callback-requested"], { callback: a.reason });
      if (ghlStub(env)) return json({ ok: true, ghl_stub: await g });
      waitUntil(g); return json({ ok: true });
    }
    case "end_session": {
      const reason = ENDS.includes(a.reason) ? a.reason : "completed";
      if (reason === "no_adult" || reason === "safety") await ev(env, "safety_handoff", reason === "no_adult" ? "no_adult" : "crisis");
      return json({ ok: true, end: true, reason, speaker: s.speaker || null });
    }
    default: return json({ ok: false, error: "unknown_tool" });
  }
}
