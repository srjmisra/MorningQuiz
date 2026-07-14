// Converts every supported question-source format into the same canonical
// schema gameEngine/eventValidation already expect:
//   { category, question, image, options[4], correctIndex, explanation, timeLimitSeconds }
//
// Every importer in the registry below returns the same shape regardless of
// input format: { ok, questions, errors: [{row, message}] }. The wizard UI
// only ever needs to know about this one contract — adding a future format
// (a friendlier paste-from-Word variant, a different spreadsheet layout)
// means writing one function and adding one registry entry, nothing else.
//
// xlsx/csv share one grid-based parsing core (SheetJS reads both into the
// same row/column shape) so "recognize these headers, in this order or any
// order, case-insensitively" is implemented exactly once.

const QuizImport = (function () {
  const DEFAULT_TIME_LIMIT_SECONDS = 20;
  const TEMPLATE_MARKER = "UniversalQuiz Template v1";

  // Single source of truth for column headers — used by both the template
  // generator and the xlsx/csv parser's header-matching, so they can't drift
  // out of sync with each other.
  const HEADERS = {
    question: "Question",
    optionA: "Option A",
    optionB: "Option B",
    optionC: "Option C",
    optionD: "Option D",
    correctAnswer: "Correct Answer",
    category: "Category",
    explanation: "Explanation",
    timeLimit: "Time limit"
  };

  function normalizeHeader(h) {
    return String(h == null ? "" : h).trim().toLowerCase();
  }

  const HEADER_LOOKUP = Object.keys(HEADERS).reduce((acc, key) => {
    acc[normalizeHeader(HEADERS[key])] = key;
    return acc;
  }, {});

  function letterToIndex(letter) {
    const l = String(letter == null ? "" : letter).trim().toUpperCase();
    const map = { A: 0, B: 1, C: 2, D: 3 };
    return Object.prototype.hasOwnProperty.call(map, l) ? map[l] : -1;
  }

  function parseTimeLimit(raw) {
    const n = Number(raw);
    return Number.isFinite(n) && n > 0 ? n : DEFAULT_TIME_LIMIT_SECONDS;
  }

  function cell(v) {
    return String(v == null ? "" : v).trim();
  }

  // ---------- Shared grid core (xlsx + csv both funnel through this) ----------

  // grid: array of arrays of cell values (SheetJS's `header: 1` shape).
  // Scans for the header row rather than assuming row 1, so an inserted
  // title row (or the template's version-marker row) doesn't break parsing.
  function questionsFromGrid(grid) {
    const errors = [];
    const headerRowIndex = grid.findIndex((row) =>
      row.some((c) => normalizeHeader(c) === normalizeHeader(HEADERS.question))
    );
    if (headerRowIndex === -1) {
      return { questions: [], errors: [{ row: null, message: `Could not find a "${HEADERS.question}" column header.` }] };
    }

    const columnMap = {}; // columnIndex -> canonical field key
    grid[headerRowIndex].forEach((headerCell, colIndex) => {
      const key = HEADER_LOOKUP[normalizeHeader(headerCell)];
      if (key) columnMap[colIndex] = key;
    });

    const questions = [];
    for (let r = headerRowIndex + 1; r < grid.length; r++) {
      const row = grid[r] || [];
      const fields = {};
      Object.keys(columnMap).forEach((colIndex) => {
        fields[columnMap[colIndex]] = row[Number(colIndex)];
      });

      const rowNumber = r + 1; // 1-based, matches the row number a spreadsheet editor shows
      const hasContent = Object.keys(fields).some((k) => cell(fields[k]) !== "");
      if (!hasContent) continue; // silently skip blank rows (common at sheet end)

      questions.push(rowFieldsToQuestion(fields, rowNumber, errors));
    }

    if (questions.length === 0 && errors.length === 0) {
      errors.push({ row: null, message: "No question rows found below the header." });
    }
    return { questions, errors };
  }

  function rowFieldsToQuestion(fields, rowNumber, errors) {
    const question = cell(fields.question);
    const options = [fields.optionA, fields.optionB, fields.optionC, fields.optionD].map(cell);
    const correctRaw = cell(fields.correctAnswer);
    const correctIndex = letterToIndex(correctRaw);
    const category = cell(fields.category) || null;
    const explanation = cell(fields.explanation);
    const timeLimitSeconds = parseTimeLimit(fields.timeLimit);

    if (!question) errors.push({ row: rowNumber, message: "Question text is required." });
    if (options.some((o) => !o)) {
      errors.push({ row: rowNumber, message: "All 4 options (Option A-D) are required." });
    }
    if (correctIndex === -1) {
      errors.push({
        row: rowNumber,
        message: `Correct Answer must be A, B, C or D (got "${correctRaw || "blank"}").`
      });
    }

    return { category, question, image: null, options, correctIndex, explanation, timeLimitSeconds };
  }

  // ---------- xlsx ----------

  function parseQuizXlsx(arrayBuffer) {
    let workbook;
    try {
      workbook = XLSX.read(arrayBuffer, { type: "array" });
    } catch (err) {
      return { ok: false, questions: [], errors: [{ row: null, message: "Could not read this file as an Excel workbook." }] };
    }
    return finishGridImport(workbook);
  }

  // ---------- csv (reuses SheetJS's own CSV parser — handles quoted commas,
  // embedded newlines, BOM, CRLF — rather than a hand-rolled split(",")) ----------

  function parseQuizCsv(text) {
    let workbook;
    try {
      workbook = XLSX.read(text, { type: "string" });
    } catch (err) {
      return { ok: false, questions: [], errors: [{ row: null, message: "Could not parse this as CSV." }] };
    }
    return finishGridImport(workbook);
  }

  function finishGridImport(workbook) {
    const sheetName = workbook.SheetNames[0];
    if (!sheetName) {
      return { ok: false, questions: [], errors: [{ row: null, message: "No sheet/data found." }] };
    }
    const grid = XLSX.utils.sheet_to_json(workbook.Sheets[sheetName], { header: 1, defval: "", blankrows: false });
    const { questions, errors } = questionsFromGrid(grid);
    return { ok: errors.length === 0 && questions.length > 0, questions, errors };
  }

  // ---------- json ----------

  function parseQuizJson(text) {
    let parsed;
    try {
      parsed = JSON.parse(text);
    } catch (err) {
      return { ok: false, questions: [], errors: [{ row: null, message: "That isn't valid JSON." }] };
    }

    const rawQuestions = Array.isArray(parsed)
      ? parsed
      : Array.isArray(parsed && parsed.questions)
        ? parsed.questions
        : null;
    if (!rawQuestions) {
      return {
        ok: false,
        questions: [],
        errors: [{ row: null, message: 'Expected {"questions": [...]} or a bare array of questions.' }]
      };
    }

    const errors = [];
    const questions = rawQuestions.map((q, i) => jsonQuestionToCanonical(q, i + 1, errors));
    if (questions.length === 0 && errors.length === 0) {
      errors.push({ row: null, message: "No questions found." });
    }
    return { ok: errors.length === 0 && questions.length > 0, questions, errors };
  }

  function jsonQuestionToCanonical(q, n, errors) {
    const question = cell(q && q.question);
    const options = Array.isArray(q && q.options) ? q.options.map(cell) : [];
    const correctIndex = Number.isInteger(q && q.correctIndex) ? q.correctIndex : -1;
    const category = cell(q && q.category) || null;
    const explanation = cell(q && q.explanation);
    const timeLimitSeconds = parseTimeLimit(q && q.timeLimitSeconds);
    const image = cell(q && q.image) || null;

    if (!question) errors.push({ row: n, message: "Question text is required." });
    if (options.length !== 4) {
      errors.push({ row: n, message: `Must have exactly 4 options (found ${options.length}).` });
    } else if (options.some((o) => !o)) {
      errors.push({ row: n, message: "Options cannot be empty." });
    }
    if (correctIndex < 0 || correctIndex > 3) {
      errors.push({ row: n, message: "correctIndex must be 0-3." });
    }

    return { category, question, image, options, correctIndex, explanation, timeLimitSeconds };
  }

  // ---------- pasted (free text copied from Word/Google Docs) ----------

  const QUESTION_START_RE = /^\s*\d+[.)]\s+(.*)$/;
  const OPTION_RE = /^\s*([A-Da-d])[.):]\s+(.*)$/;
  const ANSWER_RE = /^\s*(?:Correct\s*Answer|Answer|Ans)\s*[:.]?\s*([A-Da-d])\s*$/i;
  const CATEGORY_RE = /^\s*Category\s*[:.]?\s*(.*)$/i;
  const EXPLANATION_RE = /^\s*Explanation\s*[:.]?\s*(.*)$/i;
  const TIME_RE = /^\s*Time(?:\s*Limit)?\s*[:.]?\s*(\d+)/i;

  function splitIntoBlocks(text) {
    const lines = String(text || "").split(/\r\n|\r|\n/);
    const blocks = [];
    let current = null;
    for (const line of lines) {
      const m = QUESTION_START_RE.exec(line);
      if (m) {
        if (current) blocks.push(current);
        current = { startLine: m[1], lines: [] };
      } else if (current) {
        current.lines.push(line);
      }
      // Lines before the first numbered question (e.g. a pasted title) are
      // intentionally dropped rather than causing an error.
    }
    if (current) blocks.push(current);
    return blocks;
  }

  function parseBlock(block, blockNumber, errors) {
    const questionLines = [block.startLine.trim()];
    const options = { A: "", B: "", C: "", D: "" };
    let answerLetter = null;
    let category = null;
    let explanation = "";
    let timeLimitSeconds = DEFAULT_TIME_LIMIT_SECONDS;
    let inOptions = false;

    for (const rawLine of block.lines) {
      const line = rawLine.trim();
      if (!line) continue;

      const optMatch = OPTION_RE.exec(rawLine);
      const ansMatch = ANSWER_RE.exec(rawLine);
      const catMatch = CATEGORY_RE.exec(rawLine);
      const expMatch = EXPLANATION_RE.exec(rawLine);
      const timeMatch = TIME_RE.exec(rawLine);

      if (optMatch) {
        inOptions = true;
        options[optMatch[1].toUpperCase()] = optMatch[2].trim();
      } else if (ansMatch) {
        answerLetter = ansMatch[1].toUpperCase();
      } else if (catMatch) {
        category = catMatch[1].trim() || null;
      } else if (expMatch) {
        explanation = expMatch[1].trim();
      } else if (timeMatch) {
        const n = Number(timeMatch[1]);
        if (Number.isFinite(n) && n > 0) timeLimitSeconds = n;
      } else if (!inOptions) {
        // Not yet reached the option lines — still part of a multi-line question.
        questionLines.push(line);
      }
      // Any other stray line (after options, matching nothing) is ignored
      // rather than erroring — paste-from-Word input is inherently noisy.
    }

    const question = questionLines.join(" ").replace(/\s+/g, " ").trim();
    const optionList = ["A", "B", "C", "D"].map((l) => options[l]);
    const correctIndex = answerLetter ? letterToIndex(answerLetter) : -1;

    if (!question) errors.push({ row: blockNumber, message: "Question text is required." });
    const foundCount = optionList.filter((o) => o).length;
    if (foundCount < 4) {
      errors.push({ row: blockNumber, message: `Found ${foundCount} of 4 options (A-D).` });
    }
    if (correctIndex === -1) {
      errors.push({
        row: blockNumber,
        message: answerLetter ? `Answer letter "${answerLetter}" is invalid.` : 'No "Answer: X" line found.'
      });
    }

    return {
      category,
      question,
      image: null,
      options: optionList,
      correctIndex,
      explanation,
      timeLimitSeconds
    };
  }

  function parseQuizPastedText(text) {
    const blocks = splitIntoBlocks(text);
    if (blocks.length === 0) {
      return {
        ok: false,
        questions: [],
        errors: [{ row: null, message: 'No numbered questions found. Start each question with "1.", "2.", etc.' }]
      };
    }
    const errors = [];
    const questions = blocks.map((b, i) => parseBlock(b, i + 1, errors));
    return { ok: errors.length === 0, questions, errors };
  }

  // ---------- template generation (shares HEADERS with the parser above) ----------

  function generateTemplateWorkbook() {
    const headerRow = [
      HEADERS.question,
      HEADERS.optionA,
      HEADERS.optionB,
      HEADERS.optionC,
      HEADERS.optionD,
      HEADERS.correctAnswer,
      HEADERS.category,
      HEADERS.explanation,
      HEADERS.timeLimit
    ];
    const exampleRow = [
      "What is the capital of France?",
      "London",
      "Paris",
      "Berlin",
      "Madrid",
      "B",
      "Geography",
      "Paris has been the capital of France since 987 AD.",
      20
    ];
    // The marker sits in its own row above the header, so the header-row
    // scan in questionsFromGrid() skips right past it — visible to the
    // teacher, invisible to parsing.
    const sheet = XLSX.utils.aoa_to_sheet([[TEMPLATE_MARKER], headerRow, exampleRow]);
    const workbook = XLSX.utils.book_new();
    // Sheet tab name is the second, always-visible place the marker appears.
    XLSX.utils.book_append_sheet(workbook, sheet, TEMPLATE_MARKER);
    return workbook;
  }

  function downloadTemplate(filename) {
    const workbook = generateTemplateWorkbook();
    XLSX.writeFile(workbook, filename || "universalquiz-template.xlsx");
  }

  return {
    HEADERS,
    TEMPLATE_MARKER,
    importers: {
      xlsx: parseQuizXlsx,
      pasted: parseQuizPastedText,
      csv: parseQuizCsv,
      json: parseQuizJson
    },
    generateTemplateWorkbook,
    downloadTemplate
  };
})();
