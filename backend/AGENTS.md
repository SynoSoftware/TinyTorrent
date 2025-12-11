# **AGENTS_BACKEND.md — TinyTorrent C++ Engine**

**Purpose:**
Single authoritative reference for the architecture, protocol compliance, and development standards for the **TinyTorrent Daemon (C++ Edition)**.

---

# **1. Core Identity**

TinyTorrent Daemon = **C++20** × **libtorrent** × **Zero Overhead**.

### Identity Pillars:

- **True Native:** No Garbage Collection. No Virtual Machine. Metal performance.
- **Micro-Footprint:** Target executable size **< 5MB**. Target Idle RAM **< 15MB**.
- **Dependency Discipline:** We do not import heavy frameworks. We use libraries that compile down to static code.
- **Modern C++:** We use C++20 (Smart Pointers, Modules if viable, Coroutines) to prevent memory leaks and segmentation faults.
- **Protocol Mimicry:** We look exactly like `Transmission 4.0.0` to the HTTP RPC world.

---

# **2. Architecture**

- **Language:** **C++20**.
- **Core Engine:** `libtorrent-rasterbar` (v2.0+).
  - _Why:_ The industry standard. Used by qBittorrent, Deluge. Highly optimized.
- **Build System:** **CMake** + **Vcpkg** (Manifest mode).
  - _Strict Rule:_ No manual compiling of libs. Dependencies are defined in `vcpkg.json`.
- **Web/RPC Server:** `Crow` OR `Boost.Beast`.
  - _Requirement:_ Must handle HTTP (RPC) and WebSockets (Push) asynchronously.
  - If `libtorrent` pulls in Boost.Asio, we prefer **Boost.Beast** to reuse the existing async reactor and avoid adding a second event loop.
- **JSON Serialization:** `nlohmann/json`.
- **Database:** `SQLite` (Lightweight, single file) or flat JSON files (if < 1000 items).
  - _Decision:_ **SQLite** is preferred for robustness and complex sorting (History, Search).

## **The "Single Reactor" Strategy**

To minimize context switching and thread overhead, the app should ideally run on a **Shared `io_context`** (Asynchronous Event Loop).

1.  **Main Thread:** Initializes the `boost::asio::io_context`.
2.  **Libtorrent:** Posts alerts/events to this context.
3.  **RPC Server:** Listens on a socket bound to this same context.
4.  **Result:** Zero locking issues, zero thread-hopping latency. Everything happens sequentially in the event loop (or a small thread pool handling the loop).

---

# **3. Project Structure (C++)**

Standard CMake structure.

```txt
root/
|-- CMakeLists.txt           # Main build config
|-- vcpkg.json               # Dependencies (libtorrent, boost, sqlite3, nlohmann-json)
|
|-- src/
|   |-- main.cpp             # Entry point, Signal Handling, Context setup
|   |
|   |-- engine/              # Torrent Logic
|   |   |-- Session.hpp      # Wrapper around lt::session
|   |   |-- Session.cpp
|   |   \-- AlertHandler.cpp # Handles libtorrent events (finished, progress)
|   |
|   |-- rpc/                 # Network Layer
|   |   |-- Server.hpp       # HTTP/WS Listener
|   |   |-- Controller.cpp   # Handles "torrent-get", "torrent-add"
|   |   \-- Mapper.cpp       # Converts lt::torrent_status -> Transmission JSON
|   |
|   |-- store/               # Persistence
|   |   \-- DB.cpp           # SQLite wrapper
|   |
|   \-- utils/
|       \-- Config.hpp       # Constants & Paths
|
\-- tests/
    \-- ...
```

---

# **4. Protocol & Data Logic**

### **The "Imposter" Interface**

We must implement the Transmission RPC Spec exactly.

- **Input:** JSON Payload.
  - Example: `{"method": "torrent-get", "arguments": {"fields": ["id", "name"]}}`
- **Mapping:**
  - `id` (Transmission) <=> `info_hash` (Libtorrent).
  - _Challenge:_ Transmission uses integer IDs (1, 2, 3). Libtorrent uses Hash strings.
  - _Solution:_ The `DB` or `Session` must maintain a `std::map<int, lt::sha1_hash>` and `std::map<lt::sha1_hash, int>` to translate permanently.
- **Output:**
  - Must match Transmission types strictly (Ints, Bools, Arrays).

### **Memory Management**

- **RAII (Resource Acquisition Is Initialization):**
  - Never use `new` / `delete`.
  - Use `std::unique_ptr` and `std::shared_ptr`.
  - Resources (Sockets, File Handles) must close automatically when the object goes out of scope.
- **String Handling:**
  - Use `std::string_view` for parsing to avoid copying memory unnecessarily.

---

# **5. Performance Standards**

- **Startup Time:** < 500ms.
- **Linker Optimization:**
  - Use LTO (Link Time Optimization) in Release builds (`-flto`).
  - Strip symbols (`-s` equivalent in CMake).
- **Static Linking:**
  - Where possible, link libraries statically (except system libs) to produce a portable binary.

---

# **6. Integration Directives (C++ Specific)**

1.  **Vcpkg is the Law:**
    - Do not ask the user to `apt-get install libboost`.
    - The build process must be: `cmake -B build -S . -DCMAKE_TOOLCHAIN_FILE=.../vcpkg.cmake` -> `cmake --build build`.
2.  **Windows Compatibility:**
    - Since the build machine is Windows, we must ensure MSVC (Visual Studio Compiler) compatibility.
    - Avoid `unistd.h` or Linux-specific syscalls. Use `std::filesystem` for file ops.
3.  **Safety:**
    - Compiler Warnings are Errors (`/WX` on MSVC, `-Werror` on GCC/Clang).

---

# **7. MVP Deliverables (C++ Backend)**

1.  **CMake Setup:** A working `CMakeLists.txt` that pulls `libtorrent` and a Web Server via Vcpkg.
2.  **Hello World:** A compiled `.exe` that prints the Libtorrent version.
3.  **RPC Stub:** A server listening on port 9091 responding to `session-get` with dummy JSON.
4.  **Engine Wiring:** Ability to add a magnet link and see it download to a folder.
5.  **WebSockets:** A push stream sending updates to the frontend.

---

# **8. Development Environment (Windows)**

Since you are on Windows:

1.  **Prerequisites:** Visual Studio 2022 (C++ Desktop Dev), CMake, Git.
2.  **Vcpkg:** Needs to be bootstrapped.
3.  **Commands:**
    - Agents must provide PowerShell-compatible CMake commands.
    - Agents must not assume `make` exists (use `cmake --build`).
