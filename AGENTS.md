# **AGENTS.md — TinyTorrent Mission Specification**

## Mission Compass

1. Keep TinyTorrent lean: executable size, in-memory footprint, and runtime cost must stay as low as possible.
2. Align the GUI experience with the minimalist, performance-first ethos of the backend.
3. Respect responsibility boundaries so that each component focuses on what it does best (native daemon vs. on-demand frontend).

---

## Repository Rules

- Node tooling (`npm`, `npx`, `pnpm`, etc.) and TypeScript-only assets live **exclusively** inside `frontend/`.
  Run package installs, scripts, and builds from within that folder only.

- The repository root and native backend directories must remain free of TypeScript, Node metadata, and npm scripts.
  **No** `package.json`, **no** `node_modules`, **no** `npx`/`npm` commands belong in `/` itself.

- **No frontend-generated artifacts may exist outside `frontend/`.**
  This includes (but is not limited to):
  - build output (`dist/`, `build/`, etc.)
  - caches
  - temporary files
  - symlinks
  - tooling hooks or helper scripts

- Frontend code must not reference, import from, or depend on paths outside `frontend/`
  (including `../node_modules`, backend directories, or root-level utilities).

- Keep the root path small, predictable, and focused on C/C++ or documentation so native builds stay portable and unpolluted by frontend tooling.

---

## Build & Release Structure

- The `scripts/` folder contains **release-oriented build scripts** responsible for producing the **final executable artifacts**.
  These scripts may orchestrate backend builds, frontend packaging, signing, and final assembly.

- `backend/make.ps1` is the **authoritative entry point** for backend compilation.
  - It defines the canonical backend build flow.
  - It is **modular by design** and may call other PowerShell scripts or helper files.
  - Agents must treat `make.ps1` as the starting point, not bypass it with ad-hoc build commands.

- No other backend build entry point may diverge in behavior or assumptions from `backend/make.ps1`.

---

## Design Philosophy (see README)

1. **Speed** — fast boots, snappy controls, responsive RPCs.
2. **Density** — pack only what is strictly necessary.
3. **One Responsibility** — keep the tray, backend, and browser UI strictly distinct.
4. **Exact Typing** — avoid `any`; prefer strict schema alignment and explicit contracts.
5. **No Entropy** — no duplicate configurations, no drifting tooling, no convenience shortcuts.

---

## Runtime Responsibility Boundary (Hard Rule)

- **The backend must be fully functional, startable, and testable with no frontend present.**

  - Backend correctness, startup, shutdown, and RPC behavior must never depend on:
    - UI availability
    - browser state
    - frontend build artifacts
    - frontend lifecycle decisions

  - The frontend may consume backend capabilities.
    The backend must never assume or require the frontend.

---

## Work Protocol

- Before recommending a command for the user to run, the agent must run it itself **if the environment permits** and confirm it succeeds.

- If a command cannot be tested, the agent must explicitly state that it is **untested and speculative**.

- Code changes alone are insufficient to declare a fix.

- The agent must **not claim a task is complete** unless **one** of the following is true:

  - The fix was validated through the **same external interface the user relies on**
    (e.g. RPC behavior, HTTP responses, frontend-visible behavior), **or**
  - The agent explicitly states that the change is **unvalidated** and may still be incorrect.

- Silence on validation status is considered a failure.

---

## Tooling & Dependency Discipline

- Any new tool, dependency, workflow, or build step must justify:
  - executable size impact
  - memory footprint impact
  - runtime cost

- If the justification cannot be made explicitly, the change is rejected by default.

---

## Mandatory Procedure

- Agents **must** read and follow:
  - `backend/AGENTS.md` when working on native code
  - `frontend/AGENTS.md` when working on UI or tooling

- Global rules in this file are authoritative unless explicitly overridden by a more specific AGENTS file.

---
