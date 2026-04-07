console.log("app.js: Script loading started");
import { Logger } from './logger.js';
import { processImageForScore, processImageForScoreTwoPass } from './vision.js';
import * as stdb from './stdb.bundle.js';
import { LocalStorageStore } from './stores/LocalStorageStore.js';
import { SpacetimeDBStore } from './stores/SpacetimeDBStore.js';

document.addEventListener("DOMContentLoaded", () => {
    console.log("app.js: DOMContentLoaded fired");
    try {
        // === DOM Elements ===
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
        const logSection = document.getElementById('log-section');
        const logFab = document.getElementById('log-fab');
        const logFabIcon = document.getElementById('log-fab-icon');
        const logClearBtn = document.getElementById('log-clear-btn');
        const logCloseBtn = document.getElementById('log-close-btn');

        // Detection Mode Toggle
        const twoPassToggle = document.getElementById("two-pass-toggle");
        const modeLabelSingle = document.getElementById("mode-label-single");
        const modeLabelTwopass = document.getElementById("mode-label-twopass");

        // Mode Indicator
        const modeIndicatorEl = document.getElementById("mode-indicator");
        const confirmScoreBtn = document.getElementById("confirm-score-btn");

        // Quick Home Tile Elements
        const quickHomeTile = document.getElementById("quick-home-tile");
        const quickHomeCloseBtn = document.getElementById("quick-home-close-btn");
        const quickPlayLocalBtn = document.getElementById("quick-play-local-btn");
        const quickHostLobbyBtn = document.getElementById("quick-host-lobby-btn");
        const quickJoinLobbyBtn = document.getElementById("quick-join-lobby-btn");
        const quickSettingsBtn = document.getElementById("quick-settings-btn");

        // Home Screen elements
        const homeScreenSection = document.getElementById("home-screen");
        const gameSetupSection = document.getElementById("game-setup");
        const scoreboardSection = document.getElementById("scoreboard");
        const playLocalBtn = document.getElementById("play-local-btn");
        const hostLobbyBtn = document.getElementById("host-lobby-btn");
        const joinLobbyBtnHome = document.getElementById("join-lobby-btn-home");
        const openSettingsBtn = document.getElementById("open-settings-btn");
        const homeLogBtn = document.getElementById("home-log-btn");

        // Lobby Info
        const lobbyInfoRow = document.getElementById("lobby-info-row");
        const displayLobbyCode = document.getElementById("display-lobby-code");
        const leaveLobbyBtn = document.getElementById("leave-lobby-btn");

        // New Modals
        const createLobbyModal = document.getElementById("create-lobby-modal");
        const joinLobbyModal = document.getElementById("join-lobby-modal");
        const settingsModal = document.getElementById("settings-modal");

        const createConfirmBtn = document.getElementById("create-confirm-btn");
        const joinConfirmBtn = document.getElementById("join-confirm-btn");
        const settingsSaveBtn = document.getElementById("settings-save-btn");

        const createOwnerNameInput = document.getElementById("create-owner-name");
        const createLobbyNameInput = document.getElementById("create-lobby-name");
        const joinNameInput = document.getElementById("join-name");
        const joinCodeInput = document.getElementById("join-code");
        const lobbyListEl = document.getElementById("lobby-list");
        const serverUriInput = document.getElementById("server-uri");

        // === Game State ===
        let playMode = 'local'; // 'local' or 'multiplayer'
        let currentStore = new LocalStorageStore();
        window.gameStore = currentStore; // Added for console debugging
        let currentPlayerIdForScore = null;
        let currentVideoStream = null;
        let currentScore = 0;
        let isNetworkLocked = false;
        let reconnectTimeout = null;

        // === SpacetimeDB State ===
        let stdbConn = null;
        let stdbIdentity = null;

        // === Log Tile Toggle ===
        const toggleLogTile = () => {
            if (!logSection) return;
            const isCollapsed = logSection.classList.toggle('collapsed');
            // Log tile is now independent of the navigation FAB icon
            if (!isCollapsed) {
                const logOutput = document.getElementById('log-output');
                if (logOutput) logOutput.scrollTop = logOutput.scrollHeight;
            }
        };

        // === Quick Home Tile Toggle ===
        const toggleQuickHomeTile = (forceClose = false) => {
            if (!quickHomeTile) return;
            if (forceClose) {
                quickHomeTile.classList.add("collapsed");
                logFabIcon.textContent = "home";
                return;
            }
            const isCollapsed = quickHomeTile.classList.toggle("collapsed");
            if (!isCollapsed) {
                logSection?.classList.add("collapsed");
                logFabIcon.textContent = "close";
            } else {
                logFabIcon.textContent = "home";
            }
        };

        if (logFab) logFab.addEventListener("click", () => toggleQuickHomeTile());
        if (quickHomeCloseBtn) quickHomeCloseBtn.addEventListener("click", () => toggleQuickHomeTile(true));

        if (homeLogBtn) homeLogBtn.addEventListener("click", toggleLogTile);
        if (logCloseBtn) logCloseBtn.addEventListener("click", toggleLogTile);
        if (logClearBtn) {
            logClearBtn.addEventListener("click", () => Logger.clear());
        }

        Logger.info('App initialized.');

        // === Theme Toggle Logic ===
        const themeCheckbox = document.getElementById("theme-toggle-checkbox");
        const themeIcon = document.getElementById("theme-icon");

        if (localStorage.getItem('dominoTheme') === 'dark') {
            document.body.classList.add('dark-theme');
            if (themeCheckbox) themeCheckbox.checked = true;
            if (themeIcon) themeIcon.textContent = 'dark_mode';
        }

        themeCheckbox?.addEventListener("change", () => {
            const isDark = document.body.classList.toggle('dark-theme');
            localStorage.setItem('dominoTheme', isDark ? 'dark' : 'light');
            if (themeIcon) themeIcon.textContent = isDark ? 'dark_mode' : 'light_mode';
            Logger.info(`Theme toggled to ${isDark ? 'Dark' : 'Light'}`);
        });

        // === Store & Mode Logic ===
        const setPlayMode = (mode) => {
            playMode = mode;
            console.log(`playMode set to: ${mode}`);

            if (mode === 'multiplayer') {
                if (stdbConn && stdbIdentity) {
                    currentStore = new SpacetimeDBStore(stdbConn, stdbIdentity);
                    currentStore.onUpdate(() => {
                        renderPlayers(currentStore.getPlayers());
                        renderLobbyList();
                    });
                } else {
                    Logger.error("SpacetimeDB not connected. Waiting for connection...");
                }
            } else {
                currentStore = new LocalStorageStore();
            }

            updateUIForMode();
            renderPlayers(currentStore.getPlayers());
            window.gameStore = currentStore; // Update global reference
            Logger.info(`Play mode set to: ${mode}. Store exposed as window.gameStore`);
        };

        const updateUIForMode = () => {
            if (playMode === 'multiplayer') {
                modeIndicatorEl.textContent = 'Multiplayer';
                modeIndicatorEl.style.backgroundColor = 'var(--md-primary)';
                lobbyInfoRow?.classList.remove("hidden");
            } else {
                modeIndicatorEl.textContent = 'Local (Offline)';
                modeIndicatorEl.style.backgroundColor = 'var(--md-secondary)';
                lobbyInfoRow?.classList.add("hidden");
            }
        };

        const setNetworkLock = (locked) => {
            isNetworkLocked = locked;
            const overlay = document.getElementById("reconnecting-overlay");
            if (locked) {
                overlay?.classList.add("active");
                if (cameraModal?.classList.contains("active")) {
                    statusMessageEl.textContent = "Network lost. Waiting for reconnection...";
                }
            } else {
                overlay?.classList.remove("active");
                if (cameraModal?.classList.contains("active")) {
                    statusMessageEl.textContent = "Network restored. Camera ready.";
                }
            }
            renderPlayers(currentStore.getPlayers());
        };

        const initSpacetime = () => {
            const uri = localStorage.getItem('stdb_server_uri') || 'ws://localhost:3000';
            const token = localStorage.getItem('stdb_identity_token');

            console.log(`initSpacetime: connecting to ${uri}...`);
            stdb.DbConnection.builder()
                .withUri(uri)
                .withDatabaseName('domino-vision')
                .withToken(token)
                .onConnect((conn, identity, token) => {
                    console.log("SpacetimeDB Connected successfully");
                    stdbConn = conn;
                    stdbIdentity = identity;
                    try {
                        stdbConn.subscriptionBuilder()
                            .onApplied(() => {
                                Logger.info("SpacetimeDB Subscribed successfully");
                                renderPlayers(currentStore.getPlayers());
                            })
                            .onError((err) => {
                                Logger.error("SpacetimeDB Subscription failed: " + JSON.stringify(err));
                            })
                            .subscribe(['SELECT * FROM lobby', 'SELECT * FROM player', 'SELECT * FROM user']);
                    } catch (e) {
                        Logger.error("SpacetimeDB Subscription error: " + e);
                    }
                    localStorage.setItem('stdb_identity_token', token);

                    if (playMode === 'multiplayer' && !(currentStore instanceof SpacetimeDBStore)) {
                        currentStore = new SpacetimeDBStore(stdbConn, stdbIdentity);
                        currentStore.onUpdate(() => renderPlayers(currentStore.getPlayers()));
                        window.gameStore = currentStore; // Update global reference
                    }

                    setNetworkLock(false);
                    Logger.info("SpacetimeDB connected.");
                })
                .onDisconnect(() => {
                    Logger.error("SpacetimeDB disconnected.");
                    stdbConn = null;
                    if (playMode === 'multiplayer') {
                        setNetworkLock(true);
                    }
                })
                .onConnectError((_ctx, err) => {
                    Logger.error(`SpacetimeDB Connection Error: ${err}`);
                })
                .build();
        };

        // === Navigation Logic ===
        const showView = (view) => {
            console.log(`Navigating to view: ${view}`);
            // Force close any open tiles
            toggleQuickHomeTile(true);
            logSection?.classList.add("collapsed");

            if (view === "home") {
                homeScreenSection?.classList.remove("hidden");
                gameSetupSection?.classList.add("hidden");
                scoreboardSection?.classList.add("hidden");
                logFab?.classList.add("hidden");
            } else if (view === "game") {
                homeScreenSection?.classList.add("hidden");
                gameSetupSection?.classList.remove("hidden");
                scoreboardSection?.classList.remove("hidden");
                logFab?.classList.remove("hidden");
                logFabIcon.textContent = "home";
            }
        };

        // === Home Screen & Lobby Logic ===


        playLocalBtn?.addEventListener("click", () => {
            console.log("Play Locally button clicked");
            setPlayMode("local");
            showView('game');
        });

        hostLobbyBtn?.addEventListener("click", () => {
            console.log(`Host Lobby button clicked. stdbConn exists: ${!!stdbConn}`);
            if (!stdbConn) {
                Logger.error("Not connected to SpacetimeDB. Cannot host.");
                return;
            }
            showView('game');
            createLobbyModal?.classList.add("active");
        });

        joinLobbyBtnHome?.addEventListener("click", () => {
            console.log(`Join Lobby button clicked. stdbConn exists: ${!!stdbConn}`);
            Logger.info("Join Lobby UI requested.");
            if (!stdbConn) {
                Logger.error("Not connected to SpacetimeDB. Cannot join.");
                return;
            }
            showView('game');
            joinLobbyModal?.classList.add("active");
            setPlayMode("multiplayer");
            renderLobbyList(); // Refresh list when modal opens
        });

        openSettingsBtn?.addEventListener("click", () => {
            settingsModal?.classList.add("active");
        });

        // Modal Confirmation Handlers
        createConfirmBtn?.addEventListener("click", () => {
            const name = createOwnerNameInput.value.trim();
            const lobbyName = createLobbyNameInput?.value.trim();
            console.log(`Create Lobby Confirm clicked: Name="${name}", LobbyName="${lobbyName}"`);

            if (!name || !lobbyName) {
                Logger.error("Both player name and lobby name are required.");
                return;
            }

            setPlayMode("multiplayer");
            if (currentStore instanceof SpacetimeDBStore) {
                Logger.info(`Creating lobby: ${lobbyName} as ${name}`);
                currentStore.createLobby(name, lobbyName);
                createLobbyModal?.classList.remove("active");
            }
        });

        joinConfirmBtn?.addEventListener("click", () => {
            const name = joinNameInput.value.trim();
            const code = joinCodeInput.value.trim().toUpperCase();
            console.log(`Join Lobby Confirm clicked: Name="${name}", Code="${code}"`);

            if (!name || !code) {
                Logger.error("Both player name and lobby code are required.");
                return;
            }

            setPlayMode("multiplayer");
            if (currentStore instanceof SpacetimeDBStore) {
                Logger.info(`Joining lobby: ${code} as ${name}`);
                currentStore.joinLobby(name, code);
                joinLobbyModal?.classList.remove("active");
            }
        });

        leaveLobbyBtn?.addEventListener("click", () => {
            if (currentStore instanceof SpacetimeDBStore) {
                currentStore.leaveLobby();
            }
            setPlayMode("local");
            showView('home');
        });

        settingsSaveBtn?.addEventListener("click", () => {
            const uri = serverUriInput.value.trim();
            if (uri) {
                localStorage.setItem("stdb_server_uri", uri);
                settingsModal?.classList.remove("active");
                Logger.info(`Server URI updated to ${uri}. Please refresh to apply.`);
                if (confirm("Server settings changed. Refresh now to apply?")) {
                    window.location.reload();
                }
            }
        });

        // Close buttons for new modals
        document.getElementById("close-create-modal-btn")?.addEventListener("click", () => {
            createLobbyModal?.classList.remove("active");
            showView('home');
        });
        document.getElementById("close-join-modal-btn")?.addEventListener("click", () => {
            joinLobbyModal?.classList.remove("active");
            showView('home');
        });
        document.getElementById("close-settings-modal-btn")?.addEventListener("click", () => settingsModal?.classList.remove("active"));

        // Quick Access button handlers
        quickPlayLocalBtn?.addEventListener("click", () => {
            toggleQuickHomeTile(true);
            setPlayMode("local");
            showView("game");
        });

        quickHostLobbyBtn?.addEventListener("click", () => {
            if (!stdbConn) {
                Logger.error("Not connected to SpacetimeDB.");
                return;
            }
            toggleQuickHomeTile(true);
            showView("game");
            createLobbyModal?.classList.add("active");
        });

        quickJoinLobbyBtn?.addEventListener("click", () => {
            if (!stdbConn) {
                Logger.error("Not connected to SpacetimeDB.");
                return;
            }
            toggleQuickHomeTile(true);
            showView("game");
            joinLobbyModal?.classList.add("active");
            setPlayMode("multiplayer");
            renderLobbyList();
        });

        quickSettingsBtn?.addEventListener("click", () => {
            toggleQuickHomeTile(true);
            settingsModal?.classList.add("active");
        });

        // Ensure initial Home Screen state
        showView("home");

        // Try to connect, but don't block app startup
        initSpacetime();

        // === Lobby Management ===
        const renderLobbyList = () => {
            if (!lobbyListEl) return;
            if (!(currentStore instanceof SpacetimeDBStore)) {
                console.log("renderLobbyList: currentStore is not SpacetimeDBStore, skipping.");
                return;
            }

            const lobbies = currentStore.getAvailableLobbies();
            console.log(`renderLobbyList: Found ${lobbies ? lobbies.length : 0} lobbies.`);

            if (!lobbies || lobbies.length === 0) {
                lobbyListEl.innerHTML = '<div class="lobby-list-empty">Scanning for active lobbies...</div>';
                return;
            }

            lobbyListEl.innerHTML = "";
            lobbies.forEach(lobby => {
                console.log(`renderLobbyList: Rendering lobby ${lobby.code} (${lobby.name})`);
                const item = document.createElement("div");
                item.className = "lobby-item";
                item.innerHTML = `
                    <div class="lobby-item-info">
                        <div class="lobby-item-name">${lobby.name}</div>
                        <div class="lobby-item-meta">
                            <span class="material-icons">person</span>
                            ${lobby.playerCount} player${lobby.playerCount !== 1 ? 's' : ''}
                        </div>
                    </div>
                    <button class="lobby-connect-btn" data-code="${lobby.code}">
                        Connect
                    </button>
                `;

                const connectBtn = item.querySelector(".lobby-connect-btn");
                connectBtn.addEventListener("click", () => {
                    const userName = joinNameInput.value.trim();
                    console.log(`Lobby Connect clicked: Code="${lobby.code}", UserName="${userName}"`);

                    if (!userName) {
                        Logger.warn("User tried to connect to lobby without entering a player name.");
                        alert("Please enter your player name first.");
                        joinNameInput.focus();
                        return;
                    }
                    const code = prompt(`Enter secret code for '${lobby.name}':`, "");
                    if (code) {
                        const uppercasedCode = code.toUpperCase();
                        console.log(`Lobby Connect proceeding: Name="${userName}", Code="${uppercasedCode}"`);
                        if (currentStore.joinLobby(userName, code)) {
                            showView('game');
                        }
                        joinLobbyModal?.classList.remove("active");
                    } else {
                        console.log("Lobby Connect cancelled by user (no code entered).");
                    }
                });

                lobbyListEl.appendChild(item);
            });
        };

        // === Player Management ===
        const renderPlayers = (players) => {
            if (!players) players = currentStore.getPlayers();
            playerListEl.innerHTML = "";

            // Update Lobby Code if in multiplayer
            if (displayLobbyCode) {
                const lobbyInfo = currentStore.getLobbyInfo ? currentStore.getLobbyInfo() : null;
                displayLobbyCode.textContent = lobbyInfo ? lobbyInfo.code : "---";
            }

            const sortedPlayers = [...players].sort((a, b) => b.score - a.score);

            if (sortedPlayers.length === 0) {
                playerListEl.innerHTML = "<li style='justify-content:center; color:#666'>No players added yet.</li>";
                return;
            }

            sortedPlayers.forEach((player, index) => {
                const li = document.createElement("li");
                li.innerHTML = `
                    <div class="player-rank">${index + 1}</div>
                    <div class="player-info">
                        <span class="player-name">${player.name}${player.isSelf ? ' <small>(You)</small>' : ''}</span>
                        <div class="player-score-container">
                            <span class="player-score-large">${player.score}</span>
                            <span class="player-score-pts">pts</span>
                        </div>
                    </div>
                    <div class="player-actions"></div>
                `;

                const actionsContainer = li.querySelector(".player-actions");
                const captureBtn = document.createElement("button");
                captureBtn.className = "icon-btn camera-btn";

                const canEdit = playMode === 'local' || player.canEdit;

                if (isNetworkLocked && playMode === 'multiplayer') {
                    captureBtn.disabled = true;
                    captureBtn.classList.add("disabled");
                    captureBtn.title = "Network Disconnected";
                } else if (!canEdit) {
                    captureBtn.classList.add("disabled-action");
                    captureBtn.title = "No Permission";
                } else {
                    captureBtn.title = "Capture Score";
                    captureBtn.onclick = () => openCameraModal(player.id);
                }
                captureBtn.innerHTML = '<span class="material-icons">photo_camera</span>';

                const settingsBtn = document.createElement("button");
                settingsBtn.className = "icon-btn";

                if (!canEdit) {
                    settingsBtn.classList.add("disabled-action");
                    settingsBtn.title = "No Permission";
                } else {
                    settingsBtn.title = "Edit Player";
                    settingsBtn.onclick = () => {
                        document.dispatchEvent(new CustomEvent('openEditPlayer', { detail: { id: player.id } }));
                    };
                }
                settingsBtn.innerHTML = '<span class="material-icons">settings</span>';

                actionsContainer.appendChild(captureBtn);
                actionsContainer.appendChild(settingsBtn);
                playerListEl.appendChild(li);
            });
        };

        const addPlayer = (name, startScore = 0) => {
            if (name) {
                currentStore.addPlayer(name, startScore);
                Logger.info(`Player "${name}" add command sent to ${playMode} store.`);
                renderPlayers();
            }
        };

        const removePlayer = (id) => {
            currentStore.removePlayer(id);
            Logger.info(`Player with id=${id} remove command sent to ${playMode} store.`);
            renderPlayers();
        };

        const editPlayer = (id, name, score) => {
            if (currentStore.editPlayer) {
                currentStore.editPlayer(id, name, score);
                Logger.info(`Player update command sent to ${playMode} store for: "${name}".`);
                renderPlayers();
            }
        };

        // Setup Player Modals
        (() => {
            const modal = document.getElementById('edit-player-modal');
            const closeBtn = document.getElementById('close-edit-player-modal-btn');
            const cancelBtn = document.getElementById('edit-player-cancel-btn');
            const confirmBtn = document.getElementById('edit-player-confirm-btn');
            const deleteBtn = document.getElementById('edit-player-delete-btn');
            const nameInput = document.getElementById('edit-player-name');
            const scoreInput = document.getElementById('edit-player-score');
            let editingId = null;

            function openModal(playerId) {
                const player = currentStore.getPlayers().find(p => p.id === playerId);
                if (!player) return;
                editingId = playerId;
                nameInput.value = player.name;
                scoreInput.value = player.score;
                modal.classList.add('active');
                setTimeout(() => nameInput.focus(), 120);
            }

            function closeModal() {
                modal.classList.add('closing');
                editingId = null;
                setTimeout(() => modal.classList.remove('active', 'closing'), 200);
            }

            document.addEventListener('openEditPlayer', (e) => openModal(e.detail.id));
            closeBtn?.addEventListener('click', closeModal);
            cancelBtn?.addEventListener('click', closeModal);
            modal?.addEventListener('click', (e) => { if (e.target === modal) closeModal(); });

            confirmBtn?.addEventListener('click', () => {
                const name = nameInput.value.trim();
                const score = parseInt(scoreInput.value, 10) || 0;
                if (!name) return;
                editPlayer(editingId, name, score);
                closeModal();
            });

            deleteBtn?.addEventListener('click', () => {
                if (editingId) {
                    removePlayer(editingId);
                    closeModal();
                }
            });
        })();

        resetScoresBtn?.addEventListener("click", () => {
            currentStore.resetScores();
            renderPlayers();
        });
        clearPlayersBtn?.addEventListener("click", () => {
            if (confirm("Are you sure?")) {
                currentStore.clearPlayers();
                renderPlayers();
            }
        });

        document.addEventListener('addPlayer', (e) => {
            addPlayer(e.detail.name, e.detail.score);
        });

        // Camera Logic
        const openCameraModal = async (playerId) => {
            const player = currentStore.getPlayers().find(p => p.id === playerId);
            if (!player) return;

            currentPlayerIdForScore = playerId;
            currentPlayerNameEl.textContent = player.name;
            webcamEl.classList.remove("hidden");
            overlayCanvas.classList.add("hidden");
            captureBtn.classList.remove("hidden");
            retakeBtn.classList.add("hidden");
            acceptScoreBtn.classList.add("hidden");
            statusMessageEl.textContent = "Starting camera...";
            cameraModal.classList.add("active");

            try {
                currentVideoStream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" } });
                webcamEl.srcObject = currentVideoStream;
                statusMessageEl.textContent = "Camera ready.";
            } catch (err) {
                Logger.error(`Camera error: ${err.message}`);
                statusMessageEl.textContent = "Error accessing camera.";
            }
        };

        const closeCameraModal = () => {
            if (currentVideoStream) {
                currentVideoStream.getTracks().forEach(track => track.stop());
                currentVideoStream = null;
            }
            cameraModal.classList.remove("active");
        };

        closeModalBtn.addEventListener("click", closeCameraModal);

        captureBtn.addEventListener("click", async () => {
            statusMessageEl.textContent = "Processing...";
            overlayCanvas.width = webcamEl.videoWidth;
            overlayCanvas.height = webcamEl.videoHeight;
            const ctx = overlayCanvas.getContext('2d');
            ctx.drawImage(webcamEl, 0, 0);
            webcamEl.classList.add("hidden");
            overlayCanvas.classList.remove("hidden");

            try {
                const { score } = await processImageForScore(overlayCanvas);
                currentScore = score;
                calculatedScoreEl.textContent = score;
                captureBtn.classList.add("hidden");
                retakeBtn.classList.remove("hidden");
                acceptScoreBtn.classList.remove("hidden");
                statusMessageEl.textContent = `Score: ${score}`;
            } catch (err) {
                statusMessageEl.textContent = "Processing failed.";
            }
        });

        retakeBtn.addEventListener("click", () => {
            webcamEl.classList.remove("hidden");
            overlayCanvas.classList.add("hidden");
            captureBtn.classList.remove("hidden");
            retakeBtn.classList.add("hidden");
            acceptScoreBtn.classList.add("hidden");
        });

        acceptScoreBtn.addEventListener("click", () => {
            if (playMode === 'local') {
                currentStore.updateScore(currentPlayerIdForScore, currentScore);
                closeCameraModal();
                renderPlayers();
            } else {
                acceptScoreBtn.classList.add("hidden");
                confirmScoreBtn?.classList.remove("hidden");
                statusMessageEl.textContent = "Click 'Confirm' to send to server.";
            }
        });

        confirmScoreBtn?.addEventListener("click", () => {
            currentStore.updateScore(currentPlayerIdForScore, currentScore);
            closeCameraModal();
            renderPlayers();
        });

        // Initial render
        renderPlayers();

    } catch (err) {
        console.error("CRITICAL: app.js initialization failed!", err);
        Logger.error(`Initialization Failure: ${err.message}`);
    }
});
