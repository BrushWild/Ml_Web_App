---
description: 
---

# Alice & Bob Synchronization Test

This workflow verifies full dual-user synchronization: lobby creation, join-code validation, and real-time player list updates.

## Prerequisites

- [ ] **Backend**: Ensure `spacetime start` is running in `server/domino-vision`.
- [ ] **Frontend**: Ensure the app is served at port 5500.

## User 1: Alice (Host)

1.  **Open Alice's Browser**: Navigate to `http://localhost:5500`.
2.  **Create Lobby**:
    - Click **"Create Lobby (Host)"** (#host-lobby-btn).
    - Enter name: **"Alice"**.
    - Click **"Create Lobby"** (#create-confirm-btn).
3.  **Capture Code**:
    - Locate the 5-character code in the header (#display-lobby-code).
    - **Note this code** for Bob.

## Phase 3=2: Verification

1.  **Check Alice's Screen**:
    - Verify that **"Alice"** appears in the scoreboard.
2.  **Real-time Score Sync (Optional)**:
    - Alice updates Alices's score.
    - Verify the update appears instantly.