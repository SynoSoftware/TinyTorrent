
# TinyTorrent

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.0-blue)](https://www.typescriptlang.org/)
[![React](https://img.shields.io/badge/React-19-cyan)](https://react.dev/)
[![Engine](https://img.shields.io/badge/Engine-Libtransmission-orange)](https://github.com/transmission/transmission)
[![Size](https://img.shields.io/badge/Binary_Target-<2MB-success)]()

**The spiritual successor to µTorrent v2.2, built for the modern web.**

TinyTorrent will be a high-performance, single-binary BitTorrent client. It combines the battle-tested C backend of **libtransmission** with a world-class, GPU-accelerated frontend built on **React 19** and **HeroUI**.

We are rejecting the "bloat" of modern clients. No ads, no crypto-miners, no media players, no bundled web browsers. Just a razor-sharp tool for moving data.

> **The Mission:** A single `.exe` under 2MB or 3MB that launches instantly and looks like a professional tool from the future.

---

## 💎 Key Features

### The "Glass Monolith" UI
*   **Zero Friction:** The interface is designed to anticipate user intent. Drag-and-drop works globally. Context menus appear where you expect them.
*   **Deep Aesthetics:** Built with a "Stealth" dark mode first identity, utilizing glassmorphism, ambient lighting, and blur effects for a native HUD feel.
*   **Kinetic Motion:** Every interaction is powered by `Framer Motion`. Menus bloom, rows slide, and graphs pulse. Nothing jumps; everything flows.

### Professional Mechanics
*   **OS-Level Control:** Shift-click range selection, Ctrl-click toggling, and full keyboard navigation.
*   **Visual Data:** Real-time SVG sparklines for speed monitoring and a "Defrag-style" piece map to visualize availability.
*   **Tabular Precision:** All data uses tabular lining numerals to prevent jitter during updates.

### The Engine
*   **Core:** Built on `libtransmission` (C) for minimal RAM usage and maximum protocol compatibility.
*   **Security:** Full encryption support (MbedTLS) with 'Preferred' or 'Required' modes.
*   **Connectivity:** DHT, PEX, LPD, and Blocklist support enabled by default.

---

## 🏗 Architecture - frontend/

TinyTorrent enforces **Hard Layer Boundaries** to ensure maintainability. Data flows strictly from the Engine to the UI.

```text
src/
├── app/                  # Application Entry & Shell
├── features/             # Business Logic (Dashboard, Settings, Add)
├── shared/               # Reusable UI (GlassPanel, Buttons, Icons)
├── core/                 # The Engine (RPC Client, Types)
└── i18n/                 # Localization (Strict separation)
```

### Tech Stack
*   **Frontend:** React 19, TypeScript, Vite.
*   **Styling:** TailwindCSS v4, HeroUI.
*   **State:** React Hooks (Local-first philosophy).
*   **Backend:** Custom C++ wrapper around `libtransmission-daemon`.
*   **Server:** Mongoose (Embedded Web Server for the single binary).

---

## 🚀 Getting Started

### Prerequisites
*   Node.js 20+
*   (Optional) A running instance of standard Transmission Daemon on port 9091 for live data testing during frontend development.

### Development (Frontend)
This starts the UI in your browser with mocked data (or proxied to a local daemon).

```bash
# 1. Install dependencies
npm install

# 2. Start the HUD
npm run dev
```

### Building the Single Binary
*Coming Soon: C++ compilation instructions.*

---

## 🎨 Design Philosophy

This project strictly adheres to the **AGENTS.md** specification found in this repository.

1.  **Speed:** No lag. No hesitation.
2.  **Density:** Data-rich layout. No wasted whitespace.
3.  **One Responsibility:** Every component does exactly one thing.
4.  **Typed Reality:** No `any`. All data structures match the RPC shape exactly.

---

## 🤝 Contributing

We welcome pull requests that adhere to our **Visual Excellence Directive**.

If you contribute code, it must:
1.  Look beautiful and consistent with the design system.
2.  Use `Framer Motion` for transitions.
3.  Be strictly typed.

---


Backend - will be a modified transmission daemon that serves the compiled frontend. - currently - just install the transmission-daemon instead.

**TinyTorrent** — *Simple. Fast. Beautiful.*
