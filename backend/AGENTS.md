# **AGENTS.md — TinyTorrent Backend Specification**

**Purpose:**
Authoritative reference for the **TinyTorrent Daemon**.  
**Priority:** Correctness > Architectural Minimalism > Development Ergonomics.

---

# **1. Core Identity & Philosophy**

TinyTorrent Daemon = **Modern C++20** × **Libtorrent** × **Pragmatic Design**.

## **The Practical Minimalism Rule (Critical)**

TinyTorrent does **not** chase byte-shaving or premature optimization.  
Agents must choose algorithms and libraries that are correct, modern, lean, and maintainable.

### **Development Mode**

- You may use helpers, loggers, diagnostic tools, or richer STL features.
- **Priority:** Fast iteration, clear debugging, and ergonomics.
- Do not strip useful debug info just to save space in a Dev build.

### **Release Mode**

- Only structurally lightweight components remain.
- **Strict Separation:** All dev-only helpers (heavy loggers, debug UIs, test harnesses) must compile out via macros or separate targets.
- **No Template Bloat:** We avoid heavy C++ template libraries (like `nlohmann/json` or `Boost.Beast`) because they bloat binary size structurally.
- **Architecture:** The binary remains small because we chose the right dependencies (C-libs + standard library), not because we wrote obscure code or hand-optimized every byte.

### **Structural Simplicity Rule**

Minimalism applies to **responsibility**, not file count.

- No class, namespace, or translation unit may own more than **one primary responsibility**.
- Any component that:
  - owns a libtorrent session **and**
  - performs persistence **or**
  - performs automation **or**
  - performs RPC-facing serialization
  is **architecturally invalid**.

Composition is mandatory. Coordination is allowed. Centralized behavior is not.

### **Non-Destructive Build Rule (Critical)**

- Do not delete large dependency/build caches (e.g. `vcpkg/`, `vcpkg_installed/`, build dirs) as a “first response”.
- Prefer reuse-first actions: validate, reconfigure, repair by **moving/renaming** folders, or targeted package repair.
- Deletion is a last-resort recovery action when reuse is clearly non-viable (e.g. corruption or irreconcilable layout), and should not be the default troubleshooting step.

---

# **2. Architecture**

We use a standard, robust **Producer/Consumer** model implemented with **strict boundaries**.

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

### **State Propagation Rule**

State updates must be **event-driven**.

- Periodic full-state scans are prohibited once initial bootstrap completes.
- Components must emit explicit change events.
- Snapshots may only rebuild data that is marked dirty by events.

Polling is acceptable only for:
- Startup reconciliation
- External systems with no event surface

---

## **2.1 Architectural Model (Hexagonal / Ports & Adapters) — Critical**

TinyTorrent Backend follows **Hexagonal Architecture (Ports & Adapters)** with strict dependency direction.

**Core rule:** Policy does not depend on mechanisms.  
The torrent core must not know about HTTP, JSON, SQLite, or Win32.

### **Layering (Conceptual)**

- **Domain Core:** Pure engine rules + in-memory state.
- **Application Layer:** Use-cases that coordinate domain + ports (commands, event handling, orchestration).
- **Inbound Adapters:** RPC / tray / CLI translating external requests into commands.
- **Outbound Adapters:** Persistence, filesystem, OS integration, and other I/O implementations.

### **Dependency Direction (Absolute)**

- Dependencies point **inward** only.
- Domain depends on **nothing**.
- Application depends on Domain.
- Adapters depend on Application/Domain, never the reverse.

If you need a feature and the dependency arrow would point outward, introduce a **port**.

---

## **2.2 Ports (The Real Boundary)**

All cross-boundary communication happens through **ports**:

- Ports are **C++ interfaces** defined inward (Domain/Application).
- Ports are implemented outward (Infrastructure).
- Adapters call **application services**; they do not “reach into” the engine.

Examples (illustrative):
- `ITorrentRepository` (load/save)
- `IPathPolicy` (normalize/validate)
- `IClock` (time source)
- `IStatePublisher` (snapshot/event emission)
- `IInstallerActions` (shortcuts/handlers install operations via RPC)

This keeps the core small and prevents god-files.

---

## **2.3 Event-Driven Core (Mandatory Pattern)**

