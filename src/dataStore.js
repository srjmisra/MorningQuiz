// No longer the live quiz source — gameEngine.js reads room.quiz (teacher-
// supplied at room creation). Kept only as a ready-made "load sample quiz"
// convenience in the setup wizard, served via GET /api/sample-quiz.
const sampleQuiz = require("../config/quizData.js");

// Fails fast with a clear error if config/quizData.js is malformed — the
// same fail-fast intent this module always had, just narrowed now that
// participants/groups/event are no longer static config (participants and
// teams are self-registered/teacher-defined per room; event branding is
// entirely per-room too — see roomManager.js).
function validate() {
  if (!sampleQuiz.questions || sampleQuiz.questions.length === 0) {
    throw new Error("quizData.js: no questions defined");
  }

  for (const [i, q] of sampleQuiz.questions.entries()) {
    if (!Array.isArray(q.options) || q.options.length !== 4) {
      throw new Error(`quizData.js: question ${i} must have exactly 4 options`);
    }
    if (q.correctIndex < 0 || q.correctIndex > 3) {
      throw new Error(`quizData.js: question ${i} has invalid correctIndex`);
    }
  }
}

validate();

module.exports = {
  sampleQuiz
};
