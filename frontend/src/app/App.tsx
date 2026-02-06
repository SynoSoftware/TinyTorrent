import { useCallback, useEffect, useLayoutEffect, useMemo, useRef } from "react";
import Runtime from "@/app/runtime";
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
import {
    useWorkspaceShellViewModel,
    type WorkspaceRefreshHandles,
} from "@/app/viewModels/useWorkspaceShellViewModel";
import { useAppViewModel } from "@/app/viewModels/useAppViewModel";
import { useTorrentClient } from "./providers/TorrentClientProvider";
import { useSession } from "@/app/context/SessionContext";

const NOOP_REFRESH_HANDLES: WorkspaceRefreshHandles = {
    refreshSessionStatsData: async () => {},
    refreshTorrents: async () => {},
    refreshDetailData: async () => {},
};

type AppContentProps = {
    registerRefreshHandles: (handles: WorkspaceRefreshHandles) => void;
};

function AppContent({ registerRefreshHandles }: AppContentProps) {
    const controller = useWorkspaceShellViewModel();

    useLayoutEffect(() => {
        registerRefreshHandles(controller.shell.refreshHandles);
    }, [controller.shell.refreshHandles, registerRefreshHandles]);

    const viewModel = useAppViewModel({
        workspaceShell: controller.shell.workspace,
        statusBar: controller.shell.statusBar,
        dashboard: controller.shell.workspace.dashboard,
    });

    return (
        <TorrentCommandProvider value={controller.commands.commandApi}>
            <GlobalHotkeysHost {...controller.commands.globalHotkeys} />
            <RecoveryProvider value={controller.recovery.recoveryContext}>
                <WorkspaceShell
                    workspaceViewModel={viewModel.workspace}
                    statusBarViewModel={viewModel.statusBar}
                />
                <TorrentRecoveryModal
                    {...controller.recovery.recoveryModalProps}
                />
            </RecoveryProvider>
            <CommandPalette
                isOpen={controller.commands.commandPaletteState.isOpen}
                onOpenChange={controller.commands.commandPaletteState.setIsOpen}
                actions={viewModel.workspace.commandPalette.actions}
                getContextActions={
                    viewModel.workspace.commandPalette.getContextActions
                }
            />
            <AddMagnetModal {...controller.addTorrent.addMagnetModalProps} />
            {controller.addTorrent.addTorrentModalProps && (
                <AddTorrentModal
                    {...controller.addTorrent.addTorrentModalProps}
                />
            )}
        </TorrentCommandProvider>
    );
}

export default function App() {
    const torrentClient = useTorrentClient();
    const { reportCommandError } = useSession();
    const refreshHandlesRef = useRef<WorkspaceRefreshHandles>(
        NOOP_REFRESH_HANDLES
    );

    const registerRefreshHandles = useCallback(
        (handles: WorkspaceRefreshHandles) => {
            refreshHandlesRef.current = handles;
        },
        []
    );

    const refreshTorrents = useCallback(async () => {
        await refreshHandlesRef.current.refreshTorrents();
    }, []);

    const refreshSessionStatsData = useCallback(async () => {
        await refreshHandlesRef.current.refreshSessionStatsData();
    }, []);

    const refreshDetailData = useCallback(async () => {
        await refreshHandlesRef.current.refreshDetailData();
    }, []);

    const torrentDispatch = useMemo(
        () =>
            createTorrentDispatch({
                client: torrentClient,
                refreshTorrents,
                refreshSessionStatsData,
                refreshDetailData,
                reportCommandError,
            }),
        [
            torrentClient,
            refreshTorrents,
            refreshSessionStatsData,
            refreshDetailData,
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
                            registerRefreshHandles={registerRefreshHandles}
                        />
                    </SelectionProvider>
                </TorrentActionsProvider>
            </LifecycleProvider>
        </FocusProvider>
    );
}
