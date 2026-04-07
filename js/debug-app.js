import * as stdb from 'stdb';
import { SpacetimeDBStore } from 'stores/SpacetimeDBStore';

const SERVERS = [
    { name: "Spacetime Maincloud", uri: "wss://maincloud.spacetimedb.com" },
    { name: "Localhost (Dev Server)", uri: "ws://localhost:3000" }
];

// UI Helpers
const $ = (id) => document.getElementById(id);
const logEl = document.getElementById('debug-logs');

function log(msg, type = 'info') {
    const time = new Date().toLocaleTimeString();
    const entry = document.createElement('div');
    entry.style.color = type === 'error' ? '#ef5350' : (type === 'warn' ? '#ffca28' : '#a5d6a7');
    entry.style.marginBottom = '4px';
    entry.textContent = `[${time}] ${msg}`;
    logEl.prepend(entry);
    console.log(`[DEBUG] ${msg}`);
}

// State
let store = null;
let conn = null;
let connectionAttemptTimeout = null;
let lastSuccessfulUri = localStorage.getItem('stdb_server_uri');
let currentWaterfallIndex = 0;

function updateActiveServerUI(uri, status = "CONNECTED") {
    const server = SERVERS.find(s => s.uri === uri) || { name: "Custom Server", uri: uri };
    if ($('display-active-server')) $('display-active-server').textContent = server.name;
    const statusEl = $('conn-status');
    if (statusEl) {
        statusEl.textContent = status;
        statusEl.className = status === 'CONNECTED' ? 'status-connected' : 
                           (status === 'CONNECTING...' ? 'status-connecting' : 'status-disconnected');
    }
    if ($('server-select')) $('server-select').value = uri;
}

async function init(preferredUri = null) {
    const uri = preferredUri || localStorage.getItem('stdb_server_uri') || SERVERS[0].uri;
    const dbName = "domino-vision";
    const token = localStorage.getItem('stdb_identity_token');

    if (connectionAttemptTimeout) clearTimeout(connectionAttemptTimeout);
    if (conn) conn.disconnect();

    updateActiveServerUI(uri, "CONNECTING...");
    log(`Connecting to ${uri} (DB: ${dbName})...`);

    // 5 second timeout
    connectionAttemptTimeout = setTimeout(() => {
        log(`Connection to ${uri} timed out after 5s.`, 'warn');
        handleConnectionFailure(uri);
    }, 5000);
    
    try {
        conn = stdb.DbConnection.builder()
            .withUri(uri)
            .withDatabaseName(dbName)
            .withToken(token)
            .onConnect((_ctx, identity, token) => {
                if (connectionAttemptTimeout) clearTimeout(connectionAttemptTimeout);
                localStorage.setItem('stdb_identity_token', token);
                localStorage.setItem('stdb_server_uri', uri);
                lastSuccessfulUri = uri;

                $('display-identity').textContent = identity.toHexString();
                updateActiveServerUI(uri, "CONNECTED");
                log(`Connected successfully to ${uri}`);
                
                // Subscription is required for the store to function
                conn.subscriptionBuilder()
                    .onApplied(() => {
                        log("Subscribed to tables: lobby, player, user");
                        store = new SpacetimeDBStore(conn, identity);
                        store.onUpdate(() => render());
                        render();
                    })
                    .onError((err) => log(`Subscription Error: ${JSON.stringify(err)}`, 'error'))
                    .subscribe(['SELECT * FROM lobby', 'SELECT * FROM player', 'SELECT * FROM user']);
            })
            .onDisconnect(() => {
                updateActiveServerUI(uri, "DISCONNECTED");
                log("Disconnected.", 'warn');
            })
            .onConnectError((_ctx, err) => {
                if (connectionAttemptTimeout) clearTimeout(connectionAttemptTimeout);
                log(`Connection Error: ${err}`, 'error');
                
                if (err && (err.toString().includes("Unauthorized") || err.toString().includes("Failed to verify token"))) {
                    log("Identity token rejected. Clearing local token...", 'warn');
                    localStorage.removeItem('stdb_identity_token');
                    init(uri); // Try again without token
                } else {
                    handleConnectionFailure(uri);
                }
            })
            .build();
    } catch (err) {
        log(`Failed to build connection: ${err}`, 'error');
    }
}

