import { Divider } from "@heroui/react";
import { useTranslation } from "react-i18next";
import {
    ConnectionCredentialsCard,
    ConnectionExtensionCard,
} from "@/modules/settings/components/tabs/connection/ConnectionManager";
import { SettingsSection } from "@/modules/settings/components/SettingsSection";
import { useSettingsForm } from "@/modules/settings/context/SettingsFormContext";
import { useLifecycle } from "@/app/context/LifecycleContext";
import type { ServerClass } from "@/services/rpc/entities";

interface ConnectionTabContentProps {
    serverClass: ServerClass;
    isNativeMode: boolean;
}

export function ConnectionTabContent({
    serverClass,
    isNativeMode,
}: ConnectionTabContentProps) {
    const { t } = useTranslation();
    const { onReconnect } = useSettingsForm();
    const { rpcStatus } = useLifecycle();

    return (
        <SettingsSection
            title={t("settings.sections.active_connection")}
            description={t("settings.descriptions.connection_profiles")}
        >
            <div className="space-y-stage">
                <ConnectionCredentialsCard
                    onReconnect={onReconnect}
                    serverClass={serverClass}
                    isNativeMode={isNativeMode}
                />
                <Divider className="my-panel opacity-50" />
                <ConnectionExtensionCard serverClass={serverClass} />
            </div>
        </SettingsSection>
    );
}
