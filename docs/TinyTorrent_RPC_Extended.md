SPDX-License-Identifier: Apache-2.0

Licensed under the Apache License, Version 2.0. See `LICENSES.md` for details.

# **TinyTorrent RPC-Extended Specification**

**Version:** 1.0.0 (Gold)
**Status:** Approved for Implementation
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
    "server-version": "TinyTorrent 1.0.0",
    "rpc-version": 17,
    "websocket-endpoint": "/ws",
    "platform": "win32",
    "features": [
      "fs-browse",
      "fs-create-dir",
      "system-integration",
      "system-install",
      "system-autorun",
      "session-tray-status",
      "session-pause-all",
      "session-resume-all",
      "traffic-history",
      "sequential-download",
      "proxy-configuration",
      "labels",
      "native-dialogs"
    ]
  }
}
```

---

## **2. WebSocket Protocol (State Synchronization)**

**URL:** `ws://127.0.0.1:<PORT>/ws?token=<TOKEN>`
**Usage:** Replaces HTTP Polling. Read-Only State Sync.

### **2.0 UI Asset Routing**

HTTP requests for the web UI strip any `?query` component before looking up the packed resource, so hashed assets like `/main.js?v=1234` resolve to their actual bundle regardless of cache-busting parameters. Only when the query-stripped path is missing and does not look like an explicit asset (no file extension) does the server fall back to serving the packed `index.html`; requests for missing `.js`, `.css`, etc. files now return 404 instead of silently returning HTML.

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

### **3.3 Create Directory**

**Method:** `fs-create-dir`
**Arguments:** `path` (string).
**Behavior:**

- Creates the directory and any necessary parent directories (recursive `mkdir -p`).
- **Returns:** `success` if created or if it already exists.
- **Error:** Returns standard filesystem error (permission denied, read-only fs) if it fails.

### **3.4 Write File**

**Method:** `fs-write-file`
**Transport:** HTTP RPC
**Auth:** Required (`X-TT-Auth`)

This RPC writes data to a file path

