import { Button, cn } from "@heroui/react";
import { AlertTriangle } from "lucide-react";
import { useCallback, useEffect, useState, type Dispatch, type SetStateAction } from "react";
import type { TFunction } from "i18next";
import type { SetLocationOptions } from "@/app/context/RecoveryContext";
import { useRecoveryContext } from "@/app/context/RecoveryContext";
import type { Torrent } from "@/modules/dashboard/types/torrent";
import { useResolvedRecoveryClassification } from "@/modules/dashboard/hooks/useResolvedRecoveryClassification";
import { useMissingFilesProbe } from "@/services/recovery/missingFilesStore";
import { formatMissingFileDetails } from "@/modules/dashboard/utils/missingFiles";
import {
    formatPrimaryActionHintFromClassification,
    formatRecoveryStatusFromClassification,
} from "@/shared/utils/recoveryFormat";
import type { RecoveryRecommendedAction } from "@/services/recovery/recovery-controller";

type MissingFilesStatusCellProps = {
    torrent: Torrent;
    t: TFunction;
    handleRetry?: () => Promise<void>;
    handleDownloadMissing: (
        torrent: Torrent,
        options?: { recreateFolder?: boolean }
    ) => Promise<void>;
    handleSetLocation: (
        torrent: Torrent,
        options?: SetLocationOptions
    ) => Promise<void>;
    openFolder?: (path?: string | null) => void;
};

const ACTION_HINT_KEYS: Record<RecoveryRecommendedAction, string | undefined> = {
    downloadMissing: "recovery.status.preparing",
    locate: "recovery.status.preparing",
    retry: "recovery.status.retrying",
    openFolder: undefined,
    chooseLocation: "recovery.status.preparing",
};

