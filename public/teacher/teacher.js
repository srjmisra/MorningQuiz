const socket = io();

const connectionDot = document.getElementById("connection-dot");
socket.on("connect", () => {
  connectionDot.classList.remove("is-offline");
  connectionDot.setAttribute("aria-label", "Connected");
});
socket.on("disconnect", () => {
  connectionDot.classList.add("is-offline");
  connectionDot.setAttribute("aria-label", "Disconnected — reconnecting");
});

// Teacher reset the whole session — safest, lowest-risk way to return every
// client to a clean starting state is a full reload (reuses the existing
// init() flow, which correctly shows Welcome when no room exists).
socket.on("session:reset", () => {
  location.reload();
});

const endQuizBtn = document.getElementById("end-quiz-btn");
const resetSessionBtn = document.getElementById("reset-session-btn");

endQuizBtn.addEventListener("click", () => {
  if (!confirm("End the quiz now and show final results?")) return;
  socket.emit("teacher:endQuiz", {}, () => {});
});

resetSessionBtn.addEventListener("click", () => {
  if (!confirm("Reset the entire session? This clears all scores and participants.")) return;
  // The server broadcasts session:reset back to this same socket (it's a
  // member of the room too), which the handler above already reloads on.
  socket.emit("teacher:resetSession", {}, () => {});
});

const els = {
  setupTitleInput: document.getElementById("setup-title-input"),
  setupSubtitleInput: document.getElementById("setup-subtitle-input"),
  setupOrganizerInput: document.getElementById("setup-organizer-input"),
  setupLogoInput: document.getElementById("setup-logo-input"),
  setupLogoPreviewWrap: document.getElementById("setup-logo-preview-wrap"),
  setupLogoPreview: document.getElementById("setup-logo-preview"),
  setupLogoRemoveBtn: document.getElementById("setup-logo-remove-btn"),
  setupBrandingError: document.getElementById("setup-branding-error"),
  setupBrandingContinueBtn: document.getElementById("setup-branding-continue-btn"),

  setupModeOptions: document.getElementById("setup-mode-options"),
  setupModeBackBtn: document.getElementById("setup-mode-back-btn"),
  setupModeContinueBtn: document.getElementById("setup-mode-continue-btn"),

  setupTeamsList: document.getElementById("setup-teams-list"),
  setupTeamsAddBtn: document.getElementById("setup-teams-add-btn"),
  setupTeamsError: document.getElementById("setup-teams-error"),
  setupTeamsBackBtn: document.getElementById("setup-teams-back-btn"),
  setupTeamsContinueBtn: document.getElementById("setup-teams-continue-btn"),

  quizDownloadTemplateBtn: document.getElementById("quiz-download-template-btn"),
  quizXlsxInput: document.getElementById("quiz-xlsx-input"),
  quizPasteTextarea: document.getElementById("quiz-paste-textarea"),
  quizPasteImportBtn: document.getElementById("quiz-paste-import-btn"),
  quizAdvancedToggleBtn: document.getElementById("quiz-advanced-toggle-btn"),
  quizAdvancedPanel: document.getElementById("quiz-advanced-panel"),
  quizCsvInput: document.getElementById("quiz-csv-input"),
  quizJsonTextarea: document.getElementById("quiz-json-textarea"),
  quizJsonLoadSampleBtn: document.getElementById("quiz-json-load-sample-btn"),
  quizJsonImportBtn: document.getElementById("quiz-json-import-btn"),
  quizImportResult: document.getElementById("quiz-import-result"),
  quizImportSummary: document.getElementById("quiz-import-summary"),
  quizImportErrors: document.getElementById("quiz-import-errors"),
  quizImportPreview: document.getElementById("quiz-import-preview"),
  setupQuizError: document.getElementById("setup-quiz-error"),
  setupQuizBackBtn: document.getElementById("setup-quiz-back-btn"),
  setupQuizContinueBtn: document.getElementById("setup-quiz-continue-btn"),

  reviewTitle: document.getElementById("review-title"),
  reviewSubtitle: document.getElementById("review-subtitle"),
  reviewOrganizer: document.getElementById("review-organizer"),
  reviewLogo: document.getElementById("review-logo"),
  reviewMode: document.getElementById("review-mode"),
  reviewTeams: document.getElementById("review-teams"),
  reviewQuestions: document.getElementById("review-questions"),
  setupReviewError: document.getElementById("setup-review-error"),
  setupReviewBackBtn: document.getElementById("setup-review-back-btn"),
  setupReviewCreateBtn: document.getElementById("setup-review-create-btn"),

  qrCodeHolder: document.getElementById("qr-code-holder"),
  roomCodeDisplay: document.getElementById("room-code-display"),
  joinUrlDisplay: document.getElementById("join-url-display"),
  joinedCount: document.getElementById("joined-count"),
  groupGrid: document.getElementById("group-grid"),
  toastContainer: document.getElementById("toast-container"),
  celebrationOverlay: document.getElementById("celebration-overlay"),
  startQuizBtn: document.getElementById("start-quiz-btn"),

  introQuestionNumber: document.getElementById("intro-question-number"),
  introCategory: document.getElementById("intro-category"),
  introCountdown: document.getElementById("intro-countdown"),

  questionProgress: document.getElementById("question-progress"),
  timerFillCircle: document.getElementById("timer-fill-circle"),
  timerValue: document.getElementById("timer-value"),
  questionText: document.getElementById("question-text"),
  questionImage: document.getElementById("question-image"),
  answerGrid: document.getElementById("answer-grid"),
  lockedOverlay: document.getElementById("locked-overlay"),
  revealBtn: document.getElementById("reveal-btn"),

  resultsCorrectAnswer: document.getElementById("results-correct-answer"),
  knowledgeCard: document.getElementById("knowledge-card"),
  knowledgeText: document.getElementById("knowledge-text"),
  analyticsPanel: document.getElementById("analytics-panel"),
  groupProgressReveal: document.getElementById("group-progress-reveal"),
  leaderboardsRow: document.getElementById("leaderboards-row"),
  individualLeaderboard: document.getElementById("individual-leaderboard"),
  groupLeaderboard: document.getElementById("group-leaderboard"),
  hofGrid: document.getElementById("hof-grid"),
  nextQuestionBtn: document.getElementById("next-question-btn"),

  finalLogo: document.getElementById("final-logo"),
  finalKicker: document.getElementById("final-kicker"),
  finalThanks: document.getElementById("final-thanks"),
  podiumRow: document.getElementById("podium-row"),
  championRow: document.getElementById("champion-row"),
  finalHofGrid: document.getElementById("final-hof-grid"),
  finalIndividualRankings: document.getElementById("final-individual-rankings"),
  finalGroupRankings: document.getElementById("final-group-rankings"),

  statsBar: document.getElementById("stats-bar"),
  statQuestion: document.getElementById("stat-question"),
  statAnswered: document.getElementById("stat-answered"),
  statPending: document.getElementById("stat-pending"),
  statAccuracy: document.getElementById("stat-accuracy"),
  statFastest: document.getElementById("stat-fastest"),
  statLeadingGroup: document.getElementById("stat-leading-group"),
  statLeadingIndividual: document.getElementById("stat-leading-individual")
};

