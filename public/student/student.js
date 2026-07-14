const socket = io();

let roster = { liveRoomStatus: null };
let roomEvent = null;
let groupMode = null;
let roomTeams = [];
let myParticipant = null; // { id, name, teamId } — set on join/rejoin, never a preset roster lookup
let joinedRoomCode = null;

// Rejoin identity persistence — there's no preset roster to re-derive a
// participant from anymore, so the client remembers its own id per room
// code once self-registration succeeds.
function storageKey(roomCode) {
  return `uq_participant_${roomCode}`;
}

function saveIdentity(roomCode, participantId) {
  try {
    localStorage.setItem(storageKey(roomCode), String(participantId));
  } catch (err) {
    // Private browsing / storage disabled — non-fatal, just means no silent rejoin.
  }
}

function loadStoredParticipantId(roomCode) {
  try {
    const raw = localStorage.getItem(storageKey(roomCode));
    return raw ? Number(raw) : null;
  } catch (err) {
    return null;
  }
}

// A brief WiFi blip reconnects the transport automatically (Socket.IO's
// default behavior), but the server treats it as a brand-new socket — so
// without this, a student who's already joined would silently stop being
// able to submit answers after any network hiccup. Re-claim identity on
// every reconnect if we'd already joined once this page session.
socket.on("connect", () => {
  if (joinedRoomCode && myParticipant) {
    socket.emit("student:rejoinRoom", { roomCode: joinedRoomCode, participantId: myParticipant.id }, () => {});
  }
});

// Teacher reset the whole session — safest, lowest-risk way to return every
// client to a clean starting state is a full reload (reuses the existing
// init() flow, which will correctly show "no active session" afterward).
socket.on("session:reset", () => {
  location.reload();
});

const els = {
  pwLogo: document.getElementById("pw-logo"),
  pwOrganizer: document.getElementById("pw-organizer"),
  pwTitle: document.getElementById("pw-title"),
  pwSubtitle: document.getElementById("pw-subtitle"),
  pwContinueBtn: document.getElementById("pw-continue-btn"),

  sessionStateHeading: document.getElementById("session-state-heading"),
  sessionStateBody: document.getElementById("session-state-body"),
  sessionStateRefreshBtn: document.getElementById("session-state-refresh-btn"),

  roomCodeInput: document.getElementById("room-code-input"),
  studentNameInput: document.getElementById("student-name-input"),
  teamSelectRow: document.getElementById("team-select-row"),
  teamSelect: document.getElementById("team-select"),
  joinBtn: document.getElementById("join-btn"),
  joinError: document.getElementById("join-error"),
  waitingName: document.getElementById("waiting-name"),
  waitingGroup: document.getElementById("waiting-group"),

  introQuestionNumber: document.getElementById("intro-question-number"),
  introCategory: document.getElementById("intro-category"),
  introCountdown: document.getElementById("intro-countdown"),

  questionProgress: document.getElementById("question-progress"),
  timerFillCircle: document.getElementById("timer-fill-circle"),
  timerValue: document.getElementById("timer-value"),
  questionText: document.getElementById("question-text"),
  questionImage: document.getElementById("question-image"),
  answerGrid: document.getElementById("answer-grid"),
  submittedOverlay: document.getElementById("submitted-overlay"),
  submittedMessage: document.getElementById("submitted-message"),
  submittedScore: document.getElementById("submitted-score"),
  submittedRank: document.getElementById("submitted-rank"),
  submittedGroupName: document.getElementById("submitted-group-name"),
  submittedSub: document.getElementById("submitted-sub"),

  resultBadge: document.getElementById("result-badge"),
  resultPoints: document.getElementById("result-points"),
  resultExplanation: document.getElementById("result-explanation"),
  resultScore: document.getElementById("result-score"),
  resultStreak: document.getElementById("result-streak"),
  achievementRow: document.getElementById("achievement-row"),

  finalLogo: document.getElementById("final-logo"),
  finalHeading: document.getElementById("final-heading"),
  finalMyRank: document.getElementById("final-my-rank"),
  finalMyScore: document.getElementById("final-my-score"),
  finalMyGroupRank: document.getElementById("final-my-group-rank"),
  finalAchievementRow: document.getElementById("final-achievement-row"),
  finalChampionNote: document.getElementById("final-champion-note"),
  finalThanks: document.getElementById("final-thanks")
};

let currentQuestionIndex = null;
let hasAnsweredThisQuestion = false;
let lastAnswerResult = null;
let myScore = 0;
let myStreak = 0;
let myLongestStreak = 0;
let myCurrentRank = null;
let countdownIntervalId = null;

function showView(id) {
  document.querySelectorAll(".view").forEach((v) => v.classList.remove("view-active"));
  document.getElementById(id).classList.add("view-active");
}

