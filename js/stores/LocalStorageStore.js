import { GameStore } from './GameStore.js';

export class LocalStorageStore extends GameStore {
    constructor() {
        super();
        this.STORAGE_KEY = 'dominoPlayers';
        this.players = this.loadPlayers();
    }

    /** Load players from localStorage */
    loadPlayers() {
        try {
            return JSON.parse(localStorage.getItem(this.STORAGE_KEY)) || [];
        } catch (e) {
            console.error("Failed to load players from localStorage", e);
            return [];
        }
    }

    /** Save players to localStorage and notify listeners */
    saveAndNotify() {
        localStorage.setItem(this.STORAGE_KEY, JSON.stringify(this.players));
        this.notify();
    }

    getPlayers() {
        return [...this.players];
    }

    addPlayer(name, startScore = 0) {
        const id = Date.now().toString();
        this.players.push({ id, name, score: startScore });
        this.saveAndNotify();
    }

    updateScore(playerId, amount) {
        const player = this.players.find(p => p.id === playerId);
        if (player) {
            player.score += amount;
            this.saveAndNotify();
        }
    }

    removePlayer(playerId) {
        this.players = this.players.filter(p => p.id !== playerId);
        this.saveAndNotify();
    }

    editPlayer(playerId, name, score) {
        const player = this.players.find(p => p.id === playerId);
        if (player) {
            player.name = name;
            player.score = score;
            this.saveAndNotify();
        }
    }

    resetScores() {
        this.players.forEach(p => p.score = 0);
        this.saveAndNotify();
    }

    clearPlayers() {
        this.players = [];
        this.saveAndNotify();
    }
}