The engine communicates change via **events** (or typed “dirty flags” emitted by events), not by broad rescans.

Examples (illustrative):
- `TorrentAdded`
- `TorrentRemoved`
- `TorrentStateChanged`
- `SessionStatsUpdated`
- `StoragePathsChanged`

Effects:
- Snapshot rebuild is bounded and predictable.
- Serialization work is isolated from engine logic.
- Code naturally splits by event/concern instead of collapsing into mega-units.

---

## **2.4 Forbidden Collapses (Architectural Invalidity)**

Any of these indicates the boundary is broken:

- RPC handler directly mutates engine/session state.
- Domain/engine includes JSON headers, SQL headers, or Win32 UI headers.
- Snapshot building and RPC serialization living in the same “do everything” unit.
- Persistence lookups inside hot snapshot paths.
- “Manager” objects coordinating unrelated subsystems without ports.

When a file starts to accumulate unrelated responsibilities, the correct action is to **introduce ports + split adapters**, not to “organize it better inside one file”.

**Naming Smell Rule:**
Classes or files named `Manager`, `Helper`, or generic `Service`
(outside inbound adapters) are presumed architectural violations
unless justified by an explicit port and single responsibility.


---

## **2.5 God-Object Decompression Rule (Critical Enforcement)**

**Clarification (Critical):**
This rule does NOT authorize proactive or speculative refactoring.
Only code that is directly modified as part of the task may be moved,
extracted, or cleaned up.
Unmodified code must remain in place.

Architecture violations must be **reduced over time**, never preserved.

**Rule:**
If a patch touches a file that already violates the
“single primary responsibility” rule, the patch **must reduce that violation**,
even if only partially.

**Mandatory behavior:**

- At least **one responsibility** must be extracted behind a port or moved into
  a new unit.
- Leaving the file in the **same or worse** architectural state is a spec violation.
- “Out of scope” is **not** an acceptable justification.

**Examples of valid reductions:**

- Extract persistence behind a repository port.
- Move snapshot-building out of engine/session logic.
- Introduce a port and stub implementation even if full migration is deferred.

**Prohibited behavior:**

- Adding new logic to an already mixed-responsibility file.
- “Cleaning up later” without an actual extraction in the same patch.

This rule exists to prevent architectural debt from compounding.

---

# **3. Dependencies (vcpkg)**

We select dependencies that are **structurally small** (mostly C libraries) but use them with **Modern C++20**.

**`vcpkg.json` (illustrative):**

