const dataStore = require("./dataStore");

// Registry of active rooms, keyed by room code. UniversalQuiz v2 still only
// ever allows one entry — enforced solely via hasAnyActiveRoom() in
// socketHandlers.js — but the storage itself has no such limit baked in, so
// lifting that restriction later means removing one guard, not restructuring
// how rooms are stored.
const rooms = new Map();

function generateCode() {
  let code;
  do {
    code = String(Math.floor(100000 + Math.random() * 900000));
  } while (rooms.has(code));
  return code;
}

function hasAnyActiveRoom() {
  return rooms.size > 0;
}

function createRoom(teacherSocketId) {
  const code = generateCode();
  const room = {
    code,
    teacherSocketId,
    status: "lobby",
    currentQuestionIndex: -1,
    currentQuestionStartTime: null,
    questionTimer: null,
    answeredThisQuestion: new Set(),
    players: new Map() // participantId -> PlayerState
  };
  rooms.set(code, room);
  return room;
}

function getRoom(roomCode) {
  return rooms.get(roomCode) || null;
}

// Only one room can exist in v2, so a reconnecting teacher who doesn't know
// a room code yet (e.g. socket.data hasn't been populated on this fresh
// connection) can safely reclaim whichever single room is active. Once a
// roomCode is known it's used directly — this is also the path multiple
// concurrent rooms will require later.
function getSoleActiveRoom() {
  if (rooms.size !== 1) return null;
  return rooms.values().next().value;
}

// Lets the teacher's browser reclaim control of the already-running room
// after a refresh/crash, instead of the app defaulting to "create a new
// room" and orphaning every connected student.
function reclaimTeacher(socketId, roomCode) {
  const room = roomCode ? getRoom(roomCode) : getSoleActiveRoom();
  if (!room) return null;
  room.teacherSocketId = socketId;
  return room;
}

function joinPlayer(roomCode, participantId, socketId) {
  const room = getRoom(roomCode);
  if (!room) {
    return { ok: false, reason: "notFound" };
  }

  if (room.status === "ended") {
    return { ok: false, reason: "quizFinished" };
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

// Full teardown: broadcasts a reset notice, cancels any pending
// phase-transition timer (so a stale intro/lock/reveal callback can't fire
// against a room that no longer exists in the registry), drops every socket
// from the room, then removes it from the registry so a new quiz can start
// clean — no process restart required.
function resetSession(io, roomCode) {
  const room = getRoom(roomCode);
  if (!room) return;

  if (room.questionTimer) {
    clearTimeout(room.questionTimer);
    room.questionTimer = null;
  }

  io.to(roomCode).emit("session:reset", {});

  const socketsInRoom = io.sockets.adapter.rooms.get(roomCode);
  if (socketsInRoom) {
    for (const socketId of [...socketsInRoom]) {
      const s = io.sockets.sockets.get(socketId);
      if (s) s.leave(roomCode);
    }
  }

  rooms.delete(roomCode);
}

function disconnectBySocketId(roomCode, socketId) {
  const room = getRoom(roomCode);
  if (!room) return;
  for (const player of room.players.values()) {
    if (player.socketId === socketId) {
      player.connected = false;
      player.socketId = null;
      return;
    }
  }
}

function lobbySnapshot(roomCode) {
  const room = getRoom(roomCode);
  if (!room) return null;

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
  hasAnyActiveRoom,
  createRoom,
  getRoom,
  getSoleActiveRoom,
  reclaimTeacher,
  joinPlayer,
  disconnectBySocketId,
  lobbySnapshot,
  resetSession
};
