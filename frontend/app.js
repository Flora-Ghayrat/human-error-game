"use strict";

/* =========================================================
   HUMAN ERROR
   Frontend game controller

   Main responsibilities:
   1. Canvas drawing
   2. Drawing tools
   3. Undo and clear
   4. Secret-word display
   5. Round timer
   6. Communication with Python backend
   7. Result presentation
   8. AI memory presentation
========================================================= */


/* =========================================================
   1. Small DOM helper functions
========================================================= */

/**
 * Finds one HTML element.
 *
 * Example:
 * $("#start-round-button")
 */
function $(selector) {
  return document.querySelector(selector);
}


/**
 * Finds multiple HTML elements and converts the result
 * into a normal JavaScript array.
 *
 * Example:
 * $$(".color-button")
 */
function $$(selector) {
  return Array.from(document.querySelectorAll(selector));
}


/* =========================================================
   2. Get HTML elements
========================================================= */

/* Header */

const soundButton = $("#sound-button");


/* Round information */

const phaseLabel = $("#phase-label");
const roundLabel = $("#round-label");


/* Secret word */

const secretWordElement = $("#secret-word");
const revealWordButton = $("#reveal-word-button");
const wordInput = $("#word-input");


/* Timer */

const timerElement = $("#timer");
const timerSecondsElement = $("#timer-seconds");
const timeUpScreen = $("#time-up-screen");


/* Canvas */

const canvas = $("#drawing-canvas");
const canvasContainer = $("#canvas-container");
const context = canvas.getContext("2d", {
  willReadFrequently: true
});


/* Drawing tools */

const colorButtons = $$(".color-button");
const sizeButtons = $$(".size-button");

const eraserButton = $("#eraser-button");
const undoButton = $("#undo-button");
const clearButton = $("#clear-button");


/* Game buttons */

const startRoundButton = $("#start-round-button");
const finishRoundButton = $("#finish-round-button");


/* Answer form */

const humanAnswerInput = $("#human-answer-input");
const drawingCluesInput = $("#drawing-clues-input");


/* AI memory */

const memoryPercentElement = $("#memory-percent");
const memoryMeter = $(".memory-meter");
const memoryMeterFill = $("#memory-meter-fill");

const aiMemoryMessage = $("#ai-memory-message");
const encounterCountElement = $("#encounter-count");
const learnedClueCountElement = $("#learned-clue-count");


/* Result panel */

const resultPanel = $("#result-panel");
const resultMark = $("#result-mark");
const resultTitle = $("#result-title");
const resultDescription = $("#result-description");

const resultHumanAnswer = $("#result-human-answer");
const resultAiAnswer = $("#result-ai-answer");
const resultAiConfidence = $("#result-ai-confidence");
const resultLearnedClues = $("#result-learned-clues");


/* =========================================================
   3. Frontend game state
========================================================= */

/**
 * All temporary frontend state is stored here.
 *
 * The Python backend remains responsible for:
 * - Official game state
 * - AI prediction
 * - AI learning
 * - Winner calculation
 */
const gameState = {
  phase: "lobby",

  roundNumber: 0,

  secretWord: "",

  secretWordVisible: false,

  drawing: false,

  hasDrawing: false,

  roundActive: false,

  secondsRemaining: 60,

  timerId: null,

  selectedColor: "#241331",

  selectedBrushSize: 11,

  eraserActive: false,

  soundEnabled: false,

  encounterCount: 0,

  canvasHistory: []
};


/* Maximum number of undo steps */

const MAX_HISTORY_LENGTH = 30;


/* =========================================================
   4. Optional sound system
========================================================= */

/**
 * This prototype creates simple sounds with the browser's
 * Web Audio API.
 *
 * It does not need MP3 or WAV files.
 */

let audioContext = null;


/**
 * Creates or resumes the browser audio system.
 *
 * Browsers do not allow audio before a user interaction,
 * so this function is called after a button is clicked.
 */
function prepareAudio() {
  if (!gameState.soundEnabled) {
    return;
  }

  const AudioContextClass =
    window.AudioContext ||
    window.webkitAudioContext;

  if (!AudioContextClass) {
    return;
  }

  if (!audioContext) {
    audioContext = new AudioContextClass();
  }

  if (audioContext.state === "suspended") {
    audioContext.resume();
  }
}


