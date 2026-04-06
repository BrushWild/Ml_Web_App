/**
 * Abstract-like base class for Game Stores.
 * UI components interact with this interface to manage players and scores.
 */
export class GameStore {
    constructor() {
        this.onUpdateCallbacks = [];
    }

    /** Register a callback for when the store's data changes */
    onUpdate(callback) {
        this.onUpdateCallbacks.push(callback);
    }

    /** Notify all listeners that the state has changed */
    notify() {
        this.onUpdateCallbacks.forEach(cb => cb(this.getPlayers()));
    }

    /** Get the current list of players */
    getPlayers() {
        throw new Error("getPlayers() not implemented");
    }

    /** Add a new player to the game */
    addPlayer(name, startScore = 0) {
        throw new Error("addPlayer() not implemented");
    }

    /** Update a player's score by adding a given amount */
    updateScore(playerId, amount) {
        throw new Error("updateScore() not implemented");
    }

    /** Remove a player from the game */
    removePlayer(playerId) {
        throw new Error("removePlayer() not implemented");
    }

    /** Reset all player scores to 0 */
    resetScores() {
        throw new Error("resetScores() not implemented");
    }

    /** Clear all players from the store */
    clearPlayers() {
        throw new Error("clearPlayers() not implemented");
    }
}
