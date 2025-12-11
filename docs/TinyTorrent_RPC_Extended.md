# **TinyTorrent RPC-Extended Specification**

**Version:** 1.0.0 (Gold)
**Status:** Approved for Implementation
**Dependencies:** TinyTorrent Security Model v1.0 (Mandatory)

---

## **1. Capability Discovery**

Before attempting WebSocket upgrades or extended methods, the client **must** verify the server version to prevent "undefined method" errors on standard Transmission daemons.

### **1.1 Capability Probe**

**Method:** `tt-get-capabilities`
**Transport:** HTTP POST
**Auth:** Required (`X-TT-Auth`).

**Response:**

```json
{
  "result": "success",
  "arguments": {
    "server-version": "TinyTorrent 1.0.0",
    "rpc-version": 17,
    "websocket-endpoint": "/ws",
    "platform": "win32",
    "features": ["fs-browse", "system-integration", "sequential-download", "proxy-configuration", "labels"]
  }
}
```

---

## **2. WebSocket Protocol (State Synchronization)**

**URL:** `ws://127.0.0.1:<PORT>/ws?token=<TOKEN>`
**Usage:** Replaces HTTP Polling. Read-Only State Sync.

### **2.1 Connection Constraints**

- **Token Validation:** Must be validated via Query Parameter _before_ the 101 Switching Protocols response.
- **Origin Policy:** If `Origin` header is present, it must match the trusted UI origin.

### **2.2 Synchronization Logic**

The server pushes state updates. To prevent race conditions in the frontend (e.g., updating a torrent that was just removed), the **Processing Order** defined below is mandatory.

#### **Message: `sync-snapshot`**

Sent once immediately upon connection. Contains the full state tree.

#### **Message: `sync-patch`**

Sent when state changes (debounced).
**Processing Order (Mandatory):**

1.  **Removed:** Process `torrents.removed` first.
2.  **Added:** Process `torrents.added` second.
3.  **Updated:** Process `torrents.updated` and `session` last.

**Payload Structure:**

```json
{
  "type": "sync-patch",
  "data": {
    "session": { "downloadSpeed": 512000 },
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

## **3. Filesystem API (`fs-*`)**

**Security Note:** These methods are protected by the Security Model. Access requires a valid token.
**Performance Note:** Backend **must** execute these in a worker thread. Blocking the main event loop while waiting for disk I/O is forbidden.

### **3.1 Browse Directory**

**Method:** `fs-browse`
**Arguments:** `path` (string, optional).
**Behavior:**

- Returns directory contents.
- On Windows, `size` for files must be exact.
- If `path` is invalid/inaccessible, return standard RPC Error.

### **3.2 Disk Space**

**Method:** `fs-space`
**Arguments:** `path` (string).
**Behavior:** Returns available bytes at the specific mount point.

---

## **4. System API (`system-*` & `app-*`)**

### **4.1 OS Shell Interaction**

- **Method:** `system-reveal`
  - **Arg:** `path` (string).
  - **Behavior (Windows):** Must use `/select` logic to highlight the specific file in Explorer, not just open the folder.
  - **Behavior (Mac/Linux):** Open parent folder.
- **Method:** `system-open`
  - **Arg:** `path` (string).
  - **Behavior:** Execute default OS verb (Double-click).

### **4.2 Association**

- **Method:** `system-register-handler`
  - **Behavior:** Associations `magnet:` and `.torrent`.
  - **Return Values:**
    - `success`: Registered successfully.
    - `permission-denied`: Requires Admin/Sudo. Frontend should prompt user.
    - `error`: Generic failure.

### **4.3 Lifecycle**

- **Method:** `app-shutdown`
  - **Behavior:**
    1.  Stop RPC Listener.
    2.  Call `save_resume_data` on all torrents.
    3.  Wait for completion (or 3s timeout).
    4.  Exit process.

---

## **5. Engine Configuration (`session-set` / `session-get`)**

### **5.1 Proxy Configuration (Secure)**

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

### **5.2 Path Handling**

- **Fields:** `download-dir`, `incomplete-dir`, `watch-dir`.
- **Normalization:** The Backend **must** normalize path separators (converting `/` to `\` on Windows) upon receipt, before storing in `settings.json`.

### **5.3 Queueing & Automation**

- `queue-download-enabled` / `queue-download-size`
- `queue-seed-enabled` / `queue-seed-size`
- `queue-stalled-enabled` / `queue-stalled-minutes`
- `incomplete-dir-enabled` / `incomplete-dir`
- `watch-dir-enabled` / `watch-dir`

---

## **6. Torrent Management (`torrent-set` / `torrent-get`)**

### **6.1 Extended Properties**

- `sequential-download` (Bool): Stream priority.
- `super-seeding` (Bool): Initial seeder mode.
- `force-recheck` (Bool): Trigger.
- `force-reannounce` (Bool): Trigger.
- `labels` (Array<String>):
  - **Implementation:** Backend must store these in a sidecar map (Hash -> Labels).
  - **Behavior:** Labels persist across restarts via `state.json`.

### **6.2 Extended Status Fields**

- `metadata-percent-complete` (Double):
  - Range: 0.0 to 1.0.
  - Usage: Frontend displays "Retrieving Metadata..." bar if `status` is downloading and this value < 1.0.
- `time-until-pause` (Int):
  - Usage: Seconds remaining until the "Seeding Idle Limit" kicks in.

---

## **7. Error Handling Standards**

To ensure the Frontend can localize errors correctly, extended methods must return standard Transmission-style errors.

**Format:**

```json
{
  "result": "error",
  "arguments": {
    "message": "Permission denied writing to registry keys."
  }
}
```

- **Generic Errors:** "engine unavailable", "invalid argument".
- **Filesystem Errors:** "path not found", "access denied".
- **System Errors:** "permission denied" (for Registry/Association).
