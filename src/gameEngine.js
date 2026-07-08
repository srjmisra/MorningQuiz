const dataStore = require("./dataStore");
const roomManager = require("./roomManager");

const INTRO_DURATION_MS = 4000;
const LOCK_REVEAL_DELAY_MS = 1200;

function connectedPlayers(room) {
  return [...room.players.values()].filter((p) => p.connected);
}

function participantOf(player) {
  return dataStore.getParticipantById(player.participantId);
}

function clearTimer(room) {
  if (room.questionTimer) {
    clearTimeout(room.questionTimer);
    room.questionTimer = null;
  }
}

function startQuiz(io) {
  const room = roomManager.getRoom();
  if (!room) return;
  room.currentQuestionIndex = -1;
  goToNextQuestion(io);
}

function goToNextQuestion(io) {
  const room = roomManager.getRoom();
  if (!room) return;
  clearTimer(room);
  room.currentQuestionIndex += 1;

  if (room.currentQuestionIndex >= dataStore.quiz.questions.length) {
    finishEvent(io);
    return;
  }

  room.status = "intro";
  room.answeredThisQuestion = new Set();
  const q = dataStore.quiz.questions[room.currentQuestionIndex];

  const introPayload = {
    questionIndex: room.currentQuestionIndex,
    totalQuestions: dataStore.quiz.questions.length,
    category: q.category || "General Knowledge",
    introMs: INTRO_DURATION_MS
  };
  room.lastIntroPayload = introPayload;
  io.to(room.code).emit("game:questionIntro", introPayload);

  room.questionTimer = setTimeout(() => beginQuestion(io), INTRO_DURATION_MS);
}

function beginQuestion(io) {
  const room = roomManager.getRoom();
  if (!room) return;
  const q = dataStore.quiz.questions[room.currentQuestionIndex];

  room.status = "question";
  room.currentQuestionStartTime = Date.now();
  room.answeredThisQuestion = new Set();

  const startPayload = {
    questionIndex: room.currentQuestionIndex,
    totalQuestions: dataStore.quiz.questions.length,
    question: q.question,
    image: q.image,
    options: q.options,
    timeLimitSeconds: q.timeLimitSeconds
  };
  room.lastQuestionStartPayload = startPayload;
  io.to(room.code).emit("game:questionStart", startPayload);

  io.to(room.code).emit("game:answerCount", buildLiveStats(room));

  room.questionTimer = setTimeout(() => endQuestion(io), q.timeLimitSeconds * 1000);
}

function submitAnswer(io, socket, payload) {
  const room = roomManager.getRoom();
  if (!room || room.status !== "question") return { ok: false, error: "notOpen" };

  const participantId = socket.data.participantId;
  const player = participantId != null ? room.players.get(participantId) : null;
  if (!player || !player.connected) return { ok: false, error: "notJoined" };
  if (room.answeredThisQuestion.has(participantId)) return { ok: false, error: "alreadyAnswered" };

  const { questionIndex, choiceIndex } = payload || {};
  if (questionIndex !== room.currentQuestionIndex) return { ok: false, error: "stale" };

  const q = dataStore.quiz.questions[room.currentQuestionIndex];
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
  maybeAutoEndQuestion(io);

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

function maybeAutoEndQuestion(io) {
  const room = roomManager.getRoom();
  if (!room || room.status !== "question") return;
  const total = connectedPlayers(room).length;
  if (total > 0 && room.answeredThisQuestion.size >= total) {
    endQuestion(io);
  }
}

function endQuestion(io) {
  const room = roomManager.getRoom();
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
  room.questionTimer = setTimeout(() => revealResults(io), LOCK_REVEAL_DELAY_MS);
}

function forceReveal(io) {
  const room = roomManager.getRoom();
  if (!room || room.status !== "question") return;
  endQuestion(io);
}

function revealResults(io) {
  const room = roomManager.getRoom();
  if (!room) return;
  clearTimer(room);
  room.status = "results";
  const q = dataStore.quiz.questions[room.currentQuestionIndex];

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
  const q = dataStore.quiz.questions[questionIndex];
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

function nextQuestion(io) {
  const room = roomManager.getRoom();
  if (!room || room.status !== "results") return;
  goToNextQuestion(io);
}

// Lets the teacher finish early from any in-progress point — reuses the
// exact same finishEvent() path a natural finish already takes.
function endQuizEarly(io) {
  const room = roomManager.getRoom();
  if (!room || room.status === "ended") return;
  finishEvent(io);
}

function finishEvent(io) {
  const room = roomManager.getRoom();
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
      const participant = participantOf(p);
      const group = dataStore.getGroupById(participant.group);
      return {
        participantId: p.participantId,
        name: participant.name,
        group: participant.group,
        groupName: group ? group.name : "",
        score: p.score,
        streak: p.streak
      };
    })
    .sort((a, b) => b.score - a.score)
    .slice(0, count);
}

// Group ranking uses average score across members who have actually answered at
// least one question, not a raw sum — otherwise larger groups win by headcount alone.
// Host group(s) (e.g. Group 3) are organisers, not competitors, so they're
// excluded via competingGroups rather than the raw group list.
function computeGroupLeaderboard(room) {
  return dataStore.competingGroups
    .map((g) => {
      const members = [...room.players.values()].filter((p) => participantOf(p).group === g.id);
      const participated = members.filter((p) => p.answeredCount > 0);
      const avgPerformance =
        participated.length > 0
          ? Math.round(participated.reduce((sum, p) => sum + p.score, 0) / participated.length)
          : 0;
      return {
        id: g.id,
        name: g.name,
        color: g.color,
        avgPerformance,
        membersJoined: members.length,
        membersParticipated: participated.length,
        groupSize: dataStore.groupSize(g.id)
      };
    })
    .sort((a, b) => b.avgPerformance - a.avgPerformance);
}

function computeGroupProgress(room, questionIndex) {
  return dataStore.competingGroups.map((g) => {
    const members = [...room.players.values()].filter((p) => participantOf(p).group === g.id);
    const answered = members
      .map((p) => p.answers.find((a) => a.questionIndex === questionIndex))
      .filter(Boolean);
    const correct = answered.filter((a) => a.correct).length;
    const pct = answered.length > 0 ? Math.round((correct / answered.length) * 100) : 0;
    return { id: g.id, name: g.name, color: g.color, correct, answered: answered.length, pct };
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
      fastest = { name: participantOf(p).name, ms: p.fastestCorrectMs };
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
      longestStreakPlayer = { name: participantOf(p).name, streak: p.longestStreak };
    }
  }

  let highestAccuracyPlayer = null;
  for (const p of withAnswers) {
    const pct = p.correctCount / p.answeredCount;
    if (!highestAccuracyPlayer || pct > highestAccuracyPlayer.pct / 100) {
      highestAccuracyPlayer = { name: participantOf(p).name, pct: Math.round(pct * 100) };
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
function getReconnectSnapshot(room) {
  const snapshot = {
    status: room.status,
    lobbySnapshot: room.status === "lobby" ? roomManager.lobbySnapshot() : null,
    lastIntroPayload: room.lastIntroPayload || null,
    lastQuestionStartPayload: room.lastQuestionStartPayload || null,
    lastQuestionEndPayload: room.lastQuestionEndPayload || null,
    lastFinalResultsPayload: room.lastFinalResultsPayload || null,
    remainingSeconds: null
  };

  if (room.status === "question" && room.currentQuestionStartTime) {
    const q = dataStore.quiz.questions[room.currentQuestionIndex];
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
