import { useEffect, useMemo } from "react";
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
import { useWorkspaceShellViewModel } from "@/app/viewModels/useWorkspaceShellViewModel";
import { useAppViewModel } from "@/app/viewModels/useAppViewModel";

function AppContent() {
    const controller = useWorkspaceShellViewModel();
    const actions = useMemo(
        () => ({ dispatch: controller.commands.dispatch }),
        [controller.commands.dispatch],
    );

    const viewModel = useAppViewModel({
        workspaceShell: controller.shell.workspace,
        statusBar: controller.shell.statusBar,
        dashboard: controller.shell.workspace.dashboard,
    });

    return (
        <TorrentActionsProvider actions={actions}>
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
                    onOpenChange={
                        controller.commands.commandPaletteState.setIsOpen
                    }
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
        </TorrentActionsProvider>
    );
}

export default function App() {
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
                <SelectionProvider>
                    <AppContent />
                </SelectionProvider>
            </LifecycleProvider>
        </FocusProvider>
    );
}
