# TinyTorrent

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.0-blue)](https://www.typescriptlang.org/)
[![React](https://img.shields.io/badge/React-19-cyan)](https://react.dev/)
[![Architecture](https://img.shields.io/badge/Architecture-Hexagonal%2FAdapter-purple)]()
[![Size](https://img.shields.io/badge/Binary_Target-<3MB-success)]()

**A modern µTorrent-style BitTorrent client with a browser-native UI and a micro-sized backend.**

**NOTE THIS IS WORK IN PROGRESS - DON'T EXPECT IT TO WORK JUST YET**

---

I got pissed when I realized that we no longer have a proper torrent client. I grew up when we had a torrent client that was a 160kb .exe—lightweight and fast.
Back then the protocol was simpler and the world was smaller; today’s requirements demand more code, so we'll have to settle for 1-3 megabytes, but the philosophy is identical:
**high efficiency + a UI that looks like it came from the future.**

So I decided to go bare-metal. I wanted to write a pure C application for Windows 11 that uses no external libraries, just calling Windows API. I called it rawBit.
However, I realized that would be ugly and nobody would use it. I can do better: I can write it to use even less memory, less code, and be more beautiful by using the browser that's already installed—a fully optimized, GPU-accelerated UI framework.

**This is how TinyTorrent was born.**

Instead of dragging C++/Win32/Qt/GTK toolkits into the binary, TinyTorrent splits:

- **Native Shell:** A minimal executable that manages the window, lifecycle, and the torrent engine. It exposes a generic RPC interface.
- **Frontend:** React + TypeScript + HeroUI, leveraging the browser’s rendering engine for layout, animation, and GPU composition.

The result: a **single 2–3 MB `.exe`** that feels weightless.
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
