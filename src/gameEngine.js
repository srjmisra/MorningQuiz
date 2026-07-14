const roomManager = require("./roomManager");

const INTRO_DURATION_MS = 4000;
const LOCK_REVEAL_DELAY_MS = 1200;

function connectedPlayers(room) {
  return [...room.players.values()].filter((p) => p.connected);
}

function participantOf(room, player) {
  return room.participants.get(player.participantId);
}

function clearTimer(room) {
  if (room.questionTimer) {
    clearTimeout(room.questionTimer);
    room.questionTimer = null;
  }
}

// Public entry point (called from socketHandlers) — resolves the room once
// from roomCode, then passes the resolved object down through every internal
// helper below instead of each one re-querying roomManager independently.
function startQuiz(io, roomCode) {
  const room = roomManager.getRoom(roomCode);
  if (!room) return;
  room.currentQuestionIndex = -1;
  goToNextQuestion(io, room);
}

// Internal helper — takes the resolved room directly so the setTimeout
// closure below captures this specific room, not "whatever roomCode resolves
// to when the timer fires."
function goToNextQuestion(io, room) {
  clearTimer(room);
  room.currentQuestionIndex += 1;

  if (room.currentQuestionIndex >= room.quiz.questions.length) {
    finishEvent(io, room);
    return;
  }

  room.status = "intro";
  room.answeredThisQuestion = new Set();
  const q = room.quiz.questions[room.currentQuestionIndex];

  const introPayload = {
    questionIndex: room.currentQuestionIndex,
    totalQuestions: room.quiz.questions.length,
    category: q.category || "General Knowledge",
    introMs: INTRO_DURATION_MS
  };
  room.lastIntroPayload = introPayload;
  io.to(room.code).emit("game:questionIntro", introPayload);

  room.questionTimer = setTimeout(() => beginQuestion(io, room), INTRO_DURATION_MS);
}

function beginQuestion(io, room) {
  const q = room.quiz.questions[room.currentQuestionIndex];

  room.status = "question";
  room.currentQuestionStartTime = Date.now();
  room.answeredThisQuestion = new Set();

  const startPayload = {
    questionIndex: room.currentQuestionIndex,
    totalQuestions: room.quiz.questions.length,
    question: q.question,
    image: q.image,
    options: q.options,
    timeLimitSeconds: q.timeLimitSeconds
  };
  room.lastQuestionStartPayload = startPayload;
  io.to(room.code).emit("game:questionStart", startPayload);

  io.to(room.code).emit("game:answerCount", buildLiveStats(room));

  room.questionTimer = setTimeout(() => endQuestion(io, room), q.timeLimitSeconds * 1000);
}

// Public entry point — receives roomCode explicitly (via socket.data on the
// calling socket) rather than assuming "the" room.
function submitAnswer(io, roomCode, socket, payload) {
  const room = roomManager.getRoom(roomCode);
  if (!room || room.status !== "question") return { ok: false, error: "notOpen" };

  const participantId = socket.data.participantId;
  const player = participantId != null ? room.players.get(participantId) : null;
  if (!player || !player.connected) return { ok: false, error: "notJoined" };
  if (room.answeredThisQuestion.has(participantId)) return { ok: false, error: "alreadyAnswered" };

  const { questionIndex, choiceIndex } = payload || {};
  if (questionIndex !== room.currentQuestionIndex) return { ok: false, error: "stale" };

  const q = room.quiz.questions[room.currentQuestionIndex];
  const timeTakenMs = Date.now() - room.currentQuestionStartTime;
  const correct = choiceIndex === q.correctIndex;
  const pointsAwarded = correct
    ? Math.min(1000, Math.max(500, Math.round(500 + 500 * (1 - timeTakenMs / (q.timeLimitSeconds * 1000)))))
    : 0;

  player.answeredCount += 1;
  player.answers.push({ questionIndex, choiceIndex, correct, timeTakenMs, pointsAwarded });

  if (correct) {
    player.correctCount += 1;
    player.score += pointsAwarded;
    player.streak += 1;
    player.longestStreak = Math.max(player.longestStreak, player.streak);
    if (player.fastestCorrectMs === null || timeTakenMs < player.fastestCorrectMs) {
      player.fastestCorrectMs = timeTakenMs;
    }
  } else {
    player.streak = 0;
  }

  room.answeredThisQuestion.add(participantId);
  io.to(room.code).emit("game:answerCount", buildLiveStats(room));
  maybeAutoEndQuestion(io, room);

  const ranked = [...room.players.values()].sort((a, b) => b.score - a.score);
  const currentRank = ranked.findIndex((p) => p.participantId === participantId) + 1;

  return {
    ok: true,
    correct,
    pointsAwarded,
    currentScore: player.score,
    currentRank,
    totalPlayers: ranked.length
  };
}

