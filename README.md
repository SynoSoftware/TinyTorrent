# TinyTorrent

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.0-blue)](https://www.typescriptlang.org/)
[![React](https://img.shields.io/badge/React-19-cyan)](https://react.dev/)
[![Architecture](https://img.shields.io/badge/Architecture-Hexagonal%2FAdapter-purple)]()
[![Size](https://img.shields.io/badge/Binary_Target-<3MB-success)]()

**A modern µTorrent-style BitTorrent client with a browser-native UI and a micro-sized backend.**

![UI preview](docs/dashboard-dark.png)
![UI preview](docs/dashboard-light.png)

**NOTE THIS IS WORK IN PROGRESS: Bugs do exist, some features are unfinished, regressions can appear**

**Status:** works if transmission-daemon is installed separatelly

---

I grew up with torrent clients that were **160 KB** — small, fast, and engineered with real hardware limits in mind. That era is gone. Today even a simple tray application wastes memory it has no reason to touch, and I’m not fine with that. So I decided to do something about it.

My first ideea was a pure C, bare-metal Windows 11 client — no external libraries, just raw WinAPI. Because the UI was unacceptable, I abandoned it for a while. Later I realised that every modern system already ships with a fully optimized, GPU-accelerated engine: the internet browser. Using it delivers **better visuals, less code, and a lower memory footprint** than any hand-rolled native UI.

This project exists to bring back what made the classics great: a lean core, a tiny binary, and a UI that feels like it came from the future — without abandoning engineering discipline.

**This is how TinyTorrent was born.**

Instead of dragging C++/Win32/Qt/GTK toolkits into the binary, TinyTorrent splits:

- **Native Shell:** A minimal executable that manages the window, lifecycle, and the torrent engine. It exposes a generic RPC interface.
- **Frontend:** React + TypeScript + HeroUI, leveraging the browser’s rendering engine for layout, animation, and GPU composition.

Modern torrent protocol and will push the torrent client toward **1–3 MB**, but the philosophy stays the same: **minimal memory and CPU used**.
**Zero GUI memory footprint** unless you actively open the interface — exactly how it should be.

---

## 💎 Key Features

### Browser-Native HUD (frontend/)

- **Zero GUI RAM when unused** — The UI runs in the browser/WebView only when opened.
- **Glass Monolith UI** — Tailwind v4 + HeroUI + blur + depth for a "Stealth" aesthetic.
- **Workspace Components** — Not just tables, but functional tools:
  - **File Explorer Tree:** Nested, accordion-style file selection with priority toggling.
  - **Visualizers:** Real-time speed graphs, Disk Space Gauge, and Peer Maps.
- **Kinetic Motion** — Framer Motion used for structural changes, not just decoration.

### Backend Agnostic Architecture

TinyTorrent is no longer tied to a single engine.

- **Domain-Driven Design:** The UI interacts with a API interface
- **Adapter Pattern:** We support multiple backends
  - **Transmission Adapter:** Connects to standard Transmission RPC.
  - **Libtorrent Adapter:** Connects to a custom C++ wrapper around `libtorrent-rasterbar`. (to be developed in the future)

### Professional Mechanics

- **Queue Management:** Reorder torrents, move to top/bottom, drag-and-drop ordering.
- **Deep Interaction:** Shift-click ranges, Ctrl-click toggles, full keyboard navigation.
- **Exact Typing:** No "any" types. The RPC schema is strictly typed and normalized.

---

## 🏗 Repository Structure

This README is in the **root** of the project.

```
TinyTorrent/
├── frontend/   # React 19 HUD, Vite build, Tailwind v4, HeroUI, Framer Motion
├── backend/    # C/C++ daemon (libtransmission + embedded Mongoose server)
└── README.md   # You are here
```

### Frontend Tech

- React 19
- TypeScript
- TailwindCSS v4
- HeroUI
- Framer Motion
- Vite

### Backend Tech

- C / C++17 (no exceptions, no RTTI)
- libtransmission
- Mongoose (embedded web server)
- Static asset bundler for shipping UI inside a single binary

---

## 🚀 Getting Started

### Prerequisites

- Node.js 20+ (for the frontend)
- **Development:** You can run the frontend against a standard `transmission-daemon` (port 9091) to test the UI.

### Development (frontend)

Runs the HUD with the Transmission Adapter active.

```bash
cd frontend
npm install
npm run dev
```

### Backend

Currently you can use a regular Transmission Daemon during development.

Custom TinyTorrent backend (single-binary build) will replace it.

---

## 🎨 Design Philosophy

The entire stack follows **AGENTS.md**:

1. Speed
2. Density
3. One Responsibility
4. Exact Typing
5. No entropy in the codebase

---

## 🤝 Contributing

Pull requests must follow the **Visual Excellence Directive**:

- Beautiful and consistent components
- Transitions via Framer Motion
- Strict TypeScript
- No regressions in density or performance

---

## Backend Note

The real TinyTorrent backend will be a **minimal, modified Transmission daemon** that embeds and serves the compiled frontend.
For now, use the standard `transmission-daemon`.

---

**TinyTorrent** — _Simple. Fast. Beautiful. Browser-Native._
