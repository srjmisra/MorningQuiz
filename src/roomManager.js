const dataStore = require("./dataStore");

// Single active room for the whole event — this is one-event software, not multi-tenant.
let room = null;

function generateCode() {
  return String(Math.floor(100000 + Math.random() * 900000));
}

function createRoom(teacherSocketId) {
  room = {
    code: generateCode(),
    teacherSocketId,
    status: "lobby",
    currentQuestionIndex: -1,
    currentQuestionStartTime: null,
    questionTimer: null,
    answeredThisQuestion: new Set(),
    players: new Map() // participantId -> PlayerState
  };
  return room;
}

function getRoom() {
  return room;
}

// Lets the teacher's browser reclaim control of the already-running room
// after a refresh/crash, instead of the app defaulting to "create a new
// room" and orphaning every connected student.
function reclaimTeacher(socketId) {
  if (!room) return null;
  room.teacherSocketId = socketId;
  return room;
}

function joinPlayer(roomCode, participantId, socketId) {
  if (!room || room.code !== roomCode) {
    return { ok: false, reason: "notFound" };
  }

  const participant = dataStore.getParticipantById(participantId);
  if (!participant) {
    return { ok: false, reason: "notFound" };
  }

  // Host group (e.g. Group 3, running the event) organises rather than
  // competes — rejected here too, defensively, even though the client never
  // offers them in the join list.
  if (dataStore.isHostGroup(participant.group)) {
    return { ok: false, reason: "hostGroupExcluded" };
  }

  const existing = room.players.get(participantId);
  if (existing && existing.connected) {
    return { ok: false, reason: "alreadyJoined" };
  }

  if (existing) {
    existing.socketId = socketId;
    existing.connected = true;
    return { ok: true, player: existing, participant };
  }

  const player = {
    participantId,
    socketId,
    connected: true,
    score: 0,
    streak: 0,
    longestStreak: 0,
    answeredCount: 0,
    correctCount: 0,
    fastestCorrectMs: null,
    answers: []
  };
  room.players.set(participantId, player);
  return { ok: true, player, participant };
}

function disconnectBySocketId(socketId) {
  if (!room) return;
  for (const player of room.players.values()) {
    if (player.socketId === socketId) {
      player.connected = false;
      player.socketId = null;
      return;
    }
  }
}

function lobbySnapshot() {
  const joinedPlayers = [...room.players.values()].filter((p) => p.connected);

  const groups = dataStore.competingGroups.map((g) => {
    const size = dataStore.groupSize(g.id);
    const joined = joinedPlayers.filter(
      (p) => dataStore.getParticipantById(p.participantId).group === g.id
    ).length;
    return { id: g.id, name: g.name, color: g.color, joined, size };
  });

  const roster = joinedPlayers.map((p) => {
    const participant = dataStore.getParticipantById(p.participantId);
    return { participantId: p.participantId, name: participant.name, group: participant.group };
  });

  return {
    totalJoined: roster.length,
    totalParticipants: dataStore.competingParticipants.length,
    groups,
    roster
  };
}

module.exports = {
  createRoom,
  getRoom,
  reclaimTeacher,
  joinPlayer,
  disconnectBySocketId,
  lobbySnapshot
};