let latestLobby = null;
let currentQuestion = null;
let countdownIntervalId = null;
let totalQuestionsCount = null;

function showView(id) {
  document.querySelectorAll(".view").forEach((v) => v.classList.remove("view-active"));
  document.getElementById(id).classList.add("view-active");
}

// setupState.teams is this room's actual team list (submitted at creation,
// or restored on reconnect) — the only source of team identity now that
// there's no static roster to look groups up from.
function teamById(id) {
  return setupState.teams.find((t) => t.id === id);
}

function renderQr(joinUrl) {
  const qr = qrcode(0, "M");
  qr.addData(joinUrl);
  qr.make();
  els.qrCodeHolder.innerHTML = qr.createSvgTag({ scalable: true });
}

function renderGroupCards(groupsData) {
  // No fixed roster size to track progress toward anymore — each card just
  // shows how many students have actually joined that team so far.
  els.groupGrid.innerHTML = "";
  groupsData.forEach((g, i) => {
    const card = document.createElement("div");
    card.className = "group-card";
    card.style.setProperty("--group-color", g.color);
    card.innerHTML = `
      <div class="group-card-header">
        ${groupEmblem(g, { size: 34, delay: i * 0.05 })}
        <span class="group-name">${g.name}</span>
      </div>
      <div class="group-card-footer">${g.joined} Joined</div>
    `;
    els.groupGrid.appendChild(card);
  });
}

function showToast(message, kind) {
  const toast = document.createElement("div");
  toast.className = "toast";
  const iconName = kind === "ready" ? "check" : "user_check";
  if (kind === "ready") toast.style.borderLeftColor = "var(--accent-amber)";
  toast.innerHTML = `${icon(iconName, { size: 16, className: "icon toast-icon" })}<span>${message}</span>`;
  els.toastContainer.appendChild(toast);
  setTimeout(() => {
    toast.classList.add("toast-leaving");
    setTimeout(() => toast.remove(), 300);
  }, 3200);
}

function enterLobby(code) {
  const joinUrl = `${window.location.origin}/student/?code=${code}`;
  els.roomCodeDisplay.textContent = code;
  els.joinUrlDisplay.textContent = joinUrl;
  renderQr(joinUrl);
  applyBrandChip(setupState.event);
  updatePageTitle(setupState.event, "Teacher");
  showView("view-lobby");
}

// ---------- Event setup wizard ----------
// Four steps (branding -> mode -> teams [team/hybrid only] -> review) collect
// everything teacher:createRoom needs. The quiz questions themselves are
// untouched here — the server still serves the existing static quiz set;
// this wizard only replaces how the room's event/branding/team data is
// gathered, not what questions are asked.

const TEAM_COLOR_PALETTE = ["#2563EB", "#F59E0B", "#10B981", "#EF4444", "#8B5CF6", "#06B6D4", "#EC4899", "#84CC16"];
const MAX_LOGO_BYTES = 200 * 1024;
const ALLOWED_LOGO_TYPES = new Set(["image/png", "image/jpeg", "image/webp", "image/gif"]);
const MODE_LABELS = { individual: "Individual", team: "Team", hybrid: "Hybrid" };

