#!/usr/bin/env node
// Lightweight deployment sanity check — NOT a test suite. Boots the app as a
// real child process, drives it through the core flows over real Socket.IO
// connections (the same protocol a real teacher/student browser uses), and
// prints a pass/fail summary. Intended to be run after deploying (e.g. to
// Railway) or before a live event: `npm run healthcheck`.
//
// Covers: room creation, student join, teacher reconnect, student reconnect,
// reset, results export, and question import (the server-side half of it —
// every importer in public/shared/quizImport.js converges on the same
// canonical {title, questions} shape this script submits directly, so this
// exercises the same teacher:createRoom -> eventValidation.js path any of
// them would use; the browser-side parsing itself needs a real browser and
// isn't covered here).

const { spawn } = require("child_process");
const path = require("path");
const { io } = require("socket.io-client");

const PORT = process.env.HEALTHCHECK_PORT || 3999;
const BASE = `http://localhost:${PORT}`;
const PROJECT_ROOT = path.join(__dirname, "..");

let failures = 0;
function pass(label) {
  console.log(`  \x1b[32m✓\x1b[0m ${label}`);
}
function failCheck(label, detail) {
  failures += 1;
  console.error(`  \x1b[31m✗\x1b[0m ${label}${detail ? ` — ${detail}` : ""}`);
}
function section(title) {
  console.log(`\n${title}`);
}

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function sampleQuiz(count) {
  return {
    title: "Healthcheck Quiz",
    questions: Array.from({ length: count }, (_, i) => ({
      category: "Healthcheck",
      question: `Healthcheck question ${i + 1}?`,
      image: null,
      options: ["A", "B", "C", "D"],
      correctIndex: 0,
      explanation: "",
      timeLimitSeconds: 5
    }))
  };
}