function teamById(id) {
  return roomTeams.find((t) => t.id === id) || null;
}

function populateTeamSelect() {
  const requiresTeam = groupMode === "team" || groupMode === "hybrid";
  els.teamSelectRow.hidden = !requiresTeam;
  if (!requiresTeam) return;

  els.teamSelect.innerHTML = '<option value="" disabled selected>Select a team…</option>';
  roomTeams.forEach((t) => {
    const opt = document.createElement("option");
    opt.value = t.id;
    opt.textContent = t.name;
    els.teamSelect.appendChild(opt);
  });
}

els.roomCodeInput.addEventListener("input", (e) => {
  e.target.value = e.target.value.replace(/\D/g, "").slice(0, 6);
});

const ERROR_MESSAGES = {
  notFound: "Room code not found. Check with your host.",
  quizFinished: "This quiz has ended.",
  nameRequired: "Enter your name first.",
  nameTooLong: "That name is too long — please shorten it.",
  nameTaken: "That name is already taken in this room. Try adding an initial.",
  invalidTeam: "Choose a team before joining."
};

els.sessionStateRefreshBtn.addEventListener("click", () => location.reload());

function showWaitingRoom() {
  const team = teamById(myParticipant.teamId);
  els.waitingName.textContent = myParticipant.name;
  els.waitingGroup.textContent = team ? team.name : "";
  showView("view-waiting");
}

els.joinBtn.addEventListener("click", () => {
  const roomCode = els.roomCodeInput.value.trim();
  const name = els.studentNameInput.value.trim();
  const requiresTeam = groupMode === "team" || groupMode === "hybrid";
  const teamId = requiresTeam ? els.teamSelect.value : null;

  if (!/^\d{6}$/.test(roomCode)) {
    els.joinError.textContent = "Enter the 6-digit room code first.";
    return;
  }
  if (!name) {
    els.joinError.textContent = ERROR_MESSAGES.nameRequired;
    return;
  }
  if (requiresTeam && !teamId) {
    els.joinError.textContent = ERROR_MESSAGES.invalidTeam;
    return;
  }

  els.joinBtn.disabled = true;
  socket.emit("student:joinRoom", { roomCode, name, teamId }, (res) => {
    els.joinBtn.disabled = false;
    if (!res || !res.ok) {
      els.joinError.textContent = (res && ERROR_MESSAGES[res.error]) || "Could not join. Try again.";
      return;
    }
    joinedRoomCode = roomCode;
    myParticipant = res.participant;
    saveIdentity(roomCode, res.participant.id);
    els.joinError.textContent = "";
    showWaitingRoom();
  });
});

function attemptSilentRejoin(roomCode) {
  const storedId = loadStoredParticipantId(roomCode);
  if (!storedId) return false;

  socket.emit("student:rejoinRoom", { roomCode, participantId: storedId }, (res) => {
    if (!res || !res.ok) {
      showView("view-participant-welcome");
      return;
    }
    joinedRoomCode = roomCode;
    myParticipant = res.participant;
    // If a question/results/etc. is already live, the matching game:* event
    // handler below will move the view forward as soon as it (re)arrives —
    // this is just the safe baseline while that happens.
    showWaitingRoom();
  });
  return true;
}

const ANSWER_LETTERS = ["A", "B", "C", "D"];

function renderAnswerCards(options) {
  els.answerGrid.innerHTML = "";
  options.forEach((text, i) => {
    const card = document.createElement("button");
    card.type = "button";
    card.className = "answer-card";
    card.style.setProperty("--answer-color", `var(--answer-color-${i})`);
    card.style.setProperty("--answer-color-dark", `var(--answer-color-${i}-dark)`);
    card.style.animationDelay = `${i * 0.06}s`;
    card.dataset.optionText = text;

    const letter = document.createElement("span");
    letter.className = "card-letter";
    letter.textContent = ANSWER_LETTERS[i];
    const label = document.createElement("span");
    label.textContent = text;

    card.appendChild(letter);
    card.appendChild(label);
    card.addEventListener("click", () => submitAnswer(i, card));
    els.answerGrid.appendChild(card);
  });
}

function submitAnswer(choiceIndex, cardEl) {
  if (hasAnsweredThisQuestion) return;
  hasAnsweredThisQuestion = true;

  [...els.answerGrid.children].forEach((c) => (c.disabled = true));
  cardEl.classList.add("is-selected");

  socket.emit(
    "student:submitAnswer",
    { questionIndex: currentQuestionIndex, choiceIndex },
    (res) => {
      if (res && res.ok) {
        lastAnswerResult = { correct: res.correct, pointsAwarded: res.pointsAwarded };
        myScore = res.currentScore;
        myStreak = res.correct ? myStreak + 1 : 0;
        myLongestStreak = Math.max(myLongestStreak, myStreak);
        myCurrentRank = res.currentRank;

        els.submittedScore.textContent = res.currentScore;
        els.submittedRank.textContent = `#${res.currentRank} / ${res.totalPlayers}`;
      }
      const team = teamById(myParticipant.teamId);
      els.submittedGroupName.textContent = team ? team.name : "–";
      els.submittedMessage.textContent = "✅ Answer Submitted";
      els.submittedSub.textContent = "Waiting for reveal…";
      els.submittedOverlay.classList.add("visible");
    }
  );
}