let setupState = {
  event: { title: "", subtitle: "", organizer: "", logoDataUri: null },
  groupMode: "individual",
  teams: [],
  quiz: null
};
let teamIdCounter = 0;

function nextTeamId() {
  teamIdCounter += 1;
  return `team-${teamIdCounter}`;
}

function makeDefaultTeams() {
  return [
    { id: nextTeamId(), name: "Team A", color: TEAM_COLOR_PALETTE[0] },
    { id: nextTeamId(), name: "Team B", color: TEAM_COLOR_PALETTE[1] }
  ];
}

// --- Step 1: Branding ---

els.setupLogoInput.addEventListener("change", () => {
  const file = els.setupLogoInput.files && els.setupLogoInput.files[0];
  els.setupBrandingError.textContent = "";
  if (!file) return;

  if (!ALLOWED_LOGO_TYPES.has(file.type)) {
    els.setupBrandingError.textContent = "Logo must be a PNG, JPEG, WEBP or GIF image.";
    els.setupLogoInput.value = "";
    return;
  }
  if (file.size > MAX_LOGO_BYTES) {
    els.setupBrandingError.textContent = "Logo must be smaller than 200 KB.";
    els.setupLogoInput.value = "";
    return;
  }

  const reader = new FileReader();
  reader.onload = () => {
    setupState.event.logoDataUri = reader.result;
    els.setupLogoPreview.src = reader.result;
    els.setupLogoPreviewWrap.hidden = false;
  };
  reader.readAsDataURL(file);
});

els.setupLogoRemoveBtn.addEventListener("click", () => {
  setupState.event.logoDataUri = null;
  els.setupLogoInput.value = "";
  els.setupLogoPreviewWrap.hidden = true;
});

els.setupBrandingContinueBtn.addEventListener("click", () => {
  const title = els.setupTitleInput.value.trim();
  const organizer = els.setupOrganizerInput.value.trim();

  if (!title) {
    els.setupBrandingError.textContent = "Event title is required.";
    return;
  }
  if (!organizer) {
    els.setupBrandingError.textContent = "Organizer name is required.";
    return;
  }

  setupState.event.title = title;
  setupState.event.subtitle = els.setupSubtitleInput.value.trim();
  setupState.event.organizer = organizer;
  els.setupBrandingError.textContent = "";
  showView("view-setup-mode");
});

// --- Step 2: Mode ---

function selectMode(mode) {
  setupState.groupMode = mode;
  [...els.setupModeOptions.children].forEach((btn) => {
    btn.classList.toggle("is-selected", btn.dataset.mode === mode);
  });
}
selectMode(setupState.groupMode);

els.setupModeOptions.addEventListener("click", (e) => {
  const btn = e.target.closest(".mode-option");
  if (!btn) return;
  selectMode(btn.dataset.mode);
});

els.setupModeBackBtn.addEventListener("click", () => showView("view-setup-branding"));

els.setupModeContinueBtn.addEventListener("click", () => {
  if (setupState.groupMode === "individual") {
    setupState.teams = [];
    showView("view-setup-quiz");
    return;
  }
  if (setupState.teams.length === 0) {
    setupState.teams = makeDefaultTeams();
  }
  renderTeamsList();
  showView("view-setup-teams");
});

// --- Step 3: Teams (Team / Hybrid modes only) ---

function renderTeamsList() {
  els.setupTeamsList.innerHTML = "";
  setupState.teams.forEach((team) => {
    const row = document.createElement("div");
    row.className = "team-row";
    row.dataset.teamId = team.id;

    const dot = document.createElement("span");
    dot.className = "team-color-dot";
    dot.style.background = team.color;

    const input = document.createElement("input");
    input.type = "text";
    input.className = "team-name-input";
    input.maxLength = 40;
    input.value = team.name;
    input.addEventListener("input", () => {
      team.name = input.value;
    });

    const removeBtn = document.createElement("button");
    removeBtn.type = "button";
    removeBtn.className = "team-remove-btn btn-text";
    removeBtn.setAttribute("aria-label", `Remove ${team.name || "team"}`);
    removeBtn.textContent = "✕";
    removeBtn.disabled = setupState.teams.length <= 2;
    removeBtn.addEventListener("click", () => {
      setupState.teams = setupState.teams.filter((t) => t.id !== team.id);
      renderTeamsList();
    });

    row.appendChild(dot);
    row.appendChild(input);
    row.appendChild(removeBtn);
    els.setupTeamsList.appendChild(row);
  });
}

els.setupTeamsAddBtn.addEventListener("click", () => {
  setupState.teams.push({
    id: nextTeamId(),
    name: `Team ${setupState.teams.length + 1}`,
    color: TEAM_COLOR_PALETTE[setupState.teams.length % TEAM_COLOR_PALETTE.length]
  });
  renderTeamsList();
});

els.setupTeamsBackBtn.addEventListener("click", () => showView("view-setup-mode"));