```jsonc
{
  "name": "tinytorrent-daemon",
  "version-string": "0.1.0",
  "dependencies": [
    "libtorrent",
    "sqlite3",
    "yyjson",
    "doctest"
  ]
}
````

**Notes:**

* `libtorrent` is unavoidable weight (core engine).
* `sqlite3` and `yyjson` are preferred because they are small, fast, reliable C libs.
* `doctest` is **Dev/Test only**: Release packaging must not ship tests.
* **Mongoose** is included as a vendor file (`src/vendor/mongoose.c`) to keep build simple.
* **Boost** is used internally by libtorrent, but we **do not** use Boost headers in our codebase to prevent compile slowdowns and structural bloat.

---

# **4. Project Structure**

```txt
root/
|-- meson.build              # Build system
|-- vcpkg.json
|-- make.ps1                 # Primary entrypoint for backend builds (debug/release/test/clean)
|-- build.legacy.ps1         # Legacy Meson/Ninja wrapper (deprecated)
|-- scripts/
|   |-- buildctl.ps1         # Dispatcher that invokes scripts/commands
|   |-- commands/            # User-facing entrypoints that orchestrate workflows
|   |   |-- build.ps1
|   |   |-- clean.ps1
|   |   |-- configure.ps1
|   |   |-- install.ps1
|   |   |-- package.ps1
|   |   |-- setup.ps1
|   |   |-- test.ps1
|   \-- modules/             # Internal helpers with execution guards
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
|   |-- engine/              # Domain core (libtorrent ownership + domain state/events)
|   |   |-- Session.cpp
|   |   |-- Session.hpp
|   |   \-- State.hpp        # In-memory data structures (domain DTOs)
|   |
|   |-- rpc/                 # Inbound adapter (HTTP/JSON)
|   |   |-- Server.cpp
|   |   |-- Router.cpp
|   |   \-- Controllers.cpp
|   |
|   |-- vendor/
|   |   \-- mongoose.c       # Vendored (no external package)
|   |
|   \-- utils/
|       \-- Json.hpp         # C++ wrapper around yyjson (RAII)
|
|-- tests/
|   |-- main_test.cpp
|   \-- unit/                # Logic & JSON tests
```

**Structure rule:** If you introduce an outbound dependency (DB, FS, OS APIs), it belongs in an adapter/infrastructure area and is accessed through a port defined inward.

---

# **5. Implementation Rules (Enforced)**

These rules are **executable constraints**, not guidelines.

If a patch violates any rule below, the correct action is to
**change the structure**, not to justify the violation.

When modifying existing code:

- New logic must **not** be added to files that already mix responsibilities.
- Structural improvement is part of the definition of done.


### 5.1 Window Backdrop Policy (Non-Negotiable, Windows Host / Tray UI)

- **TinyTorrent MUST use custom acrylic via `WCA_ACCENT_POLICY`.**
- **System backdrops (`DWMWA_SYSTEMBACKDROP_TYPE`, Mica, transient, tabbed, etc.) are FORBIDDEN.**
- **Do NOT replace acrylic with any Windows-managed backdrop under any circumstance.**

Rationale (non-actionable):

- Acrylic is a core part of the TinyTorrent visual identity.
- System backdrops alter tint, contrast, noise, and activation behavior in ways that break the design.

Enforcement:

- Any change that removes, weakens, or substitutes `WCA_ACCENT_POLICY` is a **spec violation**.
- Fix visual artifacts (borders, activation outlines, resize issues) **without switching backdrop technology**.
- If acrylic causes issues, the issue must be fixed. Acrylic must not be removed.


### 5.2 DWM Activation / Border Policy (Non-Negotiable)

TinyTorrent uses frameless Win32 windows with custom acrylic via WCA_ACCENT_POLICY (for splash, main WebView host, and any tray-owned UI windows).

The window MUST NOT display any system-drawn activation outline, focus rim,
border tint, or fallback background at any time (startup, activation changes,
snap preview, DPI change, resize, or focus loss).

Enforcement rules:

- WS_THICKFRAME and all system-managed non-client chrome remain disabled.
- Acrylic via WCA_ACCENT_POLICY is mandatory and must not be replaced.
- All DWM attributes that affect borders or activation visuals
  (e.g. DWMWA_BORDER_COLOR, DWMWA_CAPTION_COLOR, related policies)
  must be explicitly set to “none/transparent” and re-applied after
  activation-related events (WM_ACTIVATE, WM_NCACTIVATE, etc.).
- Transparent UI regions must never reveal a system-painted rim or background.
- Relying on default DWM behavior or undocumented fallback visuals is forbidden;
  required attributes must be set explicitly and verified via read-back.


If a visual artifact appears, it must be fixed by correcting DWM policy
handling — never by adding padding, client painting, or switching backdrop
technology.


### **5.3 JSON Handling**

* Library: `yyjson`.
* Write small RAII wrappers (`utils/Json.hpp`) for doc/value lifetime.
* Do not concatenate strings to build JSON; use yyjson mutable API.
* Canonical error envelope must be emitted via a single helper (`result`/`error`/`arguments`).
* RPC thread must not do heavy JSON building; it may only send already-prepared responses or build bounded responses from the latest snapshot.

### **5.4 String Formatting**

* Use `std::format` for formatted messages.
* Avoid `<iostream>` in Release builds.
* Logging must be lightweight: `std::format` + `printf` / `OutputDebugString` under the hood.
* No formatting in hot loops (snapshot build, per-torrent encoding); cache or format once per event.

### **5.5 Error Handling**

* Exceptions allowed from libtorrent and Win32 wrappers.
* Catch exceptions before entering C callbacks (Mongoose) and before crossing threads.
* Worker tasks must catch and convert exceptions to structured RPC errors/events.
* Daemon logs and continues unless unrecoverable:

  * cannot open persistence store / schema mismatch
  * cannot start RPC listener after bounded retries
  * state corruption requiring shutdown

### **5.6 RPC Input Normalization**

* RPC parsing must be centralized: handlers must use shared helpers for extracting/validating args.
* Shared shapes (torrent id sets, path args, optional fields) must have one parser.
* Path normalization must be a single function (Windows: normalize separators, reject relative, enforce security rules).

### **5.7 RAII Enforcement**

* Any resource beyond a function call must be RAII-managed:

  * DB transactions, locks, file/OS handles, threads, COM init.
* No manual open/close, lock/unlock outside RAII guards.

### **5.8 Persistence Boundary Rule**

* Engine code must not issue raw SQL or depend on schema details.
* All persistence goes through repository/DAO interfaces (ports).
* Persistence lookups in hot paths (snapshots, tray status) are forbidden; load once into in-memory state.

### **5.9 Cohesion & Split Rule**

* Keep each file within a single architectural role (Domain vs Application vs Adapter vs Infrastructure).
* If a file starts to mix roles, the fix is **ports + split**, not internal reorganization.
* Apply DRY where it reduces maintenance; avoid “God managers” and catch-all services.

**No-New-Logic-in-Bad-Files Rule (Critical):**

If a file already violates cohesion (multiple architectural roles),
**no new logic may be added to it**.

All new behavior must:

- Be placed in a new file, or
- Be introduced via a port with an adapter implementation.

This applies even if the change is “small”.


---

# **6. Build Modes**

TinyTorrent uses **two** distinct build configurations.

## **6.1 Development Mode (Default)**

* **Focus:** Speed of iteration.
* **Flags:** `/MD` (Dynamic Runtime), Debug Symbols, Logging ON.
* **Features:** Helpers, debug prints, and `doctest` compiled in (tests build target only).

## **6.2 Release Mode**

* **Focus:** Distribution.
* **Flags:** `/MT` (Static Runtime), `/O1` (Size) or `/O2` (Speed).
* **Features:** Logging macros compile to nothing. Tests excluded from packaging.

---

# **7. Testing Strategy**

**Philosophy:** Tests exist to prevent regressions, not to burden the developer.

1. **Scope:**

   * **Unit Tests:** Verify JSON parsing and core state logic.
   * **Integration:** Ensure the RPC server responds to valid requests.
2. **The "Good Enough" Rule:**

   * We do not need 100% coverage.
   * We need enough tests so `make test` / `buildctl.ps1 test` catches obvious breakages.
   * If you break a test, fix the code. If the test is obsolete, update it. Do not spend hours writing complex mocks.

---

# **8. Development Workflow**

### **How to Build**

Agents must use the provided scripts. The `buildctl.ps1` dispatcher routes to dedicated `scripts/commands/` entrypoints (`setup`, `configure`, `build`, `test`, `install`, `package`, `clean`), while `scripts/modules/` contains shared helpers protected with an invocation guard.

```powershell
# 1) Setup Dependencies (VCPKG)
.\scripts\commands\setup.ps1

