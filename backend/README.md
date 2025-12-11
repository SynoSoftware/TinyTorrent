# TinyTorrent Daemon (Backend)

This folder captures the TinyTorrent micro-engine described in `AGENTS.md`. The goal is a tiny static daemon that pairs libtorrent with a minimal Mongoose RPC layer.

## Build layout

- `CMakeLists.txt` configures a single executable `tt-engine` and wires in the vcpkg dependencies (`libtorrent`, `sqlite3`, `yyjson`) plus the in-tree `mongoose.c` stub.
- `vcpkg.json` keeps the dependency manifest aligned with the agent requirements.
- Sources are grouped under `src/engine`, `src/rpc`, `src/utils`, and `src/vendor`.

## Getting started

1. Run the bootstrap script to import `vcpkg`, install the manifest dependencies (`libtorrent`, `sqlite3`, `yyjson`), and bootstrap the toolchain:
   ```
   powershell -File scripts/setup.ps1
   ```
2. Build the debug configuration (includes logging and dynamic CRT) via the Visual Studio 2026 generator (default):
   ```
   powershell -File scripts/build.ps1 -Configuration Debug
   ```
   Use `-Generator "Visual Studio 17 2022"` (or another generator) only if you genuinely need an older toolset. If `cmake` is not on your PATH, pass `-CMakePath "C:\Path\To\cmake.exe"` so that the script executes the right binary. The script now runs `vcpkg install` itself before configuring, so you get live progress output for every dependency being compiled.

### Visual Studio 2026

You can also open this folder directly in Visual Studio 2026 (File → Open → CMake...) and pick one of the configure presets defined in `CMakePresets.json` (`debug-vs2026` or `minsize-vs2026`). Visual Studio will read the preset, configure CMake with the VS 2026 generator, and expose the `tt-engine` target in the IDE so you can build and debug without running the PowerShell scripts manually.
3. When you're ready to generate the size-optimized artifact, rerun the build script with `MinSizeRel`. This configuration enables `/MT`, `/GL`, `/Os`, and strips logging to keep the `tt-engine` binary under 4 MB:
   ```
   powershell -File scripts/build.ps1 -Configuration MinSizeRel
   ```

> **Tip:** Run these scripts from the Visual Studio 2026 Developer Command Prompt so that the generator's toolchain (`cl.exe`, `link.exe`, etc.) is already on the path; otherwise specify a different generator via `-Generator`.

## Notes

- Replace `src/vendor/mongoose.c`/`.h` with the real Mongoose single-file library from https://github.com/cesanta/mongoose before shipping.
- The runtime currently just spins both loops for a fixed short duration. The scaffolding is there to plug in the actual libtorrent session and RPC handlers.
