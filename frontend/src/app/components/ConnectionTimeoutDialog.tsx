import { useEffect, useState, type ReactNode } from "react";
import { Accordion, AccordionItem, Button } from "@heroui/react";
import { AlertTriangle, Clock3, Download, Play, Sparkles, Server, Settings } from "lucide-react";
import type { Selection } from "@react-types/shared";
import { useTranslation } from "react-i18next";
import { useConnectionConfig } from "@/app/context/ConnectionConfigContext";
import { useWorkspaceModals } from "@/app/context/AppShellStateContext";
import { usePreferences } from "@/app/context/PreferencesContext";
import { useSession } from "@/app/context/SessionContext";
import { registry } from "@/config/logic";
import { textRole } from "@/config/textRoles";
import { useUiClock } from "@/shared/hooks/useUiClock";
import { status } from "@/shared/status";
import { detectBrowserPlatform, type BrowserPlatform } from "@/shared/utils/browserPlatform";
import AppTooltip from "@/shared/ui/components/AppTooltip";
import { DETAILS, FORM, MODAL } from "@/shared/ui/layout/glass-surface";
import { ModalEx } from "@/shared/ui/layout/ModalEx";

type ConnectionDialogRowProps = {
    icon: typeof Server;
    label: string;
    children: ReactNode;
};

function ConnectionDialogRow({ icon: Icon, label, children }: ConnectionDialogRowProps) {
    return (
        <div className={MODAL.dialogInsetItem}>
            <div className={FORM.connection.statusFooterRow}>
                <Icon className={FORM.workflow.statusInfoIcon} />
                <div className={DETAILS.generalMetricContent}>
                    <div className={FORM.stackTools}>
                        <p className={textRole.caption}>{label}</p>
                        {children}
                    </div>
                </div>
            </div>
        </div>
    );
}

function getTransmissionDownloadTarget(platform: BrowserPlatform) {
    if (platform.kind === "macos" || platform.kind === "linux") {
        return registry.defaults.transmissionDownloads.targets[platform.kind];
    }

    if (platform.kind === "windows") {
        if (platform.majorVersion === null || platform.majorVersion >= 10) {
            return registry.defaults.transmissionDownloads.targets.windows10;
        }

        if (platform.majorVersion > 6 || (platform.majorVersion === 6 && (platform.minorVersion ?? 0) >= 1)) {
            return registry.defaults.transmissionDownloads.targets.windows7;
        }
    }

    return registry.defaults.transmissionDownloads.targets.fallback;
}

