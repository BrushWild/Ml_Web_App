 
# Phase 4: Network Resilience & Disconnect Handling

### **System Context & Architecture**
* The core goal is to upgrade the vanilla HTML/JS local-storage Domino Vision app to support a real-time, pseudo-multiplayer experience using a SpacetimeDB Rust backend.
* **Frontend:** The frontend will remain Vanilla HTML/JS, utilizing `esbuild` strictly to bundle the generated SpacetimeDB JS client bindings into a single script called `spacetime-bundle.js`.
* **Backend:** The SpacetimeDB module will be written in Rust and located in a new `/server/domino-vision` directory.
* **State Management:** The application will use a "Hybrid" approach with strictly isolated contexts. It defaults to Local Mode, reading and writing entirely to the existing `localStorage` logic. If a user creates or joins a lobby, the local state is abandoned, and they enter the multiplayer lobby with a fresh score of `0`. 
* **Identity:** SpacetimeDB uses public/private keys generated locally to track cryptographic identity. Authentication tokens must be cached in `localStorage` and provided on subsequent page loads so users retain their identity upon refreshing.

---

### **Execution Steps for Phase 4**
**Objective:** Protect the user experience during network drops.

**Step 1: Monitor Connection State**
* Implement a connection state listener on the SpacetimeDB WebSocket.

**Step 2: Handle Disconnect Events**
* If the connection drops while in Multiplayer mode:
    * Display a persistent "Reconnecting..." modal/overlay.
    * Completely disable/block the UI from opening the Machine Learning Camera modal.
    * Disable all manual score input fields and buttons to prevent data desync.

**Step 3: Handle Reconnect Events**
* Remove the overlay and re-enable inputs once the WebSocket connection is reestablished.
