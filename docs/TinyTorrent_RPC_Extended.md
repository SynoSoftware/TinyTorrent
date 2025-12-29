SPDX-License-Identifier: Apache-2.0

Licensed under the Apache License, Version 2.0. See `LICENSES.md` for details.

# **TinyTorrent RPC-Extended Specification**

**Version:** 1.1.0 
**Status:** Revised for Webview2
**Dependencies:** TinyTorrent Security Model v1.0 (Mandatory)

---

## **1. Capability Discovery**

Before attempting WebSocket upgrades or extended methods, the client **must** verify the server version to prevent "undefined method" errors on standard Transmission daemons.

### **1.1 Loopback Host Policy**

The backend enforces a strict `Host` header policy but treats every loopback alias as equivalent. Even when the server is configured with a specific allowed host (e.g., `localhost`), `127.0.0.1`, `[::1]`, `::1`, and other standard loopback names are also accepted. This ensures launchers or helpers that target a fixed alias (like the tray using `127.0.0.1`) never hit the 403 host-restriction check while still rejecting external hosts.

### **1.2 Capability Probe**

**Method:** `tt-get-capabilities`
**Transport:** HTTP POST
**Auth:** Required (`X-TT-Auth`).

**Response:**

```json
{
  "result": "success",
  "arguments": {
    "server-version": "TinyTorrent 1.1.0",
    "rpc-version": 17,
    "websocket-endpoint": "/ws",
    "platform": "win32",
    "features": [
        "websocket-delta-sync",
        "sequence-sync",
        "traffic-history",
        "traffic-history-adaptive",
        "sequential-download",
        "super-seeding",
        "proxy-configuration",
        "session-tray-status",
        "session-pause-all",
        "session-resume-all",
        "labels",
        "labels-registry",
        "path-auto-creation",
        "metainfo-path-injection"
        ]
  }
}
```

### **1.3 Trust Boundary (WebView2)**

 To prevent CSRF attacks from external browsers, the server **must**:

 1. **Mandatory Token:** Reject any request (even loopback) that lacks a valid `X-TT-Auth` header or `token` query parameter.
 2. **Origin Lock:** If an `Origin` header is present, it must match the internal app scheme (e.g., `tt-app://local.ui`).
 3. **Native Only:** If `platform` is `win32`, the server should provide a configuration flag to ignore any requests not originating from the local machine's PID of the Host Shell or bind strictly to the loopback interface (`127.0.0.1` / `::1`).
 4. **Session Secret:** The Host Shell MUST generate a unique, cryptographically secure token at startup and inject it into the WebView2 context. The Daemon MUST accept this token for the duration of the session.

If the UI is hosted via a custom scheme (e.g., `tt-app://`), the backend **must** include that scheme in its CORS `Allow-Origin` whitelist. The backend should strictly reject the default `null` origin often sent by local file contexts to prevent local hijacking.

### **1.4 Host Shell Authority (Normative)**

All operating system interactions, including but not limited to:

- File and folder selection dialogs
- Filesystem browsing
- Registry access
- Protocol handler registration
- Installation and elevation flows

are **exclusively owned by the Native Host Shell**.

The RPC Daemon MUST NOT expose filesystem or dialog-related RPC methods.
All filesystem paths provided to the Daemon are treated as opaque,
pre-validated strings originating from the Host Shell.

---

## **2. WebSocket Protocol (State Synchronization)**

**URL:** `ws://127.0.0.1:<PORT>/ws?token=<TOKEN>`
**Usage:** Replaces HTTP Polling. Read-Only State Sync.

### **2.0 UI Asset Routing**

HTTP requests for the web UI strip any `?query` component before looking up the packed resource, so hashed assets like `/main.js?v=1234` resolve to their actual bundle regardless of cache-busting parameters. Only when the query-stripped path is missing and does not look like an explicit asset (no file extension) does the server fall back to serving the packed `index.html`.

Requests for missing `.js`, `.css`, etc. files now return 404 instead of silently returning HTML.
**Security Constraint:** All HTTP responses for UI assets MUST include the header `X-Content-Type-Options: nosniff` to prevent MIME-sniffing attacks in the local context.

### **2.1 Connection Constraints**

- **Token Validation:** Must be validated via Query Parameter _before_ the 101 Switching Protocols response.
- **Origin Policy:** If `Origin` header is present, it must match the trusted UI origin.
- **Discontinuity Handling:** Upon reconnection, the server **must** send a fresh `sync-snapshot` to ensure the client is current before resuming `sync-patch` deltas.

### **2.2 Synchronization Logic**

The server pushes state updates. To prevent race conditions in the frontend (e.g., updating a torrent that was just removed), the **Processing Order** defined below is mandatory. This synchronization logic is advertised via the **`websocket-delta-sync`** feature flag. When present, the client should prefer WebSocket patches over HTTP polling for all read-only state updates.

#### **Message: `sync-snapshot`**

Sent once immediately upon connection. Contains the full state tree.

#### **Message: `sync-patch`**

Sent when state changes (debounced).
**Processing Order (Mandatory):**

