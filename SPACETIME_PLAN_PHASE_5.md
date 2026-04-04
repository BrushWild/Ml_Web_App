 # Phase 5: UI Updates & Permissions

### **System Context & Architecture**
* The core goal is to upgrade the vanilla HTML/JS local-storage Domino Vision app to support a real-time, pseudo-multiplayer experience using a SpacetimeDB Rust backend.
* **Frontend:** The frontend will remain Vanilla HTML/JS, utilizing `esbuild` strictly to bundle the generated SpacetimeDB JS client bindings into a single script called `spacetime-bundle.js`.
* **Backend:** The SpacetimeDB module will be written in Rust and located in a new `/server` directory. You can initialize it using the command `spacetime init --lang rust`.
* **State Management:** The application will use a "Hybrid" approach with strictly isolated contexts. It defaults to Local Mode, reading and writing entirely to the existing `localStorage` logic. If a user creates or joins a lobby, the local state is abandoned, and they enter the multiplayer lobby with a fresh score of `0`. 
* **Identity:** SpacetimeDB uses public/private keys generated locally to track cryptographic identity. Authentication tokens must be cached in `localStorage` and provided on subsequent page loads so users retain their identity upon refreshing.

---

### **Execution Steps for Phase 5**
**Objective:** Build the Lobby system UI and enforce visual permissions.

**Step 1: Build the Main Lobbies UI**
* Create a "Network Settings" input/modal to toggle the SpacetimeDB connection URL, defaulting to `ws://localhost:3000` or a testnet URL.
* Build a Home Screen (Mode Selection) overlay to replace the immediate game setup view. This should feature three buttons: **Play Locally (Offline)**, **Create Lobby**, and **Join Lobby**.

**Step 2: Create Lobby Modals & Logic**
* Create Lobby: Prompts for the user's name. (The app will auto-generate a lobby code).
* Join Lobby: Prompts for the user's name and the required text input for the lobby code.

**Step 3: Refactor the Scoreboard View**
* Add a "Leave" button.
* If in a Multiplayer lobby, display the Lobby Code prominently.
* Disable the generic "Add Player", "Reset Scores", and "Clear List" buttons in multiplayer mode, as players now join independently.

**Step 4: Implement Visual Permissions**
* When rendering the scoreboard in Multiplayer mode using `SpacetimeDBStore`, dynamically compare the `client_id` of each player against the user's local Identity token. Disable the "Edit Name" and "Modify Score" buttons for players that do not match, *unless* the user's Identity matches the `owner_id` of the Lobby.
