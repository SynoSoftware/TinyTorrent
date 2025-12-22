# TinyTorrent Frontend (HUD)

This folder contains TinyTorrent’s on-demand browser UI (React + TypeScript + Vite + Tailwind + HeroUI).

## Development

Prerequisites:

-   Node.js 20+
-   A running backend that speaks Transmission RPC.

Today the only backend that works reliably end-to-end is a standard `transmission-daemon` (default RPC port: `9091`).

Install and run the dev server:

```bash
npm install
npm run dev
```

Build a production bundle:

```bash
npm run build
```

Lint:

```bash
npm run lint
```

## Repo rules

All Node tooling (`npm`, `npx`, lockfiles, etc.) stays inside `frontend/`.
The repository root and `backend/` are intentionally Node/TypeScript-free so the native build tree stays clean.

See the repo-root `AGENTS.md` for the full rule set.
