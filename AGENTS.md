# **AGENTS.md — TinyTorrent Mission Specification**

## Mission Compass

1. Keep TinyTorrent lean: executable size, in-memory footprint, and runtime cost must stay as low as possible.
2. Align the GUI experience with the minimalist, performance-first ethos of the backend.
3. Respect responsibility boundaries so that each component focuses on what it does best (native daemon vs. on-demand frontend).

## Repository Rules

- Node tooling (`npm`, `npx`, `pnpm`, etc.) and TypeScript-only assets live inside `frontend/`. Run package installs, scripts, and builds from within that folder.
- The repository root and native backend directories must remain free of TypeScript, Node metadata, and npm scripts. No `package.json`, no `node_modules`, and no `npx`/`npm` commands belong in `/` itself.
- Keep the root path small, predictable, and focused on C/C++ or documentation so the native builds stay portable and unpolluted by frontend tooling.

## Design Philosophy (see README)

1. **Speed** - fast boots, snappy controls, responsive RPCs.
2. **Density** - pack only what is strictly necessary.
3. **One Responsibility** - keep the tray/backend distinct from the browser UI.
4. **Exact Typing** - avoid `any` and prefer strict schema alignment.
5. **No entropy** - no duplicate configurations, no drifting tooling.

## Work Protocol

- Before recommending a command for the user to run, the agent must run it itself if the environment permits and confirm it succeeds.
  If the command cannot be tested, the agent must explicitly state that it is untested and speculative.

- The agent must not claim a task is complete unless:

  - the fix was validated through the **same external interface the user relies on** (e.g. RPC, HTTP, frontend behavior), **or**
  - the agent explicitly states that the change is **unvalidated** and may still be incorrect.

- Code changes alone are insufficient to declare a fix.

- The agent must not treat a task as complete, successful, or resolved unless the fix was externally validated through the same interface the user relies on, or the agent explicitly states that the result is unvalidated and may still be incorrect.
