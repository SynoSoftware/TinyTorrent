import { Button, Chip, Input } from "@heroui/react";
import { CheckCircle, Monitor, RefreshCw, XCircle } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import { flushSync } from "react-dom";
import { useTranslation } from "react-i18next";
import { scheduler } from "@/app/services/scheduler";
import { registry } from "@/config/logic";
import { TEXT_ROLE } from "@/config/textRoles";
import { useConnectionConfig } from "@/app/context/ConnectionConfigContext";
import type { ConnectionProfile } from "@/app/types/connection-profile";
import { isLoopbackHost } from "@/app/utils/uiMode";
import { useSession } from "@/app/context/SessionContext";
import { status } from "@/shared/status";
import { FORM, MODAL } from "@/shared/ui/layout/glass-surface";

const { timing, visuals } = registry;
const AUTO_PROFILE_LABEL_PATTERN = /^Connection \d+$/;

type ConnectionDraft = Pick<
    ConnectionProfile,
    "scheme" | "host" | "port" | "username" | "password"
>;

type ConnectionSubmitIntent = "connect" | "connect_local" | "reconnect";

type PendingConnectionAction = {
    intent: ConnectionSubmitIntent;
    startedAtMs: number;
};

type ConnectionDraftOverride = {
    profileId: ConnectionProfile["id"];
    draft: ConnectionDraft;
};

const LOCAL_CONNECTION_DRAFT: ConnectionDraft = {
    scheme: "http",
    host: "localhost",
    port: "9091",
    username: "",
    password: "",
};

const toConnectionDraft = (profile: ConnectionProfile): ConnectionDraft => ({
    scheme: profile.scheme,
    host: profile.host,
    port: profile.port,
    username: profile.username,
    password: profile.password,
});

const draftsEqual = (left: ConnectionDraft, right: ConnectionDraft) =>
    left.scheme === right.scheme &&
    left.host === right.host &&
    left.port === right.port &&
    left.username === right.username &&
    left.password === right.password;

interface ConnectionFieldRowProps {
    label: string;
    children: ReactNode;
}

function ConnectionFieldRow({ label, children }: ConnectionFieldRowProps) {
    return (
        <div className={FORM.locationEditorLabelInputRow}>
            <div className={FORM.locationEditorLabelColumn}>
                <span className={FORM.locationEditorInlineLabel}>{label}</span>
            </div>
            <div className={FORM.locationEditorValueColumn}>{children}</div>
        </div>
    );
}

