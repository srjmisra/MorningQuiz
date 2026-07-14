// CSV export of final results, generated entirely server-side (the teacher
// never touches raw room data — it comes back as a filename + csv string
// over the same authenticated Socket.IO control plane as everything else).
// Ranking always comes from leaderboard.js, never re-derived here, so an
// export can't disagree with what the teacher/student already saw on screen.

const leaderboard = require("./leaderboard");

function csvEscape(value) {
  const s = String(value == null ? "" : value);
  if (/[",\r\n]/.test(s)) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

function toParticipantsCsv(room) {
  const rankings = leaderboard.computeIndividualRankings(room);
  const totalQuestions = room.quiz && Array.isArray(room.quiz.questions) ? room.quiz.questions.length : 0;
  const eventTitle = (room.event && room.event.title) || "";
  const eventOrganizer = (room.event && room.event.organizer) || "";
  const timestamp = new Date().toISOString();

  const headers = [
    "Rank",
    "Name",
    "Team",
    "Score",
    "Correct Answers",
    "Answer Streak",
    "Total Questions",
    "Event Title",
    "Event Organizer",
    "Timestamp"
  ];

  // "Longest streak achieved" (not "streak at the exact moment the quiz
  // ended") is the meaningful lifetime stat for a results report — the
  // same number already shown as the Hall of Fame's "Longest Streak" badge.
  const rows = rankings.map((p, i) => [
    i + 1,
    p.name,
    p.groupName || "",
    p.score,
    p.correctCount,
    p.longestStreak,
    totalQuestions,
    eventTitle,
    eventOrganizer,
    timestamp
  ]);

  return [headers, ...rows].map((row) => row.map(csvEscape).join(",")).join("\r\n") + "\r\n";
}

function sanitizeForFilename(str) {
  const cleaned = String(str || "").replace(/[^a-zA-Z0-9]+/g, "");
  return cleaned || "Quiz";
}

function todayDateStamp() {
  const d = new Date();
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

function buildResultsFilename(room) {
  const titlePart = sanitizeForFilename(room.event && room.event.title);
  return `QuizResults_${titlePart}_${todayDateStamp()}.csv`;
}

module.exports = {
  toParticipantsCsv,
  buildResultsFilename
};
