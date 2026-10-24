// The public leaderboard is off. This app does not store a child's name.
import { json } from "../../lib/guard.js";
export function onRequest() { return json({ error: "not_stored", stored: false }, 410); }
