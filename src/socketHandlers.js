const roomManager = require("./roomManager");
const gameEngine = require("./gameEngine");

const VALID_GROUP_MODES = new Set(["individual", "team", "hybrid"]);
// ~200KB raw image + base64 inflation (~4/3x) + headroom for the data: URI prefix.
const MAX_LOGO_DATA_URI_LENGTH = 290 * 1024;

// Server-side check on the setup-wizard payload — the client already
// validates before submitting, but this is the actual boundary the app
// trusts. Deliberately minimal/inline for this phase rather than a shared
// validation module: quiz-question validation (a much bigger surface) is
// future question-import work and gets its own module then.
function validateEventSetup(payload) {
  const errors = [];
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

  if (errors.length > 0) return { ok: false, errors };

  return {
    ok: true,
    setup: {
      event: { title, subtitle, organizer, logoDataUri },
      groupMode,
      teams
    }
  };
}

function registerSocketHandlers(io) {
  io.on("connection", (socket) => {
    // Extensible per-connection identity. Only "teacher" and "student" exist
    // today, but keeping this as a plain, predictable shape (rather than
    // scattering ad-hoc properties across handlers) is what lets future
    // roles/fields get added without hunting down every place socket state
    // is read.
    socket.data.roomCode = null;
    socket.data.participantId = null;
    socket.data.role = null;

    socket.on("teacher:createRoom", (payload, ack) => {
      // The only place v2's "single active room" rule is enforced. Deleting
      // this check is the entire diff multi-room support needs later — the
      // registry underneath already has no such limit.
      if (roomManager.hasAnyActiveRoom()) {
        if (typeof ack === "function") ack({ ok: false, error: "roomLimitReached" });
        return;
      }

      const validation = validateEventSetup(payload);
      if (!validation.ok) {
        if (typeof ack === "function") ack({ ok: false, error: "invalidSetup", details: validation.errors });
        return;
      }

      const room = roomManager.createRoom(socket.id, validation.setup);
      socket.data.roomCode = room.code;
      socket.data.role = "teacher";
      socket.join(room.code);

      if (typeof ack === "function") {
        ack({ ok: true, code: room.code });
      }
      io.to(room.code).emit("room:lobbyUpdate", roomManager.lobbySnapshot(room.code));
    });

    socket.on("student:joinRoom", ({ roomCode, participantId } = {}, ack) => {
      const result = roomManager.joinPlayer(roomCode, participantId, socket.id);
      if (!result.ok) {
        if (typeof ack === "function") ack({ ok: false, error: result.reason });
        return;
      }

      socket.data.roomCode = roomCode;
      socket.data.participantId = participantId;
      socket.data.role = "student";
      socket.join(roomCode);

      if (typeof ack === "function") {
        ack({ ok: true, participant: result.participant });
      }
      io.to(roomCode).emit("room:lobbyUpdate", roomManager.lobbySnapshot(roomCode));
      io.to(roomCode).emit("room:participantJoined", {
        name: result.participant.name,
        group: result.participant.group
      });
    });

    socket.on("teacher:reconnect", (_payload, ack) => {
      // socket.data.roomCode is null on a fresh connection (page reload), so
      // this falls back to "the sole active room" — safe only because v2
      // guarantees at most one exists. A future multi-room teacher client
      // would send a known roomCode here instead of relying on the fallback.
      const room = roomManager.reclaimTeacher(socket.id, socket.data.roomCode);
      if (!room) {
        if (typeof ack === "function") ack({ exists: false });
        return;
      }
      socket.data.roomCode = room.code;
      socket.data.role = "teacher";
      socket.join(room.code);
      if (typeof ack === "function") {
        ack({
          exists: true,
          code: room.code,
          ...gameEngine.getReconnectSnapshot(room)
        });
      }
    });

    socket.on("teacher:startQuiz", (_payload, ack) => {
      gameEngine.startQuiz(io, socket.data.roomCode);
      if (typeof ack === "function") ack({ ok: true });
    });

    socket.on("teacher:revealAnswer", (_payload, ack) => {
      gameEngine.forceReveal(io, socket.data.roomCode);
      if (typeof ack === "function") ack({ ok: true });
    });

    socket.on("teacher:nextQuestion", (_payload, ack) => {
      gameEngine.nextQuestion(io, socket.data.roomCode);
      if (typeof ack === "function") ack({ ok: true });
    });

    socket.on("teacher:endQuiz", (_payload, ack) => {
      gameEngine.endQuizEarly(io, socket.data.roomCode);
      if (typeof ack === "function") ack({ ok: true });
    });

    socket.on("teacher:resetSession", (_payload, ack) => {
      roomManager.resetSession(io, socket.data.roomCode);
      if (typeof ack === "function") ack({ ok: true });
    });

    socket.on("student:submitAnswer", (payload, ack) => {
      const result = gameEngine.submitAnswer(io, socket.data.roomCode, socket, payload);
      if (typeof ack === "function") ack(result);
    });

    socket.on("disconnect", () => {
      const roomCode = socket.data.roomCode;
      if (!roomCode) return;
      const room = roomManager.getRoom(roomCode);
      if (!room) return;
      roomManager.disconnectBySocketId(roomCode, socket.id);
      io.to(roomCode).emit("room:lobbyUpdate", roomManager.lobbySnapshot(roomCode));
      gameEngine.maybeAutoEndQuestion(io, room);
    });
  });
}

module.exports = { registerSocketHandlers };
