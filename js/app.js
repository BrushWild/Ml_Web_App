console.log("app.js: Script loading started");
import { Logger } from './logger.js';
import { processImageForScore, processImageForScoreTwoPass, setModel, getCurrentModelId } from './vision.js?v=2';
import * as stdb from './stdb.bundle.js';
import { LocalStorageStore } from './stores/LocalStorageStore.js?v=2';
import { SpacetimeDBStore } from './stores/SpacetimeDBStore.js?v=2';
const SERVERS = [
    { name: "Spacetime Maincloud", uri: "wss://maincloud.spacetimedb.com" },
    { name: "Self Hosted", uri: "wss://dominohost.brushplusplus.com" },
    { name: "Localhost (Dev Server)", uri: "ws://localhost:3000" }
];

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
        const acceptContinueBtn = document.getElementById("accept-continue-btn");
        const continueScoreEl = acceptContinueBtn ? acceptContinueBtn.querySelector(".continue-score") : null;
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

        // Model Toggle (previous vs new GPU model)
        const modelToggleInput = document.getElementById("model-toggle-input");
        const modelLabelPrevious = document.getElementById("model-label-previous");
        const modelLabelGpu = document.getElementById("model-label-gpu");

        // Mode Indicator
        const modeIndicatorEl = document.getElementById("mode-indicator");

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
        const serverSelect = document.getElementById("server-select");
        const returnLocalBtn = document.getElementById("return-local-btn");
        const activeServerNameEl = document.getElementById("active-server-name");
        const activeServerBadge = document.getElementById("active-server-badge");
        const closeSettingsBtn = document.getElementById("close-settings-btn");

        // === Game State ===
        let playMode = 'local'; // 'local' or 'multiplayer'
        let currentStore = new LocalStorageStore();
        window.gameStore = currentStore; // Added for console debugging
        let currentPlayerIdForScore = null;
        let currentVideoStream = null;
        let currentScore = 0;
        let isNetworkLocked = false;
        let connectionAttemptTimeout = null;
        let lastSuccessfulUri = localStorage.getItem('stdb_server_uri');
        let currentWaterfallIndex = 0;

        // === Reconnection State ===
        let reconnectTimer = null;        // pending setTimeout handle (single-flight guard)
        let reconnectAttempt = 0;         // attempt counter, drives backoff
        let userOptedOutReconnect = false; // true after "Return to Local Mode"
        let connGeneration = 0;           // increments per built connection; stale-callback guard
        const RECONNECT_BASE_MS = 1000;        // initial backoff delay
        const RECONNECT_MAX_INTERVAL_MS = 15000; // cap per-attempt delay
        const RECONNECT_SHOW_FALLBACK_AT = 3;   // reveal "Return to Local Mode" after this many attempts

        // === SpacetimeDB State ===
        let stdbConn = null;
        let stdbIdentity = null;
        let multiplayerStore = null;

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
            document.body.setAttribute('data-theme', 'dark');
            if (themeCheckbox) themeCheckbox.checked = true;
            if (themeIcon) themeIcon.textContent = 'dark_mode';
        }

        themeCheckbox?.addEventListener("change", () => {
            const isDark = themeCheckbox.checked;
            if (isDark) {
                document.body.setAttribute('data-theme', 'dark');
            } else {
                document.body.removeAttribute('data-theme');
            }
            localStorage.setItem('dominoTheme', isDark ? 'dark' : 'light');
            if (themeIcon) themeIcon.textContent = isDark ? 'dark_mode' : 'light_mode';
            Logger.info(`Theme toggled to ${isDark ? 'Dark' : 'Light'}`);
        });

        // === Model Toggle Logic ===
        const syncModelToggle = (modelId) => {
            const isGpu = modelId === 'gpu';
            if (modelToggleInput) modelToggleInput.checked = isGpu;
            modelLabelPrevious?.classList.toggle('active', !isGpu);
            modelLabelGpu?.classList.toggle('active', isGpu);
        };
        // Initialize the toggle to reflect the currently-loaded model.
        syncModelToggle(getCurrentModelId());

        modelToggleInput?.addEventListener("change", async () => {
            const modelId = modelToggleInput.checked ? 'gpu' : 'previous';
            // Disable while loading to avoid a second concurrent load.
            modelToggleInput.disabled = true;
            const status = statusMessageEl;
            const prevText = status ? status.textContent : '';
            if (status) status.textContent = 'Switching model…';
            try {
                const active = await setModel(modelId);
                syncModelToggle(active);
            } finally {
                modelToggleInput.disabled = false;
                if (status) status.textContent = prevText;
            }
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
            const overlay = document.getElementById("reconnecting-modal");
            const fallbackWrapper = document.getElementById("reconnect-timer-wrapper");
            if (locked) {
                overlay?.classList.add("active");
                document.body.classList.add("network-locked");
                if (reconnectAttempt >= RECONNECT_SHOW_FALLBACK_AT) {
                    fallbackWrapper?.classList.remove("hidden");
                }
                if (cameraModal?.classList.contains("active")) {
                    statusMessageEl.textContent = "Network lost. Waiting for reconnection...";
                }
            } else {
                overlay?.classList.remove("active");
                document.body.classList.remove("network-locked");
                fallbackWrapper?.classList.add("hidden");
                if (cameraModal?.classList.contains("active")) {
                    statusMessageEl.textContent = "Network restored. Camera ready.";
                }
            }
            renderPlayers(currentStore.getPlayers());
        };

        const updateActiveServerUI = (uri, status = "Connected") => {
            const server = SERVERS.find(s => s.uri === uri) || { name: "Custom Server", uri: uri };
            if (activeServerNameEl) activeServerNameEl.textContent = server.name;
            if (activeServerBadge) {
                activeServerBadge.textContent = status;
                activeServerBadge.style.background = status === "Connected" ? "var(--md-success-container)" :
                    (status === "Connecting..." ? "var(--md-secondary-container)" : "var(--md-error-container)");
                activeServerBadge.style.color = status === "Connected" ? "var(--md-on-success-container)" :
                    (status === "Connecting..." ? "var(--md-on-secondary-container)" : "var(--md-on-error-container)");
            }
            if (serverSelect) serverSelect.value = uri;
        };

        const autoRestoreSession = () => {
            if (!multiplayerStore || playMode === 'multiplayer') return;
            const lobbyInfo = multiplayerStore.getLobbyInfo();
            if (lobbyInfo) {
                Logger.info(`Auto-restoring session: lobby ${lobbyInfo.code}`);
                playMode = 'multiplayer';
                currentStore = multiplayerStore;
                window.gameStore = currentStore;
                showView('game');
                renderPlayers();
            }
        };

        // Schedules the next reconnect attempt with exponential backoff: attempt #1 waits
        // 1s, #2 waits 2s, #3 waits 4s, #4 waits 8s, then it plateaus at 15s. Single-flight:
        // a pending timer is always cleared first so attempts never stack.
        const scheduleReconnect = (uri) => {
            if (reconnectTimer) {
                clearTimeout(reconnectTimer);
                reconnectTimer = null;
            }
            const attemptNumber = reconnectAttempt + 1;
            const delay = Math.min(RECONNECT_BASE_MS * Math.pow(2, attemptNumber - 1), RECONNECT_MAX_INTERVAL_MS);
            reconnectAttempt = attemptNumber;
            Logger.info(`SpacetimeDB: reconnecting in ${Math.round(delay / 1000)}s (attempt ${reconnectAttempt}).`);
            if (reconnectAttempt >= RECONNECT_SHOW_FALLBACK_AT) {
                setNetworkLock(true); // reveal "Return to Local Mode" fallback
            }
            reconnectTimer = setTimeout(() => {
                reconnectTimer = null;
                if (userOptedOutReconnect) return; // user bailed out while waiting
                const token = localStorage.getItem('stdb_identity_token');
                connectToDb(uri, token, true);
            }, delay);
        };

        // Extracted connection factory: builds a fresh DbConnection from a URI and
        // (optional) identity token. The SDK opens the WS in the constructor and has no
        // `connect()` method, so reconnection always means building a brand-new
        // connection. `connGeneration` guards against stale callbacks from a previous
        // connection whose WS close fires after we've already moved on.
        const connectToDb = (uri, token, isReconnect) => {
            const gen = ++connGeneration;
            const selfGen = () => gen === connGeneration;

            // Connection-attempt watchdog. On the first connect we keep the existing
            // 5s waterfall (try the next server if this one is dead). On a reconnect we
            // only ever retry the last-known-good server, so a longer watchdog that just
            // logs avoids spuriously advancing the server waterfall while the network is
            // down.
            if (connectionAttemptTimeout) clearTimeout(connectionAttemptTimeout);
            connectionAttemptTimeout = setTimeout(() => {
                if (!selfGen()) return;
                Logger.warn(`Connection to ${uri} still pending after watchdog.`);
                if (!isReconnect) handleConnectionFailure(uri);
            }, isReconnect ? 30000 : 5000);

            updateActiveServerUI(uri, "Connecting...");
            console.log(`connectToDb: connecting to ${uri} (reconnect=${isReconnect})...`);

            stdb.DbConnection.builder()
                .withUri(uri)
                .withDatabaseName('domino-vision')
                .withToken(token)
                .onConnect((conn, identity, newToken) => {
                    if (!selfGen()) return; // a newer connection superseded this one
                    if (connectionAttemptTimeout) clearTimeout(connectionAttemptTimeout);
                    console.log("SpacetimeDB Connected successfully");
                    stdbConn = conn;
                    stdbIdentity = identity;
                    lastSuccessfulUri = uri;
                    localStorage.setItem('stdb_server_uri', uri);
                    if (newToken) localStorage.setItem('stdb_identity_token', newToken);

                    // Reset reconnect backoff now that we're healthy.
                    if (isReconnect) {
                        reconnectAttempt = 0;
                        userOptedOutReconnect = false;
                        Logger.info("SpacetimeDB reconnected successfully.");
                    }

                    multiplayerStore = new SpacetimeDBStore(stdbConn, stdbIdentity);
                    multiplayerStore.onUpdate(() => {
                        if (playMode === 'multiplayer') renderPlayers();
                        renderLobbyList();
                        autoRestoreSession();
                    });

                    updateActiveServerUI(uri, "Connected");

                    try {
                        stdbConn.subscriptionBuilder()
                            .onApplied(() => {
                                Logger.info("SpacetimeDB Subscribed: onApplied fired.");
                                autoRestoreSession();
                                renderPlayers();
                                renderLobbyList();
                            })
                            .onError((err) => {
                                Logger.error("SpacetimeDB Subscription failed: " + JSON.stringify(err));
                            })
                            .subscribe(['SELECT * FROM lobby', 'SELECT * FROM player', 'SELECT * FROM user']);
                    } catch (e) {
                        Logger.error("SpacetimeDB Subscription error: " + e);
                    }

                    if (playMode === 'multiplayer') {
                        currentStore = multiplayerStore;
                        window.gameStore = currentStore;
                    }

                    setNetworkLock(false);
                    Logger.info(`Connected to ${SERVERS.find(s => s.uri === uri)?.name || uri}`);
                })
                .onDisconnect(() => {
                    if (!selfGen()) return; // stale WS close from a superseded connection
                    Logger.error("SpacetimeDB disconnected.");
                    if (connectionAttemptTimeout) clearTimeout(connectionAttemptTimeout);
                    if (stdbConn === null) return; // we already tore it down (manual switch)
                    stdbConn = null;
                    multiplayerStore = null;
                    window.gameStore = null;
                    updateActiveServerUI(uri, "Disconnected");
                    if (playMode === 'multiplayer') setNetworkLock(true);
                    if (playMode === 'multiplayer' && !userOptedOutReconnect) {
                        scheduleReconnect(uri);
                    }
                })
                .onConnectError((_ctx, err) => {
                    if (!selfGen()) return;
                    if (connectionAttemptTimeout) clearTimeout(connectionAttemptTimeout);
                    Logger.error(`SpacetimeDB Connection Error: ${err}`);

                    if (err && (err.toString().includes("Unauthorized") || err.toString().includes("Failed to verify token"))) {
                        Logger.warn("Identity token rejected. Clearing local token and retrying...");
                        localStorage.removeItem('stdb_identity_token');
                        reconnectAttempt = 0;
                        connectToDb(uri, null, isReconnect);
                    } else if (isReconnect) {
                        // Keep retrying the same server; scheduleReconnect advances backoff.
                        scheduleReconnect(uri);
                    } else {
                        handleConnectionFailure(uri);
                    }
                })
                .build();
        };

        // Entry point used by init and by manual server switches.
        const initSpacetime = (preferredUri = null) => {
            const uri = preferredUri || lastSuccessfulUri || localStorage.getItem('stdb_server_uri') || SERVERS[0].uri;
            const token = localStorage.getItem('stdb_identity_token');
            // Tear down the previous connection before building a new one. Nulling
            // stdbConn first suppresses the stale onDisconnect the WS close will emit.
            if (connectionAttemptTimeout) clearTimeout(connectionAttemptTimeout);
            if (stdbConn) {
                const old = stdbConn;
                stdbConn = null;
                multiplayerStore = null;
                try { old.disconnect(); } catch (e) { /* already closed */ }
            }
            reconnectAttempt = 0;
            userOptedOutReconnect = false;
            connectToDb(uri, token, false);
        };

        const handleConnectionFailure = (failedUri) => {
            Logger.warn(`Failed to connect to ${failedUri}.`);

            // Revert Logic: If this was a manual selection that failed, go back to last working
            if (lastSuccessfulUri && failedUri !== lastSuccessfulUri) {
                Logger.info(`Reverting to last successful connection: ${lastSuccessfulUri}`);
                initSpacetime(lastSuccessfulUri);
                return;
            }

            // Waterfall Logic: Try next in list
            currentWaterfallIndex++;
            if (currentWaterfallIndex < SERVERS.length) {
                const nextUri = SERVERS[currentWaterfallIndex].uri;
                Logger.info(`Waterfall: Trying next server ${SERVERS[currentWaterfallIndex].name}...`);
                initSpacetime(nextUri);
            } else {
                Logger.error("Waterfall exhausted. No servers available.");
                updateActiveServerUI(failedUri, "Offline");
                currentWaterfallIndex = 0; // Reset for next manual attempt
            }
        };

        // Populate Server Select
        if (serverSelect) {
            SERVERS.forEach(s => {
                const opt = document.createElement("option");
                opt.value = s.uri;
                opt.textContent = s.name;
                serverSelect.appendChild(opt);
            });
            serverSelect.addEventListener("change", (e) => {
                const newUri = e.target.value;
                Logger.info(`Switching to ${newUri}...`);
                localStorage.removeItem("stdb_identity_token"); // Proactively clear on switch
                currentWaterfallIndex = 0; // Reset waterfall on manual selection
                initSpacetime(newUri);
            });
        }

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
            const isPrivate = document.getElementById("create-private-toggle")?.checked || false;
            console.log(`Create Lobby Confirm clicked: Name="${name}", LobbyName="${lobbyName}", Private=${isPrivate}`);

            if (!name || !lobbyName) {
                Logger.error("Both player name and lobby name are required.");
                return;
            }

            setPlayMode("multiplayer");
            if (currentStore instanceof SpacetimeDBStore) {
                Logger.info(`Creating lobby: ${lobbyName} as ${name} (Private: ${isPrivate})`);
                currentStore.createLobby(name, lobbyName, !isPrivate);
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

        document.getElementById("close-settings-modal-btn")?.addEventListener("click", () => settingsModal?.classList.remove("active"));
        closeSettingsBtn?.addEventListener("click", () => settingsModal?.classList.remove("active"));

        // Create/Join lobby modal close buttons (X in top-right corner)
        function closeLobbyModal(modal) {
            if (!modal) return;
            modal.classList.add("closing");
            setTimeout(() => modal.classList.remove("active", "closing"), 200);
        }
        document.getElementById("close-create-modal-btn")?.addEventListener("click", () => closeLobbyModal(createLobbyModal));
        document.getElementById("close-join-modal-btn")?.addEventListener("click", () => closeLobbyModal(joinLobbyModal));
        // Also close on backdrop click or Escape, matching the other modals
        createLobbyModal?.addEventListener("click", (e) => { if (e.target === createLobbyModal) closeLobbyModal(createLobbyModal); });
        joinLobbyModal?.addEventListener("click", (e) => { if (e.target === joinLobbyModal) closeLobbyModal(joinLobbyModal); });
        document.addEventListener("keydown", (e) => {
            if (e.key === "Escape") {
                if (createLobbyModal?.classList.contains("active")) closeLobbyModal(createLobbyModal);
                if (joinLobbyModal?.classList.contains("active")) closeLobbyModal(joinLobbyModal);
            }
        });

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

        // "Return to Local Mode" — user gave up on reconnecting. Stop the backoff loop
        // and drop to the offline store; the connection itself is left alone so the
        // player's seat in the lobby is retained on the server (isOnline=false) until
        // they rejoin.
        returnLocalBtn?.addEventListener("click", () => {
            Logger.info("User returned to Local Mode from reconnect fallback.");
            if (reconnectTimer) {
                clearTimeout(reconnectTimer);
                reconnectTimer = null;
            }
            userOptedOutReconnect = true;
            setPlayMode("local");
            setNetworkLock(false);
            showView("home");
        });

        // === Browser Network Listeners ===
        // The WebSocket is the only signal that a network drop reaches the DB layer,
        // which can take up to the server's idle timeout. Browsers also expose
        // navigator.onLine / online / offline, so use them to trigger a fast reconnect
        // (and to stop hammering when the network is genuinely down).
        window.addEventListener("online", () => {
            Logger.info("Browser reports network is back online.");
            // Only nudge if we're actually disconnected AND no backoff attempt is already
            // pending. If reconnectAttempt is non-zero a backoff timer may still be armed;
            // if stdbConn is null and the timer already fired we're between attempts.
            if (playMode === 'multiplayer' && !stdbConn && reconnectAttempt === 0) {
                userOptedOutReconnect = false;
                const token = localStorage.getItem('stdb_identity_token');
                const uri = lastSuccessfulUri || localStorage.getItem('stdb_server_uri') || SERVERS[0].uri;
                connectToDb(uri, token, true);
            }
        });
        window.addEventListener("offline", () => {
            Logger.info("Browser reports network is offline.");
            if (playMode === 'multiplayer' && stdbConn) {
                // Surface the lock immediately rather than waiting for the WS to notice.
                setNetworkLock(true);
            }
        });

        const renderLobbyList = () => {
            if (!lobbyListEl) return;
            // The lobby list is only visible inside the join-lobby modal, so
            // skip the (relatively expensive) discovery + rebuild on every
            // DB tick while the modal is closed.
            if (!joinLobbyModal?.classList.contains("active")) return;

            // Use background store for discovery even in Local mode
            const discoveryStore = (currentStore instanceof SpacetimeDBStore) ? currentStore : multiplayerStore;

            if (!discoveryStore) {
                // Silent if not connected yet
                return;
            }

            const lobbies = discoveryStore.getAvailableLobbies();
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

                    console.log(`Lobby Connect proceeding: Name="${userName}", Code="${lobby.code}"`);
                    currentStore.joinLobby(userName, lobby.code);
                    joinLobbyModal?.classList.remove("active");
                });

                lobbyListEl.appendChild(item);
            });
        };

        // === Player Management ===
        // Per-row element references so update renders can mutate existing
        // rows in place instead of tearing down and rebuilding the list.
        const playerRowRefs = new Map(); // playerId -> row element refs

        const makePlayerLi = (player) => {
            const li = document.createElement("li");
            li.innerHTML = `
                <div class="player-rank"></div>
                <div class="player-info">
                    <span class="player-name"></span>
                    <div class="player-score-container">
                        <span class="player-score-large"></span>
                        <span class="player-score-pts">pts</span>
                    </div>
                </div>
                <div class="player-actions"></div>
            `;
            const actions = li.querySelector(".player-actions");
            const captureBtn = document.createElement("button");
            captureBtn.className = "icon-btn camera-btn";
            captureBtn.innerHTML = '<span class="material-icons">photo_camera</span>';
            const settingsBtn = document.createElement("button");
            settingsBtn.className = "icon-btn";
            settingsBtn.innerHTML = '<span class="material-icons">settings</span>';
            actions.appendChild(captureBtn);
            actions.appendChild(settingsBtn);
            return {
                li,
                rankEl: li.querySelector(".player-rank"),
                nameEl: li.querySelector(".player-name"),
                scoreEl: li.querySelector(".player-score-large"),
                captureBtn,
                settingsBtn
            };
        };

        const updatePlayerLi = (ref, player, index) => {
            const isOffline = playMode === 'multiplayer' && player.isOnline === false;
            ref.li.classList.toggle("disconnected", isOffline);
            ref.rankEl.textContent = index + 1;
            ref.nameEl.innerHTML = `${player.name}${player.isSelf ? ' <small>(You)</small>' : ''}` +
                `${isOffline ? ' <span class="material-icons offline-icon" title="Player Disconnected">cloud_off</span>' : ''}`;
            ref.scoreEl.textContent = player.score;

            const canEdit = playMode === 'local' || player.canEdit;
            const locked = isNetworkLocked && playMode === 'multiplayer';
            if (locked) {
                ref.captureBtn.disabled = true;
                ref.captureBtn.classList.add("disabled");
                ref.captureBtn.title = "Network Disconnected";
                ref.captureBtn.onclick = null;
            } else if (!canEdit) {
                ref.captureBtn.disabled = false;
                ref.captureBtn.classList.remove("disabled");
                ref.captureBtn.classList.add("disabled-action");
                ref.captureBtn.title = "No Permission";
                ref.captureBtn.onclick = null;
            } else {
                ref.captureBtn.disabled = false;
                ref.captureBtn.classList.remove("disabled", "disabled-action");
                ref.captureBtn.title = "Capture Score";
                ref.captureBtn.onclick = () => openCameraModal(player.id);
            }

            if (!canEdit) {
                ref.settingsBtn.classList.add("disabled-action");
                ref.settingsBtn.title = "No Permission";
                ref.settingsBtn.onclick = null;
            } else {
                ref.settingsBtn.classList.remove("disabled-action");
                ref.settingsBtn.title = "Edit Player";
                ref.settingsBtn.onclick = () => {
                    document.dispatchEvent(new CustomEvent('openEditPlayer', { detail: { id: player.id } }));
                };
            }
        };

        const renderPlayers = (players) => {
            if (!players) players = currentStore.getPlayers();

            // Update Lobby Code if in multiplayer
            if (displayLobbyCode) {
                const lobbyInfo = currentStore.getLobbyInfo ? currentStore.getLobbyInfo() : null;
                displayLobbyCode.textContent = lobbyInfo ? lobbyInfo.code : "---";
            }

            const sortedPlayers = [...players].sort((a, b) => b.score - a.score);

            if (sortedPlayers.length === 0) {
                playerListEl.innerHTML = "<li style='justify-content:center; color:#666'>No players added yet.</li>";
                playerRowRefs.clear();
                return;
            }

            // Clear the "no players" placeholder if present
            const first = playerListEl.firstElementChild;
            if (first && first.hasAttribute && first.hasAttribute("style")) {
                playerListEl.innerHTML = "";
            }

            const seen = new Set();
            sortedPlayers.forEach((player, index) => {
                seen.add(player.id);
                let ref = playerRowRefs.get(player.id);
                if (!ref) {
                    ref = makePlayerLi(player);
                    playerRowRefs.set(player.id, ref);
                }
                updatePlayerLi(ref, player, index);
                // appendChild on an existing node is a cheap DOM move; this
                // keeps DOM order in sync with rank order on score changes.
                playerListEl.appendChild(ref.li);
            });

            // Remove rows for players that left
            for (const [id, ref] of playerRowRefs) {
                if (!seen.has(id)) {
                    ref.li.remove();
                    playerRowRefs.delete(id);
                }
            }
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
            acceptContinueBtn?.classList.add("hidden");
            statusMessageEl.textContent = "Starting camera...";
            cameraModal.classList.add("active");

            // If the modal is closed before getUserMedia resolves, stop the
            // stream so we don't hold the camera for a hidden modal.
            let stream = null;
            try {
                stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" } });
                if (!cameraModal.classList.contains("active")) {
                    stream.getTracks().forEach(track => track.stop());
                    return;
                }
                currentVideoStream = stream;
                webcamEl.srcObject = stream;
                statusMessageEl.textContent = "Camera ready.";
            } catch (err) {
                Logger.error(`Camera error: ${err.message}`);
                if (stream) stream.getTracks().forEach(track => track.stop());
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
                continueScoreEl.textContent = score;
                captureBtn.classList.add("hidden");
                retakeBtn.classList.remove("hidden");
                acceptScoreBtn.classList.remove("hidden");
                acceptContinueBtn?.classList.remove("hidden");
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
            acceptContinueBtn?.classList.add("hidden");
        });

        acceptScoreBtn.addEventListener("click", () => {
            // Commit the score to the player's record and close the modal
            // (works in both local and online modes).
            currentStore.updateScore(currentPlayerIdForScore, currentScore);
            closeCameraModal();
            renderPlayers();
        });

        acceptContinueBtn?.addEventListener("click", () => {
            // Accept this score for the current player and stay in the modal,
            // ready to capture the next picture immediately.
            currentStore.updateScore(currentPlayerIdForScore, currentScore);
            renderPlayers();
            retakeBtn.classList.add("hidden");
            acceptScoreBtn.classList.add("hidden");
            acceptContinueBtn.classList.add("hidden");
            webcamEl.classList.remove("hidden");
            overlayCanvas.classList.add("hidden");
            captureBtn.classList.remove("hidden");
            statusMessageEl.textContent = "Score saved. Capture again?";
        });

        // Initial render
        renderPlayers();

    } catch (err) {
        console.error("CRITICAL: app.js initialization failed!", err);
        Logger.error(`Initialization Failure: ${err.message}`);
    }
});
