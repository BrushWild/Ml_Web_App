 
# Phase 3: Frontend Data Abstraction & Logic

### **System Context & Architecture**
* The core goal is to upgrade the vanilla HTML/JS local-storage Domino Vision app to support a real-time, pseudo-multiplayer experience using a SpacetimeDB Rust backend.
* **Frontend:** The frontend will remain Vanilla HTML/JS, utilizing `esbuild` strictly to bundle the generated SpacetimeDB JS client bindings into a single script called `spacetime-bundle.js`.
* **Backend:** The SpacetimeDB module will be written in Rust and located in a new `/server/domino-vision` directory.
* **State Management:** The application will use a "Hybrid" approach with strictly isolated contexts. It defaults to Local Mode, reading and writing entirely to the existing `localStorage` logic. If a user creates or joins a lobby, the local state is abandoned, and they enter the multiplayer lobby with a fresh score of `0`. 
* **Identity:** SpacetimeDB uses public/private keys generated locally to track cryptographic identity. Authentication tokens must be cached in `localStorage` and provided on subsequent page loads so users retain their identity upon refreshing.

---

### **Execution Steps for Phase 3**
**Objective:** Decouple the UI from the database to support the hybrid model.

**Step 1: Implement State Stores**
* Refactor the existing JS into an interface/class model for state management by introducing a `playMode` variable (`'local'` vs `'multiplayer'`). 
* Create a `GameStore` interface with methods: `addPlayer()`, `updateScore()`, `getPlayers()`.
* Implement `LocalStorageStore` (wrapping existing logic) and `SpacetimeDBStore` (wrapping the `spacetime-bundle.js` logic).

**Step 2: Setup Database Connection & Identity**
* **Initialization:** On page load, check for a stored SpacetimeDB Identity token in `localStorage` and provide it to `DbConnection.builder().withToken()`. If it doesn't exist, generate and save one.
* **Data Binding:** Register callbacks on the tables (e.g., `stdbConn.db.Player.onInsert`, `.onUpdate`, `.onDelete`) to re-render the scoreboard whenever the database state changes.

**Step 3: Hook Up the Scoring Logic**
* **Scoring Logic:** When the machine learning YOLO/domino model accepts a score, check the `playMode`. If local, apply the addition locally. 
* If multiplayer, the ML domino counter must never automatically submit scores to the backend; instead, it should populate a "Pending Score" input field on the UI. The user must explicitly click a "Confirm Score" button to find the player's DB score, add the new amount, and invoke the `update_score` reducer.
