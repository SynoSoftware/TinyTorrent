⚠️ LEGACY DOCUMENT — NOT ACTIVE

This document describes an abandoned architecture where TinyTorrent
owned a custom daemon, protocol extensions, and websocket sync.

It is preserved for historical context only.

DO NOT implement from this document.
DO NOT extend this document.
DO NOT treat this as authoritative.

See:
docs/EXE_architecture.md
docs/Host_Agent_Contract.md

**Active architecture and RPC decisions now live in `docs/EXE architecture.md`, which describes the Transmission RPC-only contract.** Treat this specification as historical material; do not allow it to influence any current implementation choices.



# **TinyTorrent Master Specification (v1.1)**

**Role:** Authoritative Architecture Document
**Target:** Engineering Team (C++ Backend & TypeScript Frontend)

## **1. Architecture & Protocol Upgrade**

The daemon operates in two modes to ensure broad compatibility while enabling modern features.

### **1.1 Capability Discovery (The Handshake)**

**Method:** `tt-get-capabilities`
**Purpose:** Allows the frontend to detect if the backend is standard Transmission or TinyTorrent.
**Response:**

```json
{
  "result": "success",
  "arguments": {
    "version": "TinyTorrent 1.0.0",
    "rpc-version": 17,
    "websocket-path": "/ws",
    "features": ["fs-browse", "system-reveal", "proxy-support", "sequential-download"]
  }
}
```

### **1.2 WebSocket Sync Protocol**

**Endpoint:** `ws://localhost:PORT/ws`
**Behavior:**

* **Snapshot:** Sent on connection. Contains full session config and torrent list.
* **Patch:** Sent on state change (e.g., 500ms interval). Contains **deltas only**.
* **Events:** Immediate system notifications (errors, file moves).

---

## **2. Extended RPC: System & Filesystem (`fs-*`, `system-*`)**

These methods provide the "Desktop Agent" capabilities.

### **2.1 Filesystem Browsing**

* **`fs-browse`**: Returns directory tree. Critical for "Save Path" dialogs.

  * *Input:* `path` (string).
  * *Output:* `entries` (array of name/type/size), `parent`, `separator`.
* **`fs-space`**: Returns `free-bytes` and `total-bytes` for a path.

### **2.2 System Integration**

* **`system-reveal`**: Opens OS file explorer.

  * *Logic:* If target is file, highlight it. If dir, open it.
* **`system-open`**: Launches file (double-click behavior).
* **`system-register-handler`**: Associates `magnet:` and `.torrent` with TinyTorrent (requires Admin on Windows).

### **2.3 Application Lifecycle**

* **`app-shutdown`**: Graceful exit.

  * *Must:* Pause session, save resume data, save state, terminate.

---

## **3. Extended RPC: Engine & Network (`session-set`)**

We extend standard methods to expose `libtorrent` power features.

### **3.1 Proxy & Privacy (Critical for qBit Parity)**

Transmission lacks detailed proxy config. We add these keys to `session-set`:

* `proxy-type`: Enum (0=None, 1=SOCKS4, 2=SOCKS5, 3=HTTP).
* `proxy-url`: String (`hostname:port`).
* `proxy-auth-enabled`: Bool.
* `proxy-username`: String.
* `proxy-password`: String.
* `proxy-peer-connections`: Bool (Proxy peer traffic or just tracker?).

### **3.2 Queueing & Limits**

Map these standard Transmission keys to `libtorrent` settings:

* `download-queue-size`: Max active downloads.
* `seed-queue-size`: Max active uploads.
* `queue-stalled-enabled` & `queue-stalled-minutes`: Treat inactive peers as stalled to rotate queue.

### **3.3 Performance Tuning**

* `engine-disk-cache`: MB size for RAM cache (def: 64).
* `engine-hashing-threads`: CPU threads for checking (def: 1).

---

## **4. Extended RPC: Torrent Management (`torrent-set`)**

### **4.1 Advanced Playback & Seeding**

* `sequential-download`: Bool (Prioritize header/start for streaming).
* `super-seeding`: Bool (Initial seeder logic).
* `force-recheck`: Bool (Trigger hash check).
* `force-reannounce`: Bool (Trigger tracker scrape).

### **4.2 Categorization (Labels)**

Since `libtorrent` doesn't track labels, the **Backend** must:

1. Accept `labels` (array of strings) in `torrent-set`.
2. Store `labels` in `state.json` mapped to the InfoHash.
3. Return `labels` in `torrent-get`.

---

## **5. Backend Core Logic (The "Smart" Agent)**

The C++ Engine (`Core.cpp`) must implement these autonomous loops.

### **5.1 Incomplete Directory Manager**