/**
 * Plays a short electronic sound.
 *
 * @param {number} frequency Sound frequency
 * @param {number} duration Sound duration in seconds
 * @param {string} wave Oscillator waveform
 */
function playTone(
  frequency = 440,
  duration = 0.08,
  wave = "square"
) {
  if (!gameState.soundEnabled) {
    return;
  }

  prepareAudio();

  if (!audioContext) {
    return;
  }

  const oscillator = audioContext.createOscillator();
  const gain = audioContext.createGain();

  oscillator.type = wave;
  oscillator.frequency.value = frequency;

  gain.gain.setValueAtTime(
    0.0001,
    audioContext.currentTime
  );

  gain.gain.exponentialRampToValueAtTime(
    0.08,
    audioContext.currentTime + 0.01
  );

  gain.gain.exponentialRampToValueAtTime(
    0.0001,
    audioContext.currentTime + duration
  );

  oscillator.connect(gain);
  gain.connect(audioContext.destination);

  oscillator.start();
  oscillator.stop(
    audioContext.currentTime + duration
  );
}


/**
 * Plays a two-note success sound.
 */
function playSuccessSound() {
  playTone(520, 0.12, "square");

  window.setTimeout(() => {
    playTone(760, 0.16, "square");
  }, 110);
}


/**
 * Plays a descending AI-win sound.
 */
function playFailureSound() {
  playTone(320, 0.14, "sawtooth");

  window.setTimeout(() => {
    playTone(180, 0.2, "sawtooth");
  }, 130);
}


/* Sound button */

soundButton.addEventListener("click", () => {
  gameState.soundEnabled =
    !gameState.soundEnabled;

  soundButton.setAttribute(
    "aria-pressed",
    String(gameState.soundEnabled)
  );

  soundButton.textContent =
    gameState.soundEnabled ? "♫" : "♪";

  if (gameState.soundEnabled) {
    prepareAudio();
    playTone(620, 0.1, "square");
  }
});


/* =========================================================
   5. Canvas coordinate conversion
========================================================= */

/**
 * Canvas internally uses 1000 × 650 pixels.
 *
 * CSS changes its visible size, especially on phones.
 * This function converts screen coordinates into the
 * canvas's internal coordinates.
 */
function getCanvasPoint(event) {
  const rectangle =
    canvas.getBoundingClientRect();

  const scaleX =
    canvas.width / rectangle.width;

  const scaleY =
    canvas.height / rectangle.height;

  return {
    x:
      (event.clientX - rectangle.left) *
      scaleX,

    y:
      (event.clientY - rectangle.top) *
      scaleY
  };
}


/* =========================================================
   6. Canvas brush configuration
========================================================= */

/**
 * Applies the current brush settings to Canvas.
 */
function configureBrush() {
  context.lineCap = "round";
  context.lineJoin = "round";

  context.lineWidth =
    gameState.selectedBrushSize;

  if (gameState.eraserActive) {
    /*
      destination-out removes existing pixels.
      It creates the eraser effect.
    */

    context.globalCompositeOperation =
      "destination-out";
  } else {
    context.globalCompositeOperation =
      "source-over";

    context.strokeStyle =
      gameState.selectedColor;
  }
}


/* =========================================================
   7. Canvas history and undo
========================================================= */

/**
 * Saves the current image before modifying it.
 */
function saveCanvasHistory() {
  const imageData = context.getImageData(
    0,
    0,
    canvas.width,
    canvas.height
  );

  gameState.canvasHistory.push(imageData);

  /*
    Keep the newest 30 history records so memory usage
    does not grow forever.
  */

  if (
    gameState.canvasHistory.length >
    MAX_HISTORY_LENGTH
  ) {
    gameState.canvasHistory.shift();
  }

  updateUndoButton();
}


/**
 * Enables or disables the undo button.
 */
function updateUndoButton() {
  undoButton.disabled =
    gameState.canvasHistory.length === 0;
}


/**
 * Restores the previous Canvas image.
 */
function undoCanvas() {
  const previousImage =
    gameState.canvasHistory.pop();

  if (!previousImage) {
    return;
  }

  context.clearRect(
    0,
    0,
    canvas.width,
    canvas.height
  );

  context.putImageData(
    previousImage,
    0,
    0
  );

  /*
    If there is no older history, the restored state
    is usually the original blank Canvas.
  */

  if (gameState.canvasHistory.length === 0) {
    gameState.hasDrawing = false;

    canvasContainer.classList.remove(
      "has-drawing"
    );
  }

  updateUndoButton();
}