export function ConnectionCredentialsCard() {
    const { t } = useTranslation();
    const [showAdvanced, setShowAdvanced] = useState(false);
    const [draftOverride, setDraftOverride] =
        useState<ConnectionDraftOverride | null>(null);
    const [pendingAction, setPendingAction] =
        useState<PendingConnectionAction | null>(null);
    const { activeProfile, activeRpcConnection, updateProfile } =
        useConnectionConfig();
    const {
        primeNextProbe,
        reconnect,
        rpcStatus,
        uiCapabilities,
    } = useSession();

    const committedDraft = useMemo(
        () => toConnectionDraft(activeProfile),
        [activeProfile],
    );
    const draft =
        draftOverride?.profileId === activeProfile.id
            ? draftOverride.draft
            : committedDraft;
    const hasDraftChanges = useMemo(
        () => !draftsEqual(draft, committedDraft),
        [committedDraft, draft],
    );
    const isDraftValid =
        draft.host.trim().length > 0 && draft.port.trim().length > 0;
    const currentServerUrl = activeRpcConnection.serverUrl;
    const isCurrentLoopback = uiCapabilities.isLoopback;
    const isDraftLoopback = isLoopbackHost(draft.host);
    const isDraftLocalDefaults = draftsEqual(draft, LOCAL_CONNECTION_DRAFT);
    const showConnectLocalAction =
        !isCurrentLoopback && !isDraftLocalDefaults;
    const isFullMode = uiCapabilities.uiMode === "Full";
    const showCompactLocalCard =
        isFullMode && isCurrentLoopback && !showAdvanced && !hasDraftChanges;
    const modeLabelKey = isFullMode
        ? "settings.connection.ui_mode_full_label"
        : "settings.connection.ui_mode_rpc_label";
    const modeSummaryKey = isFullMode
        ? "settings.connection.ui_mode_full_summary"
        : "settings.connection.ui_mode_rpc_summary";
    const profileLabel = useMemo(() => {
        const explicitLabel = activeProfile.label.trim();
        if (explicitLabel && !AUTO_PROFILE_LABEL_PATTERN.test(explicitLabel)) {
            return explicitLabel;
        }
        if (isCurrentLoopback) {
            return t("settings.connection.default_profile_label");
        }
        const hostLabel = activeProfile.host.trim();
        return hostLabel || t("settings.connection.profile_placeholder");
    }, [activeProfile.host, activeProfile.label, isCurrentLoopback, t]);
    const draftUsesInsecureBasicAuth = (() => {
        if (draft.scheme !== "http") return false;
        if (isDraftLoopback) return false;
        return Boolean(draft.username || draft.password);
    })();
    const currentConnectionUsesInsecureBasicAuth = useMemo(() => {
        if (committedDraft.scheme !== "http") return false;
        if (isLoopbackHost(committedDraft.host)) return false;
        return Boolean(committedDraft.username || committedDraft.password);
    }, [committedDraft]);
    const insecureAuthNotice = useMemo(() => {
        if (hasDraftChanges ? draftUsesInsecureBasicAuth : currentConnectionUsesInsecureBasicAuth) {
            return t("settings.connection.insecure_http_warning");
        }
        return null;
    }, [
        currentConnectionUsesInsecureBasicAuth,
        draftUsesInsecureBasicAuth,
        hasDraftChanges,
        t,
    ]);
    const visiblePendingAction =
        rpcStatus === status.connection.connected ? null : pendingAction;
    const connectionStatusLabel = useMemo(() => {
        if (visiblePendingAction !== null) {
            return t("settings.connection.connecting");
        }
        return rpcStatus === status.connection.connected
            ? t("status_bar.rpc_connected")
            : t("status_bar.rpc_error");
    }, [rpcStatus, t, visiblePendingAction]);
    const connectionStatusColor = useMemo<"success" | "warning" | "danger">(
        () => {
            if (visiblePendingAction !== null) {
                return "warning";
            }
            return rpcStatus === status.connection.connected
                ? "success"
                : "danger";
        },
        [rpcStatus, visiblePendingAction],
    );
    const statusIcon = useMemo(() => {
        if (visiblePendingAction !== null) {
            return RefreshCw;
        }
        return rpcStatus === status.connection.connected
            ? CheckCircle
            : XCircle;
    }, [rpcStatus, visiblePendingAction]);
    const StatusIcon = statusIcon;
    const isConnectionBusy = visiblePendingAction !== null;
    const pendingIntent = visiblePendingAction?.intent ?? null;

    useEffect(() => {
        if (
            pendingAction === null ||
            rpcStatus === status.connection.connected
        ) {
            return;
        }
        const remainingMs =
            pendingAction.startedAtMs + timing.connection.timeoutMs - Date.now();
        return scheduler.scheduleTimeout(() => {
            setPendingAction((current) =>
                current === pendingAction ? null : current,
            );
        }, Math.max(remainingMs, 0));
    }, [pendingAction, rpcStatus]);

    const updateDraft = useCallback(
        (patch: Partial<ConnectionDraft>) => {
            setDraftOverride((previous) => ({
                profileId: activeProfile.id,
                draft: {
                    ...(
                        previous?.profileId === activeProfile.id
                            ? previous.draft
                            : committedDraft
                    ),
                    ...patch,
                },
            }));
        },
        [activeProfile.id, committedDraft],
    );

    const handleSubmit = useCallback(
        async (intent: ConnectionSubmitIntent, nextDraft?: ConnectionDraft) => {
            const draftToCommit = nextDraft ?? draft;
            if (
                intent !== "reconnect" &&
                (draftToCommit.host.trim().length === 0 ||
                    draftToCommit.port.trim().length === 0)
            ) {
                return;
            }

            const startedAtMs = Date.now();
            if (intent !== "reconnect") {
                setPendingAction({
                    intent,
                    startedAtMs,
                });
                // Switching endpoint/profile recreates the session client, and
                // the Session owner already probes the new client immediately.
                // Prime that probe so settings-originated connects do not
                // auto-retry, and use the same explicit reconnect action
                // semantics as later reconnects.
                primeNextProbe("reconnect", {
                    disableRetry: true,
                });
                flushSync(() => {
                    updateProfile(activeProfile.id, draftToCommit);
                });
                setDraftOverride(null);
                return;
            }

            setPendingAction({
                intent,
                startedAtMs,
            });
            await reconnect({
                disableRetry: true,
            });
        },
        [activeProfile.id, draft, primeNextProbe, reconnect, updateProfile],
    );

    const handleConnectLocal = useCallback(() => {
        setDraftOverride({
            profileId: activeProfile.id,
            draft: LOCAL_CONNECTION_DRAFT,
        });
        void handleSubmit("connect_local", LOCAL_CONNECTION_DRAFT);
    }, [activeProfile.id, handleSubmit]);

    const renderStatusChip = (
        <Chip
            size="lg"
            variant="flat"
            color={connectionStatusColor}
            className={FORM.systemStatusChip}
            startContent={
                <StatusIcon
                    strokeWidth={visuals.icon.strokeWidth}
                    className={FORM.connection.iconSmall}
                />
            }
        >
            {connectionStatusLabel}
        </Chip>
    );

    if (showCompactLocalCard) {
        return (
            <div className={FORM.sectionContentStack}>
                <div className={FORM.connection.topRow}>
                    <div className={FORM.sectionHeaderStack}>
                        <h3 className={FORM.connection.profileTitle}>
                            {profileLabel}
                        </h3>
                        <p className={FORM.connection.profileEndpoint}>
                            {currentServerUrl}
                        </p>
                    </div>
                    <div className={MODAL.dialogFooterGroup}>{renderStatusChip}</div>
                </div>
                <div className={FORM.interfaceRowActions}>
                    <Button
                        size="md"
                        variant="ghost"
                        onPress={() => setShowAdvanced(true)}
                    >
                        {t("settings.connection.show_advanced")}
                    </Button>
                </div>
                <p className={TEXT_ROLE.caption}>
                    {t("settings.connection.local_mode_info")}
                </p>
            </div>
        );
    }

    const primaryActionLabel = hasDraftChanges
        ? t("settings.connection.connect")
        : t("settings.connection.reconnect");
    const primaryActionIntent: ConnectionSubmitIntent = hasDraftChanges
        ? "connect"
        : "reconnect";

    return (
        <div className={FORM.sectionContentStack}>
            <div className={FORM.connection.topRow}>
                <div className={FORM.sectionHeaderStack}>
                    <h3 className={FORM.connection.profileTitle}>{profileLabel}</h3>
                    <p className={FORM.connection.profileEndpoint}>
                        {currentServerUrl}
                    </p>
                </div>
                <div className={MODAL.dialogFooterGroup}>{renderStatusChip}</div>
            </div>
            <div className={FORM.blockStackTight}>
                <ConnectionFieldRow label={t("settings.connection.host")}>
                    <Input
                        aria-label={t("settings.connection.host")}
                        variant="bordered"
                        size="md"
                        value={draft.host}
                        onChange={(event) =>
                            updateDraft({ host: event.target.value })
                        }
                        className={FORM.connection.inputHeight}
                        isDisabled={isConnectionBusy}
                    />
                </ConnectionFieldRow>
                <ConnectionFieldRow label={t("settings.connection.port")}>
                    <Input
                        aria-label={t("settings.connection.port")}
                        variant="bordered"
                        size="md"
                        type="text"
                        value={draft.port}
                        onChange={(event) =>
                            updateDraft({ port: event.target.value })
                        }
                        className={FORM.connection.inputHeight}
                        isDisabled={isConnectionBusy}
                    />
                </ConnectionFieldRow>
                <ConnectionFieldRow label={t("settings.connection.username")}>
                    <Input
                        aria-label={t("settings.connection.username")}
                        variant="bordered"
                        size="md"
                        value={draft.username}
                        onChange={(event) =>
                            updateDraft({ username: event.target.value })
                        }
                        isDisabled={isConnectionBusy}
                    />
                </ConnectionFieldRow>
                <ConnectionFieldRow label={t("settings.connection.password")}>
                    <Input
                        aria-label={t("settings.connection.password")}
                        variant="bordered"
                        size="md"
                        type="password"
                        value={draft.password}
                        onChange={(event) =>
                            updateDraft({ password: event.target.value })
                        }
                        isDisabled={isConnectionBusy}
                    />
                </ConnectionFieldRow>
                {insecureAuthNotice !== null && (
                    <p className={FORM.connection.insecureAuthWarning}>
                        {insecureAuthNotice}
                    </p>
                )}
                <div className={FORM.inputActionRow}>
                    <div className={FORM.interfaceRowActions}>
                        {showConnectLocalAction && (
                            <Button
                                variant="bordered"
                                onPress={() => {
                                    handleConnectLocal();
                                }}
                                type="button"
                                isDisabled={isConnectionBusy}
                                isLoading={pendingIntent === "connect_local"}
                            >
                                {t("settings.connection.connect_to_this_pc")}
                            </Button>
                        )}
                        <Button
                            variant="bordered"
                            color="primary"
                            onPress={() => {
                                void handleSubmit(primaryActionIntent);
                            }}
                            type="button"
                            isDisabled={
                                isConnectionBusy ||
                                (primaryActionIntent === "connect" &&
                                    !isDraftValid)
                            }
                            isLoading={pendingIntent === primaryActionIntent}
                            startContent={
                                pendingIntent === primaryActionIntent ? undefined : (
                                    <RefreshCw
                                        strokeWidth={visuals.icon.strokeWidth}
                                        className={FORM.connection.iconSmall}
                                    />
                                )
                            }
                        >
                            {primaryActionLabel}
                        </Button>
                    </div>
                </div>
                {rpcStatus === status.connection.connected && (
                    <div className={FORM.connection.statusFooter}>
                        <div className={FORM.connection.statusFooterRow}>
                            <Monitor
                                strokeWidth={visuals.icon.strokeWidth}
                                className={FORM.workflow.statusInfoIcon}
                            />
                            <div className={FORM.stackTools}>
                                <p className={TEXT_ROLE.bodyStrong}>
                                    {t(modeLabelKey)}
                                </p>
                                <p className={TEXT_ROLE.bodySmall}>
                                    {t(modeSummaryKey)}
                                </p>
                            </div>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}
