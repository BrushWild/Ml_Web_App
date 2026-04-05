 
# Phase 1: Backend Initialization & Schema

### **System Context & Architecture**
* The core goal is to upgrade the vanilla HTML/JS local-storage Domino Vision app to support a real-time, pseudo-multiplayer experience using a SpacetimeDB Rust backend.
* **Frontend:** The frontend will remain Vanilla HTML/JS, utilizing `esbuild` strictly to bundle the generated SpacetimeDB JS client bindings into a single script called `spacetime-bundle.js`.
* **Backend:** The SpacetimeDB module will be written in Rust and located in a new `/server/domino-vision` directory.
* **State Management:** The application will use a "Hybrid" approach with strictly isolated contexts. It defaults to Local Mode, reading and writing entirely to the existing `localStorage` logic. If a user creates or joins a lobby, the local state is abandoned, and they enter the multiplayer lobby with a fresh score of `0`. 
* **Identity:** SpacetimeDB uses public/private keys generated locally to track cryptographic identity. Authentication tokens must be cached in `localStorage` and provided on subsequent page loads so users retain their identity upon refreshing.

---

### **Execution Steps for Phase 1**
**Objective:** Define the schema, and write reducers.

**Step 1: Define Data Models (Tables)**
| Table | Fields | Description |
| :--- | :--- | :--- |
| `User` | `identity` (Identity, PK), `name` (String) | Tracks the connection's cryptographic identity and their chosen display name. |
| `Lobby` | `lobby_code` (String, PK), `owner_id` (Identity) | Stores active game rooms and tracks the identity of the user who created it. |
| `Player` | `player_id` (u64, PK), `lobby_code` (String), `client_id` (Identity), `name` (String), `score` (i32/u32) | Stores individual players tied to a lobby, tracking their name and score. |

**Step 2: Implement User & Lobby Reducers**
* `update_user_name(name: String)`: Upserts the user's name in the `User` table and updates their `Player` record if they are currently in a lobby.
* `create_lobby(code: String, user_name: String)`: Validates the code is unique, generates a random 5-character string, updates the user's name, inserts a `Lobby`, and adds the caller as the first `Player` with a score of `0`.
* `join_lobby(code: String, name: String)`: Validates the lobby exists, removes the user from any existing lobby, and inserts a `Player` with a score of `0`.

**Step 3: Implement Gameplay Reducers (With Permissions)**
* `update_score(player_id: u64, new_score: i32)`: Updates a player's score. Only the player themselves (`client_id`) or the lobby's `owner_id` can modify a score.
* `remove_player(player_id: u64)`: Allows the `owner_id` to kick someone or the specific `client_id` to leave. If the leaving player is the `owner_id`, find the remaining `Player` in that lobby with the lowest `player_id` (the oldest) and update the `Lobby`'s `owner_id` to transfer ownership. If no players remain, delete the `Lobby` record and all its players cascadingly.
