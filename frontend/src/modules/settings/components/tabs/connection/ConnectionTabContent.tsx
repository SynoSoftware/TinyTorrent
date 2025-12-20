import { Divider } from "@heroui/react";
import { useTranslation } from "react-i18next";
import {
    ConnectionCredentialsCard,
    ConnectionExtensionCard,
} from "@/modules/settings/components/tabs/connection/ConnectionManager";
import { SettingsSection } from "@/modules/settings/components/SettingsSection";
import { useSettingsForm } from "@/modules/settings/context/SettingsFormContext";

export function ConnectionTabContent() {
    const { t } = useTranslation();
    const { rpcStatus, onReconnect } = useSettingsForm();

    return (
        <SettingsSection
            title={t("settings.sections.active_connection")}
            description={t("settings.descriptions.connection_profiles")}
        >
            <div className="space-y-3">
                <ConnectionCredentialsCard
                    onReconnect={onReconnect}
                    rpcStatus={rpcStatus}
                />
                <Divider className="my-3 opacity-50" />
                <ConnectionExtensionCard rpcStatus={rpcStatus} />
            </div>
        </SettingsSection>
    );
}
