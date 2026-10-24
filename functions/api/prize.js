// Public copy: the speaking board is off. Nothing about a child is stored.
import { json, sameOriginWrite } from "../../lib/guard.js";

export async function onRequestGet() {
  return json({ open: false, stored: false, today: null, week: { rows: [] }, month: { rows: [] } });
}

export async function onRequestPost({ request }) {
  if (!sameOriginWrite(request)) return json({ error: "forbidden" }, 403);
  return json({ error: "not_stored", stored: false }, 410);
}
