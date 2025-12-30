1. Freeze the chaos (stop “agent drift”)

* **Hard rule:** one change-set per problem, with a runnable acceptance checklist and *no collateral edits*.
* Create 4 branches (or 4 PRs) **in this order**:

  1. `fix/native-resize-hit-test`
  2. `fix/settings-connection-tab`
  3. `fix/ws-reconnect-no-polling`
  4. `fix/native-acrylic-main-window`
* Any PR that “also tweaks CSS / types / UI” outside its scope gets reverted.

---

2. Make resize work (proper, non-hacky)
   Your symptom (“new border appears, edges still don’t resize”) is almost always one of:

* window style missing `WS_THICKFRAME` (or accidentally changed),
* `WM_NCHITTEST` returns `HTCLIENT` for edges because your math is wrong under DWM extended frame / DPI,
* you’re calling `ScreenToClient` and using `GetClientRect` (client coords) while the real resize borders are in **window coords** (non-client region) — with DWM frame extension that gets tricky.

**Target behavior**

* Drag = **CSS only** (`-webkit-app-region: drag`).
* Resize = **native only**, via `WM_NCHITTEST` returning HT* edges/corners.
* No “drag_regions”, no “set-drag-regions”, no geometry sync.

**Do this in `MainWindowProc`**

* Keep style: `WS_POPUP | WS_THICKFRAME | WS_MINIMIZEBOX | WS_MAXIMIZEBOX | WS_SYSMENU`
* Implement hit-test using **window rect in screen coords**, not client coords.
* Use DPI-aware border thickness derived from system metrics.

Concrete algorithm (what to tell the agent to implement):

* On `WM_NCHITTEST`:

  * Let `DwmDefWindowProc(hwnd, msg, wparam, lparam, &result)` run first; if it returns true, return `result`.
  * Get mouse point in **screen coords**: `POINT pt{ GET_X_LPARAM(lparam), GET_Y_LPARAM(lparam) };`
  * Get window rect: `GetWindowRect(hwnd, &wr);`
  * Compute border thickness:

    * `UINT dpi = GetDpiForWindow(hwnd);`
    * `int frameX = GetSystemMetricsForDpi(SM_CXSIZEFRAME, dpi) + GetSystemMetricsForDpi(SM_CXPADDEDBORDER, dpi);`
    * `int frameY = GetSystemMetricsForDpi(SM_CYSIZEFRAME, dpi) + GetSystemMetricsForDpi(SM_CXPADDEDBORDER, dpi);`
  * Determine zones using **wr** (screen space):

    * `left = pt.x < wr.left + frameX`, `right = pt.x >= wr.right - frameX`
    * `top = pt.y < wr.top + frameY`, `bottom = pt.y >= wr.bottom - frameY`
  * Return `HTTOPLEFT/…` corners, else `HTLEFT/HTRIGHT/HTTOP/HTBOTTOM`, else `HTCLIENT`.
* **Do not** return `HTCAPTION` anywhere. Ever.

Acceptance test:

* Mouse cursor changes on all 4 edges + 4 corners.
* Resize works without using navbar buttons.
* Drag still works only on your CSS drag region.

---

3. Restore the Connection tab (4th time — fix the real gate)
   This is not “UX”; it’s a **visibility filter bug**.

What to do:

* In the settings tab list/filter (where you hide “connection” in native mode), remove that rule.
* Instead, inside the Connection tab content:

  * Default profile auto-connects to local daemon on startup (your native injection override).
  * **But** allow user to select/edit other profiles explicitly (advanced toggle or not, up to you).
  * Native mode should *warn* if they switch away from local, but **must not remove the feature**.

Acceptance test:

* Connection tab visible in native.
* You can switch profile to remote, reconnect, and it persists.

---

4. WebSockets after reconnect (prove what’s happening, then fix)
   You’re seeing “HTTP polling after reconnect” because **the WS upgrade fails** and your client falls back. Don’t guess—prove it.

**How to prove it (in WebView2)**

* Ensure devtools are enabled on the WebView2 controller/environment (temporarily).
* In the UI, open devtools → Network → WS.
* Hit “Reconnect”.

  * If there is no WS entry: your code never attempted WS.
  * If WS exists but closes: check close code/reason.
  * If WS handshake returns 401/403: token/origin/session handling.
  * If it’s blocked: CORS/Origin handling on `/ws`.

**What usually breaks specifically in your setup**

* Token rotated but WS is still using old token.
* Reconnect updates HTTP client but WS session isn’t reinitialized.
* Server enforces token differently for `/ws` than for RPC post.
* Origin/Host checks differ between the two paths.

**Proper fix (client-side)**

* On reconnect success (or token/profile change):

  * hard-stop WS session
  * create a new WS URL from the *current* active connection (host/port/scheme/token)
  * connect
  * only fall back to polling after explicit WS failure + surfaced error (not silent)

Acceptance test:

* After reconnect, WS shows connected and stays connected.
* You see delta updates (or whatever feature depends on WS) without polling.

---

5. Main window “white background + border” and acrylic parity with splash
   Two separate layers must be transparent, or acrylic will look wrong:

**(A) Host window composition (Win32)**

* Apply the same acrylic/blur path you use for splash to the main window HWND (fine).
* If you’re using DWM frame extension, keep it consistent.

**(B) WebView2 surface**
Even if the HWND is acrylic, WebView2 will paint opaque unless you explicitly set its background.

What to tell the agent to do:

* After controller creation, get `ICoreWebView2Controller2` (or newer) and set:

  * `DefaultBackgroundColor = {0,0,0,0}` (fully transparent)
* Also ensure the document/body/app root backgrounds are transparent in native mode:

  * `html, body { background: transparent; }`
  * and your shell container background must not reintroduce white.

Acceptance test:

* When the app is idle, you see acrylic/glass behind the UI like splash, not a white slab.
* The “background window” effect disappears (because it was just an opaque webview layer).

---

6. The “choose file” clipboard permission prompt in WebView2
   You already confirmed file dialog works. The clipboard permission prompt is coming from your UI trying to read clipboard on modal open.

Fix is simple and correct:

* In native WebView2 mode: **never auto-read clipboard**.
* Make “Paste from clipboard” an explicit user action button (then you can request permission only when asked).

Acceptance test:

* Opening Add Torrent modal never prompts for clipboard access.

---

7. What to do with the agent (exact operating mode)
   Use your local agent, but force it into a disciplined workflow:

**Instruction you give it (copy/paste)**

* “One PR per issue. No refactors. No drive-by formatting. No unrelated CSS changes. Must follow backend/AGENTS.md and frontend/AGENTS.md for touched files.”
* “PR must include: problem statement, the exact acceptance test, and which files changed.”
* “If you can’t prove a behavior (WS upgrade, resize hit test), add logging/devtools evidence and show it.”

Model choice:

* If you keep using **GPT-5.1-Codex-Mini**, expect it to keep making “plausible” edits that don’t survive runtime reality.
* Use a stronger reasoning model for cross-cutting runtime issues (resize/WS/acrylic) and keep mini for mechanical edits once the approach is locked.

---

8. Minimal checklist for you to run after each PR

* Resize works via edges/corners (cursor changes).
* Drag works only on navbar drag region.
* No clipboard prompt on opening Add Torrent.
* Connection tab present; can switch to remote and reconnect.
* WS shows connected after reconnect (Network → WS).
* Acrylic visible behind UI; no white slab.

If you want the fastest win next: do **resize hit-test** first (section 2). It’s isolated, deterministic, and stops the UI from feeling broken even when other pieces are mid-flight.
