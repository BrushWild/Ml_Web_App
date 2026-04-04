 
# Master Task Checklist: SpacetimeDB Multiplayer Integration

This checklist is designed for AI agents to track progress across the 5 phases of migrating the Domino Vision app to a SpacetimeDB backend.

### **Phase 1: Backend Initialization & Schema**
- [ ] Initialize a new SpacetimeDB Rust project in a `/server` directory using `spacetime init --lang rust`.
- [ ] Create the `User` table with `identity` (PK) and `name` fields.
- [ ] Create the `Lobby` table with `lobby_code` (PK) and `owner_id` fields.
- [ ] Create the `Player` table with `player_id` (PK), `lobby_code`, `client_id`, `name`, and `score` fields.
- [ ] Write the `update_user_name` reducer to upsert the user's name and update their `Player` record.
- [ ] Write the `create_lobby` reducer to generate a lobby code, insert a `Lobby`, and add the caller as a `Player` with a score of `0`.
- [ ] Write the `join_lobby` reducer to validate the lobby, remove the user from existing lobbies, and insert them as a `Player` with a score of `0`.
- [ ] Write the `update_score` reducer, ensuring only the `client_id` or `owner_id` can modify it.
- [ ] Write the `remove_player` reducer. Implement ownership transfer to the oldest remaining player if the owner leaves, or cascade delete the lobby if empty.

### **Phase 2: Build Pipeline & Bindings Setup**
- [ ] Run `spacetime generate --lang typescript --out-dir js/stdb` to generate client bindings.
- [ ] Create an entry point file (e.g., `js/stdb.ts`) exporting the `DbConnection`, `Identity`, and generated `Module`.
- [ ] Initialize `package.json` for `esbuild` and the `@clockworklabs/spacetimedb-sdk`.
- [ ] Create a build script (`esbuild js/stdb.ts --bundle --outfile=js/stdb.bundle.js --format=esm`).
- [ ] Update `index.html` to load the application logic as an ES module via `<script type="module" src="js/app.js"></script>`.

### **Phase 3: Frontend Data Abstraction & Logic**
- [ ] Introduce a `playMode` variable (`'local'` vs `'multiplayer'`) to isolate application state contexts.
- [ ] Create a `GameStore` interface outlining core methods like `addPlayer()`, `updateScore()`, and `getPlayers()`.
- [ ] Implement `LocalStorageStore` to encapsulate the existing local offline logic.
- [ ] Implement `SpacetimeDBStore` to wrap the `spacetime-bundle.js` logic.
- [ ] Write initialization logic to check `localStorage` for an Identity token on page load, generate one if missing, and provide it to `DbConnection.builder().withToken()`.
- [ ] Register database callbacks (`onInsert`, `onUpdate`, `onDelete`) to trigger UI scoreboard re-renders.
- [ ] Wire the ML Domino counter to update locally if in Local Mode.
- [ ] Wire the ML Domino counter in Multiplayer Mode to populate a "Pending Score" input.
- [ ] Add a "Confirm Score" button that explicitly invokes the `update_score` reducer.

### **Phase 4: Network Resilience & Disconnect Handling**
- [ ] Set up a connection state listener on the SpacetimeDB WebSocket.
- [ ] Create a persistent "Reconnecting..." modal/overlay to display on disconnects during Multiplayer mode.
- [ ] Add logic to block the UI from opening the Machine Learning Camera modal during a disconnect.
- [ ] Add logic to disable all manual score input fields and buttons to prevent desyncs during a disconnect.
- [ ] Write the reconnection handler to remove the overlay and restore input functionality.

### **Phase 5: UI Updates & Permissions**
- [ ] Create a "Network Settings" input to toggle the SpacetimeDB server URL (defaulting to `ws://localhost:3000` or a testnet).
- [ ] Build the Home Screen Mode Selection UI with "Play Locally (Offline)", "Create Lobby", and "Join Lobby" buttons.
- [ ] Build the "Create Lobby" modal to prompt for a user name and auto-generate the lobby code.
- [ ] Build the "Join Lobby" modal to prompt for a user name and the lobby code text input.
- [ ] Add a "Leave" button to the main Game Setup / Scoreboard view.
- [ ] Add UI logic to prominently display the Lobby Code when in a Multiplayer lobby.
- [ ] Add UI logic to disable the local "Add Player", "Reset Scores", and "Clear List" buttons when in Multiplayer mode.
- [ ] Enforce visual permissions by comparing the connected user's Identity against the `Player.client_id` and `Lobby.owner_id`.
- [ ] Dynamically disable "Edit Name" and "Modify Score" buttons on the scoreboard if the current user lacks permission for that row.
