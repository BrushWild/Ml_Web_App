 
# Master Task Checklist: SpacetimeDB Multiplayer Integration

This checklist is designed for AI agents to track progress across the 5 phases of migrating the Domino Vision app to a SpacetimeDB backend.

### **Phase 1: Backend Initialization & Schema**
- [x] Create the `User` table with `identity` (PK) and `name` fields.
- [x] Create the `Lobby` table with `lobby_code` (PK) and `owner_id` fields.
- [x] Create the `Player` table with `player_id` (PK), `lobby_code`, `client_id`, `name`, and `score` fields.
- [x] Write the `update_user_name` reducer to upsert the user's name and update their `Player` record.
- [x] Write the `create_lobby` reducer to generate a lobby code, insert a `Lobby`, and add the caller as a `Player` with a score of `0`.
- [x] Write the `join_lobby` reducer to validate the lobby, remove the user from existing lobbies, and insert them as a `Player` with a score of `0`.
- [x] Write the `update_score` reducer, ensuring only the `client_id` or `owner_id` can modify it.
- [x] Write the `remove_player` reducer. Implement ownership transfer to the oldest remaining player if the owner leaves, or cascade delete the lobby if empty.

### **Phase 2: Build Pipeline & Bindings Setup**
- [x] Run `spacetime generate --lang typescript --out-dir js/stdb` to generate client bindings.
- [x] Create an entry point file (e.g., `js/stdb.ts`) exporting the `DbConnection`, `Identity`, and generated `Module`.
- [x] Initialize `package.json` for `esbuild` and the `spacetimedb` SDK.
- [x] Create a build script (`esbuild js/stdb.ts --bundle --outfile=js/stdb.bundle.js --format=esm`).
- [x] Update `index.html` to load the application logic as an ES module via `<script type="module" src="js/app.js"></script>`.

### **Phase 3: Frontend Data Abstraction & Logic**
- [x] Introduce a `playMode` variable (`'local'` vs `'multiplayer'`) to isolate application state contexts.
- [x] Create a `GameStore` interface outlining core methods like `addPlayer()`, `updateScore()`, and `getPlayers()`.
- [x] Implement `LocalStorageStore` to encapsulate the existing local offline logic.
- [x] Implement `SpacetimeDBStore` to wrap the `spacetime-bundle.js` logic.
- [x] Write initialization logic to check `localStorage` for an Identity token on page load, generate one if missing, and provide it to `DbConnection.builder().withToken()`.
- [x] Register database callbacks (`onInsert`, `onUpdate`, `onDelete`) to trigger UI scoreboard re-renders.
- [x] Wire the ML Domino counter to update locally if in Local Mode.
- [x] Wire the ML Domino counter in Multiplayer Mode to populate a "Pending Score" input.
- [x] Add a "Confirm Score" button that explicitly invokes the `update_score` reducer.

### **Phase 4: Network Resilience & Disconnect Handling**
- [x] Set up a connection state listener on the SpacetimeDB WebSocket.
- [x] Create a persistent "Reconnecting..." modal/overlay to display on disconnects during Multiplayer mode.
- [x] Add logic to block the UI from opening the Machine Learning Camera modal during a disconnect.
- [x] Add logic to disable all manual score input fields and buttons to prevent desyncs during a disconnect.
- [x] Write the reconnection handler to remove the overlay and restore input functionality.

### **Phase 5: UI Updates & Permissions**
- [x] Create a "Network Settings" input to toggle the SpacetimeDB server URL (defaulting to `ws://localhost:3000` or a testnet).
- [x] Build a Home Screen (Mode Selection) overlay to replace the immediate game setup view.
- [x] Add the "Create Lobby" modal and logic to auto-generate a 5-character code and join the creator.
- [x] Add the "Join Lobby" modal and logic to prompt for a code and valid name.
- [x] Add a displayed "Lobby Code" to the scoreboard in Multiplayer mode.
- [x] Add a functional "Leave Lobby" button to the scoreboard.
- [x] Disable "Add Player", "Reset", and "Clear" buttons in Multiplayer mode for non-owners.
- [x] Implement the permissions matrix to disable "Edit Name" and "Camera" icons for unauthorized players (comparing `client_id` vs `Identity`).
- [x] Integrate auto-reconnect logic to retrieve `last_stdb_lobby_code` from `localStorage` on page refresh.
