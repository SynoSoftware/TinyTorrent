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

- **Snapshot:** Sent on connection. Contains full session config and torrent list.
- **Patch:** Sent on state change (e.g., 500ms interval). Contains **deltas only**.
- **Events:** Immediate system notifications (errors, file moves).

---

## **2. Extended RPC: System & Filesystem (`fs-*`, `system-*`)**

These methods provide the "Desktop Agent" capabilities.

### **2.1 Filesystem Browsing**

- **`fs-browse`**: Returns directory tree. Critical for "Save Path" dialogs.
  - _Input:_ `path` (string).
  - _Output:_ `entries` (array of name/type/size), `parent`, `separator`.
- **`fs-space`**: Returns `free-bytes` and `total-bytes` for a path.

### **2.2 System Integration**

- **`system-reveal`**: Opens OS file explorer.
  - _Logic:_ If target is file, highlight it. If dir, open it.
- **`system-open`**: Launches file (double-click behavior).
- **`system-register-handler`**: Associates `magnet:` and `.torrent` with TinyTorrent (requires Admin on Windows).

### **2.3 Application Lifecycle**

- **`app-shutdown`**: Graceful exit.
  - _Must:_ Pause session, save resume data, save state, terminate.

---

## **3. Extended RPC: Engine & Network (`session-set`)**

We extend standard methods to expose `libtorrent` power features.

### **3.1 Proxy & Privacy (Critical for qBit Parity)**

Transmission lacks detailed proxy config. We add these keys to `session-set`:

- `proxy-type`: Enum (0=None, 1=SOCKS4, 2=SOCKS5, 3=HTTP).
- `proxy-url`: String (`hostname:port`).
- `proxy-auth-enabled`: Bool.
- `proxy-username`: String.
- `proxy-password`: String.
- `proxy-peer-connections`: Bool (Proxy peer traffic or just tracker?).

### **3.2 Queueing & Limits**

Map these standard Transmission keys to `libtorrent` settings:

- `download-queue-size`: Max active downloads.
- `seed-queue-size`: Max active uploads.
- `queue-stalled-enabled` & `queue-stalled-minutes`: Treat inactive peers as stalled to rotate queue.

### **3.3 Performance Tuning**

- `engine-disk-cache`: MB size for RAM cache (def: 64).
- `engine-hashing-threads`: CPU threads for checking (def: 1).

---

## **4. Extended RPC: Torrent Management (`torrent-set`)**

### **4.1 Advanced Playback & Seeding**

- `sequential-download`: Bool (Prioritize header/start for streaming).
- `super-seeding`: Bool (Initial seeder logic).
- `force-recheck`: Bool (Trigger hash check).
- `force-reannounce`: Bool (Trigger tracker scrape).

### **4.2 Categorization (Labels)**

Since `libtorrent` doesn't track labels, the **Backend** must:

1.  Accept `labels` (array of strings) in `torrent-set`.
2.  Store `labels` in `state.json` mapped to the InfoHash.
3.  Return `labels` in `torrent-get`.

---

## **5. Backend Core Logic (The "Smart" Agent)**

The C++ Engine (`Core.cpp`) must implement these autonomous loops.

### **5.1 Incomplete Directory Manager**

- **Config:** `incomplete-dir-enabled`, `incomplete-dir`.
- **Logic:**
  1.  **Add:** If enabled, force `save_path` to incomplete dir.
  2.  **Monitor:** Listen for `torrent_finished_alert`.
  3.  **Action:** `handle.move_storage(real_download_path)`.

### **5.2 Watch Directory Monitor**

- **Config:** `watch-dir-enabled`, `watch-dir`.
- **Logic:**
  1.  Background thread polls directory every 2s.
  2.  Parses `*.torrent`.
  3.  Adds to engine.
  4.  Renames file to `.added` (success) or `.invalid` (fail).

### **5.3 Automated Seeding Limits**

- **Config:** `seed-ratio-limit`, `seed-idle-limit`.
- **Logic:**
  1.  Check active torrents every 5s.
  2.  If `upload/download > ratio`, `handle.pause()`.
  3.  If `idle_time > limit`, `handle.pause()`.

### **5.4 Fast Resume (Instant Startup)**

- **Logic:**
  1.  **Shutdown:** Call `save_resume_data` for all torrents. Wait for alerts.
  2.  **Storage:** Save bencoded resume blobs to `data/resume/*.fast`.
  3.  **Startup:** Load blobs and pass to `add_torrent_params.resume_data`.
  - _Result:_ Startup takes milliseconds instead of minutes (no re-check).

---

## **6. Final Checklist for Developers**

| Component        | Responsibility                                          | Status   |
| :--------------- | :------------------------------------------------------ | :------- |
| **RPC Server**   | Implement WebSocket Upgrade & Sync Loop                 | ⬜ To Do |
| **RPC Handler**  | Add `fs-*`, `system-*` handlers                         | ⬜ To Do |
| **Engine State** | Add `labels`, `proxy` settings to `SessionState` struct | ⬜ To Do |
| **Engine Loop**  | Implement Watch Dir & Seeding Limit logic               | ⬜ To Do |
| **Libtorrent**   | Map `session-set` Proxy keys to `lt::settings_pack`     | ⬜ To Do |
| **Frontend**     | Check capabilities, switch to WS, use new RPC methods   | ⬜ To Do |

## **7. Security Model (Mandatory)**

TinyTorrent enforces a strict _Local Capability Model_.
Because the daemon runs with user privileges, it must defend against local hostile processes and browser-origin attacks (CSRF, DNS rebinding, cross-site WS access).

