/\* DISPATCHER.CPP

This file **definitely needs refactoring**. While the code is
functional, it suffers from several architectural "smells" that will make
maintenance a nightmare as the project grows.

Here is a breakdown of the issues and the recommended architectural changes.

### 1. The "God File" Problem

**Issue:** `Dispatcher.cpp` contains **everything**:

1.  JSON Parsing helpers.
2.  Windows Registry modification logic.
3.  Linux `.desktop` file creation logic.
4.  File system iteration logic.
5.  RPC Routing logic.
6.  The implementation of every single RPC command.

**Refactoring:**
Split the logic into specialized modules. The `Dispatcher` should only be
responsible for **routing** requests, not executing the business logic or
interacting with the OS.

- **`src/rpc/JsonUtils.hpp`**: Move all `parse_int_value`,
  `parse_download_dir`, `bool_value` helpers here.
- **`src/utils/Platform.cpp`**: Move `register_windows_handler`,
  `register_linux_handler`, `open_with_default_app` here.
- **`src/rpc/handlers/`**: Create separate files for groups of commands:
  - `SessionHandlers.cpp` (`session-get`, `set`, `stats`)
  - `TorrentHandlers.cpp` (`torrent-get`, `add`, `action`)
  - `SystemHandlers.cpp` (`fs-browse`, `open`, `register`)

### 2. Unbounded Concurrency (The `std::thread(...).detach()` trap)

**Issue:**
In `handle_fs_browse_async` and `handle_fs_space_async`, you are spawning a new
thread and detaching it for every request.

```cpp
std::thread([cb](){ ... }).detach();
```

If a client spams `fs-browse` requests, you will spawn hundreds of threads,
potentially exhausting system resources.

**Refactoring:**
Use a **Thread Pool** for I/O bound operations that shouldn't block the Engine
thread.

1.  Add a `ThreadPool` to `tt::engine::Core` or `tt::rpc::Server`.
2.  Submit these tasks to the pool: `thread_pool_->submit([...] { ... });`.

### 3. Leakage of OS APIs into RPC Layer

**Issue:**
The top of the file is cluttered with `#include <Windows.h>`, `<shellapi.h>`,
`<unistd.h>`, etc. The RPC layer (which deals with JSON) should not know about
Win32 registry keys or XDG MIME types.

**Refactoring:**
Create an abstraction for System operations.

**Interface (`src/engine/SystemInterface.hpp`):**

```cpp
struct SystemHandlerResult { bool success; std::string message; };

class SystemInterface {
public:
    virtual SystemHandlerResult register_handler() = 0;
    virtual bool open_path(std::filesystem::path const& path) = 0;
    virtual bool reveal_path(std::filesystem::path const& path) = 0;
};
```

Implement this in `src/utils` and inject it into the handlers.

---

### Proposed File Structure Implementation

Here is how you should break this up:

#### A. Move JSON Helpers (`src/rpc/JsonUtils.hpp`)

```cpp
#pragma once
#include <yyjson.h>
#include <optional>
#include <vector>
#include <string>

namespace tt::rpc::json {
    std::optional<int> parse_int(yyjson_val* val);
    std::optional<bool> parse_bool(yyjson_val* val);
    std::vector<int> parse_ids(yyjson_val* args);
    // ... move all parser helpers here
}
```

#### B. Move Platform Logic (`src/utils/PlatformUtils.cpp`)

```cpp
#include "utils/PlatformUtils.hpp"
#ifdef _WIN32
#include <Windows.h>
// ...
#endif

namespace tt::utils {
    SystemHandlerResult register_os_handler() {
        #ifdef _WIN32
        // ... paste register_windows_handler logic here ...
        #elif __linux__
        // ... paste register_linux_handler logic here ...
        #endif
    }

    bool shell_open(std::filesystem::path const& path) {
        // ... paste open/reveal logic here ...
    }
}
```

#### C. Clean up `Dispatcher.cpp`

The dispatcher becomes a clean mapping table.

```cpp
#include "rpc/Dispatcher.hpp"
#include "rpc/handlers/SessionHandlers.hpp"
#include "rpc/handlers/TorrentHandlers.hpp"
#include "rpc/handlers/SystemHandlers.hpp"

namespace tt::rpc {

void Dispatcher::register_handlers() {
    // Session
    add_sync("session-get", handlers::session_get);
    add_sync("session-set", handlers::session_set);

    // Torrent
    add_sync("torrent-get", handlers::torrent_get);
    add_sync("torrent-add", handlers::torrent_add);

    // System (Async via ThreadPool, assuming 'engine' exposes one)
    add_async("fs-browse", [this](auto args, auto cb) {
        engine_->get_io_pool().submit([args, cb] {
            handlers::fs_browse(args, cb);
        });
    });
}

// ... dispatch method remains strictly for routing ...

}
```

### 4. Code Cleanup: `parse_ids` vs `parse_int_array`

