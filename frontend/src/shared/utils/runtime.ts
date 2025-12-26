// Native bridge guard for TinyTorrent
// AGENTS.md: All native calls must be funneled through this file. No direct window.chrome.webview references allowed.

type WebViewBridge = {
    postMessage: (payload: unknown) => void;
};

function getWebViewBridge(): WebViewBridge | null {
    const w = window as unknown as {
        chrome?: { webview?: WebViewBridge };
    };
    return w.chrome?.webview ?? null;
}

export const nativeShell = {
    postMessage(payload: unknown) {
        const bridge = getWebViewBridge();
        if (bridge) {
            bridge.postMessage(payload);
        } else {
            // eslint-disable-next-line no-console
            console.warn(
                "Native shell not available. Message dropped:",
                payload
            );
        }
    },
};
