import { useMemo } from "react";
import type {
    DashboardViewModel,
    NavbarViewModel,
    StatusBarViewModel,
    WorkspaceShellViewModel,
} from "./useAppViewModel";

export interface UseWorkspaceShellViewModelParams {
    dragAndDrop: WorkspaceShellViewModel["dragAndDrop"];
    workspaceStyle: WorkspaceShellViewModel["workspaceStyle"];
    settingsModal: WorkspaceShellViewModel["settingsModal"];
    dashboard: DashboardViewModel;
    hud: WorkspaceShellViewModel["hud"];
    deletion: WorkspaceShellViewModel["deletion"];
    navbar: NavbarViewModel;
    statusBar: StatusBarViewModel;
    isNativeHost: boolean;
}

export function useWorkspaceShellViewModel({
    dragAndDrop,
    workspaceStyle,
    settingsModal,
    dashboard,
    hud,
    deletion,
    navbar,
        statusBar,
        isNativeHost,
    }: UseWorkspaceShellViewModelParams): WorkspaceShellViewModel {
    return useMemo(
        () => ({
            dragAndDrop,
            workspaceStyle,
            settingsModal,
            dashboard,
            hud,
            deletion,
            navbar,
            statusBar,
            isNativeHost,
        }),
        [
            dragAndDrop,
            workspaceStyle,
            settingsModal,
            dashboard,
            hud,
            deletion,
            navbar,
            statusBar,
        ]
    );
}
