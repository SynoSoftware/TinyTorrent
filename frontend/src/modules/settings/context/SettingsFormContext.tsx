import { createContext, useContext } from "react";
import type { ReactNode } from "react";
import type { SettingsConfig, ConfigKey } from "@/modules/settings/data/config";
import type { ButtonActionKey } from "@/modules/settings/data/settings-tabs";

export interface SettingsFormStateContextValue {
    config: SettingsConfig;
    updateConfig: <K extends ConfigKey>(
        key: K,
        value: SettingsConfig[K]
    ) => void;
    setFieldDraft: (key: ConfigKey, draft: string | null) => void;
    jsonCopyStatus: "idle" | "copied" | "failed";
    configJson: string;
}

export interface SettingsFormActionsContextValue {
    capabilities: {
        blocklistSupported: boolean;
    };
    buttonActions: Record<ButtonActionKey, () => void>;
    canBrowseDirectories: boolean;
    onBrowse: (key: ConfigKey) => void;
    onCopyConfigJson: () => void;
    onReconnect: () => void;
    isImmersive?: boolean;
}

const SettingsFormStateContext =
    createContext<SettingsFormStateContextValue | undefined>(undefined);
const SettingsFormActionsContext =
    createContext<SettingsFormActionsContextValue | undefined>(undefined);

interface SettingsFormProviderProps {
    stateValue: SettingsFormStateContextValue;
    actionsValue: SettingsFormActionsContextValue;
    children: ReactNode;
}

export function SettingsFormProvider({
    stateValue,
    actionsValue,
    children,
}: SettingsFormProviderProps) {
    return (
        <SettingsFormStateContext.Provider value={stateValue}>
            <SettingsFormActionsContext.Provider value={actionsValue}>
                {children}
            </SettingsFormActionsContext.Provider>
        </SettingsFormStateContext.Provider>
    );
}

export function useSettingsFormState() {
    const context = useContext(SettingsFormStateContext);
    if (!context) {
        throw new Error(
            "useSettingsFormState must be used within SettingsFormProvider"
        );
    }
    return context;
}

export function useSettingsFormActions() {
    const context = useContext(SettingsFormActionsContext);
    if (!context) {
        throw new Error(
            "useSettingsFormActions must be used within SettingsFormProvider"
        );
    }
    return context;
}
