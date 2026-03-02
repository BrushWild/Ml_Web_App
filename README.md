# 🎲 Domino Recognition Web App

A browser-based domino scoring application that uses machine learning to automatically detect and count domino pips from a live webcam feed. Built as a lightweight static site — no server required.

> **Live Demo:** Deploy to GitHub Pages or open `index.html` directly in your browser.

---

## Features

- **Real-time Domino Detection** — Capture a webcam frame and let a YOLO-based ONNX model identify dominos and count their pips.
- **Two Detection Modes**
  - **Single-Pass** — Detects dominos and pips in one inference pass.
  - **Two-Pass Crop** — First detects dominos, then crops each one and re-runs inference at higher resolution for improved pip counting accuracy.
- **Player Scoreboard** — Add players, track scores across rounds, and view a live leaderboard. Scores persist in `localStorage`.
- **Debug Log Panel** — Expandable on-screen log for inspecting model output, detection details, and performance metrics.
- **Fully Client-Side** — Runs entirely in the browser using [ONNX Runtime Web](https://onnxruntime.ai/). No backend, no API keys.

---

## Tech Stack

| Layer | Technology |
|-------|------------|
| ML Inference | ONNX Runtime Web (CDN) |
| Model | YOLOv8 (exported to ONNX with End2End NMS) |
| Frontend | Vanilla HTML / CSS / JavaScript |
| Storage | Browser `localStorage` |

---

## Project Structure

```
Ml_Web_App/
├── index.html            # Main entry point
├── css/
│   └── style.css         # App styling (modal, scoreboard, toggle, logs)
├── js/
│   ├── app.js            # UI logic, player management, camera/modal control
│   ├── vision.js         # ONNX model loading, preprocessing, inference, post-processing
│   └── logger.js         # Debug log panel utilities
└── assets/
    └── models/
        └── best.onnx     # Active YOLO ONNX model
```

---

## Getting Started

### Prerequisites

- A modern browser with WebGL support (Chrome, Edge, Firefox).
- A webcam (the app requests camera access on use).

### Usage

1. **Add players** using the input field at the top.
2. Click the **📷 Score** button next to a player's name to open the camera modal.
3. Toggle between **Single-Pass** and **Two-Pass Crop** detection modes.
4. Press **Capture & Score** — the model runs inference and draws bounding boxes on the frame.
5. Review the detected score, then **Accept** to add it to the leaderboard or **Retake** to try again.

---

## License

This project is provided as-is for personal and educational use.