// Anonymous usage events: the ONLY steps the app may log, and for each the only short codes (k) it may carry.
// Shared by the app (public/track.js) and the server (functions/api/ev.js validates against it). No free text ever:
// k is one of the listed codes, v is a small whole number (seconds, a score, a plan part 0-3), x a duel link id (hashed on the server).
const BAND = ["sprouts", "explorers", "leaders", "trailblazers", "grownups"];
const LAST = "STEP"; // k = the name of the last step (app_hide / app_close)
export const STEPS = {
  app_open: ["direct", "pitch", "duel", "ref", "resume", "home"], // app opened (k = how it was opened; home = a Take me home link)
  app_back: null,                                         // came back to the app after hiding it (same session)
  app_hide: LAST,                                         // app hidden (switched tab/app, screen off), k = last step
  app_close: LAST,                                        // page closed (pagehide), k = last step
  band_pick: BAND,                                        // age group picked
  class_join: BAND,                                       // class: a new kid joined with "I'm new" (k = age group; never the name)
  role_pick: ["parent", "coach", "partner"],               // "Who are you?" grown-up role tapped (kids tap an age group: band_pick)
  trial_open: ["parent", "link"],                          // "Book a free trial class" form opened (k = from the parent screen or the #trial link)
  trial_sent: ["tue", "thu"],                              // a grown-up booked a free trial class (k = the day; never the name or phone)
  club_open: ["parent", "thanks"],                         // "Classes and sign up" opened (after the grown-up check; k = from the Grown-ups screen or the trial thank-you)
  pts_view: ["phone", "lb", "practice", "error"],           // finish: the big "+N points!" moment (k = kept on this phone / server-confirmed leaderboard points / Practice, v = points)
  acct_ask: null,                                         // kid tapped "Make your account to win prizes" (shown only after a finish that earned points)
  acct_open: null,                                        // the grown-up passed the check and saw the account form (prize_enter = account made)
  prize_open: null,                                       // leaderboard screen opened (PREVIEW)
  prize_enter: null,                                      // a grown-up joined their child to the leaderboard (never the email or name)
  lb_score: null,                                         // Today's Scored Challenge saved (never the score)
  lb_invite: null,                                        // Bring a friend link shared
  coach_in: null,                                         // coach typed the right coach code (class report notes)
  coach_note: ["quick", "typed"],                         // coach added a kid note (never the words, only quick / typed)
  profile_pick: ["same", "switch"],                       // "Who's playing?" player picked
  prompt_shown: BAND,                                     // home: today's prompt shown (k = age group, v = prompt number)
  shuffle: null,                                          // "new prompt"
  feat_pick: null,                                        // kid picked the featured challenge (Halloween) from More
  time_choice: null,                                      // talk time chip (v = seconds)
  plan_open: null,                                        // "Plan first" opened
  plan_part: null,                                        // a Hook/Point/Example/Close card was on screen (v = 0..3)
  rec_open: ["first", "daily"],                           // record screen opened (v = goal seconds; first = a new kid's first challenge)
  mic_ask: null,                                          // the phone is asking "Allow microphone?" (first time on this phone)
  rec_start: ["audio", "typed"],                          // recording started (v = goal seconds)
  talk_plus: null,                                        // "+30s" while talking (v = new goal seconds)
  auto_stop: ["audio", "typed"],                          // the app stopped the recording at the max length (v = seconds)
  rec_end: ["tap", "auto"],                               // recording ended (v = length in seconds)
  rec_cancel: null,                                       // recording closed without finishing (v = seconds)
  mic_error: ["denied", "nomic", "busy", "inapp", "unsupported"],
  rec_fail: ["short", "empty", "network", "error", "blocked", "limit"], // couldn't hear / reach the coach
  feedback_view: ["daily", "twist", "pitch", "nowords", "club", "first"], // feedback screen shown (v = overall %)
  beat_tomorrow: null,                                    // feedback: "Beat it tomorrow" tapped
  more_open: ["home", "fb"],                              // kids: the small "More" link opened (home / feedback)
  path_move: ["start", "up", "hold", "ease"],             // hidden level: what a finished talk did to it (v = level 1-10)
  coach_heard: null,                                      // "Hear my coach"
  coach_answered: null,                                   // answered the coach's follow-up question
  retry: ["again", "redo", "twist", "pitch"],             // tried again
  card_open: null,                                        // share card opened
  share: ["native", "wa", "sms", "copy", "card"],         // a share button tapped
  family_duel: null,                                      // grown-up duel (pass the phone) started
  duel_sent: ["friend"],                                  // friend duel link made (x = duel id)
  duel_open: ["ok", "done", "expired", "own", "error"],   // a friend opened a duel link (x = duel id)
  duel_join: ["ok", "taken", "offline"],                  // the friend finished the duel (x = duel id)
  friend_done: null,                                      // sender: a friend finished my duel (x = duel id)
  pn_open: ["open", "closed", "done"],                    // Pitch Night page shown
  pn_form: null,                                          // Pitch Night form started (first tap/typing in it)
  pn_submit: null,                                        // Pitch Night entry submitted (saved)
  pn_error: ["closed", "not_open", "limit", "max_subs", "invalid", "too_large", "other", "offline"],
  pn_abandon: ["form", "record", "feedback"],             // left Pitch Night without submitting (k = where)
  home_qr: ["home", "fb", "report"],                      // "Take me home" QR shown (k = from the kid home, the class feedback nudge, the class report)
  home_link: ["native", "copy", "show"],                  // "No camera? Send the link" (k = share sheet / copied / shown to copy)
  home_import: ["code", "name", "blank", "new", "no", "bad", "full"], // Take me home link opened on a phone (k = which player got it / Not now / broken link / phone full)
  buddy_open: ["home", "class", "resume"],                // Buddy play opened (k = from the kid home / the class report / reopened page)
  buddy_start: ["story", "word", "invent", "trip"],       // a buddy game started (k = which game; never names)
  buddy_done: ["story", "word", "invent", "trip"],        // a buddy game finished
  belt_up: null,                                          // a new belt (v = belt 1-5: Yellow, Orange, Green, Blue, Purple)
  belt_share: ["native", "copy"],                         // belt card shared (share sheet / copied text)
};
export const DUEL_STEPS = new Set(["duel_sent", "duel_open", "duel_join", "friend_done"]);
// never "time on step": the gap after these is time away from the app
export const AWAY = new Set(["app_hide", "app_close"]);
// not a place a session "ends" (we look at the step before them)
export const NOT_END = new Set(["app_hide", "app_close", "app_back"]);
export const MAX_BATCH = 50, MAX_BYTES = 12000, MAX_N = 3000, MAX_AGE_MS = 6 * 3600e3;
export const DUEL_ID_RE = /^[a-km-np-z2-9]{10}$/;
export const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
export function kOk(step, k) {
  const a = STEPS[step];
  if (k == null) return true;
  if (a === LAST) return typeof k === "string" && Object.prototype.hasOwnProperty.call(STEPS, k);
  return Array.isArray(a) && a.includes(k);
}