**Issue:**
There is logic duplication between parsing specific integer arrays and general
IDs.
**Fix:**
Standardize on a generic template or utility in `JsonUtils`:

```cpp
template <typename T>
std::vector<T> parse_array(yyjson_val* parent, const char* key);
```

### Summary of Action Items

1.  **Extract** all `yyjson` helper functions to a header-only or static utility
    library.
2.  **Move** OS-specific logic (Windows/Linux handlers) to `src/utils/`.
3.  **Split** the handlers into logical C++ files (`SessionHandlers`,
    `TorrentHandlers`, etc.) so developers don't step on each other's toes when
    modifying different features.
4.  **Replace** `std::thread(...).detach()` with a dedicated `ThreadPool` for
    filesystem operations.

\*/

---

/\*

This file **needs refactoring**, primarily to improve **Separation of
Concerns**.

Currently, `Server.cpp` is acting as a "God Object" for the networking layer. It
mixes transport logic (Mongoose), protocol logic (HTTP/WebSocket), business
logic (Snapshot Diffing), and utility logic (Base64/String parsing).

Here are the specific areas to refactor:

### 1. Extract Snapshot Diffing Logic (The biggest architectural violation)

**Issue:** `Server.cpp` contains complex logic (`compute_diff`, `SnapshotDiff`,
`session_snapshot_equal`) to compare two `SessionSnapshot` objects.
**Why it's bad:** The Networking layer shouldn't know the intricate details of
Engine data structures or how to calculate deltas between them. This logic is
untestable inside the private namespace of the Server.
**Solution:** Move this to a dedicated `StateTracker` or `DiffGenerator`.

**New File: `src/rpc/StateDiff.hpp`**

```cpp
namespace tt::rpc {
    struct SnapshotDiff {
        std::vector<int> removed;
        std::vector<engine::TorrentSnapshot> added;
        // ...
        static SnapshotDiff compute(const engine::SessionSnapshot& a,
                                  const engine::SessionSnapshot& b);
    };
}
```

### 2. Extract Authorization & HTTP Utilities

**Issue:** Functions like `canonicalize_host`, `host_allowed`, `origin_allowed`,
and `authorize_request` take up ~200 lines.
**Why it's bad:** This is "Middleware" logic. It obscures the actual request
handling flow.
**Solution:** Move this to `src/rpc/HttpMiddleware.hpp`.

```cpp
namespace tt::rpc::middleware {
    // Returns std::nullopt if authorized, or an error response string if not
    std::optional<std::string> validate_request(struct mg_http_message* hm,
                                              const ServerOptions& opts);
}
```

### 3. Eliminate Code Duplication (Base64)

**Issue:** The file implements `decode_base64` in an anonymous namespace.
**Why it's bad:** You already have `src/utils/Base64.hpp`. You are compiling the
same logic twice and maintaining two versions.
**Solution:** `#include "utils/Base64.hpp"` and remove the local implementation.

### 4. Isolate WebSocket Management

**Issue:** `ws_clients_` management (adding, removing, broadcasting, pinging) is
mixed with HTTP handling.
**Solution:** Create a `WebSocketManager` class inside `Server`.

```cpp
class WebSocketManager {
public:
    void add_client(mg_connection* conn, std::shared_ptr<SessionSnapshot> snap);
    void remove_client(mg_connection* conn);
    void broadcast(const std::string& msg);
    void broadcast_patch(const SessionSnapshot& current); // Handles the diffing
internally private: struct Client { ... }; std::vector<Client> clients_;
    std::mutex mutex_;
};
```

---

### Refactored `Server.cpp` structure

If you apply these changes, `Server.cpp` becomes a clean coordinator:

```cpp
#include "rpc/Server.hpp"
#include "rpc/HttpMiddleware.hpp" // New
#include "rpc/StateDiff.hpp"      // New
#include "utils/Base64.hpp"       // Use existing

// ... imports ...

namespace tt::rpc {

// ... constructor / destructor ...

void Server::handle_http_message(mg_connection* conn, mg_http_message* hm) {
    // 1. Middleware Check
    if (auto error = middleware::validate_request(hm, options_)) {
        mg_http_reply(conn, 403, ... , error->c_str());
        return;
    }

    // 2. Route Dispatch
    // ... existing dispatch logic ...
}

void Server::broadcast_websocket_updates() {
    // Logic delegated to helper class or standalone function
    // that uses StateDiff::compute()
    auto diff = StateDiff::compute(*last_snapshot_, *current_snapshot_);
    if (!diff.empty()) {
        auto payload = serialize_ws_patch(...);
        ws_manager_->broadcast(payload);
    }
}

}
```

### Recommendation

**refactor.**

1.  **Immediate:** Delete the local `decode_base64` and use `utils/Base64.hpp`.
2.  **High Value:** Move the `compute_diff` and related structs out to a
    separate file. This logic is complex and creates a heavy dependency on Engine
    internals within the Server file.
