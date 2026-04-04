### **System Context & Constraints (Read carefully before coding)**
> **Project Goal:** Upgrade a vanilla HTML/JS local-storage score-tracking app to support real-time multiplayer using SpacetimeDB (Rust backend). 
> **Architecture:** > * **Frontend:** Vanilla HTML/JS. We will use `esbuild` strictly to bundle the generated SpacetimeDB JS client bindings into a single script (`spacetime-bundle.js`). No React, no Vite.
> * **Backend:** SpacetimeDB module written in Rust, located in a new `/server` directory.
> * **State Management:** A "Hybrid" approach, but contexts are strictly isolated. The app defaults to Local Mode (using existing localStorage). If a user creates or joins a lobby, the local state is abandoned, and they enter the multiplayer lobby with a fresh score of `0`. 
> * **Identity:** SpacetimeDB authentication tokens must be saved to `localStorage` to survive page refreshes.

---

### **Phase 1: Backend Initialization & Schema**
**Objective:** Set up the Rust SpacetimeDB backend, define the schema, and write reducers.
* Initialize a new SpacetimeDB Rust project in a `/server` directory.
* Create the following tables:

| Table | Fields | Description |
| :--- | :--- | :--- |
| `Lobby` | `lobby_code` (String, PK), `owner_id` (Identity) | Stores active lobbies. |
| `Player` | `player_id` (u64, PK), `lobby_code` (String), `client_id` (Identity), `name` (String), `score` (i32) | Stores individual players tied to a lobby. |

* Create the following Reducers (enforcing strict permissions):
    * `create_lobby()`: Generates a random 5-character string, inserts a `Lobby`, and adds the caller as the first `Player` with a score of `0`.
    * `join_lobby(code: String, name: String)`: Inserts a `Player` with a score of `0` if the lobby exists.
    * `update_score(player_id: u64, new_score: i32)`: Allows the `owner_id` OR the specific `client_id` to update the score.
    * `update_name(player_id: u64, new_name: String)`: Allows the `owner_id` OR the specific `client_id` to rename.
    * `remove_player(player_id: u64)`: Allows the `owner_id` or the specific `client_id` to leave. **Crucial Logic:** If the leaving player is the `owner_id`, find the remaining `Player` in that lobby with the lowest `player_id` (the oldest) and update the `Lobby`'s `owner_id` to transfer ownership. If no players remain, delete the `Lobby` record entirely.

### **Phase 2: Build Pipeline & Bindings Setup**
**Objective:** Generate the client SDK and set up the minimal bundler.
* Generate the TypeScript/JS bindings from the Rust backend using the SpacetimeDB CLI.
* Initialize a basic `package.json` specifically for `esbuild` and `@clockworklabs/spacetimedb-sdk`.
* Write a tiny build script (e.g., `build.js` or an npm script) that bundles the generated bindings and SDK into a single `spacetime-bundle.js` file to be consumed by `index.html`.

### **Phase 3: Frontend Data Abstraction**
**Objective:** Decouple the UI from the database to support the hybrid model.
* Refactor the existing JS into an interface/class model for state management. 
* Create a `GameStore` interface with methods: `addPlayer()`, `updateScore()`, `getPlayers()`.
* Implement `LocalStorageStore` (wrapping existing logic).
* Implement `SpacetimeDBStore` (wrapping the `spacetime-bundle.js` logic).
* **Initialization:** On page load, check for a stored SpacetimeDB Identity token in `localStorage`. If it doesn't exist, generate and save one.

### **Phase 4: Network Resilience & Disconnect Handling**
**Objective:** Protect the user experience during network drops.
* Implement a connection state listener on the SpacetimeDB WebSocket.
* If the connection drops while in Multiplayer mode:
    * Display a persistent "Reconnecting..." modal/overlay.
    * Completely disable/block the UI from opening the Machine Learning Camera modal.
    * Disable all manual score input fields and buttons to prevent data desync.
    * Remove the overlay and re-enable inputs once the WebSocket connection is reestablished.

### **Phase 5: UI Updates & Permissions**
**Objective:** Build the Lobby system UI and enforce visual permissions.
* Create a "Network Settings" modal to toggle the SpacetimeDB connection URL between a Local IP (e.g., `ws://127.0.0.1:3000`) and the Clockwork Labs Testnet.
* Build a Home Screen overlay with three buttons: **Play Locally**, **Create Lobby**, and **Join Lobby** (with a text input for the 5-character code).
* **Machine Learning Counter Logic:** The ML domino counter must **never** automatically submit scores to the backend. Instead, it should populate a "Pending Score" input field on the UI. The user must explicitly click a "Confirm Score" button to trigger the `update_score` reducer.
* **UI Permissions:** If using `SpacetimeDBStore`, compare the `client_id` of each player in the roster against the user's local Identity token. Disable the "Edit Name" and "Modify Score" buttons for players that do not match, *unless* the user's Identity matches the `owner_id` of the Lobby.