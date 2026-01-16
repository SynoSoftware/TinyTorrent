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
// TODO: With “RPC extensions: NONE”, remove the extension card and any serverClass-driven connection UX.
// TODO: Connection tab should show only:
// TODO: - Transmission RPC endpoint + Basic Auth (username/password)
// TODO: - UiMode (Full|Rpc): “TinyTorrent” (Full) vs “Transmission” (Rpc) and a short explanation of what is disabled in Rpc mode
// TODO: This tab must *not* talk about “TinyTorrent server” or TT auth tokens; those were part of the deprecated RPC-extended path.
// TODO: Remove `serverClass` prop once the capability/locality provider exists; this tab should consume capabilities from context, not from daemon identity.
// TODO: Replace `isNativeMode` prop with a capability-derived flag (or uiMode) so browser/remote are treated consistently.

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
