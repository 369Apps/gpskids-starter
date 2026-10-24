// Pitch Night recordings are not stored in this public app.
// Tips stay on the device. A parent fork must not upload a child's name, photo, or voice.
import { json, sameOriginWrite } from "../../lib/guard.js";

export async function onRequestGet() {
  return json({ open: false, stored: false });
}
export async function onRequestPost({ request }) {
  if (!sameOriginWrite(request)) return json({ error: "forbidden" }, 403);
  return json({ error: "not_stored", stored: false }, 410);
}
