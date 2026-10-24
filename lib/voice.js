// Voice coach (Phase 1, PREVIEW) server switches. Fails closed.
// ON only when BOTH: env VOICE === "1" (set only in [env.preview.vars]; production has no VOICE) AND the D1 counter
// table has no kill row. Instant kill without a redeploy (see README "Voice coach"):
//   npx wrangler d1 execute gpskids-speak-ratelimit --remote --command "INSERT OR REPLACE INTO rl (k,n,exp) VALUES ('cfg:voice_off',1,4102444800)"
// ('cfg:neural_off' turns off only the Cloudflare aura-1 voice; the browser voice keeps working.) Delete the row to turn back on.
export async function voiceFlags(env) {
  const off = { on: false, neural: false };
  if (!env || env.VOICE !== "1" || !env.RL) return off;
  try {
    const r = await env.RL.prepare("SELECT k FROM rl WHERE k IN ('cfg:voice_off', 'cfg:neural_off')").all();
    const keys = new Set(((r && r.results) || []).map((x) => x.k));
    if (keys.has("cfg:voice_off")) return off;
    return { on: true, neural: env.VOICE_NEURAL !== "0" && !keys.has("cfg:neural_off") && !!env.AI };
  } catch (e) { return off; }
}
// Kid-safety scrub for anything the coach says out loud or shows: drop digit runs (phone numbers, addresses),
// emails and URLs before text-to-speech, even though the prompts already forbid repeating personal details.
export function scrub(s) {
  return String(s || "").replace(/[\u0000-\u001f]/g, " ").replace(/\S+@\S+/g, "").replace(/https?:\/\/\S+/gi, "")
    .replace(/\d[\d\s().-]{5,}\d/g, "").replace(/\s+/g, " ").trim();
}
