const participants = require("../config/participants.json");
const groups = require("../config/groups.json");
const event = require("../config/event.json");
const quiz = require("../config/quizData.js");

function validate() {
  const groupIds = new Set(groups.map((g) => g.id));

  for (const p of participants) {
    if (!groupIds.has(p.group)) {
      throw new Error(
        `participants.json: participant #${p.id} (${p.name}) references unknown group ${p.group}`
      );
    }
  }

  if (participants.length !== event.totalParticipants) {
    throw new Error(
      `event.json: totalParticipants is ${event.totalParticipants} but participants.json has ${participants.length} entries`
    );
  }

  if (groups.length !== event.totalGroups) {
    throw new Error(
      `event.json: totalGroups is ${event.totalGroups} but groups.json has ${groups.length} entries`
    );
  }

  const ids = new Set();
  for (const p of participants) {
    if (ids.has(p.id)) {
      throw new Error(`participants.json: duplicate participant id ${p.id}`);
    }
    ids.add(p.id);
  }

  if (!quiz.questions || quiz.questions.length === 0) {
    throw new Error("quizData.js: no questions defined");
  }

  for (const [i, q] of quiz.questions.entries()) {
    if (!Array.isArray(q.options) || q.options.length !== 4) {
      throw new Error(`quizData.js: question ${i} must have exactly 4 options`);
    }
    if (q.correctIndex < 0 || q.correctIndex > 3) {
      throw new Error(`quizData.js: question ${i} has invalid correctIndex`);
    }
  }
}

validate();

function getParticipantById(id) {
  return participants.find((p) => p.id === id) || null;
}

function getGroupById(id) {
  return groups.find((g) => g.id === id) || null;
}

function groupSize(id) {
  return participants.filter((p) => p.group === id).length;
}

// Host group(s) (e.g. Group 3, running the Morning Assembly) organise the
// event rather than compete in it — everything competition-facing should
// use the competing* lists below instead of the raw participants/groups.
const hostGroupIds = new Set(groups.filter((g) => g.isHost).map((g) => g.id));

function isHostGroup(groupId) {
  return hostGroupIds.has(groupId);
}

const competingGroups = groups.filter((g) => !g.isHost);
const competingParticipants = participants.filter((p) => !isHostGroup(p.group));

module.exports = {
  participants,
  groups,
  event,
  quiz,
  getParticipantById,
  getGroupById,
  groupSize,
  isHostGroup,
  competingGroups,
  competingParticipants
};
