---
description: Compiles a SpacetimeDB module into a WebAssembly (Wasm) binary. Use when you need to verify schema/reducer logic or prepare for deployment.
---

# Build SpacetimeDB Module

This workflow compiles the project source code into a SpacetimeDB-compatible module. It is the essential first step to ensure the code is syntactically correct and the schema is valid.

## When to use this workflow

- Use this after modifying `lib.rs`, `Program.cs`, or your TypeScript source files.
- Use this to catch compilation errors before attempting a local or remote publish.
- This is helpful for generating the `.wasm` file required for the database engine.

## How to use it

1. **Navigate** to the project directory containing the `spacetime.json` configuration file.
2. **Execute** the build command:
   `spacetime build`
3. **Debug Mode:** For faster compilation during active development, use:
   `spacetime build --debug`
4. **Troubleshooting:** If the build fails due to missing toolchains (common in Rust), ensure the Wasm target is installed:
   `rustup target add wasm32-unknown-unknown`