# 2) Build & Test (runs setup/configure/build/test via make/buildctl)
.\make.ps1 debug
```

### **Definition of Done**

A task is complete when:

1. The code compiles in **Debug Mode** — error free and, if reasonably possible, warning free.
2. Automated tests pass (`.\make.ps1 debug` or `buildctl.ps1 test` returns success).
3. Architectural boundaries (Engine vs. RPC, Ports & Adapters) are respected.

---

## **8.1 Terminal Command Rules (Windows Host)**

1. Do **not** use Linux-only commands/assumptions. The build machine is **Windows**.

2. Extra Windows executables available: `rg`, `fd`, `bat`.

3. For code search, never use `Select-String`. Always use ripgrep:

   * `rg -n -C 5 "<pattern>" <path>`

4. Never write complex or nested one-liners. If a command requires tricky quoting or multiple pipes, move it into a script file instead.

5. All commands must be simple, repeatable, and Windows-safe.

---

# **9. Tray / Launcher (Windows-only)**

Provide a **minimal Win32 tray UI** for TinyTorrent on Windows 11:

* **Single downloadable EXE** for users: `TinyTorrent.exe`.
* **Portable**: no installer required.
* Uses **Win32 API only** (no WinUI, no WPF, no frameworks).

## **9.1 Runtime Behavior**

* The process runs the backend daemon logic (engine + RPC + HTTP static UI) and also exposes a tray icon.
* Tray menu:

  * **Open UI**: opens default browser to `http://127.0.0.1:<port>/#tt-token=<token>`

    * The token is placed in the URL fragment so it is **not** sent in HTTP requests.
  * **Exit**: triggers graceful shutdown (`app-shutdown` semantics).
