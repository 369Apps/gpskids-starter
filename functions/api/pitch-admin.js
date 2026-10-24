// Pitch recordings are not stored, so there is no admin list.
import { json } from "../../lib/guard.js";
export function onRequest() { return json({ error: "not_stored", stored: false }, 410); }
