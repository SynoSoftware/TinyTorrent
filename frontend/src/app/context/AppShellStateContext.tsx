/* eslint-disable react-refresh/only-export-components */
import {
    createContext,
    useCallback,
    useContext,
    useMemo,
    useState,
    type ReactNode,
} from "react";
import type { ConnectionStatus } from "@/shared/types/rpc";
import { useSession } from "@/app/context/SessionContext";

export type FocusPart =
    | "table"
    | "inspector"
    | "search"
    | "navbar"
    | "command-palette";

type AppShellLifecycleState = {
    rpcStatus: ConnectionStatus;
    uiMode: "Full" | "Rpc";
};

export interface AppShellStateContextValue {
    activePart: FocusPart;
    setActivePart: (part: FocusPart) => void;
    selectedIds: string[];
    setSelectedIds: (ids: readonly string[]) => void;
    activeId: string | null;
    setActiveId: (id: string | null) => void;
    isSettingsOpen: boolean;
    openSettings: () => void;
    closeSettings: () => void;
    lifecycle: AppShellLifecycleState;
}

const AppShellStateContext = createContext<AppShellStateContextValue | null>(
    null,
);

export function AppShellStateProvider({ children }: { children: ReactNode }) {
    const {
        rpcStatus,
        uiCapabilities: { uiMode },
    } = useSession();
    const [activePart, setActivePart] = useState<FocusPart>("table");
    const [selectedIds, setSelectedIdsState] = useState<string[]>([]);
    const [activeId, setActiveId] = useState<string | null>(null);
    const [isSettingsOpen, setIsSettingsOpen] = useState(false);

    const setSelectedIds = useCallback((ids: readonly string[]) => {
        const normalized = Array.from(new Set(ids.filter((id) => Boolean(id))));
        setSelectedIdsState((prev) => {
            if (
                prev.length === normalized.length &&
                prev.every((value, index) => value === normalized[index])
            ) {
                return prev;
            }
            return normalized;
        });
    }, []);

    const openSettings = useCallback(() => setIsSettingsOpen(true), []);
    const closeSettings = useCallback(() => setIsSettingsOpen(false), []);

    const value = useMemo<AppShellStateContextValue>(
        () => ({
            activePart,
            setActivePart,
            selectedIds,
            setSelectedIds,
            activeId,
            setActiveId,
            isSettingsOpen,
            openSettings,
            closeSettings,
            lifecycle: {
                rpcStatus,
                uiMode,
            },
        }),
        [
            activePart,
            activeId,
            closeSettings,
            isSettingsOpen,
            openSettings,
            rpcStatus,
            selectedIds,
            setSelectedIds,
            uiMode,
        ],
    );

    return (
        <AppShellStateContext.Provider value={value}>
            {children}
        </AppShellStateContext.Provider>
    );
}

export function useAppShellState(): AppShellStateContextValue {
    const context = useContext(AppShellStateContext);
    if (!context) {
        throw new Error(
            "useAppShellState must be used within AppShellStateProvider",
        );
    }
    return context;
}

export function useFocusState() {
    const { activePart, setActivePart } = useAppShellState();
    return { activePart, setActivePart };
}

export function useSelection() {
    const {
        selectedIds,
        setSelectedIds,
        activeId,
        setActiveId,
    } =
        useAppShellState();
    return {
        selectedIds,
        setSelectedIds,
        activeId,
        setActiveId,
    };
}

export function useWorkspaceModals() {
    const { isSettingsOpen, openSettings, closeSettings } = useAppShellState();
    return { isSettingsOpen, openSettings, closeSettings };
}
