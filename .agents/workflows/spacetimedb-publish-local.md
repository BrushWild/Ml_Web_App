---
description: Deploys the SpacetimeDB module to a local node. Use for testing application logic and client-side integrations in a sandbox environment.
---

# Publish SpacetimeDB Local

This workflow handles the deployment of a compiled module to a locally running instance of SpacetimeDB.

## When to use this workflow

- Use this for rapid iteration where you don't want to wait for cloud deployment latency.
- This is helpful for testing "reducers" and "tables" with local client SDKs (Unity, TS, Rust).
- Use this when working offline or in a private development environment.

## How to use it

1. **Start the Local Node:** Ensure a local SpacetimeDB instance is running in the background:
   `spacetime start`
2. **Publish the Module:** In a new terminal within the project directory, run:
   `spacetime publish <database-name> --server local`
3. **Automatic Updates:** For a seamless "save-to-publish" workflow, you can use the dev command:
   `spacetime dev <database-name>`
4. **Confirm Identity:** Note the `Identity` (hex string) output by the CLI; you will need this to connect your client-side application.