function handleConnectionFailure(failedUri) {
    // Revert Logic
    if (lastSuccessfulUri && failedUri !== lastSuccessfulUri) {
        log(`Reverting to last successful connection: ${lastSuccessfulUri}`, 'info');
        init(lastSuccessfulUri);
        return;
    }

    // Waterfall logic
    currentWaterfallIndex++;
    if (currentWaterfallIndex < SERVERS.length) {
        const nextUri = SERVERS[currentWaterfallIndex].uri;
        log(`Waterfall: Trying next server ${SERVERS[currentWaterfallIndex].name}...`);
        init(nextUri);
    } else {
        log("Waterfall exhausted. No servers available.", 'error');
        updateActiveServerUI(failedUri, "OFFLINE");
        currentWaterfallIndex = 0;
    }
}

function render() {
    if (!store) return;

    // 1. Render Lobby List
    const lobbies = store.getAvailableLobbies() || [];
    const lobbyRows = $('lobby-rows');
    lobbyRows.innerHTML = '';
    
    if (lobbies.length === 0) {
        lobbyRows.innerHTML = '<tr><td colspan="4">No lobbies found in table.</td></tr>';
    } else {
        lobbies.forEach(l => {
            const tr = document.createElement('tr');
            tr.innerHTML = `
                <td><strong>${l.code}</strong></td>
                <td>${l.name}</td>
                <td>${l.playerCount}</td>
                <td><button id="join-btn-${l.code}">Join</button></td>
            `;
            lobbyRows.appendChild(tr);
            document.getElementById(`join-btn-${l.code}`).addEventListener('click', () => {
                window.joinLobby(l.code);
            });
        });
    }

    // 2. Render Active Context
    const activeInfo = store.getLobbyInfo();
    const activeDisplay = $('active-lobby-display');
    if (activeInfo) {
        activeDisplay.innerHTML = `
            <div style="font-weight:bold; color:var(--primary); font-size:16px;">${activeInfo.name}</div>
            <div style="font-family: monospace; color:#fff;">CODE: ${activeInfo.code}</div>
            <div style="font-size:10px; color:#88a889; margin-top:4px;">Owner Identity: ${activeInfo.ownerId.substring(0,24)}... ${activeInfo.isOwner ? '<strong>(YOU)</strong>' : ''}</div>
        `;
    } else {
        activeDisplay.textContent = 'NOT IN A LOBBY';
        activeDisplay.style.color = '#666';
    }

    // 3. Render Players
    const players = store.getPlayers() || [];
    const playerRows = $('player-rows');
    playerRows.innerHTML = '';
    
    if (players.length === 0) {
        playerRows.innerHTML = '<tr><td colspan="4" style="text-align:center; padding: 20px; color: #4e7050;">No active players in current lobby row context.</td></tr>';
    } else {
        players.forEach(p => {
            const tr = document.createElement('tr');
            tr.className = 'player-row';
            tr.innerHTML = `
                <td>
                    <div style="font-weight:bold; color:#fff;">${p.id}</div>
                    <div style="font-size:9px; color:#4e7050; letter-spacing:0;">${p.clientId.substring(0,16)}...</div>
                    ${p.isSelf ? '<span class="badge badge-self">LOCAL</span>' : ''}
                </td>
                <td>
                    <input type="text" value="${p.name}" style="width:100px; padding:6px; font-size:11px;" id="name-input-${p.id}">
                    <button id="name-btn-${p.id}" class="outlined" style="padding:4px 8px; font-size:9px;">SET</button>
                </td>
                <td>
                    <input type="number" value="${p.score}" style="width:60px; padding:6px; font-size:11px;" id="score-input-${p.id}">
                    <button id="score-btn-${p.id}" class="outlined" style="padding:4px 8px; font-size:9px;">SET</button>
                </td>
                <td style="text-align:right;">
                    <button id="remove-btn-${p.id}" class="danger" style="padding:6px 10px;">X</button>
                </td>
            `;
            playerRows.appendChild(tr);

            // Bind events
            document.getElementById(`name-btn-${p.id}`).addEventListener('click', () => {
                const name = document.getElementById(`name-input-${p.id}`).value;
                log(`Reducer: updateUserName for player ${p.id} -> ${name}`);
                store.editPlayer(p.id, name, p.score);
            });
            document.getElementById(`score-btn-${p.id}`).addEventListener('click', () => {
                const score = parseInt(document.getElementById(`score-input-${p.id}`).value);
                log(`Reducer: updateScore for player ${p.id} -> ${score}`);
                store.updateScore(p.id, score);
            });
            document.getElementById(`remove-btn-${p.id}`).addEventListener('click', () => {
                if (confirm(`Reducer: removePlayer ${p.id}?`)) {
                    log(`Reducer: removePlayer ${p.id}`);
                    store.removePlayer(p.id);
                }
            });
        });
    }
}