export function ConnectionTimeoutDialog() {
    const { t } = useTranslation();
    const { connectionTimeoutDialog, reconnect, rpcStatus } = useSession();
    const [expandedHelpKeys, setExpandedHelpKeys] = useState<Selection>(new Set());
    const {
        preferences: { showTorrentServerSetup },
    } = usePreferences();
    const { activeRpcConnection } = useConnectionConfig();
    const { isSettingsOpen, openSettings } = useWorkspaceModals();
    const { tick, lastTickAt } = useUiClock();
    const isStartupTimeout = connectionTimeoutDialog.action === "probe";
    const showInstallRecommendation = showTorrentServerSetup;
    const titleKey = showInstallRecommendation
        ? "workspace.connection_timeout_dialog.welcome_title"
        : isStartupTimeout
          ? "workspace.connection_timeout_dialog.startup_title"
          : "workspace.connection_timeout_dialog.runtime_title";
    const bodyKey = showInstallRecommendation
        ? "workspace.connection_timeout_dialog.welcome_body"
        : isStartupTimeout
          ? "workspace.connection_timeout_dialog.startup_body"
          : "workspace.connection_timeout_dialog.runtime_body";
    const openSettingsFromDialog = () => {
        connectionTimeoutDialog.dismiss();
        openSettings("connection");
    };
    const remainingRetrySeconds =
        connectionTimeoutDialog.retryStatus?.kind !== "scheduled"
            ? null
            : Math.max(0, Math.ceil((connectionTimeoutDialog.retryStatus.retryAtMs - lastTickAt) / 1000));
    void tick;
    const transmissionDownloadTarget = getTransmissionDownloadTarget(detectBrowserPlatform());
    const footerStatusMessage =
        connectionTimeoutDialog.retryStatus?.kind === "connecting" || rpcStatus === status.connection.idle
            ? t("workspace.connection_timeout_dialog.connecting_status", {
                  server: activeRpcConnection.serverUrl,
              })
            : remainingRetrySeconds !== null
              ? t("workspace.connection_timeout_dialog.connecting_in_status", {
                    count: remainingRetrySeconds,
                })
              : null;

    useEffect(() => {
        if (!isSettingsOpen || !connectionTimeoutDialog.isOpen) {
            return;
        }
        connectionTimeoutDialog.dismiss();
    }, [connectionTimeoutDialog, isSettingsOpen]);

    const installRow = (
        <>
            <ConnectionDialogRow icon={Download} label={t("workspace.connection_timeout_dialog.install_option_label")}>
                <div className={`${FORM.blockRowBetween} gap-tools`}>
                    <p className={textRole.bodySmall}>
                        {t("workspace.connection_timeout_dialog.install_option_hint")}
                        <br />
                        {t("workspace.connection_timeout_dialog.install_option_hint2")}
                    </p>

                    <AppTooltip content={transmissionDownloadTarget.url} native>
                        <Button
                            as="a"
                            href={transmissionDownloadTarget.url}
                            target="_blank"
                            rel="noreferrer"
                            color="primary"
                            variant="flat"
                            size="sm"
                            startContent={<Download className={FORM.workflow.actionIcon} />}
                        >
                            {t("workspace.connection_timeout_dialog.open_download")}
                        </Button>
                    </AppTooltip>
                </div>
            </ConnectionDialogRow>
        </>
    );

    return (
        <ModalEx
            open={connectionTimeoutDialog.isOpen && !isSettingsOpen}
            onClose={connectionTimeoutDialog.dismiss}
            title={t(titleKey)}
            icon={showInstallRecommendation ? Sparkles : AlertTriangle}
            size="sm"
            footerStartContent={
                footerStatusMessage ? (
                    <div className={MODAL.dialogFooterGroup}>
                        <Clock3 className={FORM.workflow.statusInfoIcon} />
                        <p className={textRole.bodySmall}>{footerStatusMessage}</p>
                    </div>
                ) : null
            }
            secondaryAction={{
                label: t("workspace.connection_timeout_dialog.open_settings"),
                onPress: openSettingsFromDialog,
            }}
            primaryAction={{
                label: t("workspace.connection_timeout_dialog.retry_now"),
                onPress: () => {
                    void reconnect();
                },
            }}
        >
            <div className={FORM.stackTools}>
                <p className={textRole.body}>{t(bodyKey)}</p>
                {showInstallRecommendation ? (
                    installRow
                ) : (
                    <>
                        <ConnectionDialogRow
                            icon={Settings}
                            label={t("workspace.connection_timeout_dialog.check_settings_label")}
                        >
                            <div className={FORM.stackTools}>
                                <p className={textRole.bodySmall}>
                                    {t("workspace.connection_timeout_dialog.settings_hint")}
                                </p>
                                <div className={`${FORM.blockRowBetween} gap-tools`}>
                                    <p className={DETAILS.generalMetricCode}>{activeRpcConnection.serverUrl}</p>
                                    <Button
                                        color="primary"
                                        variant="flat"
                                        size="sm"
                                        startContent={<Settings className={FORM.workflow.actionIcon} />}
                                        onPress={openSettingsFromDialog}
                                    >
                                        {t("workspace.connection_timeout_dialog.open_settings")}
                                    </Button>
                                </div>
                            </div>
                        </ConnectionDialogRow>
                        <Accordion
                            selectedKeys={expandedHelpKeys}
                            onSelectionChange={setExpandedHelpKeys}
                            selectionMode="multiple"
                            variant="splitted"
                            className="px-0"
                            itemClasses={{
                                base: "px-0",
                                trigger: "px-0 py-0",
                                content: "px-0 pb-0 pt-tight",
                            }}
                        >
                            <AccordionItem
                                key="connection-help"
                                aria-label={t("workspace.connection_timeout_dialog.more_help_label")}
                                title={t("workspace.connection_timeout_dialog.more_help_label")}
                            >
                                <div className={FORM.stackTools}>
                                    {installRow}
                                    <ConnectionDialogRow
                                        icon={Play}
                                        label={t("workspace.connection_timeout_dialog.start_option_label")}
                                    >
                                        <p className={textRole.bodySmall}>
                                            {t("workspace.connection_timeout_dialog.start_option_hint")}
                                        </p>
                                    </ConnectionDialogRow>
                                </div>
                            </AccordionItem>
                        </Accordion>
                    </>
                )}
            </div>
        </ModalEx>
    );
}
