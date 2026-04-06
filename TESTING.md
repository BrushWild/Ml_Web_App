# Domino Vision Testing Guide

This document outlines the procedures for testing the Domino Vision application, with a focus on the real-time multiplayer features powered by SpacetimeDB.

## 🛠️ Testing Environment Setup

To test multiplayer, you need a local SpacetimeDB node and a way to serve the frontend.

1.  **Start SpacetimeDB**:
    ```bash
    cd server/domino-vision
    spacetime start
    ```
2.  **Start Frontend Server**:
    In the root directory, run a static server (e.g., Live Server or `npx serve .`).
    The following guide assumes the app is served at **http://127.0.0.1:5500/**.

## 👥 Multiplayer Testing Scenarios

Testing multiplayer requires **at least two browser sessions** (e.g., one normal window and one incognito window, or two different browsers).

### 1. Lobby Creation & Joining
- **Host (User A)**:
    - Click **Create Lobby (Host)** on the home screen.
    - Enter a name (e.g., "Alice") and click **Start Game**.
    - Verify that a 5-character **Lobby Code** appears at the top of the scoreboard.
- **Guest (User B)**:
    - Click **Join Existing Lobby** on the home screen.
    - Enter a name (e.g., "Bob") and the 5-character code from the Host.
    - Click **Join Game**.
- **Verification**:
    - Both users should see "Alice" and "Bob" in their respective scoreboards.
    - Small "(You)" label should appear next to the correct player in each session.

### 2. Real-Time Score Updates
- **Action**: User A clicks the camera icon for User B and updates their score.
- **Verification**:
    - User B's score updates immediately on User A's screen.
    - User B's score updates immediately on User B's screen.

### 3. Permission Matrix
- **Rules**:
    - **Lobby Owner**: Can edit anyone's name/score and reset/clear all scores.
    - **Guest Player**: Can only edit their *own* name/score.
- **Test**:
    - User B (Guest) tries to click the settings/camera icon for User A (Host).
    - **Verification**: The icon should be disabled or show a "No Permission" tooltip.
    - User A (Host) clicks the Reset Scores button.
    - **Verification**: All scores in both sessions reset to 0.

### 4. Network Resilience
- **Action**: Stop the `spacetime start` process.
- **Verification**:
    - Both users should see the **Reconnecting...** overlay.
    - Actions should be disabled.
- **Action**: Restart `spacetime start`.
- **Verification**:
    - The overlay should disappear, and the session should resume.

## 🤖 AI-Assisted Testing

An AI agent can follow the automated test script or the structured workflow in `.agents/workflows/multiplayer-test.md`.

To trigger the AI testing suite:
1.  Ensure you have the `browser_subagent` capability.
2.  Run the command: `/multiplayer-test` (in supported environments).

## 🔍 Key Selectors for Automation

If writing automated tests (e.g., Playwright):
- **Host Button**: `#host-lobby-btn`
- **Join Button**: `#join-lobby-btn-home`
- **Lobby Code**: `#display-lobby-code`
- **Player Names**: `.player-name`
- **Player Scores**: `.player-score-large`
- **Confirm to Backend**: `#confirm-score-btn`
- **Default Port**: `5500`
