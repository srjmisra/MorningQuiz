const path = require("path");
const os = require("os");
const express = require("express");
const { createServer } = require("http");
const { Server } = require("socket.io");

// Fails fast with a clear error if config/*.json is inconsistent.
const dataStore = require("./src/dataStore");
const roomManager = require("./src/roomManager");
const { registerSocketHandlers } = require("./src/socketHandlers");

const app = express();

// Correct client IP / protocol resolution behind a reverse proxy (Apache +
// Phusion Passenger on Bluehost, or any other proxy). Safe no-op when run
// directly (e.g. local WiFi/hotspot deployment) since there's no proxy to
// trust in that case.
app.set("trust proxy", 1);

const server = createServer(app);
const io = new Server(server);

// Short cache window: fast repeat loads for reconnecting phones during the
// event, without risking stale assets during tonight's final rehearsal.
app.use(express.static(path.join(__dirname, "public"), { maxAge: "5m" }));

app.get("/api/roster", (req, res) => {
  // Host group(s) (e.g. Group 3, running the event) are organisers, not
  // competitors — they're excluded here so they never appear in the join
  // list or any competition UI on the client.
  const room = roomManager.getRoom();
  res.json({
    participants: dataStore.competingParticipants,
    groups: dataStore.competingGroups,
    event: dataStore.event,
    liveRoomStatus: room ? room.status : null
  });
});

registerSocketHandlers(io);

function getLanAddresses() {
  const interfaces = os.networkInterfaces();
  const addresses = [];
  for (const name of Object.keys(interfaces)) {
    for (const iface of interfaces[name]) {
      if (iface.family === "IPv4" && !iface.internal) {
        addresses.push(iface.address);
      }
    }
  }
  return addresses;
}

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

// Phusion Passenger (Bluehost/cPanel "Setup Node.js App") sets this env var
// on every process it manages. In that context the app is reached through
// whatever public domain Bluehost assigned, not localhost or a LAN IP, so
// that guidance would be actively misleading — skip it.
const isUnderPassenger = Boolean(process.env.PASSENGER_APP_ENV);

server.listen(PORT, () => {
  if (isUnderPassenger) {
    console.log(`MorningQuiz server ready (Phusion Passenger, port ${PORT}).`);
    return;
  }

  const lanAddresses = getLanAddresses();
  console.log(`\nMorningQuiz server running on port ${PORT}\n`);
  console.log(`  Local (this machine only): http://localhost:${PORT}/teacher/`);
  if (lanAddresses.length === 0) {
    console.log("\n  ⚠ No LAN network address detected — phones on other devices");
    console.log("    won't be able to reach this server. Connect to WiFi/hotspot first.");
  } else {
    console.log("\n  Share with participants (open this on the projector too):");
    lanAddresses.forEach((addr) => {
      console.log(`    http://${addr}:${PORT}/teacher/   (student join: http://${addr}:${PORT}/student/)`);
    });
  }
  console.log("");
});