socket.on("game:questionIntro", (data) => {
  currentQuestionIndex = data.questionIndex;
  hasAnsweredThisQuestion = false;
  lastAnswerResult = null;

  els.introQuestionNumber.textContent = `Question ${data.questionIndex + 1} of ${data.totalQuestions}`;
  els.introCategory.textContent = data.category;
  showView("view-intro");

  const steps = ["3", "2", "1", "GO!"];
  const stepMs = data.introMs / steps.length;
  steps.forEach((label, i) => {
    setTimeout(() => {
      els.introCountdown.textContent = label;
      els.introCountdown.style.animation = "none";
      void els.introCountdown.offsetWidth;
      els.introCountdown.style.animation = "popIn 0.5s ease";
    }, i * stepMs);
  });
});

socket.on("game:questionStart", (data) => {
  currentQuestionIndex = data.questionIndex;
  hasAnsweredThisQuestion = false;
  lastAnswerResult = null;

  els.questionProgress.textContent = `Question ${data.questionIndex + 1} of ${data.totalQuestions}`;
  els.questionText.textContent = data.question;
  if (data.image) {
    els.questionImage.src = data.image;
    els.questionImage.hidden = false;
  } else {
    els.questionImage.hidden = true;
  }
  renderAnswerCards(data.options);
  els.submittedOverlay.classList.remove("visible");
  showView("view-question");
  // "center" (not "start") so the fixed brand chip at the very top of the
  // screen doesn't overlap the question, and the answer cards below still
  // have room to show — "start" was pinning the question flush to the top edge.
  els.questionText.scrollIntoView({ behavior: "smooth", block: "center" });

  if (countdownIntervalId) clearInterval(countdownIntervalId);
  countdownIntervalId = startCountdownRing(els.timerFillCircle, els.timerValue, data.timeLimitSeconds);
});

socket.on("game:answersLocked", () => {
  if (countdownIntervalId) {
    clearInterval(countdownIntervalId);
    countdownIntervalId = null;
  }
  if (!hasAnsweredThisQuestion) {
    myStreak = 0;
    const team = teamById(myParticipant.teamId);
    els.submittedScore.textContent = myScore;
    els.submittedRank.textContent = myCurrentRank ? `#${myCurrentRank}` : "–";
    els.submittedGroupName.textContent = team ? team.name : "–";
    els.submittedMessage.textContent = "⏰ Time's Up!";
    els.submittedSub.textContent = "No answer submitted";
    els.submittedOverlay.classList.add("visible");
  }
});

socket.on("game:questionEnd", (data) => {
  if (lastAnswerResult) {
    els.resultBadge.textContent = lastAnswerResult.correct ? "✅ Correct!" : "❌ Incorrect";
    els.resultPoints.textContent = `+${lastAnswerResult.pointsAwarded} points`;
  } else {
    els.resultBadge.textContent = "⏰ No Answer";
    els.resultPoints.textContent = "+0 points";
  }
  els.resultExplanation.textContent = data.explanation || "";
  els.resultScore.textContent = myScore;
  els.resultStreak.textContent = myStreak;

  renderAchievements(data.liveStats.hallOfFame);

  els.submittedOverlay.classList.remove("visible");
  showView("view-result");
  els.resultBadge.scrollIntoView({ behavior: "smooth", block: "start" });
});

function renderAchievements(hallOfFame) {
  const badges = [];

  if (lastAnswerResult && lastAnswerResult.correct && lastAnswerResult.pointsAwarded >= 900) {
    badges.push({ icon: "⚡", label: "Fast Answer" });
  }
  if (myStreak >= 3) {
    badges.push({ icon: "🔥", label: "Answer Streak" });
  }
  if (hallOfFame && hallOfFame.highestAccuracy && hallOfFame.highestAccuracy.name === myParticipant.name) {
    badges.push({ icon: "🎯", label: "Highest Accuracy" });
  }
  if (myCurrentRank && myCurrentRank <= 3) {
    badges.push({ icon: "⭐", label: "Top 3" });
  }

  els.achievementRow.innerHTML = "";
  badges.forEach((b, i) => {
    const el = document.createElement("span");
    el.className = "achievement-badge";
    el.style.animationDelay = `${i * 0.1}s`;
    el.textContent = `${b.icon} ${b.label}`;
    els.achievementRow.appendChild(el);
  });
}

