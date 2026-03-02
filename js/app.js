document.addEventListener("DOMContentLoaded", () => {
    // === DOM Elements ===
    const newPlayerInput = document.getElementById("new-player-name");
    const addPlayerBtn = document.getElementById("add-player-btn");
    const resetScoresBtn = document.getElementById("reset-scores-btn");
    const clearPlayersBtn = document.getElementById("clear-players-btn");
    const playerListEl = document.getElementById("player-list");

    // Modal Elements
    const cameraModal = document.getElementById("camera-modal");
    const closeModalBtn = document.getElementById("close-modal-btn");
    const currentPlayerNameEl = document.getElementById("current-player-name");
    const webcamEl = document.getElementById("webcam");
    const overlayCanvas = document.getElementById("overlay-canvas");
    const captureBtn = document.getElementById("capture-btn");
    const retakeBtn = document.getElementById("retake-btn");
    const acceptScoreBtn = document.getElementById("accept-score-btn");
    const calculatedScoreEl = document.getElementById("calculated-score");
    const statusMessageEl = document.getElementById("status-message");

    // Log Panel Elements
    const logToggleBtn = document.getElementById("log-toggle-btn");
    const logPanel = document.getElementById("log-panel");
    const logClearBtn = document.getElementById("log-clear-btn");

    // Detection Mode Toggle
    const twoPassToggle = document.getElementById("two-pass-toggle");
    const modeLabelSingle = document.getElementById("mode-label-single");
    const modeLabelTwopass = document.getElementById("mode-label-twopass");

    // === Game State ===
    let players = JSON.parse(localStorage.getItem('dominoPlayers')) || [];
    let currentPlayerIdForScore = null;
    let currentVideoStream = null;
    let currentScore = 0;

    // Save to local storage
    const savePlayers = () => {
        localStorage.setItem('dominoPlayers', JSON.stringify(players));
    };

    // === Log Panel Toggle ===
    if (logToggleBtn && logPanel) {
        logToggleBtn.addEventListener("click", () => {
            logPanel.classList.toggle("collapsed");
            logToggleBtn.textContent = logPanel.classList.contains("collapsed")
                ? "Show Logs ▲" : "Hide Logs ▼";
        });
    }
    if (logClearBtn) {
        logClearBtn.addEventListener("click", () => Logger.clear());
    }

    Logger.info('App initialized.');

    // === Detection Mode Toggle ===
    const updateModeLabels = () => {
        if (twoPassToggle.checked) {
            modeLabelSingle.classList.remove('active');
            modeLabelTwopass.classList.add('active');
        } else {
            modeLabelSingle.classList.add('active');
            modeLabelTwopass.classList.remove('active');
        }
    };
    updateModeLabels(); // Set initial state
    twoPassToggle.addEventListener('change', () => {
        updateModeLabels();
        Logger.info(`Detection mode: ${twoPassToggle.checked ? 'Two-Pass Crop' : 'Single-Pass'}`);
    });

    // === Player Management ===
    const renderPlayers = () => {
        playerListEl.innerHTML = "";

        // Sort players by score descending
        const sortedPlayers = [...players].sort((a, b) => a.score - b.score);

        if (sortedPlayers.length === 0) {
            playerListEl.innerHTML = "<li style='justify-content:center; color:#666'>No players added yet.</li>";
            return;
        }

        sortedPlayers.forEach((player) => {
            const li = document.createElement("li");

            const infoDiv = document.createElement("div");
            infoDiv.className = "player-info";
            infoDiv.textContent = `${player.name} - Score: ${player.score}`;

            const actionsDiv = document.createElement("div");
            actionsDiv.className = "player-actions";

            const captureBtn = document.createElement("button");
            captureBtn.className = "capture-btn";
            captureBtn.textContent = "Capture Score";
            captureBtn.onclick = () => openCameraModal(player.id);

            const removeBtn = document.createElement("button");
            removeBtn.className = "remove-btn";
            removeBtn.innerHTML = "&times;";
            removeBtn.title = "Remove Player";
            removeBtn.onclick = () => removePlayer(player.id);

            actionsDiv.appendChild(captureBtn);
            actionsDiv.appendChild(removeBtn);

            li.appendChild(infoDiv);
            li.appendChild(actionsDiv);
            playerListEl.appendChild(li);
        });
    };

    const addPlayer = () => {
        const name = newPlayerInput.value.trim();
        if (name) {
            players.push({ id: Date.now().toString(), name, score: 0 });
            newPlayerInput.value = "";
            savePlayers();
            renderPlayers();
            Logger.info(`Player added: "${name}"`);
        }
    };

    const removePlayer = (id) => {
        players = players.filter(p => p.id !== id);
        savePlayers();
        renderPlayers();
    };

    const resetScores = () => {
        players.forEach(p => p.score = 0);
        savePlayers();
        renderPlayers();
        Logger.info('All scores reset.');
    };

    const clearPlayers = () => {
        if (confirm("Are you sure you want to clear all players?")) {
            players = [];
            savePlayers();
            renderPlayers();
            Logger.info('All players cleared.');
        }
    };

    // Event Listeners for Game Setup
    addPlayerBtn.addEventListener("click", addPlayer);
    newPlayerInput.addEventListener("keypress", (e) => {
        if (e.key === "Enter") addPlayer();
    });
    resetScoresBtn.addEventListener("click", resetScores);
    clearPlayersBtn.addEventListener("click", clearPlayers);


    // === Camera and Modal Logic ===
    const openCameraModal = async (playerId) => {
        const player = players.find(p => p.id === playerId);
        if (!player) return;

        Logger.group('Camera Modal');
        Logger.info(`Opening camera for player: "${player.name}"`);

        currentPlayerIdForScore = playerId;
        currentPlayerNameEl.textContent = player.name;

        // Reset Modal State
        webcamEl.classList.remove("hidden");
        overlayCanvas.classList.add("hidden");
        captureBtn.classList.remove("hidden");
        retakeBtn.classList.add("hidden");
        acceptScoreBtn.classList.add("hidden");
        statusMessageEl.textContent = "Starting camera...";
        currentScore = 0;

        cameraModal.classList.add("active");

        try {
            currentVideoStream = await navigator.mediaDevices.getUserMedia({
                video: { facingMode: "environment" }
            });
            webcamEl.srcObject = currentVideoStream;

            // Log video track details once metadata is loaded
            webcamEl.addEventListener('loadedmetadata', () => {
                const track = currentVideoStream.getVideoTracks()[0];
                const settings = track.getSettings();
                Logger.table('Camera Stream', {
                    label: track.label,
                    width: settings.width,
                    height: settings.height,
                    frameRate: settings.frameRate,
                    facingMode: settings.facingMode || 'N/A',
                    videoWidth: webcamEl.videoWidth,
                    videoHeight: webcamEl.videoHeight,
                });
            }, { once: true });

            Logger.info('Camera stream started.');
            statusMessageEl.textContent = "Camera ready. Position dominos in view.";
        } catch (err) {
            Logger.error(`Camera access error: ${err.message}`);
            statusMessageEl.textContent = "Error accessing camera. Please ensure permissions are granted.";
        }
    };

    const closeCameraModal = () => {
        cameraModal.classList.remove("active");
        if (currentVideoStream) {
            currentVideoStream.getTracks().forEach(track => track.stop());
            currentVideoStream = null;
        }
        currentPlayerIdForScore = null;
        Logger.info('Camera modal closed.');
        Logger.groupEnd();
    };

    closeModalBtn.addEventListener("click", closeCameraModal);

    // Close modal if user clicks outside content
    cameraModal.addEventListener("click", (e) => {
        if (e.target === cameraModal) {
            closeCameraModal();
        }
    });

    const captureAndScore = async () => {
        if (!currentVideoStream) {
            Logger.warn('captureAndScore called but no video stream active.');
            return;
        }

        // Ensure vision processing script is loaded and ready
        if (typeof window.processImageForScore !== 'function') {
            Logger.error('window.processImageForScore is not a function — vision.js may not be loaded.');
            statusMessageEl.textContent = "Vision model is not loaded yet.";
            return;
        }

        Logger.group('Capture & Score');
        statusMessageEl.textContent = "Processing image...";
        captureBtn.classList.add("hidden");

        // Match canvas size to actual video dimensions
        overlayCanvas.width = webcamEl.videoWidth;
        overlayCanvas.height = webcamEl.videoHeight;

        Logger.table('Capture Dimensions', {
            videoWidth: webcamEl.videoWidth,
            videoHeight: webcamEl.videoHeight,
            canvasWidth: overlayCanvas.width,
            canvasHeight: overlayCanvas.height,
        });

        if (overlayCanvas.width === 0 || overlayCanvas.height === 0) {
            Logger.error('Canvas dimensions are 0 × 0 — video may not be ready yet!');
            statusMessageEl.textContent = "Error: camera not ready. Try again.";
            captureBtn.classList.remove("hidden");
            Logger.groupEnd();
            return;
        }

        const ctx = overlayCanvas.getContext('2d');
        ctx.drawImage(webcamEl, 0, 0, overlayCanvas.width, overlayCanvas.height);

        // Pause webcam visually
        webcamEl.classList.add("hidden");
        overlayCanvas.classList.remove("hidden");

        // Use vision.js to run ONNX model and get annotations
        try {
            Logger.info('Calling processImageForScore...');
            const useTwoPass = twoPassToggle.checked;
            const processFn = useTwoPass
                ? window.processImageForScoreTwoPass
                : window.processImageForScore;
            Logger.info(`Mode: ${useTwoPass ? 'Two-Pass Crop' : 'Single-Pass'}`);
            const { score, canvasElement } = await processFn(overlayCanvas);
            currentScore = score;
            calculatedScoreEl.textContent = currentScore;

            // Show accept/retake buttons
            retakeBtn.classList.remove("hidden");
            acceptScoreBtn.classList.remove("hidden");
            statusMessageEl.textContent = `Detected score: ${currentScore}. Accept or Retake?`;
            Logger.info(`Score returned to UI: ${currentScore}`);
        } catch (error) {
            Logger.error(`Scoring error: ${error.message}`);
            Logger.error(`Stack: ${error.stack}`);
            statusMessageEl.textContent = "Error processing image. Try again.";
            retakeBtn.classList.remove("hidden");
        }
        Logger.groupEnd();
    };

    const retakeImage = () => {
        overlayCanvas.classList.add("hidden");
        webcamEl.classList.remove("hidden");
        captureBtn.classList.remove("hidden");
        retakeBtn.classList.add("hidden");
        acceptScoreBtn.classList.add("hidden");
        statusMessageEl.textContent = "Camera ready. Position dominos in view.";
        Logger.info('Retaking image.');
    };

    const acceptScore = () => {
        if (currentPlayerIdForScore) {
            const player = players.find(p => p.id === currentPlayerIdForScore);
            if (player) {
                player.score += currentScore;
                savePlayers();
                renderPlayers();
                Logger.info(`Accepted score ${currentScore} for "${player.name}" (total: ${player.score})`);
            }
        }
        closeCameraModal();
    };

    captureBtn.addEventListener("click", captureAndScore);
    retakeBtn.addEventListener("click", retakeImage);
    acceptScoreBtn.addEventListener("click", acceptScore);

    // Initial render
    renderPlayers();
});