* Tooltip (mouse hover): may show small status text.

  * Future: display transfer rate + torrent count using engine snapshot.

## **9.2 Tray Layer Responsibilities**

* Must be implemented as a tiny Win32 procedural component (WinMain + message loop).
* Use only raw Win32 APIs and C-style interfaces; avoid UI frameworks, GUI toolkits, or heavy C++ abstractions.
* Minimize STL use; keep code small, self-contained, and focused on UI duties only.
* The tray must never "own" or operate engine logic — it only issues compact RPC calls (e.g. `session-tray-status`) and control actions; all torrent/session logic remains in the backend.

---

## **9.3 Security Contract (Must Follow Docs)**

Security is defined in:

* `docs/TinyTorrent_Specification.md` (section 7)
* `docs/TinyTorrent_RPC_Extended.md`

Key requirements:

* Backend binds to **loopback** and chooses a **random free port**.
* Backend generates an **ephemeral token** per run.
* Backend writes `connection.json` with ACL restricted to current user.
* Frontend must send `X-TT-Auth: <token>` on all RPC requests.

---

## **9.4 Installation Without an Installer**

TinyTorrent may implement an RPC method that:

* Creates `.lnk` shortcuts (Desktop / Start Menu / Startup folder)
* Optionally registers `magnet:` and `.torrent` handlers
* Optionally copies/moves the EXE to `Program Files\TinyTorrent\TinyTorrent.exe` (requires elevation)

This is specified in the protocol docs update (see `docs/*`).

---

## **9.5 Tray Rules (Simple)**

Tray stays thin Win32 code.
Tray polls via `session-tray-status` (HTTP only).
No WebSockets.
Tray never infers state; it reflects backend values.

### **Ownership**

System changes (shortcuts, handlers, install) → daemon RPC only.
Tray only calls RPCs and shows results.

---

# **10. Execution Discipline (Agent Rules)**

* When you design a build solution, be kind with the user’s time. Ask yourself: what’s fastest without breaking correctness?
* Deletion of large folders (even temporary/generated) is not the default. Prefer reuse-first actions; if deletion is unavoidable, the agent must **explicitly state why**.
* When you change code, run the build/tests as appropriate and fix issues before calling the task complete.
* Before reporting a task as completed, perform a review and fix all important issues. Repeat until satisfied, then run `.\make.ps1 debug` and ensure no compilation failures (and no warnings if reasonably possible) and all tests pass.

## **10.1 Patch Acceptance Checklist (Mandatory)**

Before declaring a task complete, the agent must confirm:

1. No new logic was added to a file that already mixed responsibilities.
2. If such a file was touched, at least one responsibility was extracted.
3. Any new dependency crosses a boundary only via a port.
4. No new “Manager”, “Helper”, or catch-all classes were introduced.
5. The patch moves the architecture **closer** to the spec, not merely sideways.

If any item fails, the patch is incomplete.

## **10.2 Identifier Quality & Rename Reporting (Mandatory)**

When touching or reviewing code, the agent must actively evaluate
**identifier quality** (variable, function, type, and file names).

**Rule:**
If any identifier is misleading, overloaded, vague, or no longer matches
its responsibility, the agent must **report it explicitly** instead of silently
renaming it.

**Required behavior:**

- Produce a short list titled **“Rename Candidates”**.
- List each item as:
  - `current_name` → `recommended_name`
  - One-line justification (semantic mismatch, scope drift, legacy name, etc.)
- Do **not** perform the rename unless explicitly instructed.

**Examples of rename triggers:**

- Names like `Manager`, `Helper`, `Util`, `Service` without a clear role.
- Variables representing snapshots/events but named as “state” or “data”.
- Functions that now coordinate behavior but are named as pure getters/setters.
- Files whose names no longer match their architectural role.

**Rationale:**
Renaming is a high-signal refactor best performed interactively.
Reporting candidates preserves velocity while improving correctness.

Failure to report obvious rename candidates is a spec violation.
