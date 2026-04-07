import { GameStore } from './GameStore.js';

export class SpacetimeDBStore extends GameStore {
    /**
     * @param {any} stdbConn - The SpacetimeDB connection object
     * @param {any} stdbIdentity - The local user's Identity object
     */
    constructor(stdbConn, stdbIdentity) {
        super();
        this.conn = stdbConn;
        this.identity = stdbIdentity;
        this.setupListeners();
    }

    /** Register table callbacks to trigger UI refreshes */
    setupListeners() {
        if (!this.conn || !this.conn.db || !this.conn.db.player) {
            console.error("SpacetimeDB connection or player table not initialized");
            return;
        }

        // Notify UI on any changes to players or lobbies
        this.conn.db.player.onInsert(() => this.notify());
        this.conn.db.player.onUpdate(() => this.notify());
        this.conn.db.player.onDelete(() => this.notify());

        if (this.conn.db.lobby) {
            this.conn.db.lobby.onInsert(() => this.notify());
            this.conn.db.lobby.onUpdate(() => this.notify());
            this.conn.db.lobby.onDelete(() => this.notify());
        }

        this.notify();
    }

    /** Get current lobby metadata */
    getLobbyInfo() {
        if (!this.conn || !this.conn.db || !this.conn.db.lobby) {
            return null;
        }

        const players = Array.from(this.conn.db.player.iter());
        if (players.length === 0) {
            return null;
        }

        // Find the player for this identity. Try both isEqual method and string comparison.
        const player = players.find(p => {
            if (!p.clientId) return false;
            // Handle both Identity object and hex string scenarios
            const playerIdentityHex = typeof p.clientId === 'string' ? p.clientId : p.clientId.toHexString();
            const selfIdentityHex = typeof this.identity === 'string' ? this.identity : this.identity.toHexString();
            return playerIdentityHex === selfIdentityHex;
        });

        if (!player) {
            return null;
        }

        const lobby = Array.from(this.conn.db.lobby.iter()).find(l => l.lobbyCode === player.lobbyCode);
        if (!lobby) {
            console.warn(`SpacetimeDB Store: Player is in lobby ${player.lobbyCode}, but lobby table does not contain it.`);
            return null;
        }

        const info = {
            code: lobby.lobbyCode,
            name: lobby.lobbyName,
            isPublic: lobby.isPublic,
            ownerId: typeof lobby.ownerId === 'string' ? lobby.ownerId : lobby.ownerId.toHexString(),
            isOwner: (typeof lobby.ownerId === 'string' ? lobby.ownerId : lobby.ownerId.toHexString()) ===
                (typeof this.identity === 'string' ? this.identity : this.identity.toHexString())
        };

        console.log("SpacetimeDB Store: getLobbyInfo result:", info);
        return info;
    }

    /** Get all available lobbies with player counts */
    getAvailableLobbies() {
        if (!this.conn || !this.conn.db || !this.conn.db.lobby) {
            console.warn("SpacetimeDB Store: lobby table not available for getAvailableLobbies");
            return [];
        }

        const lobbies = Array.from(this.conn.db.lobby.iter())
            .filter(lobby => lobby.isPublic === true)
            .map(lobby => {
                return {
                    code: lobby.lobbyCode,
                    name: lobby.lobbyName,
                    playerCount: this.getPlayersInLobby(lobby.lobbyCode).length
                };
            });

        console.log(`SpacetimeDB Store: getAvailableLobbies found ${lobbies.length} lobbies`);
        return lobbies;
    }

    /** Helper to get all players in a specific lobby by code */
    getPlayersInLobby(lobbyCode) {
        if (!this.conn || !this.conn.db || !this.conn.db.player) return [];
        return Array.from(this.conn.db.player.iter()).filter(p => p.lobbyCode === lobbyCode);
    }

    getPlayers() {
        if (!this.conn || !this.conn.db || !this.conn.db.player) return [];

        const lobbyInfo = this.getLobbyInfo();
        const lobbyCode = lobbyInfo?.code;

        if (!lobbyCode) {
            return [];
        }

        const stdbPlayers = Array.from(this.conn.db.player.iter()).filter(p => p.lobbyCode === lobbyCode);

        return stdbPlayers.map(p => {
            const playerIdentityHex = typeof p.clientId === 'string' ? p.clientId : p.clientId.toHexString();
            const selfIdentityHex = typeof this.identity === 'string' ? this.identity : this.identity.toHexString();
            const isSelf = playerIdentityHex === selfIdentityHex;
            const isOwner = lobbyInfo.isOwner;

            return {
                id: p.playerId.toString(),
                name: p.name,
                score: p.score,
                clientId: playerIdentityHex,
                isSelf: isSelf,
                canEdit: isSelf || isOwner
            };
        }).sort((a, b) => b.score - a.score);
    }