/**
 * Clears the whole Canvas.
 *
 * @param {boolean} saveHistory
 * Whether the current state should be undoable.
 */
function clearCanvas(saveHistory = true) {
  if (
    saveHistory &&
    gameState.hasDrawing
  ) {
    saveCanvasHistory();
  }

  context.clearRect(
    0,
    0,
    canvas.width,
    canvas.height
  );

  gameState.hasDrawing = false;

  canvasContainer.classList.remove(
    "has-drawing"
  );
}


/* =========================================================
   8. Canvas drawing
========================================================= */

/**
 * Starts one drawing stroke.
 */
function startDrawing(event) {
  /*
    Drawing is only available during the drawing phase.
  */

  if (!gameState.roundActive) {
    return;
  }

  event.preventDefault();

  saveCanvasHistory();
  configureBrush();

  const point = getCanvasPoint(event);

  gameState.drawing = true;
  gameState.hasDrawing = true;

  context.beginPath();

  context.moveTo(
    point.x,
    point.y
  );

  /*
    A tiny first line makes a single tap visible
    as a small dot.
  */

  context.lineTo(
    point.x + 0.01,
    point.y + 0.01
  );

  context.stroke();

  canvasContainer.classList.add(
    "has-drawing"
  );

  /*
    Keep receiving pointer events even if the user's
    finger temporarily leaves the Canvas.
  */

  canvas.setPointerCapture(
    event.pointerId
  );
}


/**
 * Continues the current drawing stroke.
 */
function continueDrawing(event) {
  if (
    !gameState.drawing ||
    !gameState.roundActive
  ) {
    return;
  }

  event.preventDefault();

  const point = getCanvasPoint(event);

  context.lineTo(
    point.x,
    point.y
  );

  context.stroke();
}


/**
 * Finishes the current drawing stroke.
 */
function stopDrawing() {
  if (!gameState.drawing) {
    return;
  }

  gameState.drawing = false;

  context.closePath();
}


/* Pointer events support both mouse and touch */

canvas.addEventListener(
  "pointerdown",
  startDrawing
);

canvas.addEventListener(
  "pointermove",
  continueDrawing
);

canvas.addEventListener(
  "pointerup",
  stopDrawing
);

canvas.addEventListener(
  "pointercancel",
  stopDrawing
);

canvas.addEventListener(
  "pointerleave",
  stopDrawing
);


/* =========================================================
   9. Color selection
========================================================= */

colorButtons.forEach((button) => {
  button.addEventListener("click", () => {
    gameState.selectedColor =
      button.dataset.color;

    /*
      Selecting a color automatically leaves
      eraser mode.
    */

    gameState.eraserActive = false;

    eraserButton.classList.remove(
      "active"
    );

    eraserButton.setAttribute(
      "aria-pressed",
      "false"
    );

    colorButtons.forEach((item) => {
      const selected = item === button;

      item.classList.toggle(
        "active",
        selected
      );

      item.setAttribute(
        "aria-pressed",
        String(selected)
      );
    });

    playTone(480, 0.04, "square");
  });
});


/* =========================================================
   10. Brush-size selection
========================================================= */

sizeButtons.forEach((button) => {
  button.addEventListener("click", () => {
    gameState.selectedBrushSize =
      Number(button.dataset.size);

    sizeButtons.forEach((item) => {
      const selected = item === button;

      item.classList.toggle(
        "active",
        selected
      );

      item.setAttribute(
        "aria-pressed",
        String(selected)
      );
    });

    playTone(420, 0.04, "square");
  });
});


/* =========================================================
   11. Eraser, undo and clear
========================================================= */

eraserButton.addEventListener("click", () => {
  gameState.eraserActive =
    !gameState.eraserActive;

  eraserButton.classList.toggle(
    "active",
    gameState.eraserActive
  );

  eraserButton.setAttribute(
    "aria-pressed",
    String(gameState.eraserActive)
  );

  playTone(
    gameState.eraserActive ? 350 : 450,
    0.05,
    "square"
  );
});


undoButton.addEventListener("click", () => {
  undoCanvas();
  playTone(300, 0.06, "square");
});


clearButton.addEventListener("click", () => {
  if (!gameState.hasDrawing) {
    return;
  }

  clearCanvas(true);
  playTone(220, 0.08, "sawtooth");
});


/* =========================================================
   12. Secret-word display
========================================================= */

/**
 * Updates the secret-word UI.
 */
function updateSecretWordDisplay() {
  if (gameState.secretWordVisible) {
    secretWordElement.textContent =
      gameState.secretWord;

    revealWordButton.textContent =
      "隠す";
  } else {
    secretWordElement.textContent =
      "？？？？";

    revealWordButton.textContent =
      "見る";
  }

  revealWordButton.setAttribute(
    "aria-pressed",
    String(gameState.secretWordVisible)
  );
}


revealWordButton.addEventListener(
  "click",
  () => {
    if (!gameState.secretWord) {
      return;
    }

    gameState.secretWordVisible =
      !gameState.secretWordVisible;

    updateSecretWordDisplay();

    playTone(560, 0.05, "square");
  }
);


/* =========================================================
   13. Timer
========================================================= */

/**
 * Updates the timer number and accessibility information.
 */
function updateTimerDisplay() {
  timerSecondsElement.textContent =
    String(
      gameState.secondsRemaining
    ).padStart(2, "0");

  timerElement.setAttribute(
    "aria-label",
    `残り時間${gameState.secondsRemaining}秒`
  );

  const warning =
    gameState.secondsRemaining <= 10;

  timerElement.classList.toggle(
    "is-warning",
    warning
  );
}


/**
 * Stops the current timer.
 */
function stopTimer() {
  if (gameState.timerId !== null) {
    window.clearInterval(
      gameState.timerId
    );

    gameState.timerId = null;
  }
}


/**
 * Handles the moment when the timer reaches zero.
 */
function handleTimeUp() {
  stopTimer();

  gameState.roundActive = false;
  gameState.phase = "answering";

  phaseLabel.textContent = "回答中";

  timeUpScreen.hidden = false;

  finishRoundButton.disabled = false;

  playFailureSound();
}


/**
 * Starts a new 60-second timer.
 */
function startTimer() {
  stopTimer();

  gameState.secondsRemaining = 60;

  updateTimerDisplay();

  gameState.timerId =
    window.setInterval(() => {
      gameState.secondsRemaining -= 1;

      updateTimerDisplay();

      /*
        Play a warning sound during the final ten seconds.
      */

      if (
        gameState.secondsRemaining <= 10 &&
        gameState.secondsRemaining > 0
      ) {
        playTone(
          gameState.secondsRemaining <= 3
            ? 760
            : 520,
          0.05,
          "square"
        );
      }

      if (
        gameState.secondsRemaining <= 0
      ) {
        gameState.secondsRemaining = 0;

        updateTimerDisplay();
        handleTimeUp();
      }
    }, 1000);
}


/* =========================================================
   14. Python API communication
========================================================= */

/**
 * Sends JSON to the Python backend.
 *
 * @param {string} path API address
 * @param {object} body Data sent to Python
 */
async function sendApiRequest(path, body) {
  const response = await fetch(path, {
    method: "POST",

    headers: {
      "Content-Type": "application/json"
    },

    body: JSON.stringify(body)
  });

  let data;

  try {
    data = await response.json();
  } catch {
    throw new Error(
      "サーバーから正しいデータが返されませんでした。"
    );
  }

  if (!response.ok) {
    throw new Error(
      data.detail ||
      "サーバーとの通信に失敗しました。"
    );
  }

  return data;
}


/**
 * Loads the current room state.
 */
async function loadGameState() {
  const response =
    await fetch("/api/state");

  if (!response.ok) {
    throw new Error(
      "ゲームの状態を取得できませんでした。"
    );
  }

  return response.json();
}


/* =========================================================
   15. General UI functions
========================================================= */

/**
 * Updates the displayed round number.
 */
function updateRoundLabel(roundNumber) {
  gameState.roundNumber = roundNumber;

  roundLabel.textContent =
    `ROUND ${String(roundNumber).padStart(2, "0")}`;
}


/**
 * Sets the current phase.
 */
function setPhase(phase, label) {
  gameState.phase = phase;
  phaseLabel.textContent = label;
}


/**
 * Shows a frontend or server error.
 */
