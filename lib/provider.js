// Optional live-voice provider. The browser never sees the vendor, the key, or the model name.
// Leave the settings empty to use Cloudflare Workers AI for recorded tips only.
import { json } from "./guard.js";

export function providerKey(env) {
  return env.AI_API_KEY || env.TRY_XAI_KEY || env.XAI_API_KEY || "";
}
export function httpBase(env) {
  return String(env.AI_HTTP_URL || "").replace(/\/$/, "");
}
export function realtimeBase(env) {
  return String(env.AI_REALTIME_URL || "").replace(/\/$/, "");
}
export function textModel(env) {
  return env.AI_MODEL || env.AI_TEXT_MODEL || "";
}
export function liveOn(env) {
  return !!(providerKey(env) && httpBase(env) && realtimeBase(env));
}
function subprotocol(env, secret) {
  const prefix = env.AI_REALTIME_SUBPROTOCOL || "";
  return prefix ? prefix + secret : secret;
}

const TICKET_SQL = "CREATE TABLE IF NOT EXISTS voice_tickets (id TEXT PRIMARY KEY, secret TEXT NOT NULL, qs TEXT NOT NULL, exp INTEGER NOT NULL)";

// Mint a one-time same-origin socket. The provider secret stays in D1 until the socket opens, then it is deleted.
export async function mintConnect(env, { seconds = 180, query = "" } = {}) {
  if (!liveOn(env) || !env.VCU) return null;
  const r = await fetch(httpBase(env) + "/realtime/client_secrets", {
    method: "POST",
    headers: { Authorization: "Bearer " + providerKey(env), "content-type": "application/json" },
    body: JSON.stringify({ expires_after: { seconds } }),
  }).catch(() => null);
  if (!r || !r.ok) return null;
  const o = await r.json().catch(() => ({}));
  if (!o.value) return null;
  await env.VCU.prepare(TICKET_SQL).run();
  const id = crypto.randomUUID();
  const exp = Date.now() + Math.min(900, Number(seconds) + 30) * 1000;
  await env.VCU.prepare("INSERT INTO voice_tickets (id, secret, qs, exp) VALUES (?1, ?2, ?3, ?4)").bind(id, String(o.value), String(query || "").slice(0, 200), exp).run();
  return { connect_url: "/api/voice/ws?ticket=" + id, expires_at: o.expires_at || null, voice: env.AI_VOICE_ID || "" };
}

export async function proxyVoice(request, env) {
  if (request.headers.get("Upgrade") !== "websocket") return json({ error: "expected_websocket" }, 426);
  const ticket = new URL(request.url).searchParams.get("ticket") || "";
  if (!/^[0-9a-f-]{36}$/i.test(ticket) || !env.VCU || !realtimeBase(env)) return new Response("bad ticket", { status: 400 });
  await env.VCU.prepare(TICKET_SQL).run().catch(() => {});
  const row = await env.VCU.prepare("SELECT secret, qs, exp FROM voice_tickets WHERE id = ?1").bind(ticket).first();
  await env.VCU.prepare("DELETE FROM voice_tickets WHERE id = ?1 OR exp < ?2").bind(ticket, Date.now()).run().catch(() => {});
  if (!row || row.exp < Date.now() || !row.secret) return new Response("expired", { status: 410 });
  const pair = new WebSocketPair();
  const [client, server] = Object.values(pair);
  server.accept();
  const qs = row.qs ? (String(row.qs).startsWith("?") ? row.qs : "?" + row.qs) : "";
  let upstream;
  try { upstream = new WebSocket(realtimeBase(env) + qs, [subprotocol(env, row.secret)]); }
  catch (e) { try { server.close(1011, "provider"); } catch (x) {} return new Response(null, { status: 101, webSocket: client }); }
  const pending = [];
  let open = false;
  const send = (sock, data) => { try { sock.send(data); } catch (e) {} };
  server.addEventListener("message", (ev) => { if (!open) pending.push(ev.data); else send(upstream, ev.data); });
  upstream.addEventListener("open", () => { open = true; for (const d of pending) send(upstream, d); pending.length = 0; });
  upstream.addEventListener("message", (ev) => send(server, ev.data));
  const shut = (from, to) => { from.addEventListener("close", () => { try { to.close(); } catch (e) {} }); from.addEventListener("error", () => { try { to.close(); } catch (e) {} }); };
  shut(server, upstream); shut(upstream, server);
  return new Response(null, { status: 101, webSocket: client });
}