export function TorrentTable_MissingFilesStatusCell({
    torrent,
    t,
    handleRetry,
    handleDownloadMissing,
    handleSetLocation,
    openFolder,
}: MissingFilesStatusCellProps) {
    const [statusHint, setStatusHint] = useState<string | null>(null);
    const [primaryBusy, setPrimaryBusy] = useState(false);
    const [secondaryBusy, setSecondaryBusy] = useState(false);

    const { setLocationCapability, canOpenFolder } = useRecoveryContext();
    const downloadDir = torrent.savePath ?? torrent.downloadDir ?? "";
    const classification = useResolvedRecoveryClassification(torrent);
    const probe = useMissingFilesProbe(torrent.id);
    const probeLines = formatMissingFileDetails(t, probe);
    const canSetLocation =
        setLocationCapability.canBrowse || setLocationCapability.supportsManual;

    const handleOpenFolder = useCallback(() => {
        if (!downloadDir) return;
        openFolder?.(downloadDir);
    }, [downloadDir, openFolder]);

    useEffect(() => {
        setStatusHint(null);
    }, [torrent.state]);

    const runAction = useCallback(
        (
            action?: () => Promise<void>,
            setter?: Dispatch<SetStateAction<boolean>>,
            hintKey?: string
        ) => {
            if (!action || !setter) return undefined;
            return async () => {
                setter(true);
                if (hintKey) {
                    setStatusHint(t(hintKey));
                }
                try {
                    await action();
                } finally {
                    setter(false);
                    setStatusHint(null);
                }
            };
        },
        [t]
    );

    if (!classification) {
        return (
            <div className="min-w-0 w-full flex items-center justify-center h-full">
                <div className="surface-layer-1 rounded-panel p-panel flex-1 min-w-0 flex items-center gap-tight">
                    <AlertTriangle className="toolbar-icon-size-md text-warning" />
                    <span className="text-scaled font-semibold text-foreground">
                        {t("recovery.generic_header")}
                    </span>
                </div>
            </div>
        );
    }

    const recommendedActions = classification.recommendedActions;

    const buildActionConfig = (
        action: RecoveryRecommendedAction,
        setter?: Dispatch<SetStateAction<boolean>>
    ) => {
        const hintKey = ACTION_HINT_KEYS[action];
        const common = {
            size: "md" as const,
            className: "font-medium",
        };

        switch (action) {
            case "downloadMissing":
                return {
                    ...common,
                    variant: "shadow" as const,
                    color: "primary" as const,
                    label: t("recovery.action_download"),
                    onPress: runAction(
                        () => handleDownloadMissing(torrent),
                        setter,
                        hintKey
                    ),
                    isDisabled: !handleDownloadMissing,
                };
            case "locate":
            case "chooseLocation":
                if (!handleSetLocation || !canSetLocation) return null;
                return {
                    ...common,
                    variant: "shadow" as const,
                    color: "primary" as const,
                    label:
                        action === "chooseLocation"
                            ? t("recovery.action.choose_location")
                            : t("recovery.action_locate"),
                    onPress: runAction(
                        () =>
                            handleSetLocation(torrent, {
                                mode:
                                    action === "chooseLocation"
                                        ? "manual"
                                        : "browse",
                            }),
                        setter,
                        hintKey
                    ),
                    isDisabled: false,
                };
            case "retry":
                return {
                    ...common,
                    variant: "shadow" as const,
                    color: "primary" as const,
                    label: t("recovery.action_retry"),
                    onPress: runAction(handleRetry, setter, hintKey),
                    isDisabled: !handleRetry,
                };
            case "openFolder":
                if (!canOpenFolder) return null;
                return {
                    ...common,
                    variant: "light" as const,
                    color: "default" as const,
                    label: t("recovery.action_open_folder"),
                    onPress: handleOpenFolder,
                    isDisabled: !(torrent.savePath || torrent.downloadDir),
                };
            default:
                return null;
        }
    };

    const statusText = formatRecoveryStatusFromClassification(
        classification,
        t
    );
    const primaryHint = formatPrimaryActionHintFromClassification(
        classification,
        t
    );
    const displayStatus = statusHint ?? statusText;

    const defaultPrimaryAction: RecoveryRecommendedAction =
        classification.kind === "volumeLoss"
            ? "retry"
            : classification.kind === "pathLoss" ||
              classification.kind === "accessDenied"
            ? "locate"
            : "downloadMissing";
    const defaultSecondaryAction: RecoveryRecommendedAction | null =
        classification.kind === "dataGap"
            ? "openFolder"
            : classification.kind === "pathLoss"
            ? "downloadMissing"
            : null;
    const primaryActionName = recommendedActions[0] ?? defaultPrimaryAction;
    const secondaryActionName = recommendedActions[1] ?? defaultSecondaryAction;

    const primaryConfig =
        buildActionConfig(primaryActionName, setPrimaryBusy) ??
        buildActionConfig("downloadMissing", setPrimaryBusy);
    const secondaryConfig =
        secondaryActionName && secondaryActionName !== primaryActionName
            ? buildActionConfig(secondaryActionName, setSecondaryBusy)
            : null;

    if (!primaryConfig) {
        return (
            <div className="min-w-0 w-full flex items-center justify-center h-full">
                <div className="surface-layer-1 rounded-panel p-panel flex-1 min-w-0 flex items-center gap-tight">
                    <AlertTriangle className="toolbar-icon-size-md text-warning" />
                    <span className="text-scaled font-semibold text-foreground truncate">
                        {displayStatus}
                    </span>
                </div>
            </div>
        );
    }

    return (
        <div className="min-w-0 w-full flex items-center justify-center h-full">
            <div className="flex flex-wrap items-center gap-tools min-w-0">
                <div className="surface-layer-1 rounded-panel p-panel flex-1 min-w-0 flex items-center gap-tight">
                    <AlertTriangle className="toolbar-icon-size-md text-warning" />
                    <div className="flex flex-col gap-tight min-w-0">
                        <div className="flex flex-col gap-tight min-w-0">
                            <span
                                className="text-scaled font-semibold text-foreground truncate"
                                title={displayStatus}
                            >
                                {displayStatus}
                            </span>
                            {primaryHint && (
                                <span className="text-label text-foreground/70">
                                    {primaryHint}
                                </span>
                            )}
                            {probeLines.map((line) => (
                                <span
                                    key={line}
                                    className="text-label font-mono text-foreground/70 truncate"
                                >
                                    {line}
                                </span>
                            ))}
                        </div>
                    </div>
                </div>
                <div className="flex items-center gap-tools">
                    <Button
                        variant={primaryConfig.variant}
                        color={primaryConfig.color}
                        size={primaryConfig.size}
                        className={cn("ml-tight font-medium", primaryConfig.className)}
                        isDisabled={primaryConfig.isDisabled || primaryBusy}
                        isLoading={primaryBusy}
                        onPress={primaryConfig.onPress}
                    >
                        {primaryConfig.label}
                    </Button>
                    {secondaryConfig && (
                        <Button
                            variant={secondaryConfig.variant}
                            size={secondaryConfig.size}
                            className={secondaryConfig.className}
                            color={secondaryConfig.color ?? "default"}
                            isDisabled={
                                (secondaryConfig.isDisabled ?? false) || secondaryBusy
                            }
                            isLoading={secondaryBusy}
                            onPress={secondaryConfig.onPress}
                        >
                            {secondaryConfig.label}
                        </Button>
                    )}
                </div>
            </div>
        </div>
    );
}