    /** Lobby Reducers */

    createLobby(userName, lobbyName, isPublic = true) {
        if (!userName || userName.trim() === "") {
            console.error("SpacetimeDB: Cannot create lobby without a user name");
            return;
        }
        if (!lobbyName || lobbyName.trim() === "") {
            console.error("SpacetimeDB: Cannot create lobby without a lobby name");
            return;
        }

        const cleanUserName = userName.trim();
        const cleanLobbyName = lobbyName.trim();

        console.log(`SpacetimeDB: Creating lobby. User: "${cleanUserName}", Lobby Name: "${cleanLobbyName}", Public: ${isPublic}`);

        this.conn.reducers.createLobby({
            userName: cleanUserName,
            lobbyName: cleanLobbyName,
            isPublic: isPublic
        });
    }

    joinLobby(name, code) {
        if (!name || !code || typeof name !== 'string' || typeof code !== 'string' || name.trim() === "" || code.trim() === "") {
            console.error("SpacetimeDB: Cannot join lobby with empty name or code");
            return;
        }

        const cleanName = name.trim();
        const cleanCode = code.trim();

        console.log(`SpacetimeDB: Join attempt lobby "${cleanCode}" as "${cleanName}"`);

        // FIXED: Passing arguments as a single named object
        this.conn.reducers.joinLobby({
            name: cleanName,
            code: cleanCode
        });
    }

    deleteLobby(code) {
        if (!code || typeof code !== 'string') {
            console.error("SpacetimeDB Store: Cannot delete lobby without a valid code");
            return;
        }
        
        const cleanCode = code.trim().toUpperCase();
        console.log(`SpacetimeDB Store: Calling deleteLobby reducer for code "${cleanCode}"`);
        
        if (this.conn.reducers && this.conn.reducers.deleteLobby) {
            this.conn.reducers.deleteLobby({
                code: cleanCode
            });
        } else {
            console.error("SpacetimeDB Store: deleteLobby reducer not found on connection object");
        }
    }

    leaveLobby() {
        const players = Array.from(this.conn.db.player.iter());
        const self = players.find(p => p.clientId.isEqual(this.identity));
        if (self) {
            console.log(`SpacetimeDB: Leaving lobby ${self.lobbyCode}`);
            // FIXED: Passing arguments as a single named object
            this.conn.reducers.removePlayer({
                playerId: self.playerId
            });
        }
    }

    addPlayer(name, startScore = 0) {
        if (!name || typeof name !== 'string' || name.trim() === "") {
            console.error("SpacetimeDB: Cannot update user name with an empty or invalid name");
            return;
        }

        const cleanName = name.trim();
        console.log(`SpacetimeDB: Updating user name to "${cleanName}"`);

        // FIXED: Passing arguments as a single named object
        this.conn.reducers.updateUserName({
            name: cleanName
        });
    }

    updateScore(playerId, amount) {
        console.log(`SpacetimeDB: Updating score for player ${playerId} to ${amount}`);
        // FIXED: Passing arguments as a single named object
        this.conn.reducers.updateScore({
            playerId: BigInt(playerId),
            newScore: amount
        });
    }

    removePlayer(playerId) {
        console.log(`SpacetimeDB: Removing player ${playerId}`);
        // FIXED: Passing arguments as a single named object
        this.conn.reducers.removePlayer({
            playerId: BigInt(playerId)
        });
    }

    editPlayer(playerId, name, score) {
        console.log(`SpacetimeDB: Editing player ${playerId} to ${name} with score ${score}`);
        // FIXED: Passing arguments as a single named object
        this.conn.reducers.updateUserName({
            name: name
        });
        this.conn.reducers.updateScore({
            playerId: BigInt(playerId),
            newScore: score
        });
    }

    resetScores() {
        const players = this.getPlayers();
        players.forEach(p => {
            this.updateScore(p.id, 0); // Reset to 0
        });
    }

    clearPlayers() {
        console.warn("Global clear list is restricted to Owner Manual individual removals in Phase 5");
    }
}