* **Config:** `incomplete-dir-enabled`, `incomplete-dir`.
* **Logic:**

  1. **Add:** If enabled, force `save_path` to incomplete dir.
  2. **Monitor:** Listen for `torrent_finished_alert`.
  3. **Action:** `handle.move_storage(real_download_path)`.

### **5.2 Watch Directory Monitor**

* **Config:** `watch-dir-enabled`, `watch-dir`.
* **Logic:**

  1. Background thread polls directory every 2s.
  2. Parses `*.torrent`.
  3. Adds to engine.
  4. Renames file to `.added` (success) or `.invalid` (fail).

### **5.3 Automated Seeding Limits**

* **Config:** `seed-ratio-limit`, `seed-idle-limit`.
* **Logic:**

  1. Check active torrents every 5s.
  2. If `upload/download > ratio`, `handle.pause()`.
  3. If `idle_time > limit`, `handle.pause()`.

### **5.4 Fast Resume (Instant Startup)**

* **Logic:**

  1. **Shutdown:** Call `save_resume_data` for all torrents. Wait for alerts.
  2. **Storage:** Save bencoded resume blobs to `data/resume/*.fast`.
  3. **Startup:** Load blobs and pass to `add_torrent_params.resume_data`.

  * *Result:* Startup takes milliseconds instead of minutes (no re-check).

---

## **6. Final Checklist for Developers**

| Component        | Responsibility                                          | Status  |
| :--------------- | :------------------------------------------------------ | :------ |
| **RPC Server**   | Implement WebSocket Upgrade & Sync Loop                 | ⬜ To Do |
| **RPC Handler**  | Add `fs-*`, `system-*` handlers                         | ⬜ To Do |
| **Engine State** | Add `labels`, `proxy` settings to `SessionState` struct | ⬜ To Do |
| **Engine Loop**  | Implement Watch Dir & Seeding Limit logic               | ⬜ To Do |
| **Libtorrent**   | Map `session-set` Proxy keys to `lt::settings_pack`     | ⬜ To Do |
| **Frontend**     | Check capabilities, switch to WS, use new RPC methods   | ⬜ To Do |

## **7. Security Model (Mandatory)**

TinyTorrent enforces a strict *Local Capability Model*.
Because the daemon runs with user privileges, it must defend against local hostile processes and browser-origin attacks (CSRF, DNS rebinding, cross-site WS access).

### **7.1 Ephemeral Credentials**

* **Freshness:** On *every* startup, the daemon:

  1. Generates a **new** 128-bit high-entropy token.
  2. Binds to a **random** free TCP port **strictly** on the loopback interface (`127.0.0.1` or `[::1]`). *Binding to `0.0.0.0` is prohibited.*
* **Atomic Handover:** The daemon writes the following to `connection.json`:

  ```json
  { "port": 54321, "token": "a1b2c3...", "pid": 1234 }
  ```

* **Permissions:** The file is locked immediately:

  * **Linux/macOS:** `chmod 600` (User Read/Write ONLY).
  * **Windows:** NTFS ACL set to User SID only (inheritance disabled).
* **Lifecycle:** Credentials are valid only for the life of the process. They represent a temporary session capability, effectively acting as a specialized, rotating password.

### **7.2 HTTP Transport Security**

* **Primary Authentication:** `X-TT-Auth: <token>` must be included in all RPC requests.

  * If the header is missing or invalid, the server returns `401 Unauthorized` immediately.
  * **Note:** This effectively neutralizes CSRF attacks, as browsers prevent malicious sites from sending custom headers to cross-origins without a preflight (which will fail).
* **Host Header Enforcement (DNS Rebinding):**
  The `Host` header must strictly match one of:

  * `127.0.0.1` / `127.0.0.1:<port>`
  * `localhost` / `localhost:<port>`
  * `[::1]` / `[::1]:<port>`
* **CORS Policy:**

  * The server reflects the `Origin` header in `Access-Control-Allow-Origin` **only** if the `X-TT-Auth` token is valid.
  * If the `Origin` header is absent (e.g., `file://`, Native WebView, Curl), the request is processed normally, relying on the Token for security.

### **7.3 WebSocket Upgrade Security**

* **Limitation:** Browsers cannot send custom headers (`X-TT-Auth`) during the WS handshake.
* **Solution:** Token must be passed in the Query String: `GET /ws?token=<token>`.
* **Validation:** The server validates the token **before** completing the Upgrade handshake (sending `101 Switching Protocols`).
* **Logging Constraint:** The daemon **must not** log the query string of the WebSocket handshake to console or disk, to prevent token leakage in logs.
* **Failure:** Invalid token results in immediate `403 Forbidden` and socket closure.

### **7.4 Launcher Integration Contract**

The Launcher acts as the "Secure Boot" for the UI:

