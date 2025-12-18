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

1. **Speed** – fast boots, snappy controls, responsive RPCs.
2. **Density** – pack only what is strictly necessary.
3. **One Responsibility** – keep the tray/backend distinct from the browser UI.
4. **Exact Typing** – avoid `any` and prefer strict schema alignment.
5. **No entropy** – no duplicate configurations, no drifting tooling.
