# UniversalQuiz v2 — Release Notes

UniversalQuiz started as MorningQuiz, a live quiz tool built for one specific
workshop event (a KVS ZIET Bhubaneswar PGT(CS) in-service course), with a
fixed roster of participants, fixed groups, and hardcoded event branding
baked into the code. This release removes every one of those assumptions.
The result is a general-purpose live quiz platform any teacher can use for
a classroom, a staff meeting, a workshop, or an assembly — no code changes
required between events.

## Architecture changes

- **Room registry, not a global singleton.** `roomManager.js` holds a
  `Map<roomCode, Room>` instead of a single module-level variable. The app
  still only allows one active room at a time, but that limit lives in
  exactly one guard (`roomManager.hasAnyActiveRoom()`, checked in
  `socketHandlers.js`) — removing it later is a one-line change, not a
  data-model rewrite.
- **Explicit room identity throughout.** Every socket carries
  `socket.data = { roomCode, participantId, role }`. Every `gameEngine`
  function receives `roomCode` or an already-resolved `room` object
  explicitly — nothing implicitly reaches for "the" room anymore, and every
  `setTimeout` closure captures the specific room it belongs to.
- **Teacher-authored events.** A 5-step setup wizard (event details → quiz
  mode → teams → questions → review) replaces the old static Welcome
  screen. `room.event` (title/subtitle/organizer/logo), `room.groupMode`,
  `room.teams`, and `room.quiz` are all supplied by the teacher at room
  creation and validated server-side (`src/eventValidation.js`) — nothing
  is read from a config file at boot anymore except a sample quiz.
- **Self-registered participants.** `room.participants` is a per-room map
  populated entirely by students entering their own name (and a team, when
  applicable) at join time. There is no preset roster anywhere in the
  system.
- **Ranking as a single source of truth.** `src/leaderboard.js` is the only
  place individual/team ranking exists. The live leaderboard, the final
  results screen (teacher and student), and the CSV export all call the
  same two functions — they cannot disagree with each other.
- **Dynamic branding everywhere.** `public/shared/branding.js` drives the
  persistent header, welcome screen, and final-results screen on both
  apps from the active room's actual event data, with a generic built-in
  fallback mark (an inline SVG data URI — no image asset required) when no
  logo was uploaded.

## Removed assumptions

- Fixed participant roster (`config/participants.json`) — students now
  self-register.
- Fixed groups with a hardcoded "host group" that organizes rather than
  competes (`config/groups.json`) — teams are teacher-defined per event,
  and the teacher is a distinct role, not a participant.
- Static event branding (`config/event.json`) — organization name,
  institute, "session" ("Morning Assembly, presented by Group 4") badges,
  and the bilingual KVS text block are gone; branding comes from
  `room.event` or the built-in generic fallback.
- LAN/hotspot/localhost deployment guidance — the app assumes a public
  HTTPS domain (e.g. Railway) throughout; the old "share this LAN IP with
  participants" startup banner is gone.
- Hardcoded quiz content — questions are teacher-supplied at room
  creation; the original workshop's 14-question AI/Computer Vision quiz
  now exists only as an optional "load sample quiz" convenience.

## Supported features

- **Three group modes**: Individual, Team, Hybrid — chosen per event,
  teams are teacher-defined (name + color), students pick one at join
  time when applicable.
- **Teacher setup wizard**: event branding (title, subtitle, organizer,
  optional logo capped at ~200KB, client-side only), quiz mode, team
  roster, and question source, with a review step before the room is
  created.
- **Student self-registration**: name entry (validated: required,
  trimmed, length-capped, unique per room, case-insensitive) plus a team
  picker when the mode requires one.
- **Reconnect**: both teacher and student can refresh mid-event and
  resume — the teacher via a full state snapshot (including mid-question
  remaining time), the student via a `localStorage`-persisted identity
  reclaimed through `student:rejoinRoom`.
- **Live gameplay**: unchanged scoring (500–1000 points by answer speed),
  timers, intro countdown, live leaderboard, per-question analytics, Hall
  of Fame badges, and celebratory final results — all identical to the
  original MorningQuiz behavior, just driven by dynamic data now.
- **Results export**: one-click CSV download from the final-results
  screen, generated server-side.

## Import formats

Four formats, all converging on the same canonical question schema
(`public/shared/quizImport.js`), entirely client-side (no file ever
touches the server unparsed):

| Format | Status | Notes |
|---|---|---|
| Excel (`.xlsx`) | Primary | Vendored SheetJS; case-insensitive, order-independent header matching; "Download Template" button generates a matching starter file client-side |
| Paste from Word/Docs | Primary | Numbered-question block parser; tolerant of multi-line questions and `A.`/`A)` punctuation; optional `Category:`/`Explanation:`/`Time:` lines |
| CSV | Secondary ("Advanced") | Shares the same parsing core as Excel (SheetJS reads both into one row/column shape) |
| Raw JSON | Secondary ("Advanced") | `{title, questions: [...]}` or a bare array; includes a "load sample quiz" convenience |

Every importer returns `{ ok, questions, errors: [{row, message}] }`; the
setup wizard shows a question-count summary, a scrollable preview, and any
row/block errors before the teacher can continue.

## Export formats

- **CSV** (implemented): rank, name, team (blank in individual mode),
  score, correct answers, longest answer streak, total questions, event
  title, event organizer, export timestamp. Filename:
  `QuizResults_<SanitizedTitle>_<YYYY-MM-DD>.csv`.
- **PDF report / printable result sheet**: not implemented. A printable
  sheet (CSS `@media print` + `window.print()` on the existing
  final-results view) would be the cheaper of the two to add later; a
  designed PDF report would need a real PDF library.

## Known limitations

- **Single active room.** The whole server process supports exactly one
  live quiz at a time, enforced by one guard in `socketHandlers.js`. Two
  teachers cannot run separate quizzes on the same deployment
  simultaneously yet.
- **No persistence.** All room state (participants, scores, event
  branding) is in-memory only. A server restart — or `teacher:resetSession`
  — discards it permanently. There is no saved quiz history, no reusable
  question-set library across events, and no way to reopen a past quiz.
- **No accounts.** There is no login, no concept of "which teacher owns
  this room" beyond the current room's control socket, and no per-user
  anything.
- **No database.** Everything lives in process memory; nothing survives a
  deploy or a crash.
- **No analytics beyond the built-in Hall of Fame/question-analytics
  panels.** No cross-event reporting.
- **No certificates or participation records** beyond the CSV export.
- **Excel import only supports `.xlsx`** (the modern OOXML format) — no
  legacy `.xls` binary format.
- **PDF export and the printable result sheet are not implemented** (see
  Export formats above).
- **No student-side game-state snapshot on reconnect.** A student who
  reconnects mid-question is placed on a safe waiting view and picks back
  up on the next broadcast event, rather than seeing the exact live
  question state immediately (this predates this migration and was
  intentionally left as-is rather than silently changed).

These are documented gaps, not oversights — each one has a design already
sketched out in prior planning discussions (room registry → multiple
rooms, persistence module seams for template/history/user stores, etc.)
for whenever they're prioritized.
