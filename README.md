
# TinyTorrent

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.0-blue)](https://www.typescriptlang.org/)
[![React](https://img.shields.io/badge/React-19-cyan)](https://react.dev/)
[![Engine](https://img.shields.io/badge/Engine-Libtransmission-orange)](https://github.com/transmission/transmission)
[![Size](https://img.shields.io/badge/Binary_Target-<3MB-success)]()

**A modern µTorrent-style BitTorrent client with a browser-native UI and a micro-sized backend.**

---

I realized every machine already ships with a fully optimized, GPU-accelerated UI framework: **the browser**.
So instead of dragging a C++/Win32/Qt/GTK UI into the binary, TinyTorrent splits cleanly:

* A **minimal C/C++ backend** (a trimmed transmission-daemon that also serves static assets)
* A **TypeScript/React HUD** running in the browser via `http://localhost`

The result: a **single 2–3 MB `.exe`** that feels weightless.
**Zero GUI memory footprint** unless you actively open the interface — exactly how it should be.

The intent is simple: you shouldn’t feel this tool running at all. It should use only the memory you willingly allow it.
µTorrent was ~160 KB because the protocol was simpler and the world was smaller; today’s requirements demand a few extra megabytes, but the philosophy is identical:
**ruthless efficiency + a UI that looks like it came from the future.**

No bloat. No ads. No crypto. No boat whatsoever!
Just a tool for moving data that uses minimal memory and is minimal in size. 

---

## 💎 Key Features

### Browser-Native HUD (frontend/)

* **Zero GUI RAM when unused** — the UI runs in the browser only when opened.
* **Glass Monolith UI** using Tailwind v4 + HeroUI + blur + depth.
* **Kinetic motion** everywhere (`Framer Motion`).
* **Global drag-and-drop**, predictable context menus, tabular numerals.
* **Real-time sparklines** and a defrag-style pieces map.

### Professional Mechanics

* Native OS interaction patterns: Shift-click ranges, Ctrl-click toggles, full keyboard nav.
* High-density dashboard for advanced users.
* Perfectly typed RPC schema.

### The Engine (backend/)

* Built on **libtransmission** for protocol correctness and low RAM footprint.
* Embedded HTTP server (Mongoose) serves the compiled HUD.
* Encrypted connections (MbedTLS).
* DHT, PEX, LPD, blocklists — all standard transmission features.

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

* React 19
* TypeScript
* TailwindCSS v4
* HeroUI
* Framer Motion
* Vite

### Backend Tech

* C / C++17 (no exceptions, no RTTI)
* libtransmission
* Mongoose (embedded web server)
* Static asset bundler for shipping UI inside a single binary

---

## 🚀 Getting Started

### Prerequisites

* Node.js 20+ (for the frontend)
* Any Transmission Daemon (optional) if you want to test against a real RPC endpoint

### Development (frontend)

Runs the HUD with mock data or via proxy.

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

* Beautiful and consistent components
* Transitions via Framer Motion
* Strict TypeScript
* No regressions in density or performance

---

## Backend Note

The real TinyTorrent backend will be a **minimal, modified Transmission daemon** that embeds and serves the compiled frontend.
For now, use the standard `transmission-daemon`.

---

**TinyTorrent** — *Simple. Fast. Beautiful. Browser-Native.*


