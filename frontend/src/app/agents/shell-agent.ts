import {
    NativeShell,
    type NativeShellRequestOptions,
    type NativeShellRequestOutcome,
} from "@/app/runtime";
import type { TransmissionFreeSpace } from "@/services/rpc/types";

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

export type ShellAgentOutcome<T> = NativeShellRequestOutcome<T>;

export class ShellAgent {
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

    private toError(outcome: Exclude<ShellAgentOutcome<unknown>, { kind: "ok" }>) {
        const error = new Error(outcome.message);
        if (outcome.kind === "canceled") {
            (error as { name?: string }).name = "AbortError";
        }
        if (outcome.kind === "timeout") {
            (error as { name?: string }).name = "TimeoutError";
        }
        return error;
    }

    private async requestWithOutcome<T>(
        name: string,
        payload?: unknown,
        options?: NativeShellRequestOptions,
    ): Promise<ShellAgentOutcome<T>> {
        if (!this.isAvailable) {
            return {
                kind: "unavailable",
                message: "ShellAgent unavailable in Rpc mode",
            };
        }
        return (await NativeShell.requestWithOutcome(
            name,
            payload,
            options,
        )) as ShellAgentOutcome<T>;
    }

    private unwrapOutcome<T>(outcome: ShellAgentOutcome<T>): T {
        if (outcome.kind === "ok") {
            return outcome.value;
        }
        throw this.toError(outcome);
    }

    async browseDirectoryWithOutcome(
        initialPath?: string,
        options?: NativeShellRequestOptions,
    ): Promise<ShellAgentOutcome<string | undefined>> {
        const outcome = await this.requestWithOutcome<{ path?: unknown }>(
            "browse-directory",
            { path: initialPath },
            options,
        );
        if (outcome.kind !== "ok") {
            return outcome;
        }
        const value =
            outcome.value &&
            typeof outcome.value === "object" &&
            typeof (outcome.value as { path?: unknown }).path === "string"
                ? (outcome.value as { path?: string }).path
                : undefined;
        return { kind: "ok", value };
    }

    async browseDirectory(initialPath?: string) {
        return this.unwrapOutcome(
            await this.browseDirectoryWithOutcome(initialPath),
        );
    }

    async openFileDialogWithOutcome(
        options?: NativeShellRequestOptions,
    ): Promise<ShellAgentOutcome<string | undefined>> {
        const outcome = await this.requestWithOutcome<{ path?: unknown }>(
            "open-file-dialog",
            undefined,
            options,
        );
        if (outcome.kind !== "ok") {
            return outcome;
        }
        const value =
            outcome.value &&
            typeof outcome.value === "object" &&
            typeof (outcome.value as { path?: unknown }).path === "string"
                ? (outcome.value as { path?: string }).path
                : undefined;
        return { kind: "ok", value };
    }

    async openFileDialog() {
        return this.unwrapOutcome(await this.openFileDialogWithOutcome());
    }

    async openPathWithOutcome(
        path: string,
        options?: NativeShellRequestOptions,
    ): Promise<ShellAgentOutcome<void>> {
        if (!path) {
            return {
                kind: "failed",
                message: "ShellAgent openPath requires a non-empty path",
            };
        }
        const outcome = await this.requestWithOutcome<unknown>(
            "open-path",
            { path },
            options,
        );
        if (outcome.kind !== "ok") {
            return outcome;
        }
        return { kind: "ok", value: undefined };
    }

    async openPath(path: string) {
        this.unwrapOutcome(await this.openPathWithOutcome(path));
    }

    async checkFreeSpaceWithOutcome(
        path: string,
        options?: NativeShellRequestOptions,
    ): Promise<ShellAgentOutcome<TransmissionFreeSpace>> {
        const trimmed = path.trim();
        if (!trimmed) {
            return {
                kind: "failed",
                message:
                    "ShellAgent checkFreeSpace requires a non-empty path",
            };
        }
        const outcome = await this.requestWithOutcome<{
            path?: unknown;
            sizeBytes?: unknown;
            totalSize?: unknown;
        }>("check-free-space", { path: trimmed }, options);
        if (outcome.kind !== "ok") {
            return outcome;
        }
        const raw = outcome.value;
        if (typeof raw.path !== "string" || typeof raw.sizeBytes !== "number") {
            return {
                kind: "failed",
                message: "ShellAgent checkFreeSpace payload missing fields",
            };
        }
        return {
            kind: "ok",
            value: {
                path: raw.path,
                sizeBytes: raw.sizeBytes,
                totalSize:
                    typeof raw.totalSize === "number"
                        ? raw.totalSize
                        : undefined,
            },
        };
    }

    async checkFreeSpace(path: string): Promise<TransmissionFreeSpace> {
        return this.unwrapOutcome(await this.checkFreeSpaceWithOutcome(path));
    }

    async sendWindowCommandWithOutcome(
        command: WindowCommand,
        options?: NativeShellRequestOptions,
    ): Promise<ShellAgentOutcome<void>> {
        const outcome = await this.requestWithOutcome<unknown>(
            "window-command",
            { command },
            options,
        );
        if (outcome.kind !== "ok") {
            return outcome;
        }
        return { kind: "ok", value: undefined };
    }

    async sendWindowCommand(command: WindowCommand) {
        this.unwrapOutcome(await this.sendWindowCommandWithOutcome(command));
    }

    async persistWindowStateWithOutcome(
        options?: NativeShellRequestOptions,
    ): Promise<ShellAgentOutcome<void>> {
        const outcome = await this.requestWithOutcome<unknown>(
            "persist-window-state",
            undefined,
            options,
        );
        if (outcome.kind !== "ok") {
            return outcome;
        }
        return { kind: "ok", value: undefined };
    }

    async persistWindowState() {
        this.unwrapOutcome(await this.persistWindowStateWithOutcome());
    }

    async getSystemIntegrationStatusWithOutcome(
        options?: NativeShellRequestOptions,
    ): Promise<ShellAgentOutcome<SystemIntegrationStatus>> {
        const outcome = await this.requestWithOutcome<SystemIntegrationStatus>(
            "get-system-integration-status",
            undefined,
            options,
        );
        if (outcome.kind !== "ok") {
            return outcome;
        }
        return outcome;
    }

    async getSystemIntegrationStatus(): Promise<SystemIntegrationStatus> {
        return this.unwrapOutcome(
            await this.getSystemIntegrationStatusWithOutcome(),
        );
    }

    async setSystemIntegrationWithOutcome(
        features: ShellIntegrationFeatures,
        options?: NativeShellRequestOptions,
    ): Promise<ShellAgentOutcome<void>> {
        const outcome = await this.requestWithOutcome<unknown>(
            "set-system-integration",
            features,
            options,
        );
        if (outcome.kind !== "ok") {
            return outcome;
        }
        return { kind: "ok", value: undefined };
    }

    async setSystemIntegration(
        features: ShellIntegrationFeatures
    ): Promise<void> {
        this.unwrapOutcome(
            await this.setSystemIntegrationWithOutcome(features),
        );
    }
}

export const shellAgent = new ShellAgent();
