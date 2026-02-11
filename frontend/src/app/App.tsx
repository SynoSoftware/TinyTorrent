import { useEffect, useMemo } from "react";
import Runtime from "@/app/runtime";
import { usePreferences } from "@/app/context/PreferencesContext";

import { CommandPalette } from "@/app/components/CommandPalette";
import { WorkspaceShell } from "@/app/components/WorkspaceShell";
import { GlobalHotkeysHost } from "@/app/components/GlobalHotkeysHost";
import TorrentRecoveryModal from "@/modules/dashboard/components/TorrentRecoveryModal";
import { RecoveryProvider } from "@/app/context/RecoveryContext";
import { AddTorrentModal } from "@/modules/torrent-add/components/AddTorrentModal";
import { AddMagnetModal } from "@/modules/torrent-add/components/AddMagnetModal";
import { useWorkspaceShellViewModel } from "@/app/viewModels/useWorkspaceShellViewModel";
import { useAppViewModel } from "@/app/viewModels/useAppViewModel";
import { AppCommandProvider } from "@/app/context/AppCommandContext";
import { GlobalHotkeyProvider } from "@/app/context/GlobalHotkeyContext";

function AppContent() {
    const controller = useWorkspaceShellViewModel();
    const appCommandValue = useMemo(
        () => ({
            dispatch: controller.commands.dispatch,
            commandApi: controller.commands.commandApi,
        }),
        [controller.commands.commandApi, controller.commands.dispatch],
    );

    const viewModel = useAppViewModel({
        workspaceShell: controller.shell.workspace,
        statusBar: controller.shell.statusBar,
    });

    return (
        <AppCommandProvider value={appCommandValue}>
            <GlobalHotkeyProvider value={controller.commands.globalHotkeys}>
                <GlobalHotkeysHost />
            </GlobalHotkeyProvider>
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
        </AppCommandProvider>
    );
}

export default function App() {
    const {
        increaseWorkbenchScale,
        decreaseWorkbenchScale,
        resetWorkbenchScale,
    } = usePreferences();

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
                increaseWorkbenchScale();
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
                decreaseWorkbenchScale();
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
                resetWorkbenchScale();
            }
        };

        window.addEventListener("keydown", onKeyDown);
        return () => window.removeEventListener("keydown", onKeyDown);
    }, [
        increaseWorkbenchScale,
        decreaseWorkbenchScale,
        resetWorkbenchScale,
    ]);

    return <AppContent />;
}
