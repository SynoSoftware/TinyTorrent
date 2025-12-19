# **AGENTS_BACKEND.md — TinyTorrent Backend Specification**

**Purpose:**
Authoritative reference for the **TinyTorrent Daemon**.
**Priority:** Correctness > Architectural Minimalism > Development Ergonomics.

---

# **1. Core Identity & Philosophy**

TinyTorrent Daemon = **Modern C++20** × **Libtorrent** × **Pragmatic Design**.

## **The Practical Minimalism Rule (Critical)**

TinyTorrent does **not** chase byte-shaving or premature optimization.
Agents must choose algorithms and libraries that are correct, modern, lean, and maintainable.

### **Development Mode:**

- You may use helpers, loggers, diagnostic tools, or richer STL features.
- **Priority:** Fast iteration, clear debugging, and ergonomics.
- Do not strip useful debug info just to save space in a Dev build.

### **Release Mode:**

- Only structurally lightweight components remain.
- **Strict Separation:** All dev-only helpers (heavy loggers, debug UIs, test harnesses) must compile out via macros or separate targets.
- **No Template Bloat:** We avoid heavy C++ template libraries (like `nlohmann/json` or `Boost.Beast`) because they bloat binary size structurally.
- **Architecture:** The binary remains small because we chose the right dependencies (C-libs + standard library), not because we wrote obscure code or hand-optimized every byte.

### Structural Simplicity Rule

Minimalism applies to **responsibility**, not file count.

- No class, namespace, or translation unit may own more than **one primary responsibility**.
- Any component that:

  - owns a libtorrent session **and**
  - performs persistence **or**
  - performs automation **or**
  - performs RPC-facing serialization

  is **architecturally invalid**.

Composition is mandatory. Coordination is allowed. Centralized behavior is not.

### Non-Destructive Build Rule (Critical)

- Do not delete large dependency/build caches (e.g. `vcpkg/`, `vcpkg_installed/`, build dirs) as a “first response”.
- Prefer reuse-first actions: validate, reconfigure, repair by **moving/renaming** folders, or targeted package repair.
- Deletion is a last-resort recovery action when reuse is clearly non-viable (e.g. corruption or irreconcilable layout), and should not be the default troubleshooting step.

---

# **2. Architecture**

We use a standard, robust **Producer/Consumer** model.

### **Thread 1: The Engine (The Worker)**

- **Role:** Runs the `libtorrent` main loop.
- **Responsibility:**
  - Owns the `lt::session`.
  - Executes logic (Add, Pause, Remove).
  - Periodically publishes a **State Snapshot**.
  - Must remain non-blocking with respect to I/O-heavy work.
  - Disk, database, and filesystem operations must not execute on alert-handling paths.

### **Thread 2: The RPC Server (The Interface)**

- **Role:** Runs the **Mongoose** HTTP/WebSocket loop.
- **Responsibility:**
  - Parses input using `yyjson`.
  - Validates data structure.
  - Pushes commands to the Engine Queue.
  - Reads the latest **State Snapshot** to serve clients instantly.
  - RPC handlers may validate and enqueue work only.
  - RPC handlers must not perform engine mutations directly.

### **Synchronization**

- **Queue:** Thread-safe command queue (RPC → Engine).
- **Snapshot:** Mutex-protected swap of the State struct (Engine → RPC).
- **Why:** Simple, correct, and prevents the UI from freezing.

### State Propagation Rule

State updates must be **event-driven**.

- Periodic full-state scans are prohibited once initial bootstrap completes.
- Components must emit explicit change events.
- Snapshots may only rebuild data that is marked dirty by events.

Polling is acceptable only for:

- Startup reconciliation
- External systems with no event surface

---

# **3. Dependencies (vcpkg)**

We select dependencies that are **structurally small** (mostly C libraries) but use them with **Modern C++20**.

**`vcpkg.json`:**

```json
{
  "name": "tinytorrent-daemon",
  "version-string": "0.1.0",
  "dependencies": [
    "libtorrent", // The Core Engine (Unavoidable weight)
    "sqlite3", // Persistence (Tiny, reliable C lib)
    "yyjson", // JSON (Fastest, smallest C lib)
    "doctest" // Testing (Dev dependency only)
  ]
}
```

**Note:**

- **Mongoose** is included as a vendor file (`src/vendor/mongoose.c`) to keep build simple.
- **Boost** is used internally by libtorrent, but we **do not** use Boost headers in our codebase to prevent compilation slowdowns and bloat.

