# SpacetimeDB Multiplayer Integration Plan

This document outlines the architecture, data models, and steps required to migrate the Domino Vision application from purely local `localStorage` to a pseudo-multiplayer experience using **SpacetimeDB**.

The goal is to allow users to either play a "Local Game" offline, or connect to a hosted SpacetimeDB server to "Create a Lobby" or "Join a Lobby", where players share a synced scoreboard.

## 1. Backend Architecture (Rust SpacetimeDB Module)

You will need to initialize a SpacetimeDB module in Rust (`spacetime init --lang rust`). The server module will maintain the lobby and player states.

### Data Models (Tables)

We define three primary tables:
- `User`: Tracks the connection's cryptographic identity and their chosen display name.
- `Lobby`: Represents an active game room, defined by a unique string code. Tracks the identity of the user who created it (the owner).
- `Player`: Represents a user's participation in a specific lobby, tracking their name and score.

```rust
use spacetimedb::{table, reducer, Identity, ReducerContext, Table};

#[table(accessor = user, public)]
pub struct User {
    #[primary_key]
    pub identity: Identity,
    pub name: String,
}

#[table(accessor = lobby, public)]
pub struct Lobby {
    #[primary_key]
    pub code: String,
    pub owner_identity: Identity,
}

#[table(accessor = player, public)]
pub struct Player {
    #[primary_key]
    pub identity: Identity,
    pub lobby_code: String,
    pub name: String,
    pub score: u32,
}
```

### Reducers (Functions)

The backend exposes several reducers that clients can call to manipulate the state:

1. `update_user_name(name: String)`: Upserts the user's name in the `User` table and updates their `Player` record if they are currently in a lobby.
2. `create_lobby(code: String, user_name: String)`: Validates the code is unique, updates the user's name, creates a new `Lobby`, and inserts the caller as a `Player` with score `0`.
3. `join_lobby(code: String, user_name: String)`: Validates the lobby exists, removes the user from any existing lobby, and inserts them as a `Player` in the new lobby with score `0`.
4. `update_score(target_identity: Identity, new_score: u32)`: Updates a player's score. **Permission Check:** Only the player themselves or the lobby's owner can modify a score.
5. `remove_player(target_identity: Identity)`: Removes a player from the lobby. **Permission Check:** A player can remove themselves (leave), or the owner can remove someone else (kick). If the owner leaves, the entire lobby and all its players are cascadingly deleted.

## 2. Frontend Integration (JavaScript Client)

Because the current app is a zero-build vanilla HTML/JS project, integrating the SpacetimeDB `@clockworklabs/spacetimedb-sdk` (v2.1+) requires generating the TypeScript bindings and bundling them into a single ES module script that the browser can load natively.

### Bundling Steps

1. Run `spacetime generate --lang typescript --out-dir js/stdb` against the Rust module.
2. Create an entry point file (e.g. `js/stdb.ts`) that exports the `DbConnection`, `Identity`, and generated `Module` definitions.
3. Use a lightweight bundler like `esbuild` to compile it down to a browser-compatible module:
   ```bash
   esbuild js/stdb.ts --bundle --outfile=js/stdb.bundle.js --format=esm
   ```
4. In `index.html`, load your app logic as a module: `<script type="module" src="js/app.js"></script>`.

### UI Changes (`index.html` & `style.css`)

Add a new **Home Screen** (Mode Selection) to replace the immediate game setup view.
- Input: "SpacetimeDB Server URL" (defaulting to `ws://localhost:3000` or a testnet URL).
- Buttons: **Play Local (Offline)**, **Create Lobby**, and **Join Lobby**.

Add **Modals** for Creating and Joining:
- Create Lobby: Prompts for the user's name. (The app will auto-generate a 4-letter lobby code).
- Join Lobby: Prompts for the user's name and the 4-letter lobby code.

Modify the **Game Setup / Scoreboard** view:
- Add a "Leave" button.
- If in a Multiplayer lobby, display the Lobby Code prominently.
- Disable the generic "Add Player", "Reset Scores", and "Clear List" buttons in multiplayer mode, as players now join independently.

### Application Logic (`app.js`)

1. **Authentication Persistence**: SpacetimeDB uses public/private keys generated locally. You must cache the authentication token returned upon connection in `localStorage` and provide it to the `DbConnection.builder().withToken()` on subsequent page loads so users retain their owner/player identity if they refresh.
2. **Mode State**: Introduce a `playMode` variable (`'local'` vs `'multiplayer'`).
   - Local mode reads/writes entirely to `localStorage` as the app currently does.
   - Multiplayer mode initializes the `DbConnection`, calls the connection reducers (`createLobby`, `joinLobby`), and subscribes to the `Lobby` and `Player` tables.
3. **Data Binding**:
   - Register callbacks on the tables (e.g., `stdbConn.db.Player.onInsert`, `.onUpdate`, `.onDelete`) to re-render the scoreboard whenever the database state changes.
   - When rendering the scoreboard in Multiplayer mode, dynamically check the connected user's identity against the `Player.identity` and the `Lobby.owner_identity` to selectively show or hide the "Edit" and "Capture Score" buttons to enforce permissions on the UI level (the backend reducers enforce them securely).
4. **Scoring**: When the YOLO model accepts a score, check the `playMode`. If local, apply the addition locally. If multiplayer, find the player's current DB score, add the new amount, and invoke `stdbConn.reducers.updateScore(id, newTotal)`.

## Summary

By maintaining a clean separation between the Local `localStorage` array and the SpacetimeDB `Player` table, the app can offer robust offline utility while providing seamless real-time multiplayer scoring when connected.