### **7.1 Ephemeral Credentials**

- **Freshness:** On _every_ startup, the daemon:
  1.  Generates a **new** 128-bit high-entropy token.
  2.  Binds to a **random** free TCP port **strictly** on the loopback interface (`127.0.0.1` or `[::1]`). _Binding to `0.0.0.0` is prohibited._
- **Atomic Handover:** The daemon writes the following to `connection.json`:
  ```json
  { "port": 54321, "token": "a1b2c3...", "pid": 1234 }
  ```
- **Permissions:** The file is locked immediately:
  - **Linux/macOS:** `chmod 600` (User Read/Write ONLY).
  - **Windows:** NTFS ACL set to User SID only (inheritance disabled).
- **Lifecycle:** Credentials are valid only for the life of the process. They represent a temporary session capability, effectively acting as a specialized, rotating password.

### **7.2 HTTP Transport Security**

- **Primary Authentication:** `X-TT-Auth: <token>` must be included in all RPC requests.
  - If the header is missing or invalid, the server returns `401 Unauthorized` immediately.
  - **Note:** This effectively neutralizes CSRF attacks, as browsers prevent malicious sites from sending custom headers to cross-origins without a preflight (which will fail).
- **Host Header Enforcement (DNS Rebinding):**
  The `Host` header must strictly match one of:
  - `127.0.0.1` / `127.0.0.1:<port>`
  - `localhost` / `localhost:<port>`
  - `[::1]` / `[::1]:<port>`
- **CORS Policy:**
  - The server reflects the `Origin` header in `Access-Control-Allow-Origin` **only** if the `X-TT-Auth` token is valid.
  - If the `Origin` header is absent (e.g., `file://`, Native WebView, Curl), the request is processed normally, relying on the Token for security.

### **7.3 WebSocket Upgrade Security**

- **Limitation:** Browsers cannot send custom headers (`X-TT-Auth`) during the WS handshake.
- **Solution:** Token must be passed in the Query String: `GET /ws?token=<token>`.
- **Validation:** The server validates the token **before** completing the Upgrade handshake (sending `101 Switching Protocols`).
- **Logging Constraint:** The daemon **must not** log the query string of the WebSocket handshake to console or disk, to prevent token leakage in logs.
- **Failure:** Invalid token results in immediate `403 Forbidden` and socket closure.

### **7.4 Launcher Integration Contract**

The Launcher acts as the "Secure Boot" for the UI:

1.  Start `tt-engine`.
2.  Poll for the creation/update of `connection.json`.
3.  **PID Check:** Verify `json.pid` matches a running process to prevent using stale files from a previous crash.
4.  Read `port` + `token`.
5.  Inject these credentials into the Frontend environment (via Window Object injection or URL parameters).

## **8. Optimisation ideeas **

### Investigation: Embedded UI Memory Model

Question:
Can the embedded frontend UI be served without keeping its assets resident in memory
when not actively requested by a client?

Hypothesis:

- UI assets may be served directly from the executable image (read-only sections)
  or via transient, request-scoped buffers.
- The server should not require a long-lived in-memory cache of UI files.

Goals:

- Minimize steady-state memory usage when no browser is connected.
- Allow the OS to reclaim UI pages under memory pressure.
- Avoid duplicate copies of UI bytes in heap memory.

Open Questions:

- How Mongoose handles `mg_unpacked` memory ownership and lifetime.
- Whether additional buffering occurs inside Mongoose.
- Impact of compression (if enabled) on memory residency.

Non-Goals (for now):

- Aggressive micro-optimization.
- Premature refactors.
- Behavior changes without measurement.

Next Steps:

- Look at this only when we're stable, if needed
- Inspect memory mappings of the process before/after UI access.
- Verify whether UI pages are demand-paged and released.
- Decide whether explicit eviction or alternative serving is needed.

## **9. Extension Mode vs Core Mode UI Rules**

- `extended_mock_notice` must be displayed **only when Extension Mode is enabled**.
- When Extension Mode is **disabled**, the application must **never** use mock data of any kind.

---

### **No-Extension Mode (Core Mode)**

- If no extensions are available or enabled:

  - There is **no extension functionality**.
  - **No features may appear disabled** due to missing extensions — such features must be **hidden entirely**.
  - There is **no mock data** in Core Mode.
    Core Mode must not simulate or preview Extension Mode behavior.
  - Extension-related UI elements **must not exist** in the interface.

- The UI must behave as if extension features were **never part of the product**.
- Directory and disk helpers that currently rely on mock data:

  - must **not run** in Core Mode
  - must **not appear** if they require extensions

---

### **Extension-Enabled Mode**

- When Extension Mode is enabled:

  - Extension features become fully available.
  - If the connected server does **not** support extensions:

    - mock data **may be provided**
    - the user **must be explicitly informed** that mock data is being used

- Mock data is **only permitted in Extension Mode** and **only as a fallback** when the server lacks support.

---

### **Design Constraint (Mandatory)**

- Both modes (Core Mode and Extension Mode) must be **fully valid, complete user experiences**.
- The UI must be designed so that switching between modes:

  - does not break layout
  - does not introduce visual gaps
  - does not feel like features were removed or disabled

- The user must never perceive either mode as degraded or incomplete.
- The UI architecture must allow seamless merging or toggling between modes without UI redesign.

---

## **Key Principle**

> **No extensions ≠ disabled features** > **No extensions = those features do not exist**

This is a **hard rule**, not a UX suggestion.
