// Free coaching taste on the home page (PREVIEW branch preview-freecoach, Oct 24 2026).
// Storage: D1 VCU (preview: gpskids-vc-usage-preview). Tables are created on first use (D1 migrations fail with our token).
// Stored: session counters (hashed device + IP, no audio, no words) and grown-up leads (parent first name, parent email,
// kid age range, consent). Never any child name, email, photo, audio or transcript. Never pushed to GHL from here.
import { json, isPreview, day, hash } from "./trynow.js";
import { same } from "./guard.js";
import { providerKey } from "./provider.js";
export { json, isPreview, day, hash, same };
export const voiceKey = (env) => providerKey(env);
export const TASTE_SECONDS = 180, SOURCE = "home-voice-taste";
export const BANDS = ["5-7", "8-10", "11-13", "14-17"];
export const TOPICS = { me: "Tell me about yourself", pitch: "Pitch your idea", animal: "My favorite animal" };
const SQL = [
  "CREATE TABLE IF NOT EXISTS fc_sessions (id TEXT PRIMARY KEY, day TEXT NOT NULL, dev_h TEXT NOT NULL, ip_h TEXT NOT NULL, topic TEXT, created INTEGER NOT NULL)",
  "CREATE INDEX IF NOT EXISTS fc_sessions_day ON fc_sessions(day)",
  "CREATE TABLE IF NOT EXISTS fc_leads (id TEXT PRIMARY KEY, created TEXT NOT NULL, parent_first TEXT NOT NULL, parent_email TEXT NOT NULL, kid_age TEXT NOT NULL, consent INTEGER NOT NULL, source TEXT NOT NULL, ip_h TEXT, test INTEGER NOT NULL DEFAULT 0)",
  "CREATE TABLE IF NOT EXISTS fc_rl (k TEXT PRIMARY KEY, n INTEGER NOT NULL, exp INTEGER NOT NULL)",
];
let ready = false;
export async function db(env) { if (!ready) { await env.VCU.batch(SQL.map((s) => env.VCU.prepare(s))); ready = true; } return env.VCU; }
export async function bump(env, k, ttl) {
  const now = Math.floor(Date.now() / 1000);
  await env.VCU.prepare("DELETE FROM fc_rl WHERE exp < ?1").bind(now).run().catch(() => {});
  return env.VCU.prepare("INSERT INTO fc_rl (k,n,exp) VALUES (?1,1,?2) ON CONFLICT(k) DO UPDATE SET n=n+1 RETURNING n").bind(k, now + ttl).first("n");
}
export const isTest = (request, env) => env.EV_ENV === "preview" && isPreview(request) && request.headers.get("x-gks-test") === "count";
export const instructions = (topic) => "You are the GPS Kids Coach, a warm, playful speaking coach for kids aged 5 to 17. This is a short 3 minute practice. " +
  "Topic: " + (TOPICS[topic] || TOPICS.me) + ". Start by saying hi in one short sentence, say you are an AI coach, not a person, then invite the kid to talk about the topic for about 30 seconds. " +
  "After they talk, give one big win and one small thing to try, in words a 7 year old understands, then invite one more try. Keep every turn under 25 words. " +
  "Never ask for or repeat names, schools, ages, addresses or contact details. Never talk about money, plans or prices. Never discuss politics, religion, wars or grown-up topics; kindly steer back. " +
  "If a child seems unsafe or upset, say: Let's get a grown-up you trust to join you. Never mention a timer. When told time is nearly up, wrap up warmly in two short sentences.";
