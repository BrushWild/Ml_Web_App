---
description: Refresh the spacetime db front and back stacks
---

This workflow assumes that spacetime is already running via `spacetime start`

#### Setup
**Navigate** to the project directory containing the `spacetime.json` configuration file.

#### Build
**Execute** the build command:
   `spacetime build`
**Troubleshooting:** If the build fails due to missing toolchains (common in Rust), ensure the Wasm target is installed:
   `rustup target add wasm32-unknown-unknown`

#### Generate
**Generate typescript files**
   `spacetime generate --lang typescript --out-dir js/stdb --module-path ..\..\server\domino-vision\spacetimedb\`
   `npm run build-stdb`

#### Publish
**Publish the Module:** In a new terminal within the project directory, run:
   `spacetime publish domino-vision --server local --clear-database -y`