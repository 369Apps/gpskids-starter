// Tonight's in-person class: tap your name. No account, no email. The roster and every score stay on this phone.
// Used by app.js and tests/classnight.test.mjs. Nothing here is sent to the server.
export const NIGHTS = {
  thu: {
    code: "thu",
    label: "Thursday class",
    // No kid names in this public file (, Oct 15 2026: "we can't expose the kids to other coaches/partners").
    // Anyone could read names shipped here. The class list lives only on the class phone: each kid taps "I'm new" once.
    kids: [],
  },
};
export const byCode = (c) => NIGHTS[String(c || "").toLowerCase()] || null;

// Add any roster kid who isn't already a player. A blank player (no name, no saved days or points) is reused
// so a brand-new phone fits the whole class. Never deletes anyone. bands = age group to set only if that player has none yet.
export function mergeRoster(list, night, hasProgress, max = 8) {
  const out = (list || []).map((p) => ({ ...p }));
  const bands = [];
  for (const kid of night.kids) {
    let p = out.find((x) => (x.nickname || "").trim().toLowerCase() === kid.name.toLowerCase());
    if (!p) {
      const blank = out.find((x) => !(x.nickname || "").trim() && !hasProgress(x.id));
      if (blank) { blank.nickname = kid.name; blank.emoji = kid.emoji; blank.band = kid.band; p = blank; }
      else if (out.length < max) {
        let n = 1; while (out.some((x) => x.id === "p" + n)) n++;
        p = { id: "p" + n, nickname: kid.name, emoji: kid.emoji, band: kid.band, created_at: 0, kid_id: null, anon: "" };
        out.push(p);
      }
    }
    if (p) bands.push({ id: p.id, band: kid.band });
  }
  return { list: out, bands };
}

// Plain text for a parent. No link, no email, no phone number: the coach sends it from their own phone.
export function parentSummary({ name, talks = [], streak = 0, xp = 0 }) {
  const rows = (talks || []).filter((t) => t && Number.isFinite(t.o));
  const best = rows.length ? Math.max(...rows.map((t) => t.o)) : 0;
  const tip = (rows.length && rows[rows.length - 1].tip) ? String(rows[rows.length - 1].tip) : "They showed up and spoke.";
  const talksLine = rows.length === 0 ? "No talk was saved on this phone yet."
    : rows.length === 1 ? `1 talk, score ${best}%.` : `${rows.length} talks, best score ${best}%.`;
  const xpLine = xp > 0 ? ` ${xp} points.` : "";
  return `${name} practiced speaking at GPS Kids class tonight. ${talksLine} Streak: ${streak} day${streak === 1 ? "" : "s"}.${xpLine} Coach says: ${tip}`;
}
