import { createContext, useContext } from "react";
import type { ReactNode } from "react";
import type { SettingsConfig, ConfigKey } from "@/modules/settings/data/config";
import type { ButtonActionKey } from "@/modules/settings/data/settings-tabs";
import type {
    SystemInstallOptions,
    SystemInstallResult,
} from "@/services/rpc/types";
import type { RpcStatus } from "@/shared/types/rpc";

interface AutorunSwitchProps {
    isSelected: boolean;
    isDisabled: boolean;
    onChange: (next: boolean) => Promise<void>;
}

interface SettingsFormContextValue {
    config: SettingsConfig;
    updateConfig: <K extends ConfigKey>(
        key: K,
        value: SettingsConfig[K]
    ) => void;
    buttonActions: Record<ButtonActionKey, () => void>;
    canBrowseDirectories: boolean;
    onBrowse: (key: ConfigKey) => void;
    autorunSwitch: AutorunSwitchProps;
    handlerSwitch: AutorunSwitchProps;
    handlerRequiresElevation: boolean;
    extensionModeEnabled: boolean;
    isMocked: boolean;
    onSystemInstall?: (
        options: SystemInstallOptions
    ) => Promise<SystemInstallResult>;
    systemInstallFeatureAvailable: boolean;
    jsonCopyStatus: "idle" | "copied";
    onCopyConfigJson: () => void;
    configJson: string;
    rpcStatus: RpcStatus;
    onReconnect: () => void;
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
