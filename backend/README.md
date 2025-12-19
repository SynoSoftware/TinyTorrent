# TinyTorrent Daemon (Backend)

This folder captures the TinyTorrent micro-engine described in `AGENTS.md`. The goal is a tiny static daemon that pairs libtorrent with a minimal Mongoose RPC layer.

## Build layout

- `meson.build` configures the `tt-engine` executable, keeps the same source set (engine, RPC, utils, embedded `mongoose.c`), and exposes the debug/release macros that the runtime expects.
- `meson_options.txt` exposes `tt_enable_logging` and `tt_enable_tests` so the release build can disable logging/tests without touching the sources.
- `tests/meson.build` reuses the daemon sources plus the test cases so the dispatch/RPC test binaries inherit the same flags and dependencies.
- `setup.ps1` bootstraps vcpkg and installs the manifest dependencies (`libtorrent`, `sqlite3`, `yyjson`), while `make.ps1` now drives the modular `buildctl.ps1` workflow for both debug and release flows (the old `build.legacy.ps1` wrapper is kept for compatibility and prints a deprecation warning).

## Getting started

1. Run the bootstrap script to clone/boot vcpkg and install the manifest dependencies (`libtorrent`, `sqlite3`, `yyjson`):
   ```
   powershell -File setup.ps1
   ```
2. Make sure `meson` and `ninja` are installed (`python -m pip install --user meson ninja`) and that your `%USERPROFILE%\AppData\Roaming\Python\PythonXXX\Scripts` folder is on the PATH so the scripts can find the tools.
3. Build the debug configuration (logging/tests on, dynamic CRT) via the new helper:
   ```
   ./make debug
   ```
   This runs `buildctl.ps1 setup/configure/build/test` under the hood. To build the release configuration (logging/tests off, static CRT, LTO + strip), rerun the helper with:
   ```
   ./make release
   ```
   For reference there is still `powershell -File build.legacy.ps1` in the repo, but it is deprecated and only retained for reproducibility.

### Visual Studio 2026

Open the repository with VS2026 (File → Open → Folder). After running `./make debug`, Visual Studio sees the generated `build/debug/build.ninja` file and you can build/debug `tt-engine` directly from the IDE (the debugger attaches to the same binary under `build/debug`).

When you need the size-optimized binary, rerun the helper with `./make release`. That configuration flips the macros/logging, uses the static CRT (`/MT`) with `/Os`, `/GL`, `/LTCG`, runs LTO/strip, links against the static `x64-windows-static` artifacts, and keeps the tests disabled:

```
./make release
```

## Unified helper (`tt.ps1`)

- `powershell -File tt.ps1 build -Configuration Debug` — build only (respects `-Clean`).
- `powershell -File tt.ps1 test -SkipBuild` — run all test binaries once, sequentially.
- `powershell -File tt.ps1 loop -Iterations 50` — sequential loop until failure or the iteration limit (or add `-Duration 5m`).
- `powershell -File tt.ps1 parallel -MaxConcurrent 8 -RunsPerJob 5 -Duration 10m` — queue tests across worker jobs with unique ports.

The legacy parallel/stress scripts have been removed to keep a single, lean entry point.

> **Tip:** Run these scripts from the Visual Studio 2026 Developer Command Prompt so the MSVC toolchain (`cl.exe`, `link.exe`, …) is already on PATH; otherwise install Meson/Ninja into an environment that already sees the compiler.

## Notes

- Replace `src/vendor/mongoose.c`/`.h` with the real Mongoose single-file library from https://github.com/cesanta/mongoose before shipping.
- The runtime currently just spins both loops for a fixed short duration. The scaffolding is there to plug in the actual libtorrent session and RPC handlers.

## Historical Traffic Specification

TinyTorrent keeps a dedicated `speed_history` time-series table (`timestamp`, `down_bytes`, `up_bytes`) inside `tinytorrent.db`. The daemon writes fixed-size buckets (`history-interval`, 5 minutes by default) on every flush and never aggregates during writes; aggregation happens when a client issues `history-get`. The backend exposes three new configuration knobs via `session-set`: `history-enabled`, `history-interval` (clamped to ≥60 seconds), and `history-retention-days` (0 = forever). A housekeeping task trims older rows once per hour when retention is configured.

Two new RPCs, `history-get` and `history-clear`, allow the UI to read/clean the series. `history-get` samples the DB at a client-supplied `step` (rounded up to a multiple of `history-interval`) and returns `[timestamp, sumDown, sumUp, peakDown, peakUp]` tuples together with the `step` and the `recording_interval` so the UI can derive both average and peak speeds. `history-clear` deletes either the whole series or rows older than the provided cutoff.
