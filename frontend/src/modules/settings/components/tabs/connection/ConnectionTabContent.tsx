import { useTranslation } from "react-i18next";
import { ConnectionCredentialsCard } from "@/modules/settings/components/tabs/connection/ConnectionManager";
import { SettingsSection } from "@/modules/settings/components/SettingsSection";
import { useSettingsForm } from "@/modules/settings/context/SettingsFormContext";
// TODO: With “RPC extensions: NONE”, remove the extension card and any serverClass-driven connection UX.
// TODO: Connection tab should show only:
// TODO: - Transmission RPC endpoint + Basic Auth (username/password)
// TODO: - UiMode (Full|Rpc): “TinyTorrent” (Full) vs “Transmission” (Rpc) and a short explanation of what is disabled in Rpc mode
// TODO: This tab must *not* talk about “TinyTorrent server” or TT auth tokens; those were part of the deprecated RPC-extended path.
// TODO: Remove `serverClass` prop once the capability/locality provider exists; this tab should consume capabilities from context, not from daemon identity.
// TODO: Replace `isNativeMode` prop with a capability-derived flag (or uiMode) so browser/remote are treated consistently.

interface ConnectionTabContentProps {
    isNativeMode: boolean;
}

export function ConnectionTabContent({ isNativeMode }: ConnectionTabContentProps) {
    const { t } = useTranslation();
    const { onReconnect } = useSettingsForm();

    return (
        <SettingsSection
            title={t("settings.sections.active_connection")}
            description={t("settings.descriptions.connection_profiles")}
        >
            <div className="space-y-stage">
                <ConnectionCredentialsCard
                    onReconnect={onReconnect}
                    isNativeMode={isNativeMode}
                />
            </div>
        </SettingsSection>
    );
}
