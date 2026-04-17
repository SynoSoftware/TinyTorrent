import { useEffect, type ReactNode } from "react";
import { Accordion, AccordionHeading, AccordionItem, AccordionPanel, AccordionTrigger, Button } from "@heroui/react";
import { AlertTriangle, Clock3, Download, Play, Sparkles, Server, Settings } from "lucide-react";
import { useTranslation } from "react-i18next";
import { useConnectionConfig } from "@/app/context/ConnectionConfigContext";
import { useWorkspaceModals } from "@/app/context/AppShellStateContext";
import { usePreferences } from "@/app/context/PreferencesContext";
import { useSession } from "@/app/context/SessionContext";
import { registry } from "@/config/logic";
import { useUiClock } from "@/shared/hooks/useUiClock";
import { status } from "@/shared/status";
import { detectBrowserPlatform, type BrowserPlatform } from "@/shared/utils/browserPlatform";
import AppTooltip from "@/shared/ui/components/AppTooltip";
import { control, details, form, modal } from "@/shared/ui/layout/glass-surface";
import { ModalEx } from "@/shared/ui/layout/ModalEx";
const { visuals } = registry;

const connectionDialogLayout = {
    actionGroup: "flex shrink-0 items-center gap-tools",
} as const;

type ConnectionDialogRowProps = {
    icon: typeof Server;
    label: string;
    children: ReactNode;
};

function ConnectionDialogRow({ icon: Icon, label, children }: ConnectionDialogRowProps) {
    return (
        <div className={control.panel.insetBordered}>
            <div className={form.connection.statusFooterRow}>
                <Icon className={form.workflow.statusInfoIcon} />
                <div className={details.generalMetricContent}>
                    <div className={form.stackTools}>
                        <p className={visuals.typography.text.caption}>{label}</p>
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
                <div className={`${form.blockRowBetween} gap-tools`}>
                    <p className={visuals.typography.text.bodySmall}>
                        {t("workspace.connection_timeout_dialog.install_option_hint")}
                        <br />
                        {t("workspace.connection_timeout_dialog.install_option_hint2")}
                    </p>

                    <AppTooltip content={transmissionDownloadTarget.url} native>
                        <a
                            href={transmissionDownloadTarget.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className={details.generalSectionActionButton}
                        >
                            <span className={form.blockRowBetween}>
                                <Download className={form.workflow.actionIcon} />
                                <span>{t("workspace.connection_timeout_dialog.open_download")}</span>
                            </span>
                        </a>
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
                    <div className={connectionDialogLayout.actionGroup}>
                        <Clock3 className={form.workflow.statusInfoIcon} />
                        <p className={visuals.typography.text.bodySmall}>
                            {footerStatusMessage}
                        </p>
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
            <div className={form.stackTools}>
                <p className={visuals.typography.text.body}>{t(bodyKey)}</p>
                {showInstallRecommendation ? (
                    installRow
                ) : (
                    <>
                        <ConnectionDialogRow
                            icon={Settings}
                            label={t("workspace.connection_timeout_dialog.check_settings_label")}
                        >
                            <div className={form.stackTools}>
                                <p className={visuals.typography.text.bodySmall}>
                                    {t("workspace.connection_timeout_dialog.settings_hint")}
                                </p>
                                <div className={`${form.blockRowBetween} gap-tools`}>
                                    <p className={details.generalMetricCode}>{activeRpcConnection.serverUrl}</p>
                                    <Button
                                        variant="secondary"
                                        size="sm"
                                        onPress={openSettingsFromDialog}
                                    >
                                        <span className={form.blockRowBetween}>
                                            <Settings className={form.workflow.actionIcon} />
                                            <span>{t("workspace.connection_timeout_dialog.open_settings")}</span>
                                        </span>
                                    </Button>
                                </div>
                            </div>
                        </ConnectionDialogRow>
                        <Accordion
                            variant="surface"
                            className="px-0"
                        >
                            <AccordionItem
                                id="connection-help"
                                aria-label={t("workspace.connection_timeout_dialog.more_help_label")}
                            >
                                <AccordionHeading>
                                    <AccordionTrigger className={visuals.typography.text.bodySmall}>
                                        {t("workspace.connection_timeout_dialog.more_help_label")}
                                    </AccordionTrigger>
                                </AccordionHeading>
                                <AccordionPanel>
                                    <div className={form.stackTools}>
                                        {installRow}
                                        <ConnectionDialogRow
                                            icon={Play}
                                            label={t("workspace.connection_timeout_dialog.start_option_label")}
                                        >
                                            <p className={visuals.typography.text.bodySmall}>
                                                {t("workspace.connection_timeout_dialog.start_option_hint")}
                                            </p>
                                        </ConnectionDialogRow>
                                    </div>
                                </AccordionPanel>
                            </AccordionItem>
                        </Accordion>
                    </>
                )}
            </div>
        </ModalEx>
    );
}
