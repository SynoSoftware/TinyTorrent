# TinyTorrent Daemon (Backend)

This folder contains the TinyTorrent backend/daemon. The long-term goal is a TinyTorrent-native daemon built around libtorrent with a minimal RPC layer.

Today, the only backend that is working reliably end-to-end for the UI is a standard `transmission-daemon`. The TinyTorrent-native daemon is still under active development.

## Build layout

- `meson.build` configures the `tt-engine` executable, keeps the same source set (engine, RPC, utils, embedded `mongoose.c`), and exposes the debug/release macros that the runtime expects.
- `meson_options.txt` exposes `tt_enable_logging` and `tt_enable_tests` so the release build can disable logging/tests without touching the sources.
- `tests/meson.build` reuses the daemon sources plus the test cases so the dispatch/RPC test binaries inherit the same flags and dependencies.
- `make.ps1` is the main entry point. It calls `scripts/buildctl.ps1`, which orchestrates `setup/configure/build/test`.
- `build.legacy.ps1` exists for compatibility/reproducibility, but the supported path is `make.ps1`.

## Technology stack

- **Backend**: Modern C++20 with `libtorrent`, `sqlite3`, `yyjson`, vcpkg-managed dependencies, embedded `mongoose.c`, Meson/Ninja-driven builds, and Windows-specific helpers (Warp, DWM, DComp) orchestrated through `make.ps1`.
- **Frontend**: The UI lives under `frontend/` and uses Vite, TypeScript/React, and its own isolated Node toolchain; none of that tooling touches the native backend directory.
- **Runtime**: The daemon binds to loopback, serves the WebView2-hosted UI, and exposes RPC/WebSocket endpoints secured by a generated token stored in `connection.json`.

## Getting started

### Prerequisites (Windows)

- Visual Studio 2022/2026 (or “Build Tools for Visual Studio”) with:
  - MSVC C++ toolchain
  - Windows 10/11 SDK
- Python 3.x
- Git

### One-time setup

Install Meson + Ninja (one-time):

```powershell
python -m pip install --user meson ninja
```

Bootstrap the native toolchain + dependencies (vcpkg manifest install):

```powershell
cd backend
./make.ps1 setup
```

This step bootstraps vcpkg (if needed) and installs the dependencies used by the daemon (notably `libtorrent`, `sqlite3`, `yyjson`, OpenSSL, etc.).

### Build

Build Debug (runs `setup` → `configure` → `build` → `test`):

```powershell
cd backend
./make.ps1 debug
```

Build Release (runs `setup` → `configure` → `build`):

```powershell
cd backend
./make.ps1 release
```

Outputs:

- Ninja builds go to `backend/buildstate/debug` and `backend/buildstate/release`.

Other useful commands:

```powershell
cd backend
./make.ps1 clean
./make.ps1 test Debug
./make.ps1 build Debug
```

If PowerShell blocks script execution, run with:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\make.ps1 debug
```

### Visual Studio 2026

You can generate a Visual Studio solution using Meson’s VS backend. (Meson’s backend name is `vs2022`, but it opens fine in VS2026.)

```powershell
./make.ps1 vs Debug
```

This generates:

- `build_vs/debug/tinytorrent-daemon.sln`

Notes:

- The helper writes `.vcxproj.user` debug settings so Visual Studio can launch the built executables with the correct runtime DLL search path (vcpkg deps and ASan runtime for Debug builds).

## Notes

- Replace `src/vendor/mongoose.c`/`.h` with the real Mongoose single-file library from https://github.com/cesanta/mongoose before shipping.
- The daemon is still under active development; behavior, packaging, and runtime defaults will change.

## Historical Traffic Specification

TinyTorrent keeps a dedicated `speed_history` time-series table (`timestamp`, `down_bytes`, `up_bytes`) inside `tinytorrent.db`. The daemon writes fixed-size buckets (`history-interval`, 5 minutes by default) on every flush and never aggregates during writes; aggregation happens when a client issues `history-get`. The backend exposes three new configuration knobs via `session-set`: `history-enabled`, `history-interval` (clamped to ≥60 seconds), and `history-retention-days` (0 = forever). A housekeeping task trims older rows once per hour when retention is configured.

Two new RPCs, `history-get` and `history-clear`, allow the UI to read/clean the series. `history-get` samples the DB at a client-supplied `step` (rounded up to a multiple of `history-interval`) and returns `[timestamp, sumDown, sumUp, peakDown, peakUp]` tuples together with the `step` and the `recording_interval` so the UI can derive both average and peak speeds. `history-clear` deletes either the whole series or rows older than the provided cutoff.
