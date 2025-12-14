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
|-- scripts/
|   |-- setup.ps1
|   \-- build.ps1            # Builds AND runs tests
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
    - We need enough tests to ensure `build.ps1` catches obvious breakages.
    - **Agents:** If you break a test, fix the code. If the test is obsolete, update it. Do not spend hours writing complex mocks.

---

# **8. Development Workflow**

### **How to Build**

Agents must use the provided scripts.

```powershell
# 1. Setup Dependencies (VCPKG)
setup.ps1

# 2. Build & Test
build.ps1
```

### **Definition of Done**

A task is complete when:

1.  The code compiles in **Debug Mode**
2.  The automated tests pass (`build.ps1` returns success).
3.  Architectural boundaries (Engine vs. RPC) are respected.
