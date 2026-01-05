This is a massive patch that touches everything from the core networking layer to the low-level CSS design tokens. While it aims to modernize the scaling system and optimize the heartbeat, it introduces several **critical architectural anti-patterns**, **data synchronization risks**, and **brittle UI logic**.

As a senior engineer, here is my report on what is breaking and what is architecturally "wrong," ordered by importance.

---

### 1. Critical: Data Desynchronization Risk (Heartbeat Hashing)
The `computeHash` function in `heartbeat.ts` uses a custom FNV-1a hash to decide if the UI should update.
*   **The Problem:** The hash only considers `id`, `state`, `progress`, and `speed`. 
*   **What it breaks:** If a torrent is **renamed**, its **error message** changes, its **tracker status** updates, or its **label/category** changes, the hash will remain identical.
*   **Consequence:** The UI will fail to update when these properties change. Users will see stale data (e.g., a torrent showing "Downloading" even if the backend reports a "Disk Full" error) until a full page refresh occurs.

### 1. Fix: Robust Heartbeat Synchronization

Instead of manually picking 4 properties to hash (which causes data stale-ness), use a **Version/Modified-Timestamp** approach or hash the **entire** object. Modern JS engines can stringify and hash a small torrent list in sub-milliseconds.

**The Solution:**
Update `computeHash` to iterate over the entire object but ignore properties that are known to be "volatile" (like ETA if it flickers). Or, simply use `JSON.stringify` on the whole list.

```typescript
private computeHash(torrents: TorrentEntity[]) {
    // Stringify is faster and safer than manual FNV-1a picking for data integrity
    const payload = JSON.stringify(torrents);
    let hash = 0;
    for (let i = 0; i < payload.length; i++) {
        hash = (Math.imul(31, hash) + payload.charCodeAt(i)) | 0;
    }
    return hash.toString(16);
}
```

### 2. High: Violation of React Patterns (The Ref "Bucket" Anti-Pattern)
In `App.tsx`, you are attaching a ref directly to the `App` function object:
```typescript
(App as any)._torrentClientRef = { current: torrentClient };
```
*   **The Problem:** This is a gross violation of React's component model. Storing instance-specific data on a module-level function object creates a singleton-like state that survives across potential re-renders or even different root mounts.
*   **What it breaks:** This prevents the garbage collector from cleaning up the `torrentClient` properly and makes the code impossible to unit test in isolation. If multiple `App` instances were ever mounted (e.g., in a test suite), they would all collide on this same object.
*   **Fix:** Use `window` globally if you must, but ideally, this should be handled by a cleanup function in a `useEffect` within a specialized provider.

### 2. Fix: App Ref Anti-Pattern

Stop attaching refs to the `App` function object. This logic belongs in a **Service Layer** or a **Context Provider** that manages the lifecycle of the RPC connection.

**The Solution:**
Move the `beforeunload` logic into the `ConnectionConfigProvider` or create a `TorrentClientProvider`.

```typescript
// Inside a specialized Provider or App.tsx properly
const clientRef = useRef(torrentClient);

useEffect(() => {
    clientRef.current = torrentClient;
}, [torrentClient]);

useEffect(() => {
    const handleUnload = () => {
        // Use the current ref value safely
        clientRef.current?.notifyUiDetached?.();
    };
    window.addEventListener("beforeunload", handleUnload);
    return () => window.removeEventListener("beforeunload", handleUnload);
}, []);
```

### 3. High: Brittle Selection Logic (Marquee Race Conditions)
In `TorrentTable.tsx`, you introduced `isMarqueeDraggingRef.current` and a `setTimeout(..., 0)` to block click events.
*   **The Problem:** Using `setTimeout` to clear a "dragging" flag is a classic race condition. Depending on the browser's event loop priority, the `click` event might fire before OR after that timeout. 
*   **What it breaks:** Row selection will feel "glitchy." Users will accidentally open torrent details when they finish a marquee selection, or conversely, clicks won't register.
*   **Architectural smell:** UI state like "is dragging" should be handled via pointer capture or a robust state machine, not by clearing refs in a timeout.

### 3. Fix: Marquee Selection Race Condition

Eliminate the `setTimeout` and refs for event blocking. Use **Pointer Events** and calculate "Drag Intent."

**The Solution:**
Record the starting point. If the mouse moved more than 3-5 pixels, set a `wasDragging` flag. In the `click` event listener (on the capture phase), check that flag and `stopPropagation()`.

```typescript
const handleMouseUp = (e: MouseEvent) => {
    const dragDistance = Math.hypot(e.clientX - startX, e.clientY - startY);
    if (dragDistance > 5) {
        // It was a marquee drag, not a click. 
        // Use a capture-phase listener to kill the subsequent 'click' event.
        const blockClick = (ev: MouseEvent) => {
            ev.stopPropagation();
            window.removeEventListener('click', blockClick, true);
        };
        window.addEventListener('click', blockClick, true);
    }
    setMarqueeRect(null);
};
```

### 4. Medium: Maintenance Nightmare (Tailwind "Escaping")
The patch replaces standard Tailwind classes with dynamic CSS variable injections:
`className="text-\[length:var(--fz-scaled)\]"`
*   **The Problem:** You have effectively bypassed the benefits of Tailwind. By using `[length:var(...)]` everywhere, you lose the ability to use Tailwind’s compiler optimizations, and the code becomes significantly harder to read.
*   **What it breaks:** Developer Velocity. New developers cannot look at the code and know what the font size is. They have to trace `App.tsx` -> `logic.ts` -> `constants.json` -> `index.css`.
*   **Fix:** You should define these scaling behaviors in `tailwind.config.js` as custom theme extensions that map to your CSS variables.

