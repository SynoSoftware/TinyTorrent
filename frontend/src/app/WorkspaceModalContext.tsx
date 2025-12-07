import {
    createContext,
    useCallback,
    useContext,
    useState,
    type ReactNode,
} from "react";

type WorkspaceModalContextValue = {
    isAddModalOpen: boolean;
    openAddModal: () => void;
    closeAddModal: () => void;
    isSettingsOpen: boolean;
    openSettings: () => void;
    closeSettings: () => void;
};

const WorkspaceModalContext = createContext<WorkspaceModalContextValue | null>(
    null
);

export function WorkspaceModalProvider({ children }: { children: ReactNode }) {
    const [isAddModalOpen, setIsAddModalOpen] = useState(false);
    const [isSettingsOpen, setIsSettingsOpen] = useState(false);

    const openAddModal = useCallback(() => setIsAddModalOpen(true), []);
    const closeAddModal = useCallback(() => setIsAddModalOpen(false), []);
    const openSettings = useCallback(() => setIsSettingsOpen(true), []);
    const closeSettings = useCallback(() => setIsSettingsOpen(false), []);

    return (
        <WorkspaceModalContext.Provider
            value={{
                isAddModalOpen,
                openAddModal,
                closeAddModal,
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
