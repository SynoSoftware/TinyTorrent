
# TinyTorrent

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.0-blue)](https://www.typescriptlang.org/)
[![React](https://img.shields.io/badge/React-19-cyan)](https://react.dev/)
[![Engine](https://img.shields.io/badge/Engine-Libtransmission-orange)](https://github.com/transmission/transmission)
[![Size](https://img.shields.io/badge/Binary_Target-<3MB-success)]()

**A modern µTorrent-style BitTorrent client with a browser-native UI and a micro-sized backend.**

**NOTE THIS IS WORK IN PROGRESS - DON'T EXPECT IT TO WORK JUST YET**

---

I got pissed when I realized that we no longer have a proper torrent client. As I grew up when we had a torrent client that was 160kb .exe, lightweight and fast.
Back then the protocol was simpler and the world was smaller; today’s requirements demand more code therefore we'll have to get to 1-2-3 megabytes, but the philosophy is identical:
**ruthless efficiency + a UI that looks like it came from the future.**

So I decided to go bare-metal. I wanted to write a pure C application for Windows 11 that uses no external libraries, just call windows API. I called it rawBit.
However, then I realized that will be ugly and nobody will use it ... but I can also do better: I can write it to use even less memory, less code, more beautiful, by using your browser that's already installed: a fully optimized, GPU-accelerated UI framework.

**This is how TinyTorrent was born**

Instead of dragging C++/Win32/Qt/GTK toolkits into the binary, TinyTorrent splits:

* Native shell: minimal executable, manages window, lifecycle, and RPC - this is the hardwork that has already been done: libtransmission-daemon (I'll patch it to serve my frontend instead)
* Frontend: React + TypeScript + HeroUI, leveraging the browser’s rendering engine for layout, animation, and GPU composition

There's no need for heavy UI libraries baked into the binary, no platform-specific UI maintenance cost
This keeps the executable tiny, portable, the UI beautiful, fast, world-class, and the architecture clean and future-proof

The result: a **single 2–3 MB `.exe`** that feels weightless.
**Zero GUI memory footprint** unless you actively open the interface — exactly how it should be.

The intent is simple: you shouldn’t feel this tool running at all. It should use only the memory you willingly allow it.

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