1. Start `tt-engine`.
2. Poll for the creation/update of `connection.json`.
3. **PID Check:** Verify `json.pid` matches a running process to prevent using stale files from a previous crash.
4. Read `port` + `token`.
5. Inject these credentials into the Frontend environment (via Window Object injection or URL parameters).

**Native WebView2 Contract (Mandatory):**

* The Launcher must open a native window hosting WebView2.
* The Launcher must load the UI from **TinyTorrent-controlled bytes** (embedded/packed assets or loopback-served packed assets). The UI must not depend on an external browser.
* The Launcher must inject the session capability into the WebView2 page through the host bridge:

  * post the `token` (and `port` if needed) after navigation using the WebView2 message bridge
  * the UI must treat that message as authoritative for native mode boot
* If WebSocket is used in native mode, it must still use `GET /ws?token=<token>` and must not log the token.
* Legacy browser mode (if retained) may continue to use URL parameters for convenience, but native mode must not rely on “open default browser” behavior.

## **8. Optimisation ideeas**

### Investigation: Embedded UI Memory Model

Question:
Can the embedded frontend UI be served without keeping its assets resident in memory
when not actively requested by a client?

Hypothesis:

* UI assets may be served directly from the executable image (read-only sections)
  or via transient, request-scoped buffers.
* The server should not require a long-lived in-memory cache of UI files.

Goals:

* Minimize steady-state memory usage when no browser is connected.
* Allow the OS to reclaim UI pages under memory pressure.
* Avoid duplicate copies of UI bytes in heap memory.

Open Questions:

* How Mongoose handles `mg_unpacked` memory ownership and lifetime.
* Whether additional buffering occurs inside Mongoose.
* Impact of compression (if enabled) on memory residency.

Non-Goals (for now):

* Aggressive micro-optimization.
* Premature refactors.
* Behavior changes without measurement.

Next Steps:

* Look at this only when we're stable, if needed
* Inspect memory mappings of the process before/after UI access.
* Verify whether UI pages are demand-paged and released.
* Decide whether explicit eviction or alternative serving is needed.

## **9. RPC Extension UI Rules (Core vs Extension Mode)**

## Scope (Mandatory — read first)

These rules apply **only** to **RPC extensions** and UI elements whose existence or behavior depends on RPC extension support.

This is **not** about:

* generic UI feature flags
* optional UI affordances
* partially supported items

---

## Absolute UI Axiom (Non-Negotiable)

> **UI items must never express RPC extension availability, simulation, or warning state.**

Per-item warnings, notices, mock indicators, or “simulated / unsupported” messages are **not a valid UI concept** and must **not exist in any mode**.

Items are **pure**:

* they either exist and work normally
* or they do not exist at all

---

## Core Mode (No RPC Extensions)

When RPC extensions are not available or not enabled:

* There is **no RPC extension functionality**

* UI elements that depend on RPC extensions **must not exist**

* No feature may appear:

  * disabled
  * degraded
  * simulated
  * partially present

* **No mock data is allowed**

* **No per-item warnings or notices are allowed**

* The UI must behave as if RPC extensions were **never part of the product**

Examples:

* Directory helpers
* Disk helpers
* Autorun / system integration features

If they require RPC extensions, they **do not appear**.
They do not warn. They do not explain. They simply do not exist.

---

## Extension Mode (RPC Extensions Enabled)

When RPC extensions are enabled:

* RPC-backed features become fully available
* Items still **must not** display per-item warnings or mock notices
* Items must render as normal, fully functional UI elements

If RPC extensions are enabled but the connected server lacks support:

* Mock or simulated data **may** be used
* **Any explanation must be global, app-level only**

  * single banner
  * single toast
  * single notice

Per-item messaging is **still forbidden**.

---

## Explicitly Forbidden (All Modes)

The following must **never** exist at item / row / box / card level:

* warnings
* mock notices
* “simulated” labels
* “extensions missing” messages
* capability badges
* tooltips explaining missing RPC support

This includes (but is not limited to) item-level usage of:

* `mock_program_files`
* `autorun_mock_notice`
* `install.mock_notice`

These concepts may only exist **globally**, or not at all.

---

## Design Constraints (Mandatory)

* Core Mode and Extension Mode must both be:

  * complete
  * coherent
  * non-degraded user experiences

* Switching modes must:

  * not break layout
  * not introduce gaps
  * not feel like features were removed or disabled

* The UI structure must allow toggling modes without redesign

---

## Key Principle (Restated Precisely)

> **No RPC extensions ≠ disabled items** > **No RPC extensions = those items do not exist**

> **Warnings are not moved between modes — they are deleted from item-level UI entirely.**

Once this is enforced, consistency is automatic and hacks disappear.