Remade. **Tailwind v4–correct. No config.js lies. No escapes. No ambiguity.**

---

### 4. Medium: Maintenance Nightmare (Tailwind “Escaping”)

The patch replaces standard Tailwind utilities with escaped arbitrary values:

```tsx
className="text-\[length:var(--fz-scaled)\]"
```

* **The problem:** This bypasses Tailwind’s utility system entirely. Arbitrary value escapes opt out of Tailwind’s compiler guarantees, break token discoverability, and turn semantic styling into stringly-typed CSS.
* **What it breaks:** Developer velocity and maintainability. A developer can no longer infer intent from the class name. Understanding a font size now requires tracing `App.tsx → logic.ts → constants.json → index.css`.
* **Why this matters:** This collapses the design system boundary. Tailwind is no longer the source of truth; JSX becomes a thinly disguised CSS injection layer.
* **Root cause:** Design tokens were introduced *outside* Tailwind instead of being registered *inside* its theme system.

---

### 4. Fix: Design System Maintenance (Tailwind v4)

In Tailwind v4, design tokens must be registered via the **CSS theme layer**, not `tailwind.config.js`.

Instead of escaping utilities, define semantic tokens once and consume them as first-class Tailwind utilities.

---

#### The Solution (Tailwind v4–correct)

Define tokens in the authoritative theme layer:

```css
/* src/styles/theme.css */
@theme {
  --font-size-scaled-base: var(--fz-scaled);
  --font-size-scaled-sm: calc(var(--fz-scaled) * 0.85);

  --spacing-u: var(--u);
}
```

Consume them normally—no escaping, no indirection:

```tsx
<div className="text-scaled-base p-u" />
<div className="text-scaled-sm" />
```

---

### Result

* ✅ Full Tailwind compiler optimization preserved
* ✅ Semantic, discoverable utilities
* ✅ Single design-token authority
* ✅ No JSX-level CSS injection
* ✅ No tracing across unrelated files

---

### Hard Rule (should be documented)

> **Arbitrary value escapes (`text-[…]`, `p-[…]`) are forbidden for design tokens.**
> Tokens must be declared in `@theme` and consumed via semantic utilities only.

That restores Tailwind as a **design system**, not a string formatter.

Now you can use className="text-scaled-base", which is readable, discoverable, and maintainable—without escaping Tailwind or bypassing its compiler.


### 5. Medium: Type Safety Regression
In `TransmissionAdapter.ts`, the `send` method was refactored to use Zod schemas, which is good. However:
*   **The Problem:** You’ve used `z.any()` in multiple critical places (like the `mutate` and `torrent-add` methods).
*   **What it breaks:** You’ve introduced the *syntax* of type safety without the *guarantees*. If the backend changes its response format for adding a torrent, the frontend will crash at runtime because you bypassed the schema validation.

### 5. Fix: Type Safety (Zod Implementation)

Replace `z.any()` with `z.void()` or specific response schemas. Even an empty response should be validated to ensure the server actually returned a "success" result.

**The Solution:**

```typescript
// Define standard response envelopes
const zRpcSuccess = z.object({ result: z.literal("success") });

// Use it in your adapter
private async mutate(method: string, args: Record<string, unknown> = {}) {
    return await this.send({ method, arguments: args }, zRpcSuccess);
}
```

### 6. Low: Hotkey Conflicts
In `App.tsx`, you are hijacking `alt+plus` and `alt+equal`. 
*   **The Problem:** On many international keyboard layouts (like German or French), the `+` or `-` keys require different modifiers or share keys with numbers. 
*   **What it breaks:** Accessibility. Users on non-US keyboards may find that "Zoom In" simply doesn't work or triggers a browser default because the `plus` key is physically different. You should be using `code` (e.g., `NumpadAdd`) rather than `key` aliases.

### 6. Fix: International Hotkeys

Standardize on `event.code` rather than `event.key` to ensure that the physical "Plus" key works regardless of whether the user is on a French, German, or US layout.

**The Solution:**
Use the `code` property in your hotkey hook (if supported) or a manual listener.

* `Equal` is the physical key for `+` on US layouts.
* `NumpadAdd` is the universal code for the numpad `+`.

### 7. Low: Redundant Network Logic
In `notifyUiDetached`, you are manually rebuilding a `fetch` request with headers, auth tokens, and session IDs.
*   **The Problem:** This logic already exists inside the `send` method of the adapter. 
*   **What it breaks:** DRY (Don't Repeat Yourself) principle. If you ever update the Auth logic (e.g., switching from Basic Auth to Bearer tokens), you will likely forget to update this "detached" function, causing the "UI Detach" signal to fail silently in production.

### Summary Verdict
The **Heartbeat Hashing (Point 1)** and the **App Function Ref (Point 2)** are blockers. They introduce non-deterministic bugs and memory leaks. The **Geometry/CSS refactor (Point 4)** is technically functional but significantly increases the technical debt and reduces the maintainability of the UI layer.

### 7. Fix: Networking Redundancy

Refactor the `send` method to accept a `RequestInit` override or extract the "Header Builder" logic into a private helper.

**The Solution:**

```typescript
private buildHeaders() {
    const headers: Record<string, string> = { "Content-Type": "application/json" };
    if (this.sessionId) headers["X-Transmission-Session-Id"] = this.sessionId;
    // Add auth, etc...
    return headers;
}

public async notifyUiDetached() {
    const body = JSON.stringify({ method: "session-ui-detach" });
    // Use the native fetch directly but with the shared header builder
    return fetch(this.endpoint, {
        method: "POST",
        headers: this.buildHeaders(),
        body,
        keepalive: true
    }).catch(() => {/* ignore errors on exit */});
}
```
