const { io } = require("socket.io-client");

const URL = "http://localhost:3000";

async function fetchRoster() {
  const res = await fetch(`${URL}/api/roster`);
  return res.json();
}

async function main() {
  console.log("--- roster before room creation ---");
  console.log(await fetchRoster());

  const teacher = io(URL, { transports: ["websocket"] });
  await new Promise((r) => teacher.on("connect", r));

  const createRes = await new Promise((resolve) => teacher.emit("teacher:createRoom", {}, resolve));
  console.log("createRoom ack:", createRes);
  const roomCode = createRes.code;

  console.log("--- roster after room creation (before join, before start) ---");
  console.log(await fetchRoster());

  // pick first competing participant from roster
  const roster = await fetchRoster();
  const participant = roster.participants[0];
  console.log("joining as:", participant.name, participant.id);

  const student = io(URL, { transports: ["websocket"] });
  await new Promise((r) => student.on("connect", r));

  const joinRes = await new Promise((resolve) =>
    student.emit("student:joinRoom", { roomCode, participantId: participant.id }, resolve)
  );
  console.log("joinRoom ack:", joinRes);

  console.log("--- roster after student joined (before start) ---");
  console.log(await fetchRoster());

  let questionStartReceived = false;
  student.on("game:questionIntro", (data) => console.log("student received game:questionIntro:", data));
  student.on("game:questionStart", (data) => {
    questionStartReceived = true;
    console.log("student received game:questionStart:", { questionIndex: data.questionIndex, question: data.question });
  });

  const startRes = await new Promise((resolve) => teacher.emit("teacher:startQuiz", {}, resolve));
  console.log("startQuiz ack:", startRes);

  console.log("--- roster immediately after startQuiz ---");
  console.log(await fetchRoster());

  // wait past intro (4000ms) + a buffer
  await new Promise((r) => setTimeout(r, 4500));

  console.log("--- roster after intro period elapsed ---");
  console.log(await fetchRoster());

  console.log("questionStartReceived:", questionStartReceived);

  teacher.close();
  student.close();
  process.exit(questionStartReceived ? 0 : 1);
}

main().catch((err) => {
  console.error("SMOKE TEST ERROR:", err);
  process.exit(1);
});
