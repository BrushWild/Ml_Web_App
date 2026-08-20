# 🎲 Domino Recognition Web App

A browser-based domino scoring application that uses machine learning to automatically detect and count domino pips from a live webcam feed. It runs in **two modes**: a self-contained **Local Mode** (no server, scores in `localStorage`) and a real-time **Multiplayer Mode** backed by a SpacetimeDB backend, where players join a shared lobby by code and scores sync live.

> **Live Demo:** Deployed to GitHub Pages, or open `index.html` directly in your browser for Local Mode.

---

## Features

- **Real-time Domino Detection** — Capture a webcam frame and let a YOLO-based ONNX model identify dominos and count their pips.
- **Two Detection Modes**
  - **Single-Pass** — Detects dominos and pips in one inference pass.
  - **Two-Pass Crop** — First detects dominos, then crops each one and re-runs inference at higher resolution for improved pip counting accuracy.
- **Local Mode** — Add players, track scores across rounds, and view a live leaderboard. Scores persist in `localStorage`; no server required.
- **Multiplayer Mode** — Host or join a lobby by code. Player scores, names, and online status sync in real time through SpacetimeDB, so everyone in the lobby sees the same board. Includes a reconnect lifecycle that preserves your seat through brief disconnects and a "Return to Local Mode" fallback if the backend is unreachable.
- **Player Scoreboard** — Add players, track scores across rounds, and view a live leaderboard in both modes.
- **Debug Log Panel** — Expandable on-screen log for inspecting model output, detection details, and performance metrics (see also `debug.html`).
- **Client-Side Inference** — The ML model runs entirely in the browser using [ONNX Runtime Web](https://onnxruntime.ai/). No API keys; only Multiplayer Mode talks to a backend.

---

## Tech Stack

| Layer | Technology |
|-------|------------|
| ML Inference | ONNX Runtime Web (CDN) |
| Model | YOLOv8 (exported to ONNX with End2End NMS) |
| Frontend | Vanilla HTML / CSS / JavaScript |
| Local Storage | Browser `localStorage` |
| Multiplayer Backend | SpacetimeDB (Rust module) + SpacetimeDB JS client |
| Build | esbuild (`npm run build-stdb`) |
| Hosting | GitHub Pages |

---

## Project Structure

```
Ml_Web_App/
├── index.html            # Main entry point (Local + Multiplayer UI)
├── debug.html            # Debug-focused entry point
├── TESTING.md            # Multiplayer testing guide
├── css/
│   └── style.css         # App styling (modals, scoreboard, lobby, logs)
├── js/
│   ├── app.js            # UI logic, mode switching, camera/modal control, reconnect
│   ├── vision.js         # ONNX model loading, preprocessing, inference, post-processing
│   ├── logger.js         # Debug log panel utilities
│   ├── stdb.bundle.js    # Bundled SpacetimeDB client (built from stdb.ts)
│   ├── stdb.ts           # SpacetimeDB client entry (source for the bundle)
│   ├── stdb/             # Auto-generated SpacetimeDB reducers + types
│   │   ├── join_lobby_reducer.ts
│   │   ├── create_lobby_reducer.ts
│   │   ├── update_score_reducer.ts
│   │   └── ...           # other reducers, tables, types
│   └── stores/           # Storage abstraction (Local vs Multiplayer)
│       ├── GameStore.js
│       ├── LocalStorageStore.js
│       └── SpacetimeDBStore.js
├── server/
│   └── domino-vision/    # SpacetimeDB Rust backend module
│       └── spacetimedb/src/lib.rs
├── docs/
│   └── plans/            # Multiplayer implementation plan docs
├── mcp/                  # MCP context tooling
└── assets/
    └── models/
        └── best.onnx     # Active YOLO ONNX model
```

---

## Getting Started

### Prerequisites

- A modern browser with WebGL support (Chrome, Edge, Firefox).
- A webcam (the app requests camera access on use).
- **Multiplayer only:** Node.js + npm, and either the Spacetime Maincloud database or a local SpacetimeDB node (see [Multiplayer](#multiplayer-mode)).

### Build (Multiplayer)

The SpacetimeDB client is bundled from TypeScript before the app is served:

```bash
npm install
npm run build-stdb     # bundles js/stdb.ts -> js/stdb.bundle.js
```

Local Mode works without this step, but Multiplayer Mode expects the bundle to be present.

### Usage

1. **Add players** using the input field at the top (Local Mode), or **Host/Join a lobby** (Multiplayer Mode — see below).
2. Click the **📷 Score** button next to a player's name to open the camera modal.
3. Toggle between **Single-Pass** and **Two-Pass Crop** detection modes.
4. Press **Capture & Score** — the model runs inference and draws bounding boxes on the frame.
5. Review the detected score, then **Accept** to commit it to the scoreboard (and close), or **Accept & Continue** to save the score and stay in the camera modal for repeat captures. **Retake** to try again.

---

## Multiplayer Mode

Multiplayer Mode connects the frontend to a SpacetimeDB database (`domino-vision`). Three connection targets are offered:

- **Spacetime Maincloud** — `wss://maincloud.spacetimedb.com` (hosted; no setup).
- **Self Hosted** — `wss://dominohost.brushplusplus.com`, a SpacetimeDB node you run yourself.
- **Localhost (Dev Server)** — `ws://localhost:3000`, for development against a local `spacetime start`.

### Data model

The backend (`server/domino-vision`) defines three tables:

- **User** — a connected identity and display name.
- **Lobby** — a game room with a shareable `lobbyCode`, name, owner, and public flag.
- **Player** — a seat in a lobby: `playerId`, `lobbyCode`, `clientId`, `name`, `score`, and `isOnline`.

Reducers handle `create_lobby`, `join_lobby`, `delete_lobby`, `update_score`, `rename_player`, `remove_player`, plus connection lifecycle (`client_connected` / `client_disconnected`) so seats are retained across brief mobile disconnects.

### Joining a game

1. Choose **Multiplayer** mode and select a connection target (Maincloud or Self-Hosted).
2. **Host** a lobby to generate a code, or **Join** by entering a friend's code.
3. Players in the lobby appear on the scoreboard; scores update live for everyone.

> **Reconnect behavior:** If the backend connection drops, the UI locks the board and retries. After several attempts it offers **Return to Local Mode**, which lets you keep playing with locally-persisted scores instead of being stuck.

---

## License

This project is provided as-is for personal and educational use.
