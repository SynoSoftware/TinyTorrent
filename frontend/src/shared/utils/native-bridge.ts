export const isNativeBridgeAvailable = () => {
    if (typeof window === "undefined") return false;
    const w = window as any;
    return Boolean(
        (w.ipc && typeof w.ipc.send === "function") ||
            (w.__TAURI__ && typeof w.__TAURI__.invoke === "function")
    );
};

export const sendWindowCommand = (cmd: "minimize" | "maximize" | "close") => {
    if (typeof window === "undefined") return;
    const w = window as any;
    try {
        if (w.ipc && typeof w.ipc.send === "function") {
            w.ipc.send(`window-${cmd}`);
            return;
        }
        if (w.__TAURI__ && typeof w.__TAURI__.invoke === "function") {
            // TAURI / other bridge invocation placeholder
            try {
                w.__TAURI__.invoke(`window_${cmd}`);
            } catch {
                // ignore
            }
            return;
        }
        // Fallback: close the browser window on `close`
        if (cmd === "close" && typeof window.close === "function") {
            window.close();
        }
    } catch {
        // swallow
    }
};

export default {
    isNativeBridgeAvailable,
    sendWindowCommand,
};
