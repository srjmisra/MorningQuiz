// Server-side check on the teacher:createRoom setup payload — the setup
// wizard already validates client-side for fast feedback, but this is the
// actual boundary the app trusts. Two concerns (event/mode/teams branding,
// and quiz question content) live in one module because they're validated
// together at the same single entry point, but are kept as separate
// internal functions since they check unrelated things.

const VALID_GROUP_MODES = new Set(["individual", "team", "hybrid"]);
// ~200KB raw image + base64 inflation (~4/3x) + headroom for the data: URI prefix.
const MAX_LOGO_DATA_URI_LENGTH = 290 * 1024;
const DEFAULT_TIME_LIMIT_SECONDS = 20;
const TIME_PER_QUESTION_OPTIONS = new Set([10, 15, 20, 30, 45, 60]);

function validateEventFields(payload, errors) {
  const event = (payload && payload.event) || {};
  const groupMode = payload && payload.groupMode;
  const rawTeams = Array.isArray(payload && payload.teams) ? payload.teams : [];

  const title = typeof event.title === "string" ? event.title.trim() : "";
  const organizer = typeof event.organizer === "string" ? event.organizer.trim() : "";
  const subtitle = typeof event.subtitle === "string" ? event.subtitle.trim() : "";
  const logoDataUri = typeof event.logoDataUri === "string" ? event.logoDataUri : null;

  if (!title) errors.push("Event title is required.");
  if (!organizer) errors.push("Organizer name is required.");
  if (logoDataUri && (!logoDataUri.startsWith("data:image/") || logoDataUri.length > MAX_LOGO_DATA_URI_LENGTH)) {
    errors.push("Logo must be a valid image under ~200KB.");
  }
  if (!VALID_GROUP_MODES.has(groupMode)) {
    errors.push("Invalid quiz mode.");
  }

  let teams = [];
  if (groupMode === "team" || groupMode === "hybrid") {
    if (rawTeams.length < 2) {
      errors.push("Team and Hybrid modes need at least two teams.");
    } else {
      const seenNames = new Set();
      teams = rawTeams.map((t, i) => {
        const name = typeof (t && t.name) === "string" ? t.name.trim() : "";
        if (!name) errors.push(`Team ${i + 1} needs a name.`);
        const key = name.toLowerCase();
        if (key && seenNames.has(key)) errors.push(`Team name "${name}" is used more than once.`);
        seenNames.add(key);
        return {
          id: (t && t.id) || `team-${i + 1}`,
          name,
          color: typeof (t && t.color) === "string" ? t.color : "#2563EB"
        };
      });
    }
  }

  return {
    event: { title, subtitle, organizer, logoDataUri },
    groupMode,
    teams
  };
}

// Validates the canonical quiz schema regardless of which importer produced
// it (raw JSON paste today; CSV/Excel/paste-from-Word parsers land in a
// later phase, all converging on this same {title, questions} shape before
// it ever reaches this function).
function validateQuizFields(payload, errors) {
  const rawQuiz = payload && payload.quiz;
  const title = typeof (rawQuiz && rawQuiz.title) === "string" ? rawQuiz.title.trim() : "";
  const rawQuestions = Array.isArray(rawQuiz && rawQuiz.questions) ? rawQuiz.questions : [];

  if (rawQuestions.length === 0) {
    errors.push("At least one question is required.");
    return { title: title || "Quiz", questions: [] };
  }

  const questions = rawQuestions.map((q, i) => {
    const n = i + 1;
    const question = typeof (q && q.question) === "string" ? q.question.trim() : "";
    const options = Array.isArray(q && q.options)
      ? q.options.map((o) => (typeof o === "string" ? o.trim() : ""))
      : [];
    const correctIndex = Number.isInteger(q && q.correctIndex) ? q.correctIndex : -1;
    const category = typeof (q && q.category) === "string" ? q.category.trim() : "";
    const explanation = typeof (q && q.explanation) === "string" ? q.explanation.trim() : "";
    const timeLimitSeconds =
      Number.isFinite(q && q.timeLimitSeconds) && q.timeLimitSeconds > 0
        ? q.timeLimitSeconds
        : DEFAULT_TIME_LIMIT_SECONDS;
    const image = typeof (q && q.image) === "string" && q.image.trim() ? q.image.trim() : null;

    if (!question) errors.push(`Question ${n}: question text is required.`);
    if (options.length !== 4) {
      errors.push(`Question ${n}: must have exactly 4 options (found ${options.length}).`);
    } else if (options.some((o) => !o)) {
      errors.push(`Question ${n}: options cannot be empty.`);
    }
    if (correctIndex < 0 || correctIndex > 3) {
      errors.push(`Question ${n}: correct answer must be one of the 4 options.`);
    }

    return { category: category || null, question, image, options, correctIndex, explanation, timeLimitSeconds };
  });

  return { title: title || "Quiz", questions };
}

// Optional room-level setting, independent of quiz-question validation
// above. Missing/null is valid (backward compatible — see the override
// step in validateRoomSetup below); an explicit value must be one of the
// dropdown's own options, same "never trust the client" boundary as
// everything else here.
function validateSettingsFields(payload, errors) {
  const rawSettings = payload && payload.settings;
  const rawTimePerQuestion = rawSettings && rawSettings.timePerQuestion;

  if (rawTimePerQuestion == null) {
    return { timePerQuestion: null };
  }

  const timePerQuestion = Number(rawTimePerQuestion);
  if (!TIME_PER_QUESTION_OPTIONS.has(timePerQuestion)) {
    errors.push(`Time per question must be one of: ${[...TIME_PER_QUESTION_OPTIONS].join(", ")} seconds.`);
    return { timePerQuestion: null };
  }

  return { timePerQuestion };
}

function validateRoomSetup(payload) {
  const errors = [];
  const { event, groupMode, teams } = validateEventFields(payload, errors);
  const quiz = validateQuizFields(payload, errors);
  const settings = validateSettingsFields(payload, errors);

  if (errors.length > 0) return { ok: false, errors };

  // Room creation-time override: a teacher-selected time-per-question
  // applies to every question regardless of what the import source
  // specified individually. Backward compatible — if settings.
  // timePerQuestion is missing (null), each question keeps its own
  // already-validated timeLimitSeconds untouched.
  const finalQuiz = settings.timePerQuestion
    ? { ...quiz, questions: quiz.questions.map((q) => ({ ...q, timeLimitSeconds: settings.timePerQuestion })) }
    : quiz;

  return { ok: true, setup: { event, groupMode, teams, quiz: finalQuiz, settings } };
}

module.exports = { validateRoomSetup };
