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