3.  **Medium Value:** Extract `authorize_request` and host checking logic.

\*/

---

/\*

This file **needs refactoring**.

While the code is performant (using `yyjson`) and currently functional, it
exhibits several architectural anti-patterns that will make maintenance
difficult as the application grows.

### The Problems

1.  **"God Object" for Serialization**: This single file knows about every data
    structure in your application (`CoreSettings`, `SessionSnapshot`,
    `TorrentSnapshot`, `HistoryBucket`, `FsEntry`). If you change _any_ logic in the
    engine, you likely have to recompile this file.
2.  **Stringly-Typed API Contract**: JSON keys (e.g., `"download-dir"`,
    `"dht-nodes"`) are hardcoded string literals scattered inside function bodies.
    This makes it impossible to ensure consistency between serialization (GET) and
    deserialization (SET) logic elsewhere in the app.
3.  **Boilerplate Repetition**: Almost every function repeats the same `yyjson`
    setup: check doc validity, create root, add `"result": "success"`, create
    `"arguments"`.
4.  **Procedural Wall of Code**: `serialize_session_settings` is a massive,
    brittle block of procedural assignments. Adding a new setting requires manually
    writing the line to add it to the JSON object.

---

### Refactoring Plan

Here is how you should restructure this to improve architecture.

#### 1. Create a `JsonBuilder` Abstraction

Encapsulate the `yyjson` boilerplate. This removes the repetitive setup code
from every function.

**`src/rpc/JsonBuilder.hpp`**

```cpp
class JsonResponseBuilder {
public:
    explicit JsonResponseBuilder(const char* result_status = "success");

    // Returns the "arguments" object where data should be written
    yyjson_mut_val* args();

    // Finalizes and returns string
    std::string write();

    // Helper for common types
    void add_str(const char* key, const std::string& val);
    void add_int(const char* key, int val);
    // ...
private:
    tt::json::MutableDocument doc_;
    yyjson_mut_val* args_root_;
};
```

#### 2. Split by Domain

Break the file into smaller, cohesive units based on the subsystem they serve.

- `src/rpc/serializers/SessionSerializer.cpp` (Settings, Stats)
- `src/rpc/serializers/TorrentSerializer.cpp` (Lists, Details, Updates)
- `src/rpc/serializers/SystemSerializer.cpp` (Filesystem, OS actions)

#### 3. Data-Driven Settings Serialization

Instead of writing 100 lines of `yyjson_mut_obj_add_*`, use a mapping table.
This allows you to define the relationship between a C++ struct field and a JSON
key once.

**Example Refactoring of `serialize_session_settings`:**

```cpp
// Define a descriptor for settings
template <typename T>
struct SettingMap {
    const char* json_key;
    T engine::CoreSettings::* member;
};

// In implementation
std::string serialize_session_settings(const engine::CoreSettings& s, ...) {
    JsonResponseBuilder builder;
    auto* args = builder.args();
    auto* doc = builder.doc();

    static constexpr auto kIntSettings = std::to_array<SettingMap<int>>({
        {"download-queue-size", &engine::CoreSettings::download_queue_size},
        {"peer-limit", &engine::CoreSettings::peer_limit},
        // ... add others here
    });

    for (const auto& map : kIntSettings) {
        yyjson_mut_obj_add_sint(doc, args, map.json_key, s.*(map.member));
    }

    // Handle bools, strings, etc. similarly...

    return builder.write();
}
```

#### 4. Consolidate "Delta" Logic

The function `add_torrent_delta` contains complex logic for comparing fields to
determine what changed. This logic belongs in the `Engine` or a dedicated `Diff`
utility, not in the RPC serializer.

**Better Architecture:**

1.  **Engine:** Calculates the diff (`struct TorrentDiff`).
2.  **Serializer:** Dumbly serializes the `TorrentDiff` struct.

### Refactored File Structure Example

**`src/rpc/Serializer.hpp`** (The public interface remains similar, but includes
are reduced)

```cpp
#pragma once
// Forward declarations only
namespace tt::engine { struct CoreSettings; struct SessionSnapshot; ... }

namespace tt::rpc {
    std::string serialize_session_settings(const engine::CoreSettings& settings,
...);
    // ...
}
```

**`src/rpc/serializers/TorrentSerializer.cpp`**

```cpp
#include "rpc/Serializer.hpp"
#include "rpc/JsonHelpers.hpp"

namespace tt::rpc {
    // Only logic related to Torrents
    static void add_torrent_summary(...) { ... }

    std::string serialize_torrent_list(...) {
        // Implementation
    }
}
```

### Recommendation

**Refactor.** Start with **Step 3 (Data-Driven Settings)** as it yields the
highest code-reduction-to-effort ratio. Then move to **Step 2 (Splitting
files)** to stop the file from growing further.

\*/