els.setupTeamsContinueBtn.addEventListener("click", () => {
  const names = setupState.teams.map((t) => t.name.trim());
  if (names.some((n) => !n)) {
    els.setupTeamsError.textContent = "Every team needs a name.";
    return;
  }
  const lower = names.map((n) => n.toLowerCase());
  if (new Set(lower).size !== lower.length) {
    els.setupTeamsError.textContent = "Team names must be unique.";
    return;
  }
  setupState.teams.forEach((t, i) => (t.name = names[i]));
  els.setupTeamsError.textContent = "";
  showView("view-setup-quiz");
});

// --- Step 4: Questions ---
// Four import methods, all funneling through the QuizImport registry
// (public/shared/quizImport.js) into the same canonical {ok, questions,
// errors} shape — renderImportResult() below is the one shared preview/
// error UI every method uses, regardless of which format the teacher chose.

let lastImportResult = null;

function renderImportResult(result) {
  lastImportResult = result;
  els.quizImportResult.hidden = false;

  const count = result.questions.length;
  const errCount = result.errors.length;
  els.quizImportSummary.textContent =
    `${count} question${count === 1 ? "" : "s"} found` + (errCount ? `, ${errCount} error${errCount === 1 ? "" : "s"}` : "");

  els.quizImportErrors.innerHTML = "";
  result.errors.forEach((e) => {
    const li = document.createElement("li");
    li.textContent = e.row != null ? `Row ${e.row}: ${e.message}` : e.message;
    els.quizImportErrors.appendChild(li);
  });

  els.quizImportPreview.innerHTML = "";
  result.questions.slice(0, 25).forEach((q) => {
    const li = document.createElement("li");
    li.textContent = q.question || "(blank question text)";
    els.quizImportPreview.appendChild(li);
  });

  els.setupQuizContinueBtn.disabled = !result.ok;
  els.setupQuizError.textContent = result.ok
    ? ""
    : count > 0
      ? "Fix the errors above, then re-import, before continuing."
      : "";

  if (result.ok) {
    setupState.quiz = { title: setupState.event.title || "Quiz", questions: result.questions };
  }
}

// Primary method 1: Excel upload
els.quizDownloadTemplateBtn.addEventListener("click", () => {
  QuizImport.downloadTemplate();
});

els.quizXlsxInput.addEventListener("change", async () => {
  const file = els.quizXlsxInput.files && els.quizXlsxInput.files[0];
  if (!file) return;
  const buffer = await file.arrayBuffer();
  renderImportResult(QuizImport.importers.xlsx(buffer));
});

// Primary method 2: paste from Word/Docs
els.quizPasteImportBtn.addEventListener("click", () => {
  renderImportResult(QuizImport.importers.pasted(els.quizPasteTextarea.value));
});

// Advanced (secondary): CSV / JSON
els.quizAdvancedToggleBtn.addEventListener("click", () => {
  const opening = els.quizAdvancedPanel.hidden;
  els.quizAdvancedPanel.hidden = !opening;
  els.quizAdvancedToggleBtn.textContent = opening ? "Hide advanced options" : "Advanced: CSV or JSON";
});

els.quizCsvInput.addEventListener("change", async () => {
  const file = els.quizCsvInput.files && els.quizCsvInput.files[0];
  if (!file) return;
  const text = await file.text();
  renderImportResult(QuizImport.importers.csv(text));
});

els.quizJsonLoadSampleBtn.addEventListener("click", async () => {
  els.setupQuizError.textContent = "";
  try {
    const res = await fetch("/api/sample-quiz");
    const sample = await res.json();
    els.quizJsonTextarea.value = JSON.stringify(sample, null, 2);
  } catch (err) {
    els.setupQuizError.textContent = "Could not load the sample quiz.";
  }
});

els.quizJsonImportBtn.addEventListener("click", () => {
  renderImportResult(QuizImport.importers.json(els.quizJsonTextarea.value));
});

els.setupQuizBackBtn.addEventListener("click", () => {
  showView(setupState.groupMode === "individual" ? "view-setup-mode" : "view-setup-teams");
});

els.setupQuizContinueBtn.addEventListener("click", () => {
  if (!setupState.quiz || !Array.isArray(setupState.quiz.questions) || setupState.quiz.questions.length === 0) {
    els.setupQuizError.textContent = "Import at least one valid question first.";
    return;
  }
  els.setupQuizError.textContent = "";
  renderReview();
  showView("view-setup-review");
});

// --- Step 5: Review ---

function renderReview() {
  const e = setupState.event;
  els.reviewTitle.textContent = e.title;
  els.reviewSubtitle.textContent = e.subtitle || "—";
  els.reviewOrganizer.textContent = e.organizer;
  els.reviewMode.textContent = MODE_LABELS[setupState.groupMode];

  els.reviewLogo.innerHTML = "";
  if (e.logoDataUri) {
    const img = document.createElement("img");
    img.src = e.logoDataUri;
    img.className = "review-logo-thumb";
    img.alt = "Event logo";
    els.reviewLogo.appendChild(img);
  } else {
    els.reviewLogo.textContent = "None";
  }

  els.reviewTeams.innerHTML = "";
  if (setupState.teams.length === 0) {
    els.reviewTeams.textContent = "—";
  } else {
    setupState.teams.forEach((t) => {
      const chip = document.createElement("span");
      chip.className = "review-team-chip";
      chip.style.setProperty("--team-color", t.color);
      chip.textContent = t.name;
      els.reviewTeams.appendChild(chip);
    });
  }

  els.reviewQuestions.textContent =
    setupState.quiz && Array.isArray(setupState.quiz.questions)
      ? `${setupState.quiz.questions.length} question${setupState.quiz.questions.length === 1 ? "" : "s"}`
      : "None";

  els.setupReviewError.textContent = "";
}