- On Windows, the backend must reject writes to system locations, including but not limited to:
  `C:\Windows\`, `C:\Program Files\`, `C:\Program Files (x86)\`, and `C:\ProgramData\`, as well as any path requiring elevated privileges to write.
- `fs-write-file` is intended for user-space data only; it must not be used to modify operating system or application installation files.

---

#### **Arguments**

```json
{
  "path": "C:/Users/.../export.json",
  "data": "<base64>",
  "mode": "overwrite"
}
```

- `path` (string, required)

  - Must be an absolute path

- `data` (string, required)

  - Base64-encoded payload

- `mode` (string, optional)

  - `"overwrite"` (default)
  - `"fail-if-exists"`

No append. No streaming. Keep it simple.

---

#### **Behavior (Normative)**

- Backend must:

  - Decode Base64
  - Write atomically (temp file + replace)
  - Create parent directories **only if they already exist** (no mkdir here)
  - This RPC is not restricted to paths selected via `dialog-save-file`; dialogs are a convenience mechanism, not a security boundary.

- Backend must **reject** the call if:

  - write permissions are missing

---

#### **Response (Success)**

```json
{
  "result": "success",
  "arguments": {
    "bytesWritten": 2048
  }
}
```

---

#### **Response (Error)**

Standard error format:

```json
{
  "result": "error",
  "arguments": {
    "message": "permission denied"
  }
}
```

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

### **4.4 System integration (Windows installer helpers)**

- **Method:** `system-install`
- **Transport:** HTTP RPC
- **Auth:** Required (`X-TT-Auth`).
- **Purpose:** Creates shortcuts, optionally registers protocol handlers, and can copy the running daemon into `Program Files` when elevation is available.

**Arguments:**

- `name` (string, optional): Shortcut display name. Defaults to `TinyTorrent` and is capped at 64 characters.
- `args` (string, optional): Command-line arguments appended to each shortcut.
- `locations` (`Array<String>`, optional): Any subset of `desktop`, `start-menu`, `startup`. When omitted or empty, all three locations are used.
- `registerHandlers` (`Bool`, optional): When `true`, reuses `system-register-handler` to bind `magnet:` and `.torrent`.
- `installToProgramFiles` (`Bool`, optional): When `true`, copies the current executable to `C:/Program Files/TinyTorrent/TinyTorrent.exe` (may require elevation).

**Response:**

```json
{
  "result": "success",
  "arguments": {
    "action": "system-install",
    "success": true,
    "shortcuts": {
      "desktop": "C:/Users/<USER>/Desktop/TinyTorrent.lnk",
      "start-menu": "C:/Users/<USER>/AppData/Roaming/Microsoft/Windows/Start Menu/Programs/TinyTorrent.lnk",
      "startup": "C:/Users/<USER>/AppData/Roaming/Microsoft/Windows/Start Menu/Programs/Startup/TinyTorrent.lnk"
    },
    "installSuccess": true,
    "installMessage": "installed to C:/Program Files/TinyTorrent/TinyTorrent.exe",
    "installedPath": "C:/Program Files/TinyTorrent/TinyTorrent.exe",
    "handlersRegistered": true
  }
}
```

For additional details (including optional messages, handler registration feedback, and permission-denied indicators) see §6.5.3.

---

### **4.5 Autorun / Startup Integration**

These RPCs control whether TinyTorrent automatically starts when the user logs in.
The frontend expresses intent only; the backend is solely responsible for selecting
the executable path, startup mechanism, and required permissions.

The frontend must never provide file paths or executable names.

#### **4.5.1 system-autorun-status**

- **Method:** `system-autorun-status`
- **Auth:** Required (`X-TT-Auth`)
- **Arguments:** None

**Response:**

```json
{
  "result": "success",
  "arguments": {
    "enabled": true,
    "supported": true,
    "requiresElevation": false
  }
}
```

- `enabled`: Autorun is currently active.
- `supported`: Platform supports autorun integration.
- `requiresElevation`: Enabling or disabling autorun requires elevated privileges.

---

#### **4.5.2 system-autorun-enable**

- **Method:** `system-autorun-enable`
- **Auth:** Required (`X-TT-Auth`)
- **Arguments (optional):**

```json
{
  "scope": "user"
}
```

- `scope`: Defaults to `user`. Platforms may ignore unsupported scopes.

**Behavior:**

- Backend determines the correct executable (installed copy preferred).
- Backend selects the appropriate OS autorun mechanism.
- Operation is idempotent.

---

#### **4.5.3 system-autorun-disable**

- **Method:** `system-autorun-disable`
- **Auth:** Required (`X-TT-Auth`)
- **Arguments:** None

**Behavior:**

- Removes autorun entries created by TinyTorrent.
- Operation is idempotent.

---

## **5 Native Dialog API (`dialog-*`) — Windows Only**

These RPCs request the backend to invoke **native Windows file and folder dialogs** and return the user’s selection to the frontend.

Dialogs are **OS-owned, modal, and user-interactive**. The frontend expresses intent only; the backend owns execution, security, and OS integration.

---

### **5.0 Platform Scope & Capability Gating**

- This API is **Windows-only** in TinyTorrent v1.0.
- Servers on other platforms **must not** advertise support.
- Capability discovery:

  - The backend advertises support via the `native-dialogs` feature in `tt-get-capabilities`.
  - Frontends **must not** call any `dialog-*` method unless this capability is present.

If invoked when unsupported, the backend must return:

```json
{
  "result": "error",
  "arguments": {
    "message": "native dialogs not supported"
  }
}
```

---

### **5.1 Security & Execution Rules**

- **Auth:** Required (`X-TT-Auth`)

- **Origin:** Request must originate from a trusted UI origin.

- **Session:** Requires an active interactive desktop session.

  - If running headless (service, SSH, no desktop), return:

    ```json
    {
      "result": "error",
      "arguments": {
        "message": "interactive session required"
      }
    }
    ```

- **Threading:** Dialogs must be invoked on a UI-capable **STA thread**.

- **Concurrency:** Only **one dialog may be active at a time**.

  - If another dialog is already open, return:

    ```json
    {
      "result": "error",
      "arguments": {
        "message": "dialog already active"
      }
    }
    ```

- **Cancellation:** User cancellation is **not an error** and must be represented by empty or `null` results.

---

### **5.2 Windows Implementation (Normative)**

- File and folder dialogs **must** use `IFileOpenDialog`.
- Folder selection **must** use `IFileOpenDialog` with `FOS_PICKFOLDERS`.
- Legacy APIs (`GetOpenFileName`, `SHBrowseForFolder`) are **forbidden**.
- Dialogs must be modal and should be parented to the active UI window when possible.

---

### **5.3 Open File Dialog**

**Method:** `dialog-open-file`
**Purpose:** Let the user select one or more existing files.

**Arguments:**

```json
{
  "title": "Select torrent file",
  "filters": [{ "name": "Torrent Files", "extensions": ["torrent"] }],
  "allowMultiple": false
}
```

- `filters` map directly to Windows file type filters.
- `allowMultiple` defaults to `false`.

**Response (Success):**

```json
{
  "result": "success",
  "arguments": {
    "paths": ["C:/Users/.../Downloads/example.torrent"]
  }
}
```

**Response (User Cancelled):**

```json
{
  "result": "success",
  "arguments": {
    "paths": []
  }
}
```

An empty array **always** indicates user cancellation.

---

### **5.4 Select Folder Dialog**

**Method:** `dialog-select-folder`
**Purpose:** Let the user select a single directory.

**Arguments:**

```json
{
  "title": "Select download folder"
}
```

**Response (Success):**

```json
{
  "result": "success",
  "arguments": {
    "path": "C:/Users/.../Downloads/Torrents"
  }
}
```

**Response (User Cancelled):**

```json
{
  "result": "success",
  "arguments": {
    "path": null
  }
}
```

---

### **5.5 Save File Dialog**

**Method:** `dialog-save-file`
**Platform:** Windows only
**Auth:** Required (`X-TT-Auth`)
**Capability:** `native-dialogs`

This RPC invokes the native **Windows Save File dialog** and returns the path selected by the user.
It does **not** create or write the file; it only returns the chosen destination path.

---

#### **Arguments**

```json
{
  "title": "Save file as",
  "defaultName": "export.json",
  "filters": [
    { "name": "JSON Files", "extensions": ["json"] },
    { "name": "All Files", "extensions": ["*"] }
  ]
}
```

- `title` (string, optional): Dialog title.
- `defaultName` (string, optional): Suggested filename.
- `filters` (array, optional): File type filters mapped directly to Windows dialog filters.
- The backend may ignore unsupported or malformed filters.

---

#### **Behavior**

- Backend must use **`IFileSaveDialog`**.
- The dialog is modal and blocks until user action.
- Overwrite confirmation is handled **by the OS dialog**, not by the backend.
- Backend must **not** create, truncate, or touch the file.
- Returned paths must be absolute and normalized.
- Operation is idempotent and side-effect free.

---

#### **Response (Success)**

```json
{
  "result": "success",
  "arguments": {
    "path": "C:/Users/.../Documents/export.json"
  }
}
```

---

#### **Response (User Cancelled)**

```json
{
  "result": "success",
  "arguments": {
    "path": null
  }
}
```

`null` **always** indicates user cancellation and is **not an error**.

---

#### **Errors**

Standard error format applies:

- `"native dialogs not supported"`
- `"interactive session required"`
- `"dialog already active"`

---

### **Implementation Notes (Normative)**

- Must be executed on an STA thread.
- Must not be callable concurrently with another dialog.
- Legacy APIs (`GetSaveFileName`) are forbidden.

---

#### **Intended Uses**

- Exporting statistics
- Saving configuration snapshots
- Writing debug or diagnostic output

Actual file writing must be performed by a **separate RPC** using the returned path.

---

## **6. Historical Traffic API (`history-*`)**

**Concept:** Time-series data with server-side aggregation.
**Transport:** HTTP RPC Only (Excluded from WebSocket snapshots to prevent head-of-line blocking).

### **6.1 Retrieve History**

**Method:** `history-get`
**Arguments:**

- `start` (int, required): Unix Epoch (Inclusive).
- `end` (int, optional): Unix Epoch (Exclusive). Defaults to Now.
- `step` (int, optional): Aggregation window in seconds.
  - **Behavior:** Server snaps this to the nearest multiple of the recording interval.
  - **Logic:** If `step` > `recording_interval`, the server sums bytes (Volume) and finds the max bytes (Peak Speed) for the bucket.

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

### **6.2 Clear History**

**Method:** `history-clear`
**Arguments:**

- `older-than` (int, optional): Unix Epoch. If omitted, clears ALL history.

---

## **7. Engine Configuration (`session-set` / `session-get`)**

### **7.1 Proxy Configuration (Secure)**

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

### **7.2 Path Handling**

- **Fields:** `download-dir`, `incomplete-dir`, `watch-dir`.
- **Normalization:** The Backend **must** normalize path separators (converting `/` to `\` on Windows) upon receipt, before storing in `settings.json`.
- **Auto-Creation (Fail-safe):** If a user sets a path (via `session-set` or `torrent-add`) that does not exist, the backend **must** attempt to create it automatically. This ensures downloads do not fail simply because the user skipped the explicit "Create Folder" step.

### **7.3 Queueing & Automation**

- `queue-download-enabled` / `queue-download-size`
- `queue-seed-enabled` / `queue-seed-size`
- `queue-stalled-enabled` / `queue-stalled-minutes`
- `incomplete-dir-enabled` / `incomplete-dir`
- `watch-dir-enabled` / `watch-dir`

### **7.4 Traffic History Configuration**

These keys are available in `session-set` and `session-get`.

- `history-enabled` (Bool): Master switch. Default `true`.
- `history-interval` (Int): Recording resolution in seconds.
  - **Constraint:** Minimum `60`. Default `300` (5 minutes).
- `history-retention-days` (Int): Auto-deletion threshold. Default `30` (0 = Infinite).

### **7.5 Tray Helpers**

The Windows tray is intentionally thin. These RPC helpers expose only the data the tray needs without letting it enumerate every torrent.

#### **7.5.1 session-tray-status**

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

#### **7.5.2 session-pause-all / session-resume-all**

- **Method:** `session-pause-all` / `session-resume-all`
- **Auth:** Required
- **Arguments:** None
- **Behavior:** Executes `torrent_handle::pause()` / `torrent_handle::resume()` on every managed torrent. These helpers are designed for the tray so it never needs to inspect IDs or statuses.

  Each method returns `serialize_success()` on completion. The tray should call `session-resume-all` when `allPaused` is `true` (showing “Resume All”) and `session-pause-all` when `allPaused` is `false`. If the backend is still initializing and returns an error, retry on the next tooltip poll.

#### **7.5.3 system-install**

- **Method:** `system-install`
- **Auth:** Required (`X-TT-Auth`)
- **Arguments:**
  - `name` (`String`, optional): Label that prefixes each shortcut. Defaults to `TinyTorrent` and is capped at 64 characters.
  - `args` (`String`, optional): Extra command-line arguments appended to every shortcut.
  - `locations` (`Array<String>`, optional): Any subset of `desktop`, `start-menu`, `startup`. Defaults to all three when omitted or empty.
  - `registerHandlers` (`Bool`, optional): When `true`, reuses `system-register-handler` to bind `magnet:` and `.torrent` types.
  - `installToProgramFiles` (`Bool`, optional): When `true`, copies the running EXE into `C:/Program Files/TinyTorrent/TinyTorrent.exe` (requires elevation and may set `permissionDenied`).
- **Response:**

  ```json
  {
    "result": "success",
    "arguments": {
      "action": "system-install",
      "success": true,
      "shortcuts": {
        "desktop": "C:/Users/.../Desktop/TinyTorrent.lnk",
        "start-menu": "C:/Users/.../AppData/Roaming/Microsoft/Windows/Start Menu/Programs/TinyTorrent.lnk",
        "startup": "C:/Users/.../AppData/Roaming/Microsoft/Windows/Start Menu/Programs/Startup/TinyTorrent.lnk"
      },
      "installSuccess": true,
      "installMessage": "installed to C:/Program Files/TinyTorrent/TinyTorrent.exe",
      "installedPath": "C:/Program Files/TinyTorrent/TinyTorrent.exe",
      "handlersRegistered": true
    }
  }
  ```

  `shortcuts` maps each requested location to the `.lnk` that was actually created. When `installToProgramFiles` was requested, the backend includes `installSuccess`, `installMessage`, and `installedPath` even if the overall RPC reports `error`. `handlersRegistered` and `handlerMessage` mirror the `system-register-handler` result. The boolean `permissionDenied` notifies callers that elevated rights are required (e.g., capturing the Program Files copy failure).

- **Behavior:**
  - Runs on the IO queue and reuses the same shortcut/COM helpers the tray already depends on.
  - Creates `.lnk` shortcuts pointing to either the current executable or the freshly installed copy when `installToProgramFiles` succeeds. Shortcuts are safe to call even on failure because they always point to a valid path.
  - Optionally registers `magnet:`/`.torrent` handlers via `registerHandlers`.
  - Designed for the Windows launcher flow; non-Windows platforms will report `system-install unsupported` and propagate `permissionDenied` when the OS prevents Program Files writes.

---

## **8. Torrent Management (`torrent-set` / `torrent-get`)**

### **8.1 Extended Properties**

- `sequential-download` (Bool): Stream priority.
- `super-seeding` (Bool): Initial seeder mode.
- `force-recheck` (Bool): Trigger.
- `force-reannounce` (Bool): Trigger.
- `labels` (Array<String>):
  - **Implementation:** Backend must store these in a sidecar map (Hash -> Labels).
  - **Behavior:** Labels persist across restarts via `state.json`.

### **8.2 Extended Status Fields**

- `metadata-percent-complete` (Double):
  - Range: 0.0 to 1.0.
  - Usage: Frontend displays "Retrieving Metadata..." bar if `status` is downloading and this value < 1.0.
- `time-until-pause` (Int):
  - Usage: Seconds remaining until the "Seeding Idle Limit" kicks in.

---

## **9. Error Handling Standards**

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