---

# **4. Project Structure**

```txt
root/
|-- meson.build              # Build system
|-- vcpkg.json
|-- make.ps1                # CLI shim (debug/release/test/clean)
|-- build.legacy.ps1        # Legacy Meson/Ninja wrapper (deprecated)
|-- scripts/
|   |-- buildctl.ps1        # Dispatcher that invokes scripts/commands
|   |-- commands/           # User-facing entrypoints that orchestrate workflows
|   |   |-- build.ps1
|   |   |-- clean.ps1
|   |   |-- configure.ps1
|   |   |-- install.ps1
|   |   |-- package.ps1
|   |   |-- setup.ps1
|   |   |-- test.ps1
|   \-- modules/            # Internal helpers with execution guards
|       |-- log.ps1
|       |-- env-detect.ps1
|       |-- toolchain-bootstrap.ps1
|       |-- meson-config.ps1
|       |-- deploy.ps1
|       |-- fs-safe-delete.ps1
|       |-- vcpkg.ps1
|
|-- src/
|   |-- main.cpp             # Entry point
|   |
|   |-- engine/              # Logic related to Libtorrent
|   |   |-- Session.cpp
|   |   |-- Session.hpp
|   |   \-- State.hpp        # Data structures (DTOs)
|   |
|   |-- rpc/                 # Logic related to HTTP/JSON
|   |   |-- Server.cpp
|   |   |-- Router.cpp
|   |   \-- Controllers.cpp
|   |
|   |-- vendor/
|   |   \-- mongoose.c       # No external package for this
|   |
|   \-- utils/
|       \-- Json.hpp         # C++ Wrapper around yyjson
|
|-- tests/
|   |-- main_test.cpp
|   \-- unit/                # Logic & JSON tests
```

---

# **5. Implementation Rules**

### **5.1 JSON Handling**

- **Library:** `yyjson`.
- **Reason:** It avoids the massive template instantiation cost of `nlohmann/json`.
- **Usage:**
  - Write small C++ wrappers (`utils/Json.hpp`) to ensure RAII (memory cleanup).
  - Do not manually concatenate strings to build JSON. Use the library's mutable document API.

### **5.2 String Formatting**

- **Use:** `std::format` (C++20) for all formatted messages.
- **Example:** `auto s = std::format("Error: {}", code);`
- **Avoid:** `<iostream>` in Release builds (it brings in heavy static initializers).
- **Dev Logging:** Use lightweight logging macros that call `std::format` + `printf`/`OutputDebugStringA` under the hood. Do not introduce `fmt` as an additional dependency.

### **5.3 Error Handling**

- **Exceptions:** Allowed and expected from `libtorrent`.
- **Boundary:** Exceptions must be caught before entering C-callbacks (Mongoose) or crossing threads.
- **Stability:** The daemon should log an error and continue, not crash, unless the state is unrecoverable.

### 5.4 RPC Input Normalization

RPC request parsing must be centralized.

- Argument extraction and validation must not be duplicated per method.
- Shared request shapes (e.g. torrent ID sets) must have a single parser.
- RPC handlers should read as declarative mappings, not procedural parsing code.

### 5.5 RAII Enforcement

Any resource with a lifetime longer than a function call must be RAII-managed.

This includes:

- Database transactions
- Mutexes and locks
- File descriptors
- Worker thread ownership

Manual begin/end, open/close, or lock/unlock patterns are forbidden outside RAII guards.

### Persistence Boundary Rule

Engine logic must not issue raw SQL or database-specific calls.

- All persistence goes through a dedicated repository/DAO interface.
- Engine code expresses intent (save, load, update), not storage mechanics.
- Schema details are forbidden outside persistence modules.

---

# **6. Build Modes**

TinyTorrent uses **two** distinct build configurations.

## **6.1 Development Mode (Default)**

- **Focus:** Speed of iteration.
- **Flags:** `/MD` (Dynamic Runtime), Debug Symbols, Logging ON.
- **Features:** Helpers, debug prints, and `doctest` are compiled in.

## **6.2 Release Mode**

- **Focus:** Distribution.
- **Flags:** `/MT` (Static Runtime), `/O1` (Size) or `/O2` (Speed).
- **Features:** Logging macros compile to nothing. Tests excluded.

---

# **7. Testing Strategy**

**Philosophy:** Tests exist to prevent regressions, not to burden the developer.