els.setupReviewBackBtn.addEventListener("click", () => {
  showView("view-setup-quiz");
});

els.setupReviewCreateBtn.addEventListener("click", () => {
  els.setupReviewCreateBtn.disabled = true;
  els.setupReviewError.textContent = "";

  socket.emit(
    "teacher:createRoom",
    {
      event: setupState.event,
      groupMode: setupState.groupMode,
      teams: setupState.teams,
      quiz: setupState.quiz
    },
    (res) => {
      els.setupReviewCreateBtn.disabled = false;
      if (!res || !res.ok) {
        if (res && res.error === "roomLimitReached") {
          els.setupReviewError.textContent = "A quiz is already running on this server. Reset it before creating a new one.";
        } else if (res && res.details) {
          els.setupReviewError.textContent = res.details.join(" ");
        } else {
          els.setupReviewError.textContent = "Could not create the room. Try again.";
        }
        return;
      }
      enterLobby(res.code);
    }
  );
});

function handleLobbyUpdate(data) {
  latestLobby = data;
  els.joinedCount.textContent = data.totalJoined;
  renderGroupCards(data.groups);
  els.startQuizBtn.disabled = data.totalJoined < 1;
}
socket.on("room:lobbyUpdate", handleLobbyUpdate);

socket.on("room:participantJoined", (data) => {
  const team = teamById(data.group);
  showToast(`${data.name} joined${team ? ` ${team.name}` : ""}`);
});

els.startQuizBtn.addEventListener("click", () => {
  socket.emit("teacher:startQuiz", {}, () => {});
});

els.revealBtn.addEventListener("click", () => {
  els.revealBtn.disabled = true;
  socket.emit("teacher:revealAnswer", {}, () => {});
});

els.nextQuestionBtn.addEventListener("click", () => {
  els.nextQuestionBtn.disabled = true;
  socket.emit("teacher:nextQuestion", {}, () => {});
});

function updateStatsBar(stats) {
  if (!stats) return;
  els.statsBar.classList.add("visible");
  els.statQuestion.textContent = totalQuestionsCount
    ? `${stats.questionIndex + 1} / ${totalQuestionsCount}`
    : `${stats.questionIndex + 1}`;
  els.statAnswered.textContent = stats.answeredCount;
  els.statPending.textContent = stats.pendingCount;
  els.statAccuracy.textContent = `${stats.avgAccuracy}%`;
  els.statFastest.textContent = stats.fastestResponse
    ? `${stats.fastestResponse.name.split(" ")[0]} (${(stats.fastestResponse.ms / 1000).toFixed(1)}s)`
    : "–";
  els.statLeadingGroup.innerHTML = stats.leadingGroup
    ? groupEmblem(stats.leadingGroup, { size: 16 }) + ` ${stats.leadingGroup.name}`
    : "–";
  els.statLeadingIndividual.textContent = stats.leadingIndividual
    ? stats.leadingIndividual.name
    : "–";
}

const ANSWER_LETTERS = ["A", "B", "C", "D"];

function renderAnswerCards(options, interactive) {
  els.answerGrid.innerHTML = "";
  options.forEach((text, i) => {
    const card = document.createElement("button");
    card.type = "button";
    card.className = "answer-card";
    card.style.setProperty("--answer-color", `var(--answer-color-${i})`);
    card.style.setProperty("--answer-color-dark", `var(--answer-color-${i}-dark)`);
    card.style.animationDelay = `${i * 0.06}s`;
    card.disabled = !interactive;
    card.dataset.optionText = text;

    const letter = document.createElement("span");
    letter.className = "card-letter";
    letter.textContent = ANSWER_LETTERS[i];
    const label = document.createElement("span");
    label.textContent = text;

    card.appendChild(letter);
    card.appendChild(label);
    els.answerGrid.appendChild(card);
  });
}

function handleQuestionIntro(data) {
  currentQuestion = { questionIndex: data.questionIndex, totalQuestions: data.totalQuestions };
  totalQuestionsCount = data.totalQuestions;
  els.introQuestionNumber.textContent = `Question ${data.questionIndex + 1} of ${data.totalQuestions}`;
  els.introCategory.textContent = data.category;
  endQuizBtn.hidden = false;
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
}
socket.on("game:questionIntro", handleQuestionIntro);

