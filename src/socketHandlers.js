const roomManager = require("./roomManager");
const gameEngine = require("./gameEngine");

function registerSocketHandlers(io) {
  io.on("connection", (socket) => {
    socket.on("teacher:createRoom", (_payload, ack) => {
      const room = roomManager.createRoom(socket.id);
      socket.join(room.code);
      if (typeof ack === "function") {
        ack({ ok: true, code: room.code });
      }
      io.to(room.code).emit("room:lobbyUpdate", roomManager.lobbySnapshot());
    });

    socket.on("student:joinRoom", ({ roomCode, participantId } = {}, ack) => {
      const result = roomManager.joinPlayer(roomCode, participantId, socket.id);
      if (!result.ok) {
        if (typeof ack === "function") ack({ ok: false, error: result.reason });
        return;
      }

      socket.join(roomCode);
      socket.data.participantId = participantId;

      if (typeof ack === "function") {
        ack({ ok: true, participant: result.participant });
      }
      io.to(roomCode).emit("room:lobbyUpdate", roomManager.lobbySnapshot());
      io.to(roomCode).emit("room:participantJoined", {
        name: result.participant.name,
        group: result.participant.group
      });
    });

    socket.on("teacher:reconnect", (_payload, ack) => {
      const room = roomManager.reclaimTeacher(socket.id);
      if (!room) {
        if (typeof ack === "function") ack({ exists: false });
        return;
      }
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
      gameEngine.startQuiz(io);
      if (typeof ack === "function") ack({ ok: true });
    });

    socket.on("teacher:revealAnswer", (_payload, ack) => {
      gameEngine.forceReveal(io);
      if (typeof ack === "function") ack({ ok: true });
    });

    socket.on("teacher:nextQuestion", (_payload, ack) => {
      gameEngine.nextQuestion(io);
      if (typeof ack === "function") ack({ ok: true });
    });

    socket.on("student:submitAnswer", (payload, ack) => {
      const result = gameEngine.submitAnswer(io, socket, payload);
      if (typeof ack === "function") ack(result);
    });

    socket.on("disconnect", () => {
      const room = roomManager.getRoom();
      if (!room) return;
      roomManager.disconnectBySocketId(socket.id);
      io.to(room.code).emit("room:lobbyUpdate", roomManager.lobbySnapshot());
      gameEngine.maybeAutoEndQuestion(io);
    });
  });
}

module.exports = { registerSocketHandlers };
