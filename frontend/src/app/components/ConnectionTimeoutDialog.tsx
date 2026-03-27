import { useEffect, type ReactNode } from "react";
import { Button } from "@heroui/react";
import { AlertTriangle, Clock3, Download, Play, Sparkles, Server, Settings } from "lucide-react";
import { useTranslation } from "react-i18next";
import { useConnectionConfig } from "@/app/context/ConnectionConfigContext";
import { useWorkspaceModals } from "@/app/context/AppShellStateContext";
import { usePreferences } from "@/app/context/PreferencesContext";
import { useSession } from "@/app/context/SessionContext";
import { TEXT_ROLE } from "@/config/textRoles";
import { useUiClock } from "@/shared/hooks/useUiClock";
import { status } from "@/shared/status";
import { DETAILS, FORM, MODAL } from "@/shared/ui/layout/glass-surface";
import { ModalEx } from "@/shared/ui/layout/ModalEx";

const TRANSMISSION_DAEMON_DOWNLOAD_URL = "https://transmissionbt.com/download";

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
                        <p className={TEXT_ROLE.caption}>{label}</p>
                        {children}
                    </div>
                </div>
            </div>
        </div>
    );
}

export function ConnectionTimeoutDialog() {
    const { t } = useTranslation();
    const { connectionTimeoutDialog, reconnect, rpcStatus, uiCapabilities } = useSession();
    const {
        preferences: { hasConnectedTorrentServer },
    } = usePreferences();
    const { activeRpcConnection } = useConnectionConfig();
    const { isSettingsOpen, openSettings } = useWorkspaceModals();
    const { tick, lastTickAt } = useUiClock();
    const isStartupTimeout = connectionTimeoutDialog.action === "probe";
    const showInstallRecommendation = isStartupTimeout && uiCapabilities.isLoopback;
    const showWelcomeCopy = showInstallRecommendation && !hasConnectedTorrentServer;
    const titleKey = showWelcomeCopy
        ? "workspace.connection_timeout_dialog.welcome_title"
        : isStartupTimeout
          ? "workspace.connection_timeout_dialog.startup_title"
          : "workspace.connection_timeout_dialog.runtime_title";
    const bodyKey = showWelcomeCopy
        ? "workspace.connection_timeout_dialog.welcome_body"
        : showInstallRecommendation
          ? "workspace.connection_timeout_dialog.startup_install_body"
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
            : Math.max(
                  0,
                  Math.ceil(
                      (connectionTimeoutDialog.retryStatus.retryAtMs -
                          lastTickAt) /
                          1000,
                  ),
              );
    void tick;
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

    return (
        <ModalEx
            open={connectionTimeoutDialog.isOpen && !isSettingsOpen}
            onClose={connectionTimeoutDialog.dismiss}
            title={t(titleKey)}
            icon={showWelcomeCopy ? Sparkles : AlertTriangle}
            size="sm"
            footerStartContent={
                footerStatusMessage ? (
                    <div className={MODAL.dialogFooterGroup}>
                        <Clock3 className={FORM.workflow.statusInfoIcon} />
                        <p className={TEXT_ROLE.bodySmall}>{footerStatusMessage}</p>
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
                <p className={TEXT_ROLE.body}>{t(bodyKey)}</p>
                {showInstallRecommendation ? null : (
                    <ConnectionDialogRow
                        icon={Server}
                        label={t("workspace.connection_timeout_dialog.current_connection_label")}
                    >
                        <p className={DETAILS.generalMetricCode}>{activeRpcConnection.serverUrl}</p>
                    </ConnectionDialogRow>
                )}
                {showInstallRecommendation ? (
                    <>
                        {showWelcomeCopy ? null : (
                            <ConnectionDialogRow
                                icon={Play}
                                label={t("workspace.connection_timeout_dialog.start_option_label")}
                            >
                                <p className={TEXT_ROLE.bodySmall}>
                                    {t("workspace.connection_timeout_dialog.start_option_hint")}
                                </p>
                            </ConnectionDialogRow>
                        )}
                        <ConnectionDialogRow
                            icon={Download}
                            label={t("workspace.connection_timeout_dialog.install_option_label")}
                        >
                            <div className={FORM.stackTools}>
                                <p className={TEXT_ROLE.bodySmall}>
                                    {t("workspace.connection_timeout_dialog.install_option_hint")}
                                </p>
                                <div className={MODAL.dialogFooterGroup}>
                                    <p className={DETAILS.generalMetricCode}>{TRANSMISSION_DAEMON_DOWNLOAD_URL}</p>
                                    <Button
                                        as="a"
                                        href={TRANSMISSION_DAEMON_DOWNLOAD_URL}
                                        target="_blank"
                                        rel="noreferrer"
                                        color="primary"
                                        variant="flat"
                                        size="sm"
                                        startContent={<Download className={FORM.workflow.actionIcon} />}
                                    >
                                        {t("workspace.connection_timeout_dialog.open_download")}
                                    </Button>
                                </div>
                            </div>
                        </ConnectionDialogRow>
                    </>
                ) : (
                    <ConnectionDialogRow
                        icon={Settings}
                        label={t("workspace.connection_timeout_dialog.check_settings_label")}
                    >
                        <p className={TEXT_ROLE.bodySmall}>{t("workspace.connection_timeout_dialog.settings_hint")}</p>
                    </ConnectionDialogRow>
                )}
            </div>
        </ModalEx>
    );
}