1. **Removed:** Process `torrents.removed` first.
2. **Added:** Process `torrents.added` second.
3. **Updated:** Process `torrents.updated` and `session` last.

**Sequence Integrity:**
Every `sync-patch` MUST include a monotonically increasing `sequence` integer. If the client receives a patch where `incoming_sequence != last_sequence + 1`, the client MUST discard the patch and request a full state refresh (`sync-snapshot`).

**Payload Structure:**

```json
{
  "type": "sync-patch",
  "sequence": 1042,
  "data": {
    "session": { 
        "downloadSpeed": 512000,
        "labels-registry": { "Movies": 5, "Music": 12 }
    },
    "torrents": {
      "removed": [ 104 ],
      "added": [ { "id": 201, "name": "New...", ... } ],
      "updated": [ { "id": 101, "rateDownload": 0 } ]
    }
  }
}
```

### **2.3 Standardized Events**

To ensure type safety in the frontend, the `event` message type uses strict naming.

| Event Name          | Payload Data                           | Trigger Condition               |
| :------------------ | :------------------------------------- | :------------------------------ |
| `error`             | `{ "message": "string", "code": int }` | System/Disk errors.             |
| `torrent-added`     | `{ "id": int }`                        | External add (e.g., Watch Dir). |
| `torrent-finished`  | `{ "id": int }`                        | Download completes.             |
| `blocklist-updated` | `{ "count": int }`                     | Blocklist reload complete.      |
| `app-shutdown`      | `null`                                 | Daemon is shutting down.        |

---

## **3. Historical Traffic API (`history-*`)**

**Concept:** Time-series data with server-side aggregation.
**Transport:** HTTP RPC Only (Excluded from WebSocket snapshots to prevent head-of-line blocking).

### **3.1 Retrieve History**

**Method:** `history-get`
**Arguments:**

- `start` (int, required): Unix Epoch (Inclusive).
- `end` (int, optional): Unix Epoch (Exclusive). Defaults to Now.
- `step` (int, optional): Aggregation window in seconds.
  - **Behavior:** Server snaps this to the nearest multiple of the recording interval.
  - **Logic:** If `step` > `recording_interval`, the server sums bytes (Volume) and finds the max bytes (Peak Speed) for the bucket.
- `limit` (int, optional): Target number of data points.
  - **Behavior:** If provided, the server MUST calculate the effective `step` required to return no more than `limit` data points (Adaptive Downsampling).

**Response:**
Returns a dense array of tuples for bandwidth efficiency.

```json
{
  "result": "success",
  "arguments": {
    "step": 3600, // The effective step used by server
    "recording-interval": 300, // Base resolution (for Peak calc)
    "data": [
      // [ Timestamp, SumDown, SumUp, PeakDown, PeakUp ]
      [ 1715000000, 52428800, 1048576, 5000000, 20000 ],
      ...
    ]
  }
}
```

- **Volume (Bar Chart):** Use `SumDown`.
- **Average Speed (Line):** `SumDown / step`.
- **Peak Speed (Shadow):** `PeakDown / recording-interval`.

### **3.2 Clear History**

**Method:** `history-clear`
**Arguments:**

- `older-than` (int, optional): Unix Epoch. If omitted, clears ALL history.

---

## **4. Engine Configuration (`session-set` / `session-get`)**

### **4.1 Proxy Configuration (Secure)**

To achieve qBittorrent parity while maintaining security:

- **Write Fields (`session-set`):**
  - `proxy-type`: Int (0-5).
  - `proxy-url`: String.
  - `proxy-auth-enabled`: Bool.
  - `proxy-username`: String.
  - `proxy-password`: String.
  - `proxy-peer-connections`: Bool.

- **Read Fields (`session-get`):**
  - **Redaction Rule:** The `proxy-password` field **must** return `<REDACTED>` or `null` in the response. It must **never** be sent in cleartext, even to an authenticated client.

### **4.2 Path Policy & Auto-Provisioning**

