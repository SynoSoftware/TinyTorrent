# **TinyTorrent Master Specification (v1.0)**

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