// Action Handlers
window.joinLobby = (code) => {
    const nameInput = $('join-name');
    const name = nameInput.value || 'DebugUser';
    log(`Reducer: joinLobby("${name}", "${code}")`);
    store.joinLobby(name, code);
};

// Event Listeners
// Populate Server Select
const serverSelect = $('server-select');
if (serverSelect) {
    SERVERS.forEach(s => {
        const opt = document.createElement("option");
        opt.value = s.uri;
        opt.textContent = s.name;
        serverSelect.appendChild(opt);
    });
    serverSelect.addEventListener("change", (e) => {
        const newUri = e.target.value;
        log(`Switching to ${SERVERS.find(s => s.uri === newUri)?.name || newUri}...`);
        localStorage.removeItem("stdb_identity_token"); 
        currentWaterfallIndex = 0;
        init(newUri);
    });
}

$('btn-reconnect').addEventListener('click', () => {
    log("Resetting connection...");
    init(localStorage.getItem('stdb_server_uri'));
});

$('btn-clear-storage').addEventListener('click', () => {
    if (confirm("Clear local storage (identity token & settings)?")) {
        localStorage.clear();
        log("LocalStorage wiped. Refresh to restart session.");
    }
});

$('btn-create').addEventListener('click', () => {
    const name = $('create-user-name').value;
    const lobbyName = $('create-lobby-name').value;
    const isPublic = $('create-public').checked;
    if (!name || !lobbyName) {
        log("Error: User Name and Lobby Name are required", 'error');
        return;
    }
    log(`Reducer: createLobby("${name}", "${lobbyName}", isPublic=${isPublic})`);
    store.createLobby(name, lobbyName, isPublic);
});

$('btn-join').addEventListener('click', () => {
    const name = $('join-name').value;
    const code = $('join-code').value;
    if (!name || !code) {
        log("Error: User Name and Lobby Code are required", 'error');
        return;
    }
    window.joinLobby(code);
});

$('btn-leave').addEventListener('click', () => {
    log("Reducer: removePlayer (Self)");
    store.leaveLobby();
});

$('btn-delete-lobby').addEventListener('click', () => {
    const info = store.getLobbyInfo();
    if (!info) {
        log("Error: Not in a lobby", "error");
        return;
    }
    if (confirm(`ADMIN: Delete full lobby ${info.code}? This will remove ALL players.`)) {
        log(`Reducer: delete_lobby("${info.code}")`);
        store.deleteLobby(info.code);
    }
});

$('btn-global-reset').addEventListener('click', () => {
    log("Batch Reducer: resetScores (calling updateScore for all active rows)");
    store.resetScores();
});

$('btn-clear-logs').addEventListener('click', () => {
    logEl.innerHTML = '';
});

// Bootstrap
window.addEventListener('load', init);
