# **AGENTS_BACKEND.md — TinyTorrent Micro-Engine**

**Purpose:**
Single authoritative reference for the architecture of the **TinyTorrent Daemon**, optimized for **minimum binary size** and **minimal memory usage**, while maintaining a **comfortable development workflow**.

---

# **1. Core Identity**

TinyTorrent Daemon = **C++20** × **libtorrent** × **Embedded Tactics**.

### Identity Pillars

- **Static & Stripped (Release Only):**
  Release builds produce one `.exe`, fully static, symbol-free, no DLLs.

- **Debuggable (Development):**
  Development builds retain symbols, exceptions, RTTI, logs, and dynamic CRT.

- **No Frameworks:**
  No Beast, no Crow, no Boost-websocket. They are heavy and template-bloated.

- **Hybrid Stack:**
  Engine = C++20 (libtorrent)
  RPC Layer = C (Mongoose) for minimal footprint.

- **Size Target:**
  **Release:** `< 4MB` uncompressed, ~1.5MB with UPX.
  **Development:** unrestricted.

- **Memory Target (Release):**
  **< 10MB idle** on Windows (except user requested disk cache)

---

# **2. Architecture**

- **Language:** C++20 (MSVC).

- **Core Engine:** `libtorrent-rasterbar` (static link)
  _Build:_ minimal-size configuration (logging disabled, deprecated APIs removed, tools excluded).

- **RPC/Web Server:** **Mongoose** (Cesanta).
  _Why:_ Pure C, single-file library, tiny binary footprint, handles HTTP + WebSockets.

- **JSON Parser:** **yyjson** (preferred) or **RapidJSON**.
  _Why:_ `nlohmann/json` generates hundreds of KB of templates. yyjson is extremely small and very fast.

- **Database:** **SQLite3** (C API), statically linked.

## **The Micro-Loop**

Two threads only:

1. **Thread 1 — Engine:** Runs libtorrent session loop.
2. **Thread 2 — RPC:** Runs Mongoose event loop (`mongoose_poll`).

Communication:

- Command queue: `std::deque` with a mutex or MPSC queue.
- Shared state snapshot: `std::atomic<void*>` or RC’ed struct for readonly snapshots.

Thread-safe, minimal, fast.

---

# **3. Dependencies (vcpkg Manifest)**

**`vcpkg.json`:**

```json
{
  "name": "tinytorrent-daemon",
  "version-string": "0.1.0",
  "dependencies": ["libtorrent", "sqlite3", "yyjson"]
}
```

**Mongoose** is not installed through vcpkg — it is compiled directly from `mongoose.c`.

---

# **4. Project Structure (Optimized)**

```txt
root/
|-- CMakeLists.txt            # Development/Release modes
|-- vcpkg.json
|
|-- src/
|   |-- main.cpp              # Entry point, thread creation
|   |
|   |-- vendor/
|   |   |-- mongoose.c
|   |   \-- mongoose.h
|   |
|   |-- engine/
|   |   |-- Core.cpp          # Libtorrent session wrapper
|   |   \-- Core.hpp
|   |
|   |-- rpc/
|   |   |-- Server.cpp        # Mongoose event handlers
|   |   |-- Dispatcher.cpp    # RPC method routing
|   |   \-- Serializer.cpp    # yyjson encoding
|   |
|   \-- utils/
|       \-- FS.cpp            # filesystem helpers
```

---

# **5. Protocol Implementation (RPC)**

### **C-Bridge Strategy**

No heavy abstractions.
No OOP server framework.
Mongoose callback + switch logic is enough.

**Example:**

```cpp
static void fn(struct mg_connection *c, int ev, void *ev_data, void *fn_data) {
    if (ev == MG_EV_HTTP_MSG) {
        auto *hm = (struct mg_http_message *)ev_data;
        // 1. Validate endpoint
        // 2. Parse JSON via yyjson
        // 3. Push command to engine queue
        // 4. Send reply with mg_http_reply()
    }
}
```

### **Data Strategy**

- **Input:** Transmission RPC-compatible requests.
- **Output:** Minimal JSON strings.
- **Push Updates:**
  Build a **single JSON buffer per second** and broadcast to all WebSocket clients.
  → Zero per-client allocations.

---

# **6. Build Modes (Mandatory)**

TinyTorrent uses **two** build configurations.
One for productivity, one for binary minimalism.

---

## **6.1 Development Mode (`Debug` or `RelWithDebInfo`)**

Default mode used during daily coding.

- **Runtime:** `/MD` (dynamic CRT)
- **Optimization:** default or `/O2`
- **LTO:** OFF
- **Symbols:** ON
- **Exceptions:** ON globally (`/EHsc`)
- **RTTI:** ON
- **Logging:** ON
- **Assertions:** ON
- **Binary size:** irrelevant

This ensures:

- fast build times
- easy debugging
- stack traces
- no accidental size-optimization misery
- no “where did my symbol go?” headaches

---

## **6.2 Release Mode (`MinSizeRel`)**

Used only for producing the distributable daemon.

- **Runtime:** `/MT` (static CRT)
- **Optimization:** `/Os` or `/O1` (minimize size)
- **LTO:** `/GL` (Link-Time Optimization)
- **Symbols:** stripped
- **Exceptions:** allowed only where libtorrent requires
- **RTTI:** OFF if possible
- **Logging:** OFF
- **Assertions:** OFF
- **Binary target:** `< 4MB`

This build is sculpted for extreme minimalism.

---

# **7. MVP Deliverables**

1. **Micro-Server:** Minimal Mongoose-based HTTP server.
2. **Libtorrent Static Integration:** Engine loop running.
3. **RPC Stub:** `session-get` implemented.
4. **Tiny JSON:** yyjson-based RPC parsing.
5. **Single Executable:** `tt-engine.exe` runnable on clean Windows.

---

# **8. Development Rules**

These rules protect binary size **without breaking development workflow**:

1. **Do not use `<iostream>` in release code.**
   It drags huge static initializers. Use `printf` or `fmt`.

2. **Exceptions:**

   - ON during development.
   - Keep exception paths rare in release. Libtorrent uses exceptions internally.

3. **Forward Declarations:**
   Use them aggressively to keep headers light.

4. **Includes:**
   Do not include large STL headers in `.hpp` files.

5. **Logging:**

   - Verbose logging allowed in dev.
   - Completely removed in release via macros.

6. **Check `.exe` size after major work.**
   Any unexpected +1MB spike must be investigated immediately.

---

# **9. Development vs Release Rules (Critical)**

These guarantees must always hold:

### **Development (Default)**

- Fast compiles
- Full debug symbols
- Logs enabled
- Exceptions enabled
- Dynamic CRT
- No size constraints

This is the only mode used while writing code.

### **Release (Manual Only)**

- Switch to `MinSizeRel`
- Static CRT
- LTO enabled
- Symbols removed
- Logging disabled
- RTTI removed if possible
- Size < 4 MB

Run this only when producing the final artifact.

---

# **End of Specification**

All agents must respect development ergonomics while ensuring release builds meet the extreme micro-binary requirements.