// Public entry point (also called from socketHandlers' disconnect handler,
// which resolves the room first) — takes the room directly since both call
// sites already have it in hand.
function maybeAutoEndQuestion(io, room) {
  if (!room || room.status !== "question") return;
  const total = connectedPlayers(room).length;
  if (total > 0 && room.answeredThisQuestion.size >= total) {
    endQuestion(io, room);
  }
}

function endQuestion(io, room) {
  if (!room || room.status !== "question") return;
  clearTimer(room);

  // Anyone who didn't answer in time breaks their streak, same as an incorrect answer.
  for (const player of connectedPlayers(room)) {
    if (!room.answeredThisQuestion.has(player.participantId)) {
      player.streak = 0;
    }
  }

  room.status = "locked";
  io.to(room.code).emit("game:answersLocked", {});
  room.questionTimer = setTimeout(() => revealResults(io, room), LOCK_REVEAL_DELAY_MS);
}

function forceReveal(io, roomCode) {
  const room = roomManager.getRoom(roomCode);
  if (!room || room.status !== "question") return;
  endQuestion(io, room);
}

function revealResults(io, room) {
  if (!room) return;
  clearTimer(room);
  room.status = "results";
  const q = room.quiz.questions[room.currentQuestionIndex];

  const endPayload = {
    questionIndex: room.currentQuestionIndex,
    correctIndex: q.correctIndex,
    explanation: q.explanation,
    individualTop5: computeIndividualTop(room, 5),
    groupLeaderboard: computeGroupLeaderboard(room),
    groupProgress: computeGroupProgress(room, room.currentQuestionIndex),
    questionAnalytics: computeQuestionAnalytics(room, room.currentQuestionIndex),
    liveStats: buildLiveStats(room)
  };
  room.lastQuestionEndPayload = endPayload;
  io.to(room.code).emit("game:questionEnd", endPayload);
}

// Per-question breakdown for the "Question Analytics" panel — reuses the
// answers already stored on each player, no new state to track.
function computeQuestionAnalytics(room, questionIndex) {
  const q = room.quiz.questions[questionIndex];
  const allAnswers = [...room.players.values()]
    .map((p) => p.answers.find((a) => a.questionIndex === questionIndex))
    .filter(Boolean);

  const correctResponses = allAnswers.filter((a) => a.correct).length;
  const incorrectResponses = allAnswers.length - correctResponses;
  const accuracyPct =
    allAnswers.length > 0 ? Math.round((correctResponses / allAnswers.length) * 100) : 0;
  const avgResponseMs =
    allAnswers.length > 0
      ? Math.round(allAnswers.reduce((sum, a) => sum + a.timeTakenMs, 0) / allAnswers.length)
      : 0;

  const wrongCounts = new Map();
  for (const a of allAnswers) {
    if (!a.correct) wrongCounts.set(a.choiceIndex, (wrongCounts.get(a.choiceIndex) || 0) + 1);
  }
  let mostSelectedWrongIndex = null;
  let mostSelectedWrongCount = 0;
  for (const [idx, count] of wrongCounts.entries()) {
    if (count > mostSelectedWrongCount) {
      mostSelectedWrongIndex = idx;
      mostSelectedWrongCount = count;
    }
  }

  return {
    totalResponses: allAnswers.length,
    correctResponses,
    incorrectResponses,
    accuracyPct,
    avgResponseMs,
    mostSelectedWrongAnswer: mostSelectedWrongIndex !== null ? q.options[mostSelectedWrongIndex] : null,
    mostSelectedWrongCount
  };
}