- **Opaque Strings:** The Daemon accepts filesystem paths as opaque strings provided by the UI (acquired via Native Shell Dialogs).
- **Encoding:** All opaque strings provided for filesystem paths **MUST** be **UTF-8 encoded** to support international characters.
- **Normalization:** The Backend **must** normalize path separators (converting `/` to `\` on Windows) upon receipt.
- **Recursive Creation (Mandatory):** If a path provided in `torrent-add` or `session-set` does not exist, the backend **must** perform a recursive `mkdir -p` equivalent. The UI will not check for directory existence; it assumes the Daemon is the authority for path provisioning.
This behavior is advertised via the **`path-auto-creation`** feature flag. When present, the UI should skip any "Directory Exists" pre-checks and assume the backend will provision necessary paths.
- **Timeouts:** If the path points to a disconnected network drive (UNC) or unresponsive mount, the backend **must** enforce a strict timeout (e.g., 5 seconds) and return a specific error code (`path-unreachable`) rather than blocking the RPC thread indefinitely.

### **4.3 Queueing & Automation**

- `queue-download-enabled` / `queue-download-size`
- `queue-seed-enabled` / `queue-seed-size`
- `queue-stalled-enabled` / `queue-stalled-minutes`
- `incomplete-dir-enabled` / `incomplete-dir`
- `watch-dir-enabled` / `watch-dir`

### **4.4 Traffic History Configuration**

These keys are available in `session-set` and `session-get`.

- `history-enabled` (Bool): Master switch. Default `true`.
- `history-interval` (Int): Recording resolution in seconds.
  - **Constraint:** Minimum `60`. Default `300` (5 minutes).
- `history-retention-days` (Int): Auto-deletion threshold. Default `30` (0 = Infinite).

### **4.5 Tray Helpers**

The Windows tray is intentionally thin. These RPC helpers expose only the data the tray needs without letting it enumerate every torrent.

#### **4.5.1 session-tray-status**

- **Method:** `session-tray-status` (no arguments)
- **Auth:** Required (`X-TT-Auth`)
- **Response:**

  ```json
  {
    "result": "success",
    "arguments": {
      "downloadSpeed": 0,
      "uploadSpeed": 0,
      "activeTorrentCount": 0,
      "seedingCount": 0,
      "anyError": false,
      "allPaused": false,
      "downloadDir": "C:/Users/.../Downloads"
    }
  }
  ```

  `downloadSpeed` / `uploadSpeed` are in bytes per second, ideal for tooltip badges. The tray should show `activeTorrentCount` plus `seedingCount` and switch to the error icon when `anyError` is true. `downloadDir` is optional but, when populated, is guaranteed to be an absolute, normalized path so the tray can issue `system-open` without additional parsing. Use `allPaused` to pick which of the two RPCs below to invoke.

#### **4.5.2 session-pause-all / session-resume-all**

- **Method:** `session-pause-all` / `session-resume-all`
- **Auth:** Required
- **Arguments:** None
- **Behavior:** Executes `torrent_handle::pause()` / `torrent_handle::resume()` on every managed torrent. These helpers are designed for the tray so it never needs to inspect IDs or statuses.

  Each method returns `serialize_success()` on completion. The tray should call `session-resume-all` when `allPaused` is `true` (showing “Resume All”) and `session-pause-all` when `allPaused` is `false`. If the backend is still initializing and returns an error, retry on the next tooltip poll.

---

## **5. Torrent Management (`torrent-set` / `torrent-get`)**

### **5.1 Extended Properties**

- `sequential-download` (Bool): Stream priority.
- `super-seeding` (Bool): Initial seeder mode.
- `force-recheck` (Bool): Trigger.
- `force-reannounce` (Bool): Trigger.
- `labels` (Array<String>):
  - **Implementation:** Backend must store these in a sidecar map (Hash -> Labels).
  - **Behavior:** Labels persist across restarts via `state.json`.
  - **Global Registry:** To support UI consistency, the backend MUST maintain and return a `labels-registry` (Label Name -> Count) in the `session` object during `session-get` and `sync-patch`.

| Capability Key | RPC Argument (for `torrent-set`) | Type | Description |
| :--- | :--- | :--- | :--- |
| `sequential-download` | `sequential-download` | Bool | Prioritize pieces in linear order. |
| `super-seeding` | `super-seeding` | Bool | Enable initial seeding optimization. |
| `labels` | `labels` | String Array | Assign metadata tags to the torrent. |

### **5.2 Extended Status Fields**

- `metadata-percent-complete` (Double):
  - Range: 0.0 to 1.0.
  - Usage: Frontend displays "Retrieving Metadata..." bar if `status` is downloading and this value < 1.0.
- `time-until-pause` (Int):
  - Usage: Seconds remaining until the "Seeding Idle Limit" kicks in.

### **5.3 Local Path Injection (`torrent-add`)**

To support the Native Shell's "Direct Add" feature. This method is advertised via the **`metainfo-path-injection`** feature flag.

- **Method:** `torrent-add`
- **Argument:** `metainfo-path` (string, optional).
- **Behavior:** When `metainfo-path` is provided, the Daemon reads the `.torrent` file directly from the local disk using the path string. The UI is **forbidden** from sending Base64 chunks of the file if a local path is available. This prevents IPC memory pressure and ensures the Daemon handles file-locking correctly.

---

## **6. Error Handling Standards**

To ensure the Frontend can localize errors correctly, extended methods must return standard Transmission-style errors.

**Format:**

```json
{
  "result": "error",
  "arguments": {
    "message": "Permission denied writing to registry keys.",
    "code": 4001
  }
}
```

- **Generic Errors:** "engine unavailable", "invalid argument".
- **Filesystem Errors:** "path not found", "access denied".
- **System Errors:** "permission denied" (for Registry/Association).

**Standardized Extended Error Codes:**

| Error String | Code | Trigger Condition |
| :--- | :--- | :--- |
| `path-unreachable` | 4001 | Network drive timeout or invalid UNC path. |
| `metainfo-read-failure` | 4002 | Provided `metainfo-path` is corrupt, locked, or missing. |
| `invalid-sequence` | 4004 | WebSocket synchronization gap detected. |
| `permission-denied` | 4003 | OS-level access restriction (ACLs). |
