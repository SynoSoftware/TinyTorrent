# <img src="frontend/public/tinyTorrent.svg" width="48" alt="" /> TinyTorrent

**A modern BitTorrent client. No frameworks needed. Binary target: <3 MB.**


[![License: MPL-2.0](https://img.shields.io/badge/License-MPL--2.0-orange.svg)](https://www.mozilla.org/MPL/2.0/)
[![Protocol: Apache-2.0](https://img.shields.io/badge/Protocol-Apache--2.0-blue.svg)](https://www.apache.org/licenses/LICENSE-2.0)

[![Language](https://img.shields.io/badge/Backend-C%20%2F%20C%2B%2B20-blue)](https://en.cppreference.com/w/cpp/20)
[![Language](https://img.shields.io/badge/Frontend-TypeScript%205.9-blue)](https://www.typescriptlang.org/)
[![React](https://img.shields.io/badge/React-19.2.x-cyan)](https://react.dev/)

[![UI](https://img.shields.io/badge/UI-HeroUI%20%2B%20TailwindCSS-8b5cf6)](https://www.heroui.com/)
[![Motion](https://img.shields.io/badge/Motion-Framer%20Motion-pink)](https://www.framer.com/motion/)

[![Build](https://img.shields.io/badge/Build-Meson%20%2B%20Ninja-2f855a)](https://mesonbuild.com/)
[![Frontend Build](https://img.shields.io/badge/Frontend%20Build-Vite-646cff)](https://vitejs.dev/)
[![Dependencies](https://img.shields.io/badge/Deps-vcpkg-informational)](https://github.com/microsoft/vcpkg)

[![Runtime](https://img.shields.io/badge/UI%20Runtime-WebView2%20\(On--Demand\)-success)]()
[![Platform](https://img.shields.io/badge/Platform-Win32%20%2F%20DWM%20%2F%20DComp-darkblue)]()
[![Tray](https://img.shields.io/badge/Native-Tray%20%2B%20Shell%20Integration-darkgreen)]()

[![Engine](https://img.shields.io/badge/Engine-libtorrent%20%2F%20Transmission-darkgreen)]()
[![Persistence](https://img.shields.io/badge/Persistence-sqlite3%20%2B%20yyjson-yellowgreen)]()
[![RPC](https://img.shields.io/badge/RPC-Mongoose%20Embedded-orange)]()

[![Architecture](https://img.shields.io/badge/Architecture-Hexagonal%20%2F%20Adapter-purple)]()
[![Binary Size](https://img.shields.io/badge/Binary_Target-<3MB-success)]()


**Status:** Work in progress.  
Frontend runs against a standard `transmission-daemon`. Bugs exist; some features are unfinished and regressions may occur.  
Custom single-binary backend is under active development.

---

## 🧠 Motivation

I grew up with torrent clients that were **~160 KB** — small, fast, and engineered with real hardware limits in mind. That era is gone. Today even a simple tray application wastes memory it has no reason to touch, and I’m not fine with that. So I decided to do something about it.

My first idea was a pure C, bare-metal Windows client — no external libraries, just raw WinAPI. The UI was unacceptable, so I abandoned that approach. Later I realized that every modern system already ships with a fully optimized, GPU-accelerated rendering engine: the web browser. Used _on demand_, it delivers better visuals, less UI code, and zero idle UI memory.

This project exists to bring back what made the classics great: a lean core, a tiny binary, and a UI that feels modern — without abandoning engineering discipline.

**This is how TinyTorrent was born.**

Instead of dragging UI toolkits into the binary, TinyTorrent is split cleanly:

- **Native Tray Daemon:**  
  A minimal C/C++ executable responsible for lifecycle, tray controls (pause/resume/open GUI), and the torrent engine. Always running. No UI.

- **On-Demand GUI:**  
  A browser-based UI launched only when requested (Chrome, Edge, Firefox, etc.).  
  When closed, **no UI process exists**.

**Zero GUI memory when unused.**  
Exactly how it should be.

---

![UI preview](docs/dashboard-light.png)
![UI preview](docs/tt-supremacy.png)

## 💎 Key Features

### Browser-Native HUD (frontend/)

- **Zero GUI memory when unused** — the interface is launched on demand in an external browser.
- **Glass Monolith UI** — Tailwind v4 + HeroUI + blur + depth for a stealth aesthetic.
- **Workspace Components**
  - **File Explorer Tree:** Nested, accordion-style file selection with priority toggling.
  - **Visualizers:** Real-time speed graphs, Disk Space Gauge, and peer maps.
- **Kinetic Motion** — Framer Motion used for structural transitions, not decoration.

### Backend-Agnostic Architecture

TinyTorrent is not tied to a single engine.

- **Strict RPC boundary:** The UI talks to a well-defined API.
- **Adapter Pattern:**
  - **Transmission Adapter:** Uses standard Transmission RPC.
  - **Libtorrent Adapter:** Planned C++ wrapper around `libtorrent-rasterbar`.

### Interaction Model

- **Queue Management:** Reorder torrents, move to top/bottom, drag-and-drop.
- **Deep Interaction:** Shift-click ranges, Ctrl-click toggles, full keyboard navigation.
- **Exact Typing:** No `any`. RPC schema is strictly typed and normalized.

---

## ⚖️ Licensing Rationale

TinyTorrent is licensed under **MPL-2.0** for the code because I want this project to stay true to the spirit that in my eyes made uTorrent great (small, practical, user-respecting), and to avoid the “uTorrent way” where a great tool drifts into a closed, adware/bloat-heavy direction.

MPL-2.0 is a pragmatic middle ground: it keeps the project open and encourages improvements to flow back when code is modified and redistributed, while still being compatible with real-world integration.

Notes:

- Repository license texts live at the repo root: `LICENSE` (MPL-2.0) and `APACHE-2.0`.
- Protocol/spec docs are **Apache-2.0**; branding assets are **proprietary/trademarked** (see the notices adjacent to those assets).

---

## 🏗 Repository Structure

```

TinyTorrent/
├── frontend/ # React 19 HUD, Vite build, Tailwind v4, HeroUI, Framer Motion
├── backend/ # C/C++ tray daemon + torrent engine
└── README.md # You are here

```

### Frontend Tech

- React 19
- TypeScript
- TailwindCSS v4
- HeroUI
- Framer Motion
- Vite

### Backend Tech

- Modern C / C++20 daemon (Meson + Ninja, vcpkg-managed dependencies)
- Native tray + WebView2 hosting + Win32 integration (DWM/DComp, WebView composition)
- libtorrent / Transmission adapters plus sqlite3 + yyjson persistence & RPC helpers
- Embedded Mongoose + helper scripts (`make.ps1`, `buildctl.ps1`, helpers under `scripts/`)

---

## 🚀 Getting Started

### Prerequisites

- Node.js 20+
- **Development:** You can run the frontend against a standard `transmission-daemon` (port 9091).

### Development (frontend)

```bash
cd frontend
npm install
npm run dev
```

> **Note:** The root and backend directories are intentionally TypeScript/Node-free. All `npm`/`npx` work happens inside `frontend/` so the native build tree stays clean. See `AGENTS.md` for the full rule set.

### Development (backend)

#### Generate a Visual Studio solution (Windows)

From a fresh clone, you can generate a `.sln` using Meson’s Visual Studio backend via the PowerShell helper:

```powershell
cd backend
./make.ps1 vs Debug
```

This produces the solution at:

- `backend/build_vs/debug/tinytorrent-daemon.sln`

For a release solution:

```powershell
cd backend
./make.ps1 vs Release
```

Output:

- `backend/build_vs/release/tinytorrent-daemon.sln`

Notes:

- The script also writes Visual Studio `.vcxproj.user` debug settings so the debugger can find required runtime DLLs (vcpkg deps and ASan runtime in Debug).
- If you change toolsets / vcpkg triplets / upgrade Visual Studio, rerun `./make.ps1 vs Debug` to regenerate those settings.

## Backend Note

Today, the only backend that is working reliably end-to-end is a standard **`transmission-daemon`**.

In parallel, we’re building a **TinyTorrent-native daemon** (currently WIP) built around **libtorrent (C++)**. This path is the main reason our current executable misses the original size target: libtorrent (and the surrounding C++ runtime + dependencies) is heavier than a minimal Transmission-based setup.

Why go this way anyway? Because the Transmission-based setup has had reliability issues for our use case — most notably around **starting magnet downloads immediately** (and, in some cases, entering unrecoverable wait states). The libtorrent-based daemon is intended to solve those problems while keeping a clean RPC boundary.

Current priorities are correctness and stability first; optimization comes later. We may be able to shave some size off, but a dramatic drop is unlikely while we stay on libtorrent + C++.

The **~1 MB** size target is an explicit initial goal derived from an educated estimate. Although the estimate was made before fully evaluating the scope of a full torrent daemon, Transmission’s final executable indicates the target remains realistic. **The primary priority is correct, stable operation and interoperability in today’s torrent ecosystem; binary size optimization remains a subsequent objective, with the size goal still in scope.**

Longer-term (time permitting): once the libtorrent-based daemon is solid, we may take on Transmission itself and apply a similar approach there. There’s also an aspirational “classic uTorrent” goal: potentially rewriting more of the stack in **C** with an aggressive size target (roughly **1–1.5 MB UPX-packed**), primarily as an engineering challenge.

For the full protocol and engine details, see:

- `docs/TinyTorrent_RPC_Extended.md`
- `docs/TinyTorrent_Specification.md`

---

## 🎨 Design Philosophy

Defined in **AGENTS.md** (root). That document also makes the rule explicit: only `frontend/` owns TypeScript and Node tooling, keeping the rest of the tree purely native.

1. Speed
2. Density
3. One Responsibility
4. Exact Typing
5. No entropy in the codebase

---

## 🤝 Contributing

Pull requests must follow the **Visual Excellence Directive**:

- Modern and consistent components
- Framer Motion for structural transitions
- Strict TypeScript
- No regressions in performance

---

![UI preview](docs/dashboard-dark.png)

**TinyTorrent** — _Simple. Fast. Beautiful. On-Demand._
