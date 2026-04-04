 
# Comprehensive SpacetimeDB Multiplayer Integration Plan

### **System Context & Architecture**
* The core goal is to upgrade the vanilla HTML/JS local-storage Domino Vision app to support a real-time, pseudo-multiplayer experience using a SpacetimeDB Rust backend.
* **Frontend:** The frontend will remain Vanilla HTML/JS, utilizing `esbuild` strictly to bundle the generated SpacetimeDB JS client bindings into a single script called `spacetime-bundle.js`.
* **Backend:** The SpacetimeDB module will be written in Rust and located in a new `/server` directory. You can initialize it using the command `spacetime init --lang rust`.
* **State Management:** The application will use a "Hybrid" approach with strictly isolated contexts. It defaults to Local Mode, reading and writing entirely to the existing `localStorage` logic. If a user creates or joins a lobby, the local state is abandoned, and they enter the multiplayer lobby with a fresh score of `0`. 
* **Identity:** SpacetimeDB uses public/private keys generated locally to track cryptographic identity. Authentication tokens must be cached in `localStorage` and provided on subsequent page loads so users retain their identity upon refreshing.

---

### **Phase 1: Backend Initialization & Schema**
**Objective:** Set up the Rust SpacetimeDB backend, define the schema, and write reducers.

**Data Models (Tables):**
| Table | Fields | Description |
| :--- | :--- | :--- |
| `User` | `identity` (Identity, PK), `name` (String) | Tracks the connection's cryptographic identity and their chosen display name. |
| `Lobby` | `lobby_code` (String, PK), `owner_id` (Identity) | Stores active game rooms and tracks the identity of the user who created it. |
| `Player` | `player_id` (u64, PK), `lobby_code` (String), `client_id` (Identity), `name` (String), `score` (i32/u32) | Stores individual players tied to a lobby, tracking their name and score. |

**Reducers (Functions):**
* `update_user_name(name: String)`: Upserts the user's name in the `User` table and updates their `Player` record if they are currently in a lobby.
* `create_lobby(code: String, user_name: String)`: Validates the code is unique, generates a random 5-character string, updates the user's name, inserts a `Lobby`, and adds the caller as the first `Player` with a score of `0`.
* `join_lobby(code: String, name: String)`: Validates the lobby exists, removes the user from any existing lobby, and inserts a `Player` with a score of `0`.
* `update_score(player_id: u64, new_score: i32)`: Updates a player's score. Only the player themselves (`client_id`) or the lobby's `owner_id` can modify a score.
* `remove_player(player_id: u64)`: Allows the `owner_id` to kick someone or the specific `client_id` to leave. If the leaving player is the `owner_id`, find the remaining `Player` in that lobby with the lowest `player_id` (the oldest) and update the `Lobby`'s `owner_id` to transfer ownership. If no players remain, delete the `Lobby` record and all its players cascadingly.

---

### **Phase 2: Build Pipeline & Bindings Setup**
**Objective:** Generate the client SDK and set up the minimal bundler.

* Generate the TypeScript/JS bindings from the Rust backend using the SpacetimeDB CLI: `spacetime generate --lang typescript --out-dir js/stdb`.
* Create an entry point file (e.g. `js/stdb.ts`) that exports the `DbConnection`, `Identity`, and generated `Module` definitions.
* Initialize a basic `package.json` specifically for `esbuild` and `@clockworklabs/spacetimedb-sdk` (v2.1+).
* Write a build script using `esbuild` to compile it down to a browser-compatible module: `esbuild js/stdb.ts --bundle --outfile=js/stdb.bundle.js --format=esm`.
* In `index.html`, load your app logic as a module: `<script type="module" src="js/app.js"></script>`.

---

### **Phase 3: Frontend Data Abstraction & Logic**
**Objective:** Decouple the UI from the database to support the hybrid model.

* Refactor the existing JS into an interface/class model for state management by introducing a `playMode` variable (`'local'` vs `'multiplayer'`). 
* Create a `GameStore` interface with methods: `addPlayer()`, `updateScore()`, `getPlayers()`.
* Implement `LocalStorageStore` (wrapping existing logic) and `SpacetimeDBStore` (wrapping the `spacetime-bundle.js` logic).
* **Initialization:** On page load, check for a stored SpacetimeDB Identity token in `localStorage` and provide it to `DbConnection.builder().withToken()`. If it doesn't exist, generate and save one.
* **Data Binding:** Register callbacks on the tables (e.g., `stdbConn.db.Player.onInsert`, `.onUpdate`, `.onDelete`) to re-render the scoreboard whenever the database state changes.
* **Scoring Logic:** When the machine learning YOLO/domino model accepts a score, check the `playMode`. If local, apply the addition locally. If multiplayer, the ML domino counter must never automatically submit scores to the backend; instead, it should populate a "Pending Score" input field on the UI. The user must explicitly click a "Confirm Score" button to find the player's DB score, add the new amount, and invoke the `update_score` reducer.

---

### **Phase 4: Network Resilience & Disconnect Handling**
**Objective:** Protect the user experience during network drops.

* Implement a connection state listener on the SpacetimeDB WebSocket.
* If the connection drops while in Multiplayer mode:
    * Display a persistent "Reconnecting..." modal/overlay.
    * Completely disable/block the UI from opening the Machine Learning Camera modal.
    * Disable all manual score input fields and buttons to prevent data desync.
    * Remove the overlay and re-enable inputs once the WebSocket connection is reestablished.

---

### **Phase 5: UI Updates & Permissions**
**Objective:** Build the Lobby system UI and enforce visual permissions.

* Create a "Network Settings" input/modal to toggle the SpacetimeDB connection URL, defaulting to `ws://localhost:3000` or a testnet URL.
* Build a Home Screen (Mode Selection) overlay to replace the immediate game setup view. This should feature three buttons: **Play Locally (Offline)**, **Create Lobby**, and **Join Lobby**.
* **Modals:**
    * Create Lobby: Prompts for the user's name. (The app will auto-generate a lobby code).
    * Join Lobby: Prompts for the user's name and the required text input for the lobby code.
* **Game Setup / Scoreboard View:**
    * Add a "Leave" button.
    * If in a Multiplayer lobby, display the Lobby Code prominently.
    * Disable the generic "Add Player", "Reset Scores", and "Clear List" buttons in multiplayer mode, as players now join independently.
* **UI Permissions:** When rendering the scoreboard in Multiplayer mode using `SpacetimeDBStore`, dynamically compare the `client_id` of each player against the user's local Identity token. Disable the "Edit Name" and "Modify Score" buttons for players that do not match, *unless* the user's Identity matches the `owner_id` of the Lobby.
