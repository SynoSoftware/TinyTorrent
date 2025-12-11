# TinyTorrent Daemon (Backend)

This folder captures the TinyTorrent micro-engine described in `AGENTS.md`. The goal is a tiny static daemon that pairs libtorrent with a minimal Mongoose RPC layer.

## Build layout

- `meson.build` configures the `tt-engine` executable, keeps the same source set (engine, RPC, utils, embedded `mongoose.c`), and exposes the debug/release macros that the runtime expects.
- `meson_options.txt` exposes `tt_enable_logging` and `tt_enable_tests` so the release build can disable logging/tests without touching the sources.
- `tests/meson.build` reuses the daemon sources plus the test cases so the dispatch/RPC test binaries inherit the same flags and dependencies.
- `setup.ps1` bootstraps vcpkg and installs the manifest dependencies (`libtorrent`, `sqlite3`, `yyjson`), while `build.ps1` now drives Meson + Ninja for both debug and MinSizeRel flows.

## Getting started

1. Run the bootstrap script to clone/boot vcpkg and install the manifest dependencies (`libtorrent`, `sqlite3`, `yyjson`):
   ```
   powershell -File setup.ps1
   ```
2. Make sure `meson` and `ninja` are installed (`python -m pip install --user meson ninja`) and that your `%USERPROFILE%\AppData\Roaming\Python\PythonXXX\Scripts` folder is on the PATH so the scripts can find the tools.
3. Build the debug configuration (logging/tests on, dynamic CRT) via the Meson/Ninja wrapper:
   ```
   powershell -File build.ps1 -Configuration Debug
   ```
   This script installs the manifest, runs `meson setup` into `build/debug`, and then builds everything with `ninja`.
### Visual Studio 2026
Open the repository with VS2026 (File → Open → Folder). After running the build script, Visual Studio sees the generated `build/debug/build.ninja` file and you can build/debug `tt-engine` directly from the IDE (the debugger attaches to the same binary under `build/debug`).
4. When you need the size-optimized binary, rerun the wrapper with `MinSizeRel`. That configuration flips the macros/logging, switches the CRT to `/MT`, enables `/Os`, `/GL`, `/LTCG`, and keeps the tests disabled:
   ```
   powershell -File build.ps1 -Configuration MinSizeRel
   ```

> **Tip:** Run these scripts from the Visual Studio 2026 Developer Command Prompt so the MSVC toolchain (`cl.exe`, `link.exe`, …) is already on PATH; otherwise install Meson/Ninja into an environment that already sees the compiler.

## Notes

- Replace `src/vendor/mongoose.c`/`.h` with the real Mongoose single-file library from https://github.com/cesanta/mongoose before shipping.
- The runtime currently just spins both loops for a fixed short duration. The scaffolding is there to plug in the actual libtorrent session and RPC handlers.
