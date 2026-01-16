import { NativeShell } from "@/app/runtime";

export type ShellUiMode = "Full" | "Rpc";
export type WindowCommand = "minimize" | "maximize" | "close";

type MagnetPayload = string | { link?: string };

type SystemIntegrationStatus = {
    autorun: boolean;
    associations: boolean;
};

type ShellIntegrationFeatures = {
    autorun?: boolean;
    associations?: boolean;
};

class ShellAgent {
    private uiMode: ShellUiMode = "Rpc";
    private magnetSubscription?: () => void;
    private readonly magnetHandlers = new Set<(link?: string) => void>();

    setUiMode(mode: ShellUiMode) {
        this.uiMode = mode;
    }

    get currentUiMode() {
        return this.uiMode;
    }

    get isAvailable() {
        return this.uiMode === "Full" && NativeShell.isAvailable;
    }

    private ensureMagnetSubscription() {
        if (this.magnetSubscription) return;
        if (typeof NativeShell.onEvent !== "function") return;
        this.magnetSubscription = NativeShell.onEvent(
            "magnet-link",
            (payload?: MagnetPayload) => {
                const link =
                    typeof payload === "string"
                        ? payload
                        : payload && typeof payload === "object"
                        ? payload.link
                        : undefined;
                for (const handler of [...this.magnetHandlers]) {
                    try {
                        handler(link);
                    } catch {
                        // swallow errors to keep the bridge stable
                    }
                }
            }
        );
    }

    onMagnetLink(handler: (link?: string) => void) {
        this.ensureMagnetSubscription();
        const handlers = this.magnetHandlers;
        handlers.add(handler);
        return () => {
            handlers.delete(handler);
            if (!handlers.size && this.magnetSubscription) {
                this.magnetSubscription();
                this.magnetSubscription = undefined;
            }
        };
    }

    private ensureAvailable() {
        if (!this.isAvailable) {
            throw new Error("ShellAgent unavailable in Rpc mode");
        }
    }

    async browseDirectory(initialPath?: string) {
        this.ensureAvailable();
        return NativeShell.browseDirectory(initialPath);
    }

    async openFileDialog() {
        this.ensureAvailable();
        return NativeShell.openFileDialog();
    }

    async openPath(path: string) {
        this.ensureAvailable();
        if (!path) {
            throw new Error("ShellAgent openPath requires a non-empty path");
        }
        await NativeShell.openPath(path);
    }

    async sendWindowCommand(command: WindowCommand) {
        this.ensureAvailable();
        await NativeShell.sendWindowCommand(command);
    }

    async persistWindowState() {
        this.ensureAvailable();
        await NativeShell.request("persist-window-state");
    }

    async getSystemIntegrationStatus(): Promise<SystemIntegrationStatus> {
        this.ensureAvailable();
        return NativeShell.getSystemIntegrationStatus();
    }

    async setSystemIntegration(
        features: ShellIntegrationFeatures
    ): Promise<void> {
        this.ensureAvailable();
        await NativeShell.setSystemIntegration(features);
    }
}

export const shellAgent = new ShellAgent();
