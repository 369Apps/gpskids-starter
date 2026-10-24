// GET /api/voice -> { on, neural }  Voice coach switches for the client (PREVIEW feature, see lib/voice.js). No-store.
import { json } from "../../lib/guard.js";
import { voiceFlags } from "../../lib/voice.js";
export async function onRequestGet({ env }) { return json(await voiceFlags(env)); }
export const onRequestPost = () => json({ error: "method_not_allowed" }, 405);
