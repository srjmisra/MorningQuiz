const socket = io();

let roster = { participants: [], groups: [], event: {} };
let selectedGroup = null; // null = All
let searchTerm = "";
let selectedParticipant = null;
let joinedRoomCode = null;

// A brief WiFi blip reconnects the transport automatically (Socket.IO's
// default behavior), but the server treats it as a brand-new socket — so
// without this, a student who's already joined would silently stop being
// able to submit answers after any network hiccup. Re-claim identity on
// every reconnect if we'd already joined once.
socket.on("connect", () => {
  if (joinedRoomCode && selectedParticipant) {
    socket.emit("student:joinRoom", { roomCode: joinedRoomCode, participantId: selectedParticipant.id }, () => {});
  }
});

// Teacher reset the whole session — safest, lowest-risk way to return every
// client to a clean starting state is a full reload (reuses the existing
// init() flow, which will correctly show "no active session" afterward).
socket.on("session:reset", () => {
  location.reload();
});

const els = {
  pwOrg: document.getElementById("pw-org"),
  pwInstitute: document.getElementById("pw-institute"),
  pwTitle: document.getElementById("pw-title"),
  pwProgramme: document.getElementById("pw-programme"),
  pwContinueBtn: document.getElementById("pw-continue-btn"),

  sessionStateHeading: document.getElementById("session-state-heading"),
  sessionStateBody: document.getElementById("session-state-body"),
  sessionStateRefreshBtn: document.getElementById("session-state-refresh-btn"),

  roomCodeInput: document.getElementById("room-code-input"),
  searchInput: document.getElementById("search-input"),
  groupTabs: document.getElementById("group-tabs"),
  participantList: document.getElementById("participant-list"),
  confirmName: document.getElementById("confirm-name"),
  confirmKv: document.getElementById("confirm-kv"),
  confirmRegion: document.getElementById("confirm-region"),
  confirmGroup: document.getElementById("confirm-group"),
  joinBtn: document.getElementById("join-btn"),
  backBtn: document.getElementById("back-btn"),
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

  finalHeading: document.getElementById("final-heading"),
  finalMyRank: document.getElementById("final-my-rank"),
  finalMyScore: document.getElementById("final-my-score"),
  finalMyGroupRank: document.getElementById("final-my-group-rank"),
  finalAchievementRow: document.getElementById("final-achievement-row"),
  finalChampionNote: document.getElementById("final-champion-note")
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

function groupById(id) {
  return roster.groups.find((g) => g.id === id);
}

function renderGroupTabs() {
  const tabs = [{ id: null, name: "All", icon: "👥", color: "#64748b" }, ...roster.groups];
  els.groupTabs.innerHTML = "";
  for (const tab of tabs) {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "group-tab" + (selectedGroup === tab.id ? " active" : "");
    btn.style.setProperty("--tab-color", tab.color);
    btn.textContent = tab.icon ? `${tab.icon} ${tab.name}` : tab.name;
    btn.addEventListener("click", () => {
      selectedGroup = tab.id;
      renderGroupTabs();
      renderParticipantList();
    });
    els.groupTabs.appendChild(btn);
  }
}

function renderParticipantList() {
  const term = searchTerm.trim().toLowerCase();
  const filtered = roster.participants.filter((p) => {
    const matchesGroup = selectedGroup === null || p.group === selectedGroup;
    const matchesSearch = !term || p.name.toLowerCase().includes(term);
    return matchesGroup && matchesSearch;
  });

  els.participantList.innerHTML = "";
  if (filtered.length === 0) {
    const li = document.createElement("li");
    li.className = "participant-empty";
    li.textContent = "No participants match.";
    els.participantList.appendChild(li);
    return;
  }

  for (const p of filtered) {
    const group = groupById(p.group);
    const li = document.createElement("li");
    li.className = "participant-item";
    const nameSpan = document.createElement("span");
    nameSpan.className = "participant-name";
    nameSpan.textContent = p.name;
    const metaSpan = document.createElement("span");
    metaSpan.className = "participant-meta";
    metaSpan.textContent = group ? group.name : "";
    li.appendChild(nameSpan);
    li.appendChild(metaSpan);
    li.addEventListener("click", () => selectParticipant(p));
    els.participantList.appendChild(li);
  }
}

function selectParticipant(p) {
  selectedParticipant = p;
  const group = groupById(p.group);
  els.confirmName.textContent = p.name;
  els.confirmKv.textContent = p.kv;
  els.confirmRegion.textContent = p.region;
  els.confirmGroup.textContent = group ? group.name : "";
  els.joinError.textContent = "";
  showView("view-confirm");
}

els.searchInput.addEventListener("input", (e) => {
  searchTerm = e.target.value;
  renderParticipantList();
});

els.roomCodeInput.addEventListener("input", (e) => {
  e.target.value = e.target.value.replace(/\D/g, "").slice(0, 6);
});

els.backBtn.addEventListener("click", () => {
  selectedParticipant = null;
  showView("view-join");
});

const ERROR_MESSAGES = {
  notFound: "Room code not found. Check with your host.",
  alreadyJoined: "This name is already joined from another device.",
  hostGroupExcluded: "This group is hosting the event and isn't part of the quiz.",
  quizFinished: "This quiz has ended."
};

els.sessionStateRefreshBtn.addEventListener("click", () => location.reload());

els.joinBtn.addEventListener("click", () => {
  if (!selectedParticipant) return;
  const roomCode = els.roomCodeInput.value.trim();
  if (!/^\d{6}$/.test(roomCode)) {
    els.joinError.textContent = "Enter the 6-digit room code first.";
    return;
  }

  els.joinBtn.disabled = true;
  socket.emit("student:joinRoom", { roomCode, participantId: selectedParticipant.id }, (res) => {
    els.joinBtn.disabled = false;
    if (!res || !res.ok) {
      els.joinError.textContent = (res && ERROR_MESSAGES[res.error]) || "Could not join. Try again.";
      return;
    }
    joinedRoomCode = roomCode;
    const group = groupById(selectedParticipant.group);
    els.waitingName.textContent = selectedParticipant.name;
    els.waitingGroup.textContent = group ? group.name : "";
    showView("view-waiting");
  });
});

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
      const group = groupById(selectedParticipant.group);
      els.submittedGroupName.textContent = group ? group.name : "–";
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
    const group = groupById(selectedParticipant.group);
    els.submittedScore.textContent = myScore;
    els.submittedRank.textContent = myCurrentRank ? `#${myCurrentRank}` : "–";
    els.submittedGroupName.textContent = group ? group.name : "–";
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
});

