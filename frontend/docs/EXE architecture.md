Final EXE architecutre
---

## 1. Transmission-daemon **is king** — correct

Transmission-daemon must be:

* Always running (service / background process)
* Lowest memory footprint
* Own **all torrent truth**
* Stateless toward UI (UI can die at any moment)

Daemon invariants:

* No UI logic
* No host-integration hacks
* No optimistic behavior
* No recovery UX
* No “desktop convenience” features

It speaks **RPC only**.

If something can’t be expressed via RPC → it’s not daemon territory.

---

## 2. Tray app = “absolute minimal memory”

The goal is not *zero* used memory but minimal and minimal CPU used , it’s **bounded, predictable, and asleep**.
Tray must stay within the same order of magnitude as the daemon and never exceed it significantly when idle.

No bloat. Memory footprint is important. No frameworks.
**Tray is a command surface + status hint, not an interface**

### ✅ Tray icon itself

* Status icon (green / yellow / red)
* Tooltip with **aggregate speed**
  ⮕ *This is the only speed exposure*

Example tooltip:

```
TinyTorrent
D: 1.2 MB/s  U: 120 kB/s
```

### ✅ Right-click tray menu (expanded but shallow)

Typical menu (varied slightly by version):

* Show TinyTorrent
* Add Torrent…
* Add Magnet…

---

* Pause All Torrents
* Resume All Torrents

---

* Exit

---

✔️ Detect daemon crash → YES
✔️ Reflect daemon crash → YES
✔️ One-shot restart → YES (only if tray launched it)
⚠️ Service registration → installer / explicit action only
❌ Tray as watchdog → NO
❌ Tray as service manager → NO


---

## 3. WebView2 app = disposable brain

The WebView2 app must be treated as:

> **Crashable, restartable, replaceable, and untrusted**

### WebView2 responsibilities

* Render UI
* Connect to daemon via RPC
* Derive *computed* states
* Call host services **via tray bridge**
* Persist UI-only data (history, layout, charts)
* Requests system actions via host agent when NativeShell is available and the UI is connected to localhost daemon (open folder, associations, install/uninstall, etc.)


### NativeShell availability and locality

NativeShell capabilities are available **only when the WebView2 UI is connected to a local daemon (localhost / 127.0.0.1)**.

If the UI is connected to a remote daemon:
* NativeShell is considered unavailable
* All host-backed features are disabled
* The UI must degrade gracefully



If it dies:

* Torrents continue
* Tray still works
* Daemon keeps running

If daemon restarts:

* UI reconnects cleanly
* No corrupted local state
* No “half actions”

---

## 4.  **Host API**, not “UI does things”

Structure it like this:

```
[ WebView2 UI ]
        |
        | (IPC / named pipe)
        v
[ Tray / Host Agent ]
        |
        | (filesystem, OS APIs)
        v
[ Windows / macOS / Linux ]
```

The UI **never**:

* Opens Explorer
* Browses folders
* Checks disk space
* Probes files
* Reads permissions

It asks the **host agent** to do it.

- if there's no host agent, the UI has to deal with the missing feature - that's usually how tranmission interface works.

That’s how you avoid:

* Capability lies
* Remote/local confusion
* Broken recovery flows

---

## 5. One app or two tray apps?

### Correct answer: **3 processes, 2 binaries**

1. **transmission-daemon** (existing)
2. **host agent / tray** (native, tiny)
3. **webview2 UI** (spawned on demand)

todo: can we get them all in a single exe without increasing the memory used by the daemon?

Binary layout:

* `daemon.exe`
* `host.exe`

  * tray
  * IPC server
  * UI launcher

WebView2 lives inside `host.exe` *or* as a child process — either is fine as long as it’s killable.

---

## 6. Memory discipline (important)

Reality check:

* Daemon: ~5–20 MB
* Tray/host: minimal MB idle
* WebView2: 150–300 MB **when open**

That’s fine **if and only if**:

* WebView2 is not always running
* Tray does not preload UI
* No background React nonsense
* No polling loops in tray

Tray sleeps. UI wakes.

---

 ## 7. Daemon RPC Extensions: NONE

Transmission-daemon is consumed strictly via vanilla Transmission RPC.
No TinyTorrent-specific RPC methods, tokens, or transports exist at the daemon layer.

---

## 8. Host Agent Contract (Mandatory)

The host agent exposes a **strict, versioned Host API** for filesystem and OS integration.

This API is:
* not Transmission RPC
* not accessible remotely
* not callable unless locality = loopback
* authoritative for OS facts

The UI may only request host actions through this contract.


---

## 9. Final corrected mental model (lock this in)

* **Daemon**: truth, engine, minimal, dumb
* **Host agent**: OS bridge, intents, filesystem facts
* **UI**: math, rendering, user decisions

No layer skips another.