1.  **Scope:**
    - **Unit Tests:** Verify JSON parsing and core state logic.
    - **Integration:** Ensure the RPC server responds to valid requests.
2.  **The "Good Enough" Rule:**

- We do not need 100% coverage.
- We need enough tests to ensure `make test`/`buildctl.ps1 test` catches obvious breakages.
- **Agents:** If you break a test, fix the code. If the test is obsolete, update it. Do not spend hours writing complex mocks.

---

# **8. Development Workflow**

### **How to Build**

Agents must use the provided scripts. The `buildctl.ps1` dispatcher now routes to dedicated scripts/commands/ entrypoints (`setup`, `configure`, `build`, `test`, `install`, `package`, `clean`), while the scripts/modules/ directory keeps the shared helpers, each protected with an invocation guard.

```powershell
# 1. Setup Dependencies (VCPKG)
setup.ps1        # now implemented by scripts/commands/setup.ps1 and toolchain-bootstrap modules

# 2. Build & Test (runs setup/configure/build/test via buildctl)
./make debug
```

### **Definition of Done**

A task is complete when:

1.  The code compiles in **Debug Mode** - error free and, if reasonably possible, warning free.
2.  The automated tests pass (`./make debug` or `buildctl.ps1 test` returns success).
3.  Architectural boundaries (Engine vs. RPC) are respected.

### Commands in the terminal:

1. Do **not** try to execute Linux commands. The build machine is Windows.
2. Extra Windows executables available: `rg`, `fd`, `bat`.
3. For code search, never use `Select-String`. Always use ripgrep:

   - `rg -n -C 5 "<pattern>" <path>`

4. Never write complex or nested shell one-liners. If a command requires tricky quoting or multiple pipes, move it into a script file instead. All commands must be simple, cross-platform, and Windows-safe.

## Tray / Launcher (Windows-only)

Provide a **minimal Win32 tray UI** for TinyTorrent on Windows 11:

- **Single downloadable EXE** for users: `TinyTorrent.exe`.
- **Portable**: no installer required.
- Uses **Win32 API only** (no WinUI, no WPF, no frameworks).

#### Runtime behavior

- The process runs the backend daemon logic (engine + RPC + HTTP static UI) and also exposes a tray icon.
- Tray menu:
  - **Open UI**: opens default browser to `http://127.0.0.1:<port>/#tt-token=<token>`
    - The token is placed in the URL fragment so it is **not** sent in HTTP requests.
  - **Exit**: triggers graceful shutdown (`app-shutdown` semantics).
- Tooltip (mouse hover): may show small status text.
  - Future: display transfer rate + torrent count using engine snapshot.

#### Tray layer responsibilities

- Must be implemented as a tiny Win32 procedural component (WinMain + message loop).
- Use only raw Win32 APIs and C-style interfaces; avoid UI frameworks, GUI toolkits, or heavy C++ abstractions.
- Minimize STL use; keep code small, self-contained, and focused on UI duties only.
- The tray must never "own" or operate engine logic — it only issues compact RPC calls (e.g. `session-tray-status`) and control actions; all torrent/session logic remains in the backend.

#### Security contract (must follow docs)

Security is defined in:

- `docs/TinyTorrent_Specification.md` (section 7)
- `docs/TinyTorrent_RPC_Extended.md`

Key requirements:

- Backend binds to **loopback** and chooses a **random free port**.
- Backend generates an **ephemeral token** per run.
- Backend writes `connection.json` with ACL restricted to current user.
- Frontend must send `X-TT-Auth: <token>` on all RPC requests.

#### Installation without an installer

TinyTorrent may implement an RPC method that:

- Creates `.lnk` shortcuts (Desktop / Start Menu / Startup folder)
- Optionally registers `magnet:` and `.torrent` handlers
- Optionally copies/moves the EXE to `Program Files\TinyTorrent\TinyTorrent.exe` (requires elevation)

This is specified in the protocol docs update (see `docs/*`).

#### Tray rules (simple)

Tray stays thin Win32 code.
Tray polls via session-tray-status (HTTP only).
No WebSockets.
Tray never infers state; it reflects backend values.

#### Ownership

System changes (shortcuts, handlers, install) → daemon RPC only.
Tray only calls RPCs and shows results.

## Other

- When you design a build solution, be kind with my time. Ask yourself what's faster for the user? Maybe you can you must confirm with the user deletion of large folders even if temporary or generated.
- When you change code, run the tests or build as apropriate. fix any issues before calling the task complete
