const path = require("path");
const express = require("express");
const { createServer } = require("http");
const { Server } = require("socket.io");

// Fails fast with a clear error if config/*.json is inconsistent.
const dataStore = require("./src/dataStore");
const roomManager = require("./src/roomManager");
const { registerSocketHandlers } = require("./src/socketHandlers");

const app = express();

// UniversalQuiz always runs behind a public HTTPS reverse proxy (Railway,
// or any other host) — this correctly resolves client IP/protocol in that
// setup and is a safe no-op if ever run without a proxy in front.
app.set("trust proxy", 1);

const server = createServer(app);
const io = new Server(server);

// Short cache window: fast repeat loads for reconnecting phones during a
// live event, without risking stale assets between deploys.
app.use(express.static(path.join(__dirname, "public"), { maxAge: "5m" }));

app.get("/api/roster", (req, res) => {
  // v2 only ever has one active room, so "the current room" (if any) is
  // whichever one is in the registry — getSoleActiveRoom() is the same
  // v2-only convenience roomManager uses internally for teacher reconnect.
  //
  // No more fixed participant/group rosters to serve — students self-
  // register (see student:joinRoom), so this only tells the client what it
  // needs before that: the active room's own branding/mode/teams, if any
  // room exists yet. All branding is per-room now — there's no separate
  // static "event" to fall back to.
  const room = roomManager.getSoleActiveRoom();
  res.json({
    roomEvent: room ? room.event : null,
    groupMode: room ? room.groupMode : null,
    teams: room ? room.teams : [],
    liveRoomStatus: room ? room.status : null
  });
});

// Convenience only — lets the setup wizard's "Load sample quiz" button
// pre-fill something real instead of a blank textarea. Not read by any
// room-creation path; the teacher's submitted quiz always goes through
// teacher:createRoom -> eventValidation.js like any other question source.
app.get("/api/sample-quiz", (req, res) => {
  res.json(dataStore.sampleQuiz);
});

registerSocketHandlers(io);

const PORT = process.env.PORT || 3000;

server.on("error", (err) => {
  if (err.code === "EADDRINUSE") {
    console.error(`\nPort ${PORT} is already in use — is the server already running in another window?`);
    console.error(`Close that one first, or run with a different port: PORT=3001 npm start\n`);
  } else {
    console.error("Server failed to start:", err);
  }
  process.exit(1);
});

server.listen(PORT, () => {
  console.log(`MorningQuiz server ready on port ${PORT}. Serve it behind your public HTTPS domain.`);
});
