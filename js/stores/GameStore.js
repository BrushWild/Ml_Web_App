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

    /** Notify all listeners that the state has changed.
     * Coalesced to at most one delivery per animation frame so a burst of
     * table events (e.g. rapid score updates) triggers a single re-render
     * instead of one per event. */
    notify() {
        if (this.__notifyScheduled) return;
        this.__notifyScheduled = true;
        const schedule = () => {
            this.__notifyScheduled = false;
            const players = this.getPlayers();
            this.onUpdateCallbacks.forEach(cb => cb(players));
        };
        if (typeof requestAnimationFrame === 'function') {
            requestAnimationFrame(schedule);
        } else {
            setTimeout(schedule, 0);
        }
    }

    /** Get the current list of players */
    getPlayers() {
        throw new Error("getPlayers() not implemented");
    }

    /** Add a new player to the game */
    addPlayer(name, startScore = 0) {
        throw new Error("addPlayer() not implemented");
    }

    /**
     * Shared score arithmetic: the score committed to a player's record is
     * always their current score plus `amount`. Both store backends route
     * through this so local and online scoring can never drift apart.
     */
    addScore(currentScore, amount) {
        return (Number(currentScore) || 0) + amount;
    }

    /** Update a player's score by adding a given amount (additive, not replacement) */
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