function handleQuestionStart(data, overrideSeconds) {
  currentQuestion = data;
  els.questionProgress.textContent = `Question ${data.questionIndex + 1} of ${data.totalQuestions}`;
  els.questionText.textContent = data.question;
  if (data.image) {
    els.questionImage.src = data.image;
    els.questionImage.hidden = false;
  } else {
    els.questionImage.hidden = true;
  }
  renderAnswerCards(data.options, false);
  els.lockedOverlay.classList.remove("visible");
  els.revealBtn.disabled = false;
  els.revealBtn.hidden = false;
  showView("view-question");
  // "center" (not "start") so the fixed corner controls at the very top of
  // the screen don't overlap the question, and the answer grid below still
  // has room to show — "start" was pinning the question flush to the top edge.
  els.questionText.scrollIntoView({ behavior: "smooth", block: "center" });

  if (countdownIntervalId) clearInterval(countdownIntervalId);
  const seconds = typeof overrideSeconds === "number" ? overrideSeconds : data.timeLimitSeconds;
  if (seconds > 0) {
    countdownIntervalId = startCountdownRing(els.timerFillCircle, els.timerValue, seconds);
  } else {
    els.timerValue.textContent = "0";
  }
}
socket.on("game:questionStart", (data) => handleQuestionStart(data));

socket.on("game:answerCount", (stats) => {
  updateStatsBar(stats);
});

socket.on("game:answersLocked", () => {
  els.lockedOverlay.classList.add("visible");
  els.revealBtn.hidden = true;
  if (countdownIntervalId) {
    clearInterval(countdownIntervalId);
    countdownIntervalId = null;
  }
});

function handleQuestionEnd(data, opts) {
  const immediate = Boolean(opts && opts.immediate);
  updateStatsBar(data.liveStats);

  const cards = [...els.answerGrid.children];
  cards.forEach((card, i) => {
    if (i === data.correctIndex) {
      card.classList.add("is-correct");
    } else {
      card.classList.add("is-dim");
    }
  });

  const showResults = () => {
    els.lockedOverlay.classList.remove("visible");
    els.resultsCorrectAnswer.textContent = cards[data.correctIndex]
      ? cards[data.correctIndex].dataset.optionText
      : "";
    els.knowledgeText.textContent = data.explanation || "";
    els.knowledgeCard.classList.remove("visible");
    els.analyticsPanel.classList.remove("visible");
    els.groupProgressReveal.classList.remove("visible");
    els.leaderboardsRow.classList.remove("visible");
    els.hofGrid.classList.remove("visible");

    renderQuestionAnalytics(data.questionAnalytics);
    renderGroupProgress(data.groupProgress);
    renderLeaderboards(data.individualTop5, data.groupLeaderboard);
    renderHallOfFame(data.liveStats.hallOfFame);

    els.nextQuestionBtn.disabled = false;
    els.nextQuestionBtn.textContent =
      currentQuestion && currentQuestion.questionIndex + 1 >= currentQuestion.totalQuestions
        ? "Finish Event"
        : "Next Question";
    showView("view-results");
    els.resultsCorrectAnswer.scrollIntoView({ behavior: "smooth", block: "start" });

    const revealDelay = immediate ? 0 : null;
    setTimeout(() => els.knowledgeCard.classList.add("visible"), revealDelay ?? 100);
    setTimeout(() => els.analyticsPanel.classList.add("visible"), revealDelay ?? 500);
    setTimeout(() => els.groupProgressReveal.classList.add("visible"), revealDelay ?? 1000);
    setTimeout(() => {
      els.leaderboardsRow.classList.add("visible");
      els.leaderboardsRow.scrollIntoView({ behavior: "smooth", block: "start" });
    }, revealDelay ?? 1600);
    setTimeout(() => els.hofGrid.classList.add("visible"), revealDelay ?? 2200);
  };

  if (immediate) {
    showResults();
  } else {
    setTimeout(showResults, 1600);
  }
}
socket.on("game:questionEnd", (data) => handleQuestionEnd(data));

function renderQuestionAnalytics(qa) {
  els.analyticsPanel.innerHTML = "";
  if (!qa) return;

  const tiles = [
    { label: "Correct", value: qa.correctResponses, cls: "at-correct" },
    { label: "Incorrect", value: qa.incorrectResponses, cls: "at-incorrect" },
    { label: "Accuracy", value: qa.accuracyPct, cls: "", suffix: "%" },
    { label: "Avg Response Time", value: Math.round(qa.avgResponseMs / 100) / 10, cls: "", suffix: "s", raw: true },
    { label: "Most Missed Answer", value: qa.mostSelectedWrongAnswer || "—", cls: "", text: true }
  ];

  for (const t of tiles) {
    const tile = document.createElement("div");
    tile.className = `analytics-tile ${t.cls}`;
    const valueSpan = document.createElement("span");
    valueSpan.className = "at-value";
    const labelSpan = document.createElement("span");
    labelSpan.className = "at-label";
    labelSpan.textContent = t.label;
    tile.appendChild(valueSpan);
    tile.appendChild(labelSpan);
    els.analyticsPanel.appendChild(tile);

    if (t.text) {
      valueSpan.style.fontSize = "16px";
      valueSpan.textContent = t.value;
    } else if (t.raw) {
      valueSpan.textContent = `${t.value}${t.suffix}`;
    } else {
      animateCounter(valueSpan, t.value, { suffix: t.suffix || "" });
    }
  }
}

const HOF_CARDS = [
  { key: "fastestThinker", icon: "zap", title: "Fastest Thinker", color: "#f59e0b", valueFn: (v) => `${(v.ms / 1000).toFixed(1)}s response` },
  { key: "longestStreak", icon: "flame", title: "Longest Streak", color: "#ef4444", valueFn: (v) => `${v.streak} in a row` },
  { key: "highestAccuracy", icon: "target", title: "Highest Accuracy", color: "#10b981", valueFn: (v) => `${v.pct}% accurate` },
  { key: "leadingGroup", icon: "trophy", title: "Best Performing Group", color: "#3b82f6", valueFn: (v) => `${v.avgPerformance} pts avg`, isGroup: true }
];

function renderHallOfFame(hallOfFame, container) {
  const target = container || els.hofGrid;
  target.innerHTML = "";
  if (!hallOfFame) return;

  HOF_CARDS.forEach((def, i) => {
    const entry = hallOfFame[def.key];
    const card = document.createElement("div");
    card.className = "hof-card";
    card.style.setProperty("--hof-color", def.color);
    card.style.animationDelay = `${i * 0.1}s`;
    const nameMarkup = entry && def.isGroup ? groupEmblem(entry, { size: 18 }) + ` ${entry.name}` : entry ? entry.name : "—";
    card.innerHTML = `
      ${icon(def.icon, { size: 26, className: "icon hof-icon" })}
      <p class="hof-title">${def.title}</p>
      <p class="hof-name">${nameMarkup}</p>
      <p class="hof-value">${entry ? def.valueFn(entry) : "No data yet"}</p>
    `;
    target.appendChild(card);
  });
}

function renderGroupProgress(groupProgress) {
  els.groupProgressReveal.innerHTML = "";
  groupProgress.forEach((g, i) => {
    const card = document.createElement("div");
    card.className = "group-progress-card";
    card.style.setProperty("--group-color", g.color);
    card.innerHTML = `
      <div class="gp-label">
        <span class="gp-name">${groupEmblem(g, { size: 20, delay: i * 0.04 })} ${g.name}</span>
        <span>${g.pct}%</span>
      </div>
      <div class="group-progress-track">
        <div class="group-progress-fill" style="width:${g.pct}%"></div>
      </div>
    `;
    els.groupProgressReveal.appendChild(card);
  });
}

// Rank is communicated by number + the existing gold/silver/bronze row
// tint (see .rank-1/.rank-2/.rank-3 in theme.css), not by medal emoji.
function renderLeaderboards(individualList, groupLeaderboard, individualEl, groupEl) {
  const individualTarget = individualEl || els.individualLeaderboard;
  const groupTarget = groupEl || els.groupLeaderboard;

  individualTarget.innerHTML = "";
  individualList.forEach((p, i) => {
    const li = document.createElement("li");
    li.className = `leaderboard-row${i < 3 ? ` rank-${i + 1}` : ""}`;
    li.style.animationDelay = `${Math.min(i, 12) * 0.05}s`;
    li.innerHTML = `<span class="lb-name-wrap"><span class="leaderboard-rank">${i + 1}</span>${p.name}</span><span class="lb-score">${p.score}</span>`;
    individualTarget.appendChild(li);
  });

  const maxAvg = Math.max(...groupLeaderboard.map((g) => g.avgPerformance), 1);
  groupTarget.innerHTML = "";
  groupLeaderboard.forEach((g, i) => {
    const barPct = Math.round((g.avgPerformance / maxAvg) * 100);
    const li = document.createElement("li");
    li.className = `group-leaderboard-row${i < 3 ? ` rank-${i + 1}` : ""}`;
    li.style.animationDelay = `${i * 0.08}s`;
    li.innerHTML = `
      <div class="glb-top">
        <span class="leaderboard-rank">${i + 1}</span>
        <span class="glb-name">${groupEmblem(g, { size: 22, delay: i * 0.06 })} ${g.name}</span>
        <span class="glb-score">${g.avgPerformance} pts</span>
      </div>
      <div class="group-progress-track">
        <div class="group-progress-fill" style="width:${barPct}%; background:${g.color}"></div>
      </div>
      <div class="glb-sub">Participants ${g.membersParticipated} / ${g.membersJoined}</div>
    `;
    groupTarget.appendChild(li);
  });
}

// Rank is communicated by podium height + border glow (see .podium-1/2/3 in
// teacher.css), not medal emoji — the shield emblem itself is the badge.
function renderPodium(groupRankings) {
  els.podiumRow.innerHTML = "";
  groupRankings.slice(0, 3).forEach((g, i) => {
    const rank = i + 1;
    const block = document.createElement("div");
    block.className = `podium-block podium-${rank}`;
    block.innerHTML = `
      <span class="podium-rank">${rank}</span>
      ${groupEmblem(g, { size: 44, delay: 0.2 + i * 0.15 })}
      <p class="podium-name">${g.name}</p>
      <p class="podium-score">${g.avgPerformance} pts avg</p>
    `;
    els.podiumRow.appendChild(block);
  });
}

