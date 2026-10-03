# **AGENTS.md — TinyTorrent Mission Specification**

## Mission Compass

1. Minimize runtime memory first, especially while downloading/seeding with WinUI closed. Correctness and useful transfer performance remain constraints; executable size is secondary. The desktop architecture owns the measurement policy.
2. Align the GUI experience with the minimalist, performance-first ethos of the engine.
3. Respect responsibility boundaries between the engine, which includes the tray, and on-demand WinUI.

Before planning or changing the local Windows architecture, read
[docs/desktop-architecture.md](docs/desktop-architecture.md). It owns runtime,
communication, and dependency decisions; older browser/Transmission specifications
describe legacy code. This authority also applies in component instructions.

Before changing user-facing text, language selection, or display formatting, read
[docs/localisation.md](docs/localisation.md); it owns the catalogue and live-switch
contract for the desktop product.

Project terms such as engine, pipe adapter, and protocol are defined in
[CONTEXT.md](CONTEXT.md). Use them as written.

---

## Repository Rules

- Node tooling (`npm`, `npx`, `pnpm`, etc.) and TypeScript-only assets live **exclusively** inside `frontend/`.
  Run package installs, scripts, and builds from within that folder only.

- The repository root, `engine/`, and `backend/` must remain free of TypeScript, Node metadata, and npm scripts.
  **No** `package.json`, **no** `node_modules`, **no** `npx`/`npm` commands belong in `/` itself.

- **No web-frontend-generated artifacts may exist outside `frontend/`.**
  This includes (but is not limited to):
  - build output (`dist/`, `build/`, etc.)
  - caches
  - temporary files
  - symlinks
  - tooling hooks or helper scripts

- Web frontend code must not reference, import from, or depend on paths outside `frontend/`
  (including `../node_modules`, backend directories, or root-level utilities).

- Keep the root path small, predictable, and focused on C/C++ or documentation so native builds stay portable and unpolluted by frontend tooling.

- These web tooling rules apply to `frontend/`; native WinUI sources, dependencies,
  and generated build artifacts belong under `winui3/` and use its own instructions.

---

## Build & Release Structure

- The `scripts/` folder contains **release-oriented build scripts** responsible for producing the **final executable artifacts**.
  These scripts may orchestrate backend builds, frontend packaging, signing, and final assembly.

- `engine/` is the new project for the engine: the torrent client that stays in the tray.
  It does not exist yet and has no build entry point. When it gets one, name that single entry point here.

- `backend/` and `frontend/` are the earlier TypeScript version. Desktop work does not touch them;
  the rules about them in this file describe that version as it stands.

- `backend/make.ps1` is the **authoritative entry point** for backend compilation.
  - It defines the canonical backend build flow.
  - It is **modular by design** and may call other PowerShell scripts or helper files.
  - Agents must treat `make.ps1` as the starting point, not bypass it with ad-hoc build commands.

- No other backend build entry point may diverge in behavior or assumptions from `backend/make.ps1`.

---

## Design Philosophy (see README)

1. **Speed** — fast boots, snappy controls, responsive RPCs.
2. **Density** — pack only what is strictly necessary.
3. **One Responsibility** — keep engine policy, tray behavior, and WinUI presentation at their own owners; responsibility boundaries do not require separate processes.
4. **Exact Typing** — avoid `any`; prefer strict schema alignment and explicit contracts.
5. **No Entropy** — no duplicate configurations, no drifting tooling, no convenience shortcuts.
6. **Web Frontend Styling Authority** — web feature code uses shared semantic tokens/primitives (see `frontend/AGENTS.md`); WinUI follows `winui3/AGENTS.md`.
7. **No New Web Tokens Without Approval** — agents must not introduce new web frontend semantic tokens without explicit user permission.

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

- The same rule binds the desktop product: the engine must start, run, and shut down correctly
  with no WinUI process and no WinUI files present.

---

## Work Protocol

- Before choosing, adding, or running tests, read [docs/testing.md](docs/testing.md).
  It is the authority for test scope: incremental work does not imply a full suite.
  Local build entry points and restrictions on launching desktop applications still apply.

- Every iteration must begin with enough local familiarization to understand the existing owner, data flow, and adjacent patterns before code is changed.
  The agent must inspect the surrounding code first so it can identify duplication, overlap, ownership drift, and parallel structures before deciding where to patch.

- The default target is the **minimal architecture that still works**.
  Prefer the smallest local fix at the natural owner, expressed through existing state and existing boundaries, over new abstractions or broader rewrites.
  Collapse overlap instead of preserving it, treat API growth as harmful by default, and remove unnecessary indirection rather than layering on helpers, props, or compatibility paths.

- Follow-up iterations are expected to reduce drift, not add “cleanup architecture.”
  Refactors must simplify the model, reduce touched surface, and remove overlap; they must not introduce broader systems, speculative abstractions, or convenience APIs.

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
  - `backend/AGENTS.md` when working in `backend/`
  - the desktop architecture and `CONTEXT.md` when working in `engine/`, which has no AGENTS file yet
  - `winui3/AGENTS.md` when working on WinUI or its tooling
  - `frontend/AGENTS.md` when working on the web frontend or its tooling

- For web frontend work, the ownership, overlap, API-surface, and simplification rules in `frontend/AGENTS.md` are mandatory.

- Global rules in this file are authoritative unless explicitly overridden by a more specific AGENTS file.

---