socket.on("game:finalResults", (data) => {
  const myRankIndex = data.finalIndividualRankings.findIndex(
    (p) => p.participantId === myParticipant.id
  );
  const myEntry = myRankIndex >= 0 ? data.finalIndividualRankings[myRankIndex] : null;
  const myGroupRankIndex = data.finalGroupRankings.findIndex((g) => g.id === myParticipant.teamId);

  els.finalMyRank.textContent = myRankIndex >= 0 ? `#${myRankIndex + 1}` : "–";
  els.finalMyScore.textContent = myEntry ? myEntry.score : myScore;
  els.finalMyGroupRank.textContent = myGroupRankIndex >= 0 ? `#${myGroupRankIndex + 1}` : "–";

  const isChampIndividual =
    data.championIndividual && data.championIndividual.participantId === myParticipant.id;
  const isChampGroup = data.championGroup && data.championGroup.id === myParticipant.teamId;

  if (isChampIndividual) {
    els.finalHeading.textContent = "👑 You're the Champion!";
  } else if (isChampGroup) {
    els.finalHeading.textContent = "🏆 Your Group Won!";
  } else {
    els.finalHeading.textContent = "🏁 Quiz Complete!";
  }

  els.finalChampionNote.textContent = `Champion: ${
    data.championIndividual ? data.championIndividual.name : "–"
  } · Champion Group: ${data.championGroup ? data.championGroup.name : "–"}`;

  els.finalLogo.src = brandLogoSrc(roomEvent && roomEvent.logoDataUri);
  els.finalThanks.textContent = `Thank you for participating${
    roomEvent && roomEvent.organizer ? ` — ${roomEvent.organizer}` : ""
  }!`;

  const finalBadges = [];
  if (myLongestStreak >= 3) finalBadges.push({ icon: "🔥", label: "Answer Streak" });
  if (data.hallOfFame.highestAccuracy && data.hallOfFame.highestAccuracy.name === myParticipant.name) {
    finalBadges.push({ icon: "🎯", label: "Highest Accuracy" });
  }
  if (data.hallOfFame.fastestThinker && data.hallOfFame.fastestThinker.name === myParticipant.name) {
    finalBadges.push({ icon: "⚡", label: "Fastest Answer" });
  }
  els.finalAchievementRow.innerHTML = "";
  finalBadges.forEach((b, i) => {
    const el = document.createElement("span");
    el.className = "achievement-badge";
    el.style.animationDelay = `${i * 0.1}s`;
    el.textContent = `${b.icon} ${b.label}`;
    els.finalAchievementRow.appendChild(el);
  });

  showView("view-final");
  if (isChampIndividual || isChampGroup) {
    launchConfetti({ container: document.body, count: 100 });
  }
});

function renderParticipantWelcome() {
  const e = roomEvent || {};
  els.pwLogo.src = brandLogoSrc(e.logoDataUri);
  els.pwOrganizer.textContent = e.organizer ? `by ${e.organizer}` : "";
  els.pwTitle.textContent = e.title || "Live Quiz";
  els.pwSubtitle.textContent = e.subtitle || "";
}

els.pwContinueBtn.addEventListener("click", () => {
  showView("view-join");
});

async function init() {
  applyBrandChip(null);
  updatePageTitle(null, "Join");

  const params = new URLSearchParams(window.location.search);
  const codeParam = params.get("code") ? params.get("code").replace(/\D/g, "").slice(0, 6) : null;
  if (codeParam) {
    els.roomCodeInput.value = codeParam;
  }

  try {
    const res = await fetch("/api/roster");
    roster = await res.json();
    roomEvent = roster.roomEvent;
    groupMode = roster.groupMode;
    roomTeams = roster.teams || [];

    renderParticipantWelcome();
    applyBrandChip(roomEvent);
    updatePageTitle(roomEvent, "Join");
    populateTeamSelect();

    if (roster.liveRoomStatus === null) {
      els.sessionStateHeading.textContent = "Please Wait";
      els.sessionStateBody.textContent = "The quiz has not started yet. Please wait for the teacher.";
      showView("view-session-state");
    } else if (roster.liveRoomStatus === "ended") {
      els.sessionStateHeading.textContent = "Quiz Ended";
      els.sessionStateBody.textContent = "This quiz has ended.";
      showView("view-session-state");
    } else if (codeParam) {
      // A room is live and we arrived via a room-specific link — silently
      // reclaim identity if this browser already joined it before.
      attemptSilentRejoin(codeParam);
    }
    // Otherwise stay on view-participant-welcome (already view-active by default).
  } catch (err) {
    console.error("Failed to load roster:", err);
  } finally {
    hideSplashScreen();
  }
}

init();
