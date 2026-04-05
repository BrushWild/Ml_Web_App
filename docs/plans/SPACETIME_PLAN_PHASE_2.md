 
# Phase 2: Build Pipeline & Bindings Setup

### **System Context & Architecture**
* The core goal is to upgrade the vanilla HTML/JS local-storage Domino Vision app to support a real-time, pseudo-multiplayer experience using a SpacetimeDB Rust backend.
* **Frontend:** The frontend will remain Vanilla HTML/JS, utilizing `esbuild` strictly to bundle the generated SpacetimeDB JS client bindings into a single script called `spacetime-bundle.js`.
* **Backend:** The SpacetimeDB module will be written in Rust and located in a new `/server/domino-vision` directory.
* **State Management:** The application will use a "Hybrid" approach with strictly isolated contexts. It defaults to Local Mode, reading and writing entirely to the existing `localStorage` logic. If a user creates or joins a lobby, the local state is abandoned, and they enter the multiplayer lobby with a fresh score of `0`. 
* **Identity:** SpacetimeDB uses public/private keys generated locally to track cryptographic identity. Authentication tokens must be cached in `localStorage` and provided on subsequent page loads so users retain their identity upon refreshing.

---

### **Execution Steps for Phase 2**
**Objective:** Generate the client SDK and set up the minimal bundler.

**Step 1: Generate Bindings**
* Generate the TypeScript/JS bindings from the Rust backend using the SpacetimeDB CLI: `spacetime generate --lang typescript --out-dir js/stdb`.
* Create an entry point file (e.g. `js/stdb.ts`) that exports the `DbConnection`, `Identity`, and generated `Module` definitions.

**Step 2: Setup Bundler Pipeline**
* Initialize a basic `package.json` specifically for `esbuild` and `@clockworklabs/spacetimedb-sdk` (v2.1+).
* Write a build script using `esbuild` to compile it down to a browser-compatible module: `esbuild js/stdb.ts --bundle --outfile=js/stdb.bundle.js --format=esm`.

**Step 3: Integrate with Frontend**
* In `index.html`, load your app logic as a module: `<script type="module" src="js/app.js"></script>`.