function renderAchievements(hallOfFame) {
  const badges = [];

  if (lastAnswerResult && lastAnswerResult.correct && lastAnswerResult.pointsAwarded >= 900) {
    badges.push({ icon: "⚡", label: "Speed Demon" });
  }
  if (myStreak >= 3) {
    badges.push({ icon: "🔥", label: "On Fire" });
  }
  if (hallOfFame && hallOfFame.highestAccuracy && hallOfFame.highestAccuracy.name === selectedParticipant.name) {
    badges.push({ icon: "🎯", label: "Accuracy Master" });
  }
  if (myCurrentRank && myCurrentRank <= 3) {
    badges.push({ icon: "⭐", label: "Knowledge Star" });
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
    (p) => p.participantId === selectedParticipant.id
  );
  const myEntry = myRankIndex >= 0 ? data.finalIndividualRankings[myRankIndex] : null;
  const myGroupRankIndex = data.finalGroupRankings.findIndex((g) => g.id === selectedParticipant.group);

  els.finalMyRank.textContent = myRankIndex >= 0 ? `#${myRankIndex + 1}` : "–";
  els.finalMyScore.textContent = myEntry ? myEntry.score : myScore;
  els.finalMyGroupRank.textContent = myGroupRankIndex >= 0 ? `#${myGroupRankIndex + 1}` : "–";

  const isChampIndividual =
    data.championIndividual && data.championIndividual.participantId === selectedParticipant.id;
  const isChampGroup = data.championGroup && data.championGroup.id === selectedParticipant.group;

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

  const finalBadges = [];
  if (myLongestStreak >= 3) finalBadges.push({ icon: "🔥", label: "On Fire" });
  if (data.hallOfFame.highestAccuracy && data.hallOfFame.highestAccuracy.name === selectedParticipant.name) {
    finalBadges.push({ icon: "🎯", label: "Accuracy Master" });
  }
  if (data.hallOfFame.fastestThinker && data.hallOfFame.fastestThinker.name === selectedParticipant.name) {
    finalBadges.push({ icon: "⚡", label: "Speed Demon" });
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

function renderSessionBranding(session) {
  const enabled = Boolean(session && session.enabled);
  document
    .querySelectorAll(".session-block, .session-subtitle")
    .forEach((el) => (el.style.display = enabled ? "" : "none"));
  if (!enabled) return;
  document.querySelectorAll("[data-session-type]").forEach((el) => (el.textContent = session.type));
  document
    .querySelectorAll("[data-session-presented-by]")
    .forEach((el) => (el.textContent = session.presentedBy));
}

function renderParticipantWelcome() {
  const e = roster.event;
  els.pwOrg.textContent = e.organization || "";
  els.pwInstitute.textContent = e.instituteEnglishFull || e.institute || "";
  els.pwTitle.textContent = e.tagline || e.workshopTitle || "";
  els.pwProgramme.textContent = e.programme || "";
}

els.pwContinueBtn.addEventListener("click", () => {
  showView("view-join");
});

async function init() {
  const params = new URLSearchParams(window.location.search);
  const codeParam = params.get("code");
  if (codeParam) {
    els.roomCodeInput.value = codeParam.replace(/\D/g, "").slice(0, 6);
  }

  try {
    const res = await fetch("/api/roster");
    roster = await res.json();
    renderParticipantWelcome();
    renderGroupTabs();
    renderParticipantList();
    renderSessionBranding(roster.event.session);

    if (roster.liveRoomStatus === null) {
      els.sessionStateHeading.textContent = "Please Wait";
      els.sessionStateBody.textContent = "The quiz has not started yet. Please wait for the teacher.";
      showView("view-session-state");
    } else if (roster.liveRoomStatus === "ended") {
      els.sessionStateHeading.textContent = "Quiz Ended";
      els.sessionStateBody.textContent = "This quiz has ended.";
      showView("view-session-state");
    }
  } catch (err) {
    console.error("Failed to load roster:", err);
  } finally {
    hideSplashScreen();
  }
}

init();