function renderChampions(championIndividual, championGroup) {
  els.championRow.innerHTML = "";
  const cards = [
    {
      iconName: "crown",
      title: "Champion Individual",
      name: championIndividual ? championIndividual.name : "—",
      sub: championIndividual ? `${championIndividual.score} pts · ${championIndividual.groupName}` : ""
    },
    {
      iconName: "trophy",
      title: "Champion Group",
      name: championGroup ? championGroup.name : "—",
      sub: championGroup ? `${championGroup.avgPerformance} pts average performance` : ""
    }
  ];
  cards.forEach((c) => {
    const card = document.createElement("div");
    card.className = "champion-card";
    card.innerHTML = `
      ${icon(c.iconName, { size: 32, className: "icon champion-icon" })}
      <p class="champion-title">${c.title}</p>
      <p class="champion-name">${c.name}</p>
      <p class="champion-sub">${c.sub}</p>
    `;
    els.championRow.appendChild(card);
  });
}

function handleFinalResults(data, opts) {
  const skipCelebration = Boolean(opts && opts.skipCelebration);
  els.statsBar.classList.remove("visible");
  endQuizBtn.hidden = true;

  const e = setupState.event;
  els.finalLogo.src = brandLogoSrc(e && e.logoDataUri);
  els.finalKicker.textContent = e && e.organizer ? `By ${e.organizer}` : "";
  els.finalThanks.textContent = `Thank you for participating${e && e.organizer ? ` — ${e.organizer}` : ""}!`;

  renderPodium(data.finalGroupRankings);
  renderChampions(data.championIndividual, data.championGroup);
  renderHallOfFame(data.hallOfFame, els.finalHofGrid);
  renderLeaderboards(
    data.finalIndividualRankings,
    data.finalGroupRankings,
    els.finalIndividualRankings,
    els.finalGroupRankings
  );

  showView("view-final");
  els.podiumRow.scrollIntoView({ behavior: "smooth", block: "start" });
  setTimeout(() => {
    els.finalIndividualRankings.scrollIntoView({ behavior: "smooth", block: "start" });
  }, 1500);
  if (!skipCelebration) {
    launchConfetti({ container: els.celebrationOverlay, count: 150 });
    launchFireworks({ container: els.celebrationOverlay, bursts: 6 });
  }
}
socket.on("game:finalResults", (data) => handleFinalResults(data));

// Fills every static <span class="icon" data-icon="name" data-icon-size="n">
// placeholder in the current HTML with its Lucide SVG — keeps icon markup
// declarative in HTML instead of hand-typed SVG paths.
function hydrateIcons() {
  document.querySelectorAll("[data-icon]").forEach((el) => {
    const size = Number(el.dataset.iconSize) || 18;
    el.innerHTML = icon(el.dataset.icon, { size });
  });
}

// If a room is already running on the server (this browser refreshed, or a
// second teacher window/tab was opened), reclaim it instead of defaulting to
// the Welcome screen — restarting "Create Room" would orphan every student.
function applyReconnectSnapshot(snapshot) {
  showToast("Reconnected to the live quiz", "ready");
  enterLobby(snapshot.code);
  endQuizBtn.hidden = !["intro", "question", "locked", "results"].includes(snapshot.status);

  switch (snapshot.status) {
    case "lobby":
      if (snapshot.lobbySnapshot) handleLobbyUpdate(snapshot.lobbySnapshot);
      break;
    case "intro":
      if (snapshot.lastIntroPayload) handleQuestionIntro(snapshot.lastIntroPayload);
      break;
    case "question":
    case "locked":
      if (snapshot.lastQuestionStartPayload) {
        handleQuestionStart(snapshot.lastQuestionStartPayload, snapshot.remainingSeconds);
      }
      if (snapshot.status === "locked") {
        els.lockedOverlay.classList.add("visible");
        els.revealBtn.hidden = true;
      }
      break;
    case "results":
      if (snapshot.lastQuestionStartPayload) {
        handleQuestionStart(snapshot.lastQuestionStartPayload, 0);
      }
      if (snapshot.lastQuestionEndPayload) {
        handleQuestionEnd(snapshot.lastQuestionEndPayload, { immediate: true });
      }
      break;
    case "ended":
      if (snapshot.lastFinalResultsPayload) {
        handleFinalResults(snapshot.lastFinalResultsPayload, { skipCelebration: true });
      }
      break;
    default:
      break;
  }
}

async function init() {
  hydrateIcons();
  // Generic branding until (if ever) a reconnect restores an actual room's
  // event — the setup wizard itself is what populates it for a fresh room.
  applyBrandChip(null);
  updatePageTitle(null, "Teacher");

  try {
    const reconnectRes = await new Promise((resolve) => {
      socket.emit("teacher:reconnect", {}, resolve);
    });
    if (reconnectRes && reconnectRes.exists) {
      // Keep the wizard's in-memory state consistent with the room actually
      // reclaimed (a refreshed teacher never sees the wizard, but if they
      // did navigate back into it, it would reflect the real room's setup).
      if (reconnectRes.event) setupState.event = reconnectRes.event;
      if (reconnectRes.groupMode) setupState.groupMode = reconnectRes.groupMode;
      if (reconnectRes.teams) setupState.teams = reconnectRes.teams;
      if (reconnectRes.quiz) setupState.quiz = reconnectRes.quiz;
      applyBrandChip(setupState.event);
      updatePageTitle(setupState.event, "Teacher");
      applyReconnectSnapshot(reconnectRes);
    }
  } catch (err) {
    console.error("Failed to reconnect:", err);
  } finally {
    hideSplashScreen();
  }
}

init();
