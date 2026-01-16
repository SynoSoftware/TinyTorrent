import {
    createContext,
    useCallback,
    useContext,
    useState,
    type ReactNode,
} from "react";

type WorkspaceModalContextValue = {
    isSettingsOpen: boolean;
    openSettings: () => void;
    closeSettings: () => void;
};

const WorkspaceModalContext = createContext<WorkspaceModalContextValue | null>(
    null
);
// TODO: Consolidate modal/command visibility state into a single Workbench/App ViewModel provider (see `todo.md` task 13) to reduce the number of small contexts and “global state islands”.
// TODO: Rule: UI surfaces should consume a small number of well-defined providers (session/uiMode, preferences, workbench viewmodel), not many ad-hoc contexts.

export function WorkspaceModalProvider({ children }: { children: ReactNode }) {
    const [isSettingsOpen, setIsSettingsOpen] = useState(false);

    const openSettings = useCallback(() => setIsSettingsOpen(true), []);
    const closeSettings = useCallback(() => setIsSettingsOpen(false), []);

    return (
        <WorkspaceModalContext.Provider
            value={{
                isSettingsOpen,
                openSettings,
                closeSettings,
            }}
        >
            {children}
        </WorkspaceModalContext.Provider>
    );
}

export function useWorkspaceModals(): WorkspaceModalContextValue {
    const context = useContext(WorkspaceModalContext);
    if (!context) {
        throw new Error(
            "useWorkspaceModals must be used within a WorkspaceModalProvider"
        );
    }
    return context;
}