function showError(message) {
  resultPanel.hidden = false;

  resultPanel.classList.add(
    "ai-winner"
  );

  resultMark.textContent = "!";

  resultTitle.textContent =
    "通信エラー";

  resultDescription.textContent =
    message;

  resultHumanAnswer.textContent =
    "—";

  resultAiAnswer.textContent =
    "—";

  resultAiConfidence.textContent =
    "";

  resultLearnedClues.textContent =
    "—";

  resultPanel.scrollIntoView({
    behavior: "smooth",
    block: "center"
  });
}


/* =========================================================
   16. Start a new round
========================================================= */

/**
 * Resets the UI for a new round.
 */
function resetRoundInterface() {
  stopTimer();

  gameState.canvasHistory = [];
  gameState.hasDrawing = false;
  gameState.drawing = false;
  gameState.secretWordVisible = false;

  context.clearRect(
    0,
    0,
    canvas.width,
    canvas.height
  );

  canvasContainer.classList.remove(
    "has-drawing"
  );

  timeUpScreen.hidden = true;
  resultPanel.hidden = true;

  resultPanel.classList.remove(
    "ai-winner"
  );

  humanAnswerInput.value = "";
  drawingCluesInput.value = "";

  updateSecretWordDisplay();
  updateUndoButton();
}


/**
 * Starts a round after contacting Python.
 */
async function startNewRound() {
  const selectedWord =
    wordInput.value.trim();

  if (!selectedWord) {
    wordInput.focus();
    return;
  }

  startRoundButton.disabled = true;

  try {
    const serverState =
      await sendApiRequest(
        "/api/round/start",
        {
          word: selectedWord
        }
      );

    gameState.secretWord =
      selectedWord;

    resetRoundInterface();

    gameState.roundActive = true;

    setPhase(
      "drawing",
      "描画中"
    );

    updateRoundLabel(
      serverState.round_number
    );

    finishRoundButton.disabled =
      false;

    startTimer();

    canvas.focus();

    playTone(660, 0.1, "square");
  } catch (error) {
    showError(error.message);
  } finally {
    startRoundButton.disabled =
      false;
  }
}


startRoundButton.addEventListener(
  "click",
  startNewRound
);


/*
  Pressing Enter in the word input also starts the round.
*/

wordInput.addEventListener(
  "keydown",
  (event) => {
    if (event.key === "Enter") {
      startNewRound();
    }
  }
);


/* =========================================================
   17. Finish the round
========================================================= */

/**
 * Converts:
 *
 * 箱、ひげ、魚
 *
 * or:
 *
 * 箱, ひげ, 魚
 *
 * into:
 *
 * ["箱", "ひげ", "魚"]
 */
function parseDrawingClues(text) {
  return text
    .split(/[、,]/)
    .map((clue) => clue.trim())
    .filter((clue) => clue.length > 0);
}


/**
 * Sends the human answer and clues to Python.
 */
async function finishCurrentRound() {
  const humanAnswer =
    humanAnswerInput.value.trim();

  if (!humanAnswer) {
    humanAnswerInput.focus();
    return;
  }

  const clues = parseDrawingClues(
    drawingCluesInput.value
  );

  finishRoundButton.disabled = true;

  stopTimer();

  gameState.roundActive = false;

  setPhase(
    "judging",
    "AI判定中"
  );

  try {
    const result =
      await sendApiRequest(
        "/api/round/finish",
        {
          human_guesses: [
            humanAnswer
          ],

          clues
        }
      );

    gameState.encounterCount += 1;

    showRoundResult(
      result,
      humanAnswer
    );

    setPhase(
      "result",
      "結果発表"
    );
  } catch (error) {
    showError(error.message);

    /*
      Allow another submission after a temporary error.
    */

    finishRoundButton.disabled =
      false;

    setPhase(
      "answering",
      "回答中"
    );
  }
}


finishRoundButton.addEventListener(
  "click",
  finishCurrentRound
);


/*
  Pressing Enter in the answer field submits the answer.
*/

humanAnswerInput.addEventListener(
  "keydown",
  (event) => {
    if (
      event.key === "Enter" &&
      !finishRoundButton.disabled
    ) {
      finishCurrentRound();
    }
  }
);


/* =========================================================
   18. Result presentation
========================================================= */

/**
 * Shows the complete result from Python.
 */