function nextQuestion(io, roomCode) {
  const room = roomManager.getRoom(roomCode);
  if (!room || room.status !== "results") return;
  goToNextQuestion(io, room);
}

// Lets the teacher finish early from any in-progress point — reuses the
// exact same finishEvent() path a natural finish already takes.
function endQuizEarly(io, roomCode) {
  const room = roomManager.getRoom(roomCode);
  if (!room || room.status === "ended") return;
  finishEvent(io, room);
}

function finishEvent(io, room) {
  if (!room) return;
  clearTimer(room);
  room.status = "ended";

  const individualRankings = computeIndividualTop(room, room.players.size);
  const groupRankings = computeGroupLeaderboard(room);
  const stats = buildLiveStats(room);

  const finalPayload = {
    championIndividual: individualRankings[0] || null,
    championGroup: groupRankings[0] || null,
    hallOfFame: stats.hallOfFame,
    finalIndividualRankings: individualRankings,
    finalGroupRankings: groupRankings
  };
  room.lastFinalResultsPayload = finalPayload;
  io.to(room.code).emit("game:finalResults", finalPayload);
}

function computeIndividualTop(room, count) {
  return [...room.players.values()]
    .map((p) => {
      const participant = participantOf(room, p);
      const team = (room.teams || []).find((t) => t.id === participant.teamId) || null;
      return {
        participantId: p.participantId,
        name: participant.name,
        group: participant.teamId,
        groupName: team ? team.name : "",
        score: p.score,
        streak: p.streak
      };
    })
    .sort((a, b) => b.score - a.score)
    .slice(0, count);
}

// Team ranking uses average score across members who have actually answered
// at least one question, not a raw sum — otherwise bigger teams win by
// headcount alone. Teams (and who's on them) are entirely teacher-defined
// via the setup wizard (room.teams) — empty in individual mode, which
// naturally yields an empty leaderboard/progress list below.
function computeGroupLeaderboard(room) {
  return (room.teams || [])
    .map((t) => {
      const members = [...room.players.values()].filter((p) => participantOf(room, p).teamId === t.id);
      const participated = members.filter((p) => p.answeredCount > 0);
      const avgPerformance =
        participated.length > 0
          ? Math.round(participated.reduce((sum, p) => sum + p.score, 0) / participated.length)
          : 0;
      return {
        id: t.id,
        name: t.name,
        color: t.color,
        avgPerformance,
        membersJoined: members.length,
        membersParticipated: participated.length,
        // No fixed roster size to report anymore — just echoes the current
        // joined count so any client still reading this field stays sane.
        groupSize: members.length
      };
    })
    .sort((a, b) => b.avgPerformance - a.avgPerformance);
}

function computeGroupProgress(room, questionIndex) {
  return (room.teams || []).map((t) => {
    const members = [...room.players.values()].filter((p) => participantOf(room, p).teamId === t.id);
    const answered = members
      .map((p) => p.answers.find((a) => a.questionIndex === questionIndex))
      .filter(Boolean);
    const correct = answered.filter((a) => a.correct).length;
    const pct = answered.length > 0 ? Math.round((correct / answered.length) * 100) : 0;
    return { id: t.id, name: t.name, color: t.color, correct, answered: answered.length, pct };
  });
}

function buildLiveStats(room) {
  const players = connectedPlayers(room);
  const totalPlayers = players.length;
  const answeredCount = room.answeredThisQuestion ? room.answeredThisQuestion.size : 0;
  const pendingCount = Math.max(0, totalPlayers - answeredCount);

  const withAnswers = [...room.players.values()].filter((p) => p.answeredCount > 0);
  const avgAccuracy = withAnswers.length > 0
    ? Math.round(
        (withAnswers.reduce((sum, p) => sum + p.correctCount / p.answeredCount, 0) / withAnswers.length) * 100
      )
    : 0;

  let fastest = null;
  for (const p of room.players.values()) {
    if (p.fastestCorrectMs !== null && (!fastest || p.fastestCorrectMs < fastest.ms)) {
      fastest = { name: participantOf(room, p).name, ms: p.fastestCorrectMs };
    }
  }

  const groupLeaderboard = computeGroupLeaderboard(room);
  const leadingGroup =
    groupLeaderboard.length > 0 && groupLeaderboard[0].avgPerformance > 0 ? groupLeaderboard[0] : null;

  const individualTop = computeIndividualTop(room, 1);
  const leadingIndividual = individualTop.length > 0 && individualTop[0].score > 0 ? individualTop[0] : null;

  let longestStreakPlayer = null;
  for (const p of room.players.values()) {
    if (p.longestStreak > 0 && (!longestStreakPlayer || p.longestStreak > longestStreakPlayer.streak)) {
      longestStreakPlayer = { name: participantOf(room, p).name, streak: p.longestStreak };
    }
  }

  let highestAccuracyPlayer = null;
  for (const p of withAnswers) {
    const pct = p.correctCount / p.answeredCount;
    if (!highestAccuracyPlayer || pct > highestAccuracyPlayer.pct / 100) {
      highestAccuracyPlayer = { name: participantOf(room, p).name, pct: Math.round(pct * 100) };
    }
  }

  return {
    questionIndex: room.currentQuestionIndex,
    answeredCount,
    pendingCount,
    totalPlayers,
    avgAccuracy,
    fastestResponse: fastest,
    leadingGroup,
    leadingIndividual,
    hallOfFame: {
      fastestThinker: fastest,
      longestStreak: longestStreakPlayer,
      highestAccuracy: highestAccuracyPlayer,
      leadingGroup
    }
  };
}

// Lets a teacher who refreshed mid-event catch back up instead of the app
// defaulting to a blank Welcome screen while the room keeps running headless.
// Already room-scoped (takes room directly) — roomManager.reclaimTeacher()
// resolves which room before calling this.
function getReconnectSnapshot(room) {
  const snapshot = {
    status: room.status,
    // Passthrough of the teacher's setup-wizard data (event/groupMode/teams)
    // so a refreshed teacher browser can restore it without redoing setup.
    // Purely descriptive — not read by any scoring/leaderboard/timer logic.
    event: room.event || null,
    groupMode: room.groupMode || null,
    teams: room.teams || [],
    quiz: room.quiz || null,
    lobbySnapshot: room.status === "lobby" ? roomManager.lobbySnapshot(room.code) : null,
    lastIntroPayload: room.lastIntroPayload || null,
    lastQuestionStartPayload: room.lastQuestionStartPayload || null,
    lastQuestionEndPayload: room.lastQuestionEndPayload || null,
    lastFinalResultsPayload: room.lastFinalResultsPayload || null,
    remainingSeconds: null
  };

  if (room.status === "question" && room.currentQuestionStartTime) {
    const q = room.quiz.questions[room.currentQuestionIndex];
    const elapsedSeconds = Math.floor((Date.now() - room.currentQuestionStartTime) / 1000);
    snapshot.remainingSeconds = Math.max(0, q.timeLimitSeconds - elapsedSeconds);
  }

  return snapshot;
}

module.exports = {
  startQuiz,
  submitAnswer,
  forceReveal,
  nextQuestion,
  endQuizEarly,
  maybeAutoEndQuestion,
  getReconnectSnapshot
};
