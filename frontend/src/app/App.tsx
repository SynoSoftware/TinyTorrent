import { useEffect, useMemo, useRef } from "react";
import type { MutableRefObject } from "react";
import Runtime from "@/app/runtime";
import type { EngineAdapter } from "@/services/rpc/engine-adapter";
import useWorkbenchScale from "./hooks/useWorkbenchScale";

import { CommandPalette } from "./components/CommandPalette";
import { WorkspaceShell } from "./components/WorkspaceShell";
import { GlobalHotkeysHost } from "./components/GlobalHotkeysHost";
import TorrentRecoveryModal from "@/modules/dashboard/components/TorrentRecoveryModal";
import { RecoveryProvider } from "@/app/context/RecoveryContext";
import { TorrentActionsProvider } from "@/app/context/TorrentActionsContext";
import { SelectionProvider } from "@/app/context/SelectionContext";
import { FocusProvider } from "./context/FocusContext";
import { LifecycleProvider } from "@/app/context/LifecycleContext";
import { TorrentCommandProvider } from "@/app/context/TorrentCommandContext";
import { AddTorrentModal } from "@/modules/torrent-add/components/AddTorrentModal";
import { AddMagnetModal } from "@/modules/torrent-add/components/AddMagnetModal";
import { createTorrentDispatch } from "./actions/torrentDispatch";
import { useWorkspaceShellViewModel } from "@/app/viewModels/useWorkspaceShellViewModel";
import { useAppViewModel } from "@/app/viewModels/useAppViewModel";
import { useTorrentClient } from "./providers/TorrentClientProvider";
import { useSession } from "@/app/context/SessionContext";

type AppContentProps = {
    refreshSessionStatsDataRef: MutableRefObject<() => Promise<void>>;
    refreshTorrentsRef: MutableRefObject<() => Promise<void>>;
    refreshDetailDataRef: MutableRefObject<() => Promise<void>>;
    torrentClientRef: MutableRefObject<EngineAdapter | null>;
};

function AppContent({
    refreshSessionStatsDataRef,
    refreshTorrentsRef,
    refreshDetailDataRef,
    torrentClientRef,
}: AppContentProps) {
    const controller = useWorkspaceShellViewModel({
        refreshSessionStatsDataRef,
        refreshTorrentsRef,
        refreshDetailDataRef,
        torrentClientRef,
    });
    const viewModel = useAppViewModel({
        workspaceShell: controller.workspace,
        statusBar: controller.workspace.statusBar,
        dashboard: controller.workspace.dashboard,
    });

    return (
        <TorrentCommandProvider value={controller.commandApi}>
            <GlobalHotkeysHost {...controller.globalHotkeys} />
            <RecoveryProvider value={controller.recoveryContext}>
                <WorkspaceShell workspaceViewModel={viewModel.workspace} />
                <TorrentRecoveryModal {...controller.recoveryModalProps} />
            </RecoveryProvider>
            <CommandPalette
                isOpen={controller.commandPaletteState.isOpen}
                onOpenChange={controller.commandPaletteState.setIsOpen}
                actions={viewModel.workspace.commandPalette.actions}
                getContextActions={
                    viewModel.workspace.commandPalette.getContextActions
                }
            />
            <AddMagnetModal {...controller.addMagnetModalProps} />
            {controller.addTorrentModalProps && (
                <AddTorrentModal {...controller.addTorrentModalProps} />
            )}
        </TorrentCommandProvider>
    );
}

export default function App() {
    const torrentClient = useTorrentClient();
    const { reportCommandError } = useSession();
    const torrentClientRef = useRef<EngineAdapter | null>(null);
    const refreshSessionStatsDataRef = useRef<() => Promise<void>>(
        async () => {}
    );
    const refreshTorrentsRef = useRef<() => Promise<void>>(async () => {});
    const refreshDetailDataRef = useRef<() => Promise<void>>(async () => {});

    useEffect(() => {
        torrentClientRef.current = torrentClient;
    }, [torrentClient]);

    const torrentDispatch = useMemo(
        () =>
            createTorrentDispatch({
                client: torrentClient,
                clientRef: torrentClientRef,
                refreshTorrentsRef,
                refreshSessionStatsDataRef,
                refreshDetailData: async () => {
                    await refreshDetailDataRef.current();
                },
                reportCommandError,
            }),
        [
            torrentClient,
            torrentClientRef,
            refreshTorrentsRef,
            refreshSessionStatsDataRef,
            refreshDetailDataRef,
            reportCommandError,
        ]
    );

    const actions = useMemo(() => ({ dispatch: torrentDispatch }), [
        torrentDispatch,
    ]);

    const { increase, decrease, reset } = useWorkbenchScale();

    useEffect(() => {
        if (Runtime.isNativeHost && typeof document !== "undefined") {
            document.documentElement.dataset.nativeHost = "true";
        }
    }, []);

    useEffect(() => {
        const onKeyDown = (e: KeyboardEvent) => {
            if (
                e.altKey &&
                !e.ctrlKey &&
                !e.metaKey &&
                !e.shiftKey &&
                (e.code === "Equal" || e.code === "NumpadAdd")
            ) {
                e.preventDefault();
                increase();
                return;
            }
            if (
                e.altKey &&
                !e.ctrlKey &&
                !e.metaKey &&
                !e.shiftKey &&
                (e.code === "Minus" || e.code === "NumpadSubtract")
            ) {
                e.preventDefault();
                decrease();
                return;
            }
            if (
                ((e.ctrlKey || e.metaKey) && e.code === "Digit0") ||
                (e.altKey &&
                    !e.ctrlKey &&
                    !e.metaKey &&
                    !e.shiftKey &&
                    e.code === "NumpadMultiply")
            ) {
                if (Runtime.suppressBrowserZoomDefaults()) {
                    e.preventDefault();
                }
                reset();
            }
        };

        window.addEventListener("keydown", onKeyDown);
        return () => window.removeEventListener("keydown", onKeyDown);
    }, [increase, decrease, reset]);

    return (
        <FocusProvider>
            <LifecycleProvider>
                <TorrentActionsProvider actions={actions}>
                    <SelectionProvider>
                        <AppContent
                            refreshSessionStatsDataRef={refreshSessionStatsDataRef}
                            refreshTorrentsRef={refreshTorrentsRef}
                            refreshDetailDataRef={refreshDetailDataRef}
                            torrentClientRef={torrentClientRef}
                        />
                    </SelectionProvider>
                </TorrentActionsProvider>
            </LifecycleProvider>
        </FocusProvider>
    );
}