async function main() {
  console.log(`Starting UniversalQuiz on port ${PORT} for a health check...`);
  const server = spawn("node", ["server.js"], {
    cwd: PROJECT_ROOT,
    env: { ...process.env, PORT: String(PORT) }
  });
  let serverErrored = false;
  server.stderr.on("data", (d) => {
    serverErrored = true;
    process.stderr.write(`[server] ${d}`);
  });
  await wait(1000);

  try {
    // ---- HTTP layer ----
    section("HTTP endpoints");
    const rosterRes = await fetch(`${BASE}/api/roster`);
    if (rosterRes.ok) pass("GET /api/roster responds 200");
    else failCheck("GET /api/roster", `status ${rosterRes.status}`);

    const teacherPageRes = await fetch(`${BASE}/teacher/`);
    if (teacherPageRes.ok) pass("GET /teacher/ responds 200");
    else failCheck("GET /teacher/", `status ${teacherPageRes.status}`);

    const studentPageRes = await fetch(`${BASE}/student/`);
    if (studentPageRes.ok) pass("GET /student/ responds 200");
    else failCheck("GET /student/", `status ${studentPageRes.status}`);

    // ---- Room creation (also exercises the import path: this payload is
    // exactly what any question importer converges on before submission) ----
    section("Room creation + question import path");
    const teacher = io(BASE, { transports: ["websocket"] });
    await new Promise((resolve) => teacher.on("connect", resolve));

    const createRes = await new Promise((resolve) =>
      teacher.emit(
        "teacher:createRoom",
        {
          event: { title: "Healthcheck Event", subtitle: "", organizer: "Healthcheck", logoDataUri: null },
          groupMode: "individual",
          teams: [],
          quiz: sampleQuiz(2)
        },
        resolve
      )
    );
    if (createRes && createRes.ok) pass(`teacher:createRoom succeeded (room ${createRes.code})`);
    else { failCheck("teacher:createRoom", JSON.stringify(createRes)); throw new Error("cannot continue without a room"); }
    const roomCode = createRes.code;

    // ---- Student join ----
    section("Student join");
    const student = io(BASE, { transports: ["websocket"] });
    await new Promise((resolve) => student.on("connect", resolve));
    const joinRes = await new Promise((resolve) =>
      student.emit("student:joinRoom", { roomCode, name: "Healthcheck Student", teamId: null }, resolve)
    );
    if (joinRes && joinRes.ok) pass("student:joinRoom succeeded");
    else failCheck("student:joinRoom", JSON.stringify(joinRes));
    const participantId = joinRes && joinRes.participant && joinRes.participant.id;

    // ---- Teacher reconnect ----
    section("Teacher reconnect");
    teacher.disconnect();
    await wait(200);
    const teacherB = io(BASE, { transports: ["websocket"] });
    await new Promise((resolve) => teacherB.on("connect", resolve));
    const teacherReconnectRes = await new Promise((resolve) => teacherB.emit("teacher:reconnect", {}, resolve));
    if (teacherReconnectRes && teacherReconnectRes.exists && teacherReconnectRes.code === roomCode) {
      pass("teacher:reconnect reclaimed the active room");
    } else {
      failCheck("teacher:reconnect", JSON.stringify(teacherReconnectRes));
    }

    // ---- Student reconnect ----
    section("Student reconnect");
    student.disconnect();
    await wait(200);
    const studentB = io(BASE, { transports: ["websocket"] });
    await new Promise((resolve) => studentB.on("connect", resolve));
    const studentReconnectRes = await new Promise((resolve) =>
      studentB.emit("student:rejoinRoom", { roomCode, participantId }, resolve)
    );
    if (studentReconnectRes && studentReconnectRes.ok) {
      pass("student:rejoinRoom reclaimed identity");
    } else {
      failCheck("student:rejoinRoom", JSON.stringify(studentReconnectRes));
    }

    // ---- Play the quiz through, then export ----
    section("Quiz playthrough + results export");
    const finalPromise = new Promise((resolve) => studentB.once("game:finalResults", resolve));
    studentB.on("game:questionStart", (data) => {
      studentB.emit("student:submitAnswer", { questionIndex: data.questionIndex, choiceIndex: 0 }, () => {});
    });
    studentB.on("game:questionEnd", () => {
      teacherB.emit("teacher:nextQuestion", {}, () => {});
    });
    teacherB.emit("teacher:startQuiz", {}, () => {});
    const finalResults = await Promise.race([
      finalPromise,
      wait(30000).then(() => null)
    ]);
    if (finalResults && finalResults.finalIndividualRankings && finalResults.finalIndividualRankings.length === 1) {
      pass("quiz played through to game:finalResults with 1 ranked participant");
    } else {
      failCheck("quiz playthrough", finalResults ? "unexpected final payload" : "timed out waiting for game:finalResults");
    }

    const exportRes = await new Promise((resolve) => teacherB.emit("teacher:exportResults", {}, resolve));
    if (exportRes && exportRes.ok && exportRes.csv && exportRes.csv.startsWith("Rank,Name,Team,Score")) {
      pass(`teacher:exportResults returned a well-formed CSV (${exportRes.filename})`);
    } else {
      failCheck("teacher:exportResults", JSON.stringify(exportRes && { ok: exportRes.ok, filename: exportRes.filename }));
    }

    // ---- Reset ----
    section("Session reset");
    const resetSeen = new Promise((resolve) => studentB.once("session:reset", resolve));
    teacherB.emit("teacher:resetSession", {}, () => {});
    await Promise.race([resetSeen, wait(3000)]);
    await wait(200);
    const roomGoneCheck = await new Promise((resolve) =>
      teacherB.emit(
        "teacher:createRoom",
        {
          event: { title: "Post-reset check", organizer: "Healthcheck", logoDataUri: null },
          groupMode: "individual",
          teams: [],
          quiz: sampleQuiz(1)
        },
        resolve
      )
    );
    if (roomGoneCheck && roomGoneCheck.ok) {
      pass("teacher:resetSession correctly freed the room slot (a new room could be created)");
    } else {
      failCheck("teacher:resetSession", "room slot was not freed after reset: " + JSON.stringify(roomGoneCheck));
    }

    teacherB.disconnect();
    studentB.disconnect();

    if (serverErrored) {
      failCheck("server process", "wrote to stderr at some point during the run — see [server] lines above");
    }
  } catch (err) {
    failCheck("unexpected exception", err.message);
  } finally {
    server.kill();
    await wait(300);
  }

  console.log("");
  if (failures === 0) {
    console.log("\x1b[32mAll health checks passed.\x1b[0m");
    process.exit(0);
  } else {
    console.error(`\x1b[31m${failures} health check(s) failed.\x1b[0m`);
    process.exit(1);
  }
}

main();
