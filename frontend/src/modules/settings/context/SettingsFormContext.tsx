import { createContext, useContext } from "react";
import type { ReactNode } from "react";
import type { SettingsConfig, ConfigKey } from "@/modules/settings/data/config";
import type { ButtonActionKey } from "@/modules/settings/data/settings-tabs";
import type { ConnectionStatus } from "@/shared/types/rpc";

interface SettingsFormContextValue {
    config: SettingsConfig;
    updateConfig: <K extends ConfigKey>(
        key: K,
        value: SettingsConfig[K]
    ) => void;
    buttonActions: Record<ButtonActionKey, () => void>;
    canBrowseDirectories: boolean;
    onBrowse: (key: ConfigKey) => void;
    jsonCopyStatus: "idle" | "copied" | "failed";
    onCopyConfigJson: () => void;
    configJson: string;
    rpcStatus: ConnectionStatus;
    onReconnect: () => void;
    isImmersive?: boolean;
}

const SettingsFormContext = createContext<SettingsFormContextValue | undefined>(
    undefined
);

interface SettingsFormProviderProps {
    value: SettingsFormContextValue;
    children: ReactNode;
}

export function SettingsFormProvider({
    value,
    children,
}: SettingsFormProviderProps) {
    return (
        <SettingsFormContext.Provider value={value}>
            {children}
        </SettingsFormContext.Provider>
    );
}

export function useSettingsForm() {
    const context = useContext(SettingsFormContext);
    if (!context) {
        throw new Error(
            "useSettingsForm must be used within a SettingsFormProvider"
        );
    }
    return context;
}
