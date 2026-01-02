import {
    createContext,
    useCallback,
    useContext,
    useState,
    type ReactNode,
} from "react";

type WorkspaceModalContextValue = {
    isAddMagnetModalOpen: boolean;
    openAddMagnetModal: () => void;
    closeAddMagnetModal: () => void;
    isSettingsOpen: boolean;
    openSettings: () => void;
    closeSettings: () => void;
};

const WorkspaceModalContext = createContext<WorkspaceModalContextValue | null>(
    null
);

export function WorkspaceModalProvider({ children }: { children: ReactNode }) {
    const [isAddMagnetModalOpen, setIsAddMagnetModalOpen] = useState(false);
    const [isSettingsOpen, setIsSettingsOpen] = useState(false);

    const openAddMagnetModal = useCallback(
        () => setIsAddMagnetModalOpen(true),
        []
    );
    const closeAddMagnetModal = useCallback(
        () => setIsAddMagnetModalOpen(false),
        []
    );
    const openSettings = useCallback(() => setIsSettingsOpen(true), []);
    const closeSettings = useCallback(() => setIsSettingsOpen(false), []);

    return (
        <WorkspaceModalContext.Provider
            value={{
                isAddMagnetModalOpen,
                openAddMagnetModal,
                closeAddMagnetModal,
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