function showRoundResult(
  result,
  humanAnswer
) {
  const humansWon =
    result.winner === "humans";

  const aiWon =
    result.winner === "ai";

  const nobodyWon =
    result.winner === "nobody";

  const confidencePercent =
    Math.round(
      result.ai.confidence * 100
    );

  /*
    The UI always shows at least 12% so the meter
    does not look completely empty.
  */

  const memoryPercent =
    Math.max(
      12,
      confidencePercent
    );

  resultPanel.hidden = false;

  resultPanel.classList.toggle(
    "ai-winner",
    !humansWon
  );


  /* -----------------------------------------
     Human victory
  ----------------------------------------- */

  if (humansWon) {
    resultMark.textContent = "○";

    resultTitle.textContent =
      "人間の勝利！";

    resultDescription.textContent =
      "その表現は、まだAIの記憶の外側にあります。";

    playSuccessSound();
  }


  /* -----------------------------------------
     AI victory
  ----------------------------------------- */

  if (aiWon) {
    resultMark.textContent = "×";

    resultTitle.textContent =
      "AIに見破られた！";

    resultDescription.textContent =
      "同じ表現は次から通用しません。新しい描き方を考えよう。";

    playFailureSound();
  }


  /* -----------------------------------------
     No winner
  ----------------------------------------- */

  if (nobodyWon) {
    resultMark.textContent = "?";

    resultTitle.textContent =
      "まだ誰にも伝わらない";

    resultDescription.textContent =
      "もう少し、人間だけが気づける手がかりを加えよう。";

    playTone(260, 0.15, "triangle");
  }


  /* Human and AI answers */

  resultHumanAnswer.textContent =
    humanAnswer || "—";

  resultAiAnswer.textContent =
    result.ai.guess || "わからない";

  resultAiConfidence.textContent =
    `自信 ${confidencePercent}%`;


  /* Learned clues */

  if (
    Array.isArray(
      result.learned_clues
    ) &&
    result.learned_clues.length > 0
  ) {
    resultLearnedClues.textContent =
      result.learned_clues.join("・");
  } else {
    resultLearnedClues.textContent =
      "なし";
  }


  /* Update AI memory */

  updateAiMemory({
    word: result.word,
    confidencePercent,
    memoryPercent,
    learnedClues:
      result.learned_clues || []
  });


  /* Move result panel into view */

  resultPanel.scrollIntoView({
    behavior: "smooth",
    block: "center"
  });
}


/* =========================================================
   19. AI memory presentation
========================================================= */

/**
 * Updates the AI memory card.
 */
function updateAiMemory({
  word,
  confidencePercent,
  memoryPercent,
  learnedClues
}) {
  memoryPercentElement.textContent =
    `${memoryPercent}%`;

  memoryMeterFill.style.width =
    `${memoryPercent}%`;

  memoryMeter.setAttribute(
    "aria-valuenow",
    String(memoryPercent)
  );

  encounterCountElement.textContent =
    String(
      gameState.encounterCount
    ).padStart(2, "0");

  learnedClueCountElement.textContent =
    String(
      learnedClues.length
    ).padStart(2, "0");


  if (confidencePercent >= 80) {
    aiMemoryMessage.textContent =
      `AIは「${word}」の描き方をかなり理解しています。大きく表現を変える必要があります。`;

    return;
  }


  if (confidencePercent >= 50) {
    aiMemoryMessage.textContent =
      `AIは「${word}」の表現パターンを覚え始めています。`;

    return;
  }


  aiMemoryMessage.textContent =
    "この描き方は、まだAIの記憶にありません。次は学習されるかもしれません。";
}


/* =========================================================
   20. Initial application setup
========================================================= */

/**
 * Prepares the first screen.
 */
async function initializeApplication() {
  configureBrush();

  updateUndoButton();
  updateTimerDisplay();
  updateSecretWordDisplay();

  finishRoundButton.disabled = true;

  try {
    const serverState =
      await loadGameState();

    updateRoundLabel(
      serverState.round_number || 0
    );

    /*
      The prototype normally begins in the lobby.
    */

    if (
      serverState.phase === "drawing"
    ) {
      setPhase(
        "drawing",
        "描画中"
      );
    } else if (
      serverState.phase === "result"
    ) {
      setPhase(
        "result",
        "結果発表"
      );
    } else {
      setPhase(
        "lobby",
        "準備中"
      );
    }
  } catch {
    /*
      The page can still show its design if the Python
      server is unavailable, but game API buttons will
      not complete successfully.
    */

    setPhase(
      "offline",
      "OFFLINE"
    );
  }
}


/* Start after the HTML document has loaded */

initializeApplication();