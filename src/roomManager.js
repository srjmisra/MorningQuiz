// Registry of active rooms, keyed by room code. UniversalQuiz v2 still only
// ever allows one entry — enforced solely via hasAnyActiveRoom() in
// socketHandlers.js — but the storage itself has no such limit baked in, so
// lifting that restriction later means removing one guard, not restructuring
// how rooms are stored.
const rooms = new Map();

const MAX_NAME_LENGTH = 40;

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

// setup ({event, groupMode, teams, quiz}) is the teacher's already-validated
// setup wizard payload — see src/eventValidation.js, called from
// socketHandlers.js's teacher:createRoom handler before this ever runs.
// event/groupMode/teams are purely descriptive (teacher's own branding/
// reconnect display). quiz drives gameplay directly (room.quiz.questions).
// teams is also the *only* source of team identity now — participants are
// self-registered per room (see joinPlayer below), not looked up from any
// static roster.
function createRoom(teacherSocketId, setup) {
  const code = generateCode();
  const room = {
    code,
    teacherSocketId,
    status: "lobby",
    currentQuestionIndex: -1,
    currentQuestionStartTime: null,
    questionTimer: null,
    answeredThisQuestion: new Set(),
    participants: new Map(), // participantId -> { id, name, teamId }
    participantIdCounter: 0,
    players: new Map(), // participantId -> PlayerState
    quiz: (setup && setup.quiz) || null,
    event: (setup && setup.event) || null,
    groupMode: (setup && setup.groupMode) || null,
    teams: (setup && setup.teams) || []
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

// Fresh join: student self-registers with a name (always) and a team
// (required only when the room's mode is team/hybrid — room.teams is the
// only valid source of team ids, never a value the client invents).
function joinPlayer(roomCode, { name, teamId } = {}, socketId) {
  const room = getRoom(roomCode);
  if (!room) {
    return { ok: false, reason: "notFound" };
  }
  if (room.status === "ended") {
    return { ok: false, reason: "quizFinished" };
  }

  const trimmedName = String(name || "").trim();
  if (!trimmedName) {
    return { ok: false, reason: "nameRequired" };
  }
  if (trimmedName.length > MAX_NAME_LENGTH) {
    return { ok: false, reason: "nameTooLong" };
  }

  const requiresTeam = room.groupMode === "team" || room.groupMode === "hybrid";
  let resolvedTeamId = null;
  if (requiresTeam) {
    const team = (room.teams || []).find((t) => t.id === teamId);
    if (!team) {
      return { ok: false, reason: "invalidTeam" };
    }
    resolvedTeamId = team.id;
  }

  const nameKey = trimmedName.toLowerCase();
  const nameTaken = [...room.participants.values()].some((p) => p.name.toLowerCase() === nameKey);
  if (nameTaken) {
    return { ok: false, reason: "nameTaken" };
  }

  room.participantIdCounter += 1;
  const participantId = room.participantIdCounter;
  const participant = { id: participantId, name: trimmedName, teamId: resolvedTeamId };
  room.participants.set(participantId, participant);

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

// Reclaim an already-registered identity (page refresh, dropped connection).
// Unlike joinPlayer, this never rejects on "already connected" — the whole
// point is the same student's browser taking its own socket back over,
// which is exactly as valid whether or not the old socket ever cleanly
// disconnected first.
function rejoinPlayer(roomCode, participantId, socketId) {
  const room = getRoom(roomCode);
  if (!room) {
    return { ok: false, reason: "notFound" };
  }
  const participant = room.participants.get(participantId);
  const player = room.players.get(participantId);
  if (!participant || !player) {
    return { ok: false, reason: "notFound" };
  }
  if (room.status === "ended") {
    return { ok: false, reason: "quizFinished" };
  }

  player.socketId = socketId;
  player.connected = true;
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

// Dynamic counts based on whoever has actually joined this room — there is
// no fixed roster size to report a fraction/"all ready" state against
// anymore, unlike the old static-roster model.
function lobbySnapshot(roomCode) {
  const room = getRoom(roomCode);
  if (!room) return null;

  const joinedPlayers = [...room.players.values()].filter((p) => p.connected);

  const groups = (room.teams || []).map((t) => {
    const joined = joinedPlayers.filter((p) => {
      const participant = room.participants.get(p.participantId);
      return participant && participant.teamId === t.id;
    }).length;
    return { id: t.id, name: t.name, color: t.color, joined };
  });

  const roster = joinedPlayers.map((p) => {
    const participant = room.participants.get(p.participantId);
    return { participantId: p.participantId, name: participant.name, group: participant.teamId };
  });

  return {
    totalJoined: roster.length,
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
  rejoinPlayer,
  disconnectBySocketId,
  lobbySnapshot,
  resetSession
};
