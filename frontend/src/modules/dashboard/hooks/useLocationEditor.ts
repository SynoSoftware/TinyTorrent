import { useCallback, useEffect, useReducer, useRef } from "react";
import { useTranslation } from "react-i18next";
import type { Torrent, TorrentDetail } from "@/modules/dashboard/types/torrent";
import { resolveTorrentPath } from "@/modules/dashboard/utils/torrentPaths";
import type {
    LocationEditorState,
    RecoverySessionInfo,
    SetLocationConfirmOutcome,
    SetLocationExecutionMode,
    SetLocationOptions,
    SetLocationOutcome,
    SetLocationSurface,
} from "@/app/context/RecoveryContext";
import { useUiModeCapabilities } from "@/app/context/SessionContext";
import { getRecoveryFingerprint } from "@/app/domain/recoveryUtils";
import type { ResumeRecoveryCommandOutcome } from "@/modules/dashboard/hooks/useRecoveryController.types";
import { isActionableRecoveryErrorClass } from "@/services/recovery/errorClassificationGuards";
import { shellAgent } from "@/app/agents/shell-agent";

type SetLocationAndRecoverFn = (
    torrent: Torrent | TorrentDetail,
    path: string,
    mode: SetLocationExecutionMode,
) => Promise<ResumeRecoveryCommandOutcome>;

type BrowseResult = { status: "picked"; path: string } | { status: "cancelled" } | { status: "failed" } | null;

interface UseLocationEditorParams {
    torrents: Array<Torrent | TorrentDetail>;
    detailData: TorrentDetail | null;
    recoverySession: RecoverySessionInfo | null;
    setLocationAndRecover: SetLocationAndRecoverFn;
}

interface UseLocationEditorResult {
    setLocationEditorState: LocationEditorState | null;
    cancelSetLocationEditor: () => void;
    releaseSetLocationEditor: () => void;
    confirmSetLocation: () => Promise<SetLocationConfirmOutcome>;
    handleSetLocationInputChange: (value: string) => void;
    handleSetLocation: (torrent: Torrent | TorrentDetail, options?: SetLocationOptions) => Promise<SetLocationOutcome>;
}

type ManualEditorState = LocationEditorState;
type DestinationPathPolicy = "windows_abs_only" | "any_abs";
type ManualEditorAction =
    | {
          type: "open";
          payload: {
              surface: SetLocationSurface;
              executionMode: SetLocationExecutionMode;
              torrentKey: string;
              draft: string;
              intentId: number;
          };
      }
    | { type: "update"; payload: { draft: string } }
    | { type: "submitting" }
    | { type: "verifying"; payload: { fingerprint: string } }
    | { type: "error"; payload: { message: string } }
    | { type: "close" }
    | { type: "set"; payload: ManualEditorState | null };

const manualEditorReducer = (state: ManualEditorState | null, action: ManualEditorAction): ManualEditorState | null => {
    if (!state && action.type !== "open" && action.type !== "set") {
        return state;
    }
    switch (action.type) {
        case "open":
            return {
                surface: action.payload.surface,
                executionMode: action.payload.executionMode,
                torrentKey: action.payload.torrentKey,
                initialPath: action.payload.draft,
                inputPath: action.payload.draft,
                status: "idle",
                intentId: action.payload.intentId,
                awaitingRecoveryFingerprint: null,
                error: undefined,
            };
        case "update":
            return {
                ...state!,
                inputPath: action.payload.draft,
                error: undefined,
            };
        case "submitting":
            return {
                ...state!,
                status: "submitting",
                error: undefined,
            };
        case "verifying":
            return {
                ...state!,
                status: "verifying",
                awaitingRecoveryFingerprint: action.payload.fingerprint,
                error: undefined,
            };
        case "error":
            return {
                ...state!,
                status: "idle",
                error: action.payload.message,
                awaitingRecoveryFingerprint: null,
            };
        case "close":
            return null;
        case "set":
            return action.payload;
        default:
            return state;
    }
};

const hasControlChars = (value: string) => /[\r\n\t]/.test(value);

const isValidLocationPathForPolicy = (
    path: string,
    policy: DestinationPathPolicy,
): boolean => {
    const trimmed = path.trim();
    if (!trimmed) return false;
    if (hasControlChars(trimmed)) return false;

    const isWindowsAbs =
        /^[a-zA-Z]:[\\/]/.test(trimmed) || /^\\\\/.test(trimmed);
    const isPosixAbs = trimmed.startsWith("/");

    if (policy === "windows_abs_only") {
        return isWindowsAbs;
    }
    return isWindowsAbs || isPosixAbs;
};

export function useLocationEditor({ torrents, detailData, recoverySession, setLocationAndRecover }: UseLocationEditorParams): UseLocationEditorResult {
    const { t } = useTranslation();
    const uiCapabilities = useUiModeCapabilities();
    const { canBrowse, supportsManual } = uiCapabilities;
    const destinationPathPolicy: DestinationPathPolicy =
        uiCapabilities.destinationPathPolicy ?? "any_abs";
    const locationEditorOwnerRef = useRef<{
        surface: SetLocationSurface;
        torrentKey: string;
    } | null>(null);
    const setLocationEditorStateRef = useRef<ManualEditorState | null>(null);
    const setLocationDraftsRef = useRef(new Map<string, string>());
    const setLocationIntentCounterRef = useRef(0);
    const [setLocationEditorState, dispatchSetLocationEditor] = useReducer(manualEditorReducer, null);

    const setEditorState = useCallback((value: ManualEditorState | null) => {
        dispatchSetLocationEditor({
            type: "set",
            payload: value,
        });
    }, []);

    useEffect(() => {
        setLocationEditorStateRef.current = setLocationEditorState;
    }, [setLocationEditorState]);

    const getDraftPathForTorrent = useCallback((key: string | null, fallback: string): string => {
        if (!key) return fallback;
        return setLocationDraftsRef.current.get(key) ?? fallback;
    }, []);

    const saveDraftForTorrent = useCallback((key: string | null, path: string) => {
        if (!key) return;
        setLocationDraftsRef.current.set(key, path);
    }, []);

    const clearDraftForTorrent = useCallback((key: string | null) => {
        if (!key) return;
        setLocationDraftsRef.current.delete(key);
    }, []);

    const getTorrentByKey = useCallback(
        (key: string | null) => {
            if (!key) return null;
            const found = torrents.find((torrent) => getRecoveryFingerprint(torrent) === key) ?? null;
            if (found) return found;
            if (detailData && getRecoveryFingerprint(detailData) === key) {
                return detailData;
            }
            return null;
        },
        [detailData, torrents],
    );

    useEffect(() => {
        const validKeys = new Set<string>();
        torrents.forEach((torrent) => {
            const key = getRecoveryFingerprint(torrent);
            if (key) validKeys.add(key);
        });
        if (detailData) {
            const detailKey = getRecoveryFingerprint(detailData);
            if (detailKey) validKeys.add(detailKey);
        }
        setLocationDraftsRef.current.forEach((_, key) => {
            if (!validKeys.has(key)) {
                setLocationDraftsRef.current.delete(key);
            }
        });
    }, [detailData, torrents]);

    const openSetLocationEditor = useCallback(
        (state: Omit<LocationEditorState, "intentId">) => {
            const torrentKey = state.torrentKey || null;
            const resolvedPath = getDraftPathForTorrent(torrentKey, state.inputPath);
            setLocationIntentCounterRef.current += 1;
            const next: LocationEditorState = {
                ...state,
                inputPath: resolvedPath,
                initialPath: state.initialPath ?? state.inputPath,
                intentId: setLocationIntentCounterRef.current,
                awaitingRecoveryFingerprint: null,
            };
            if (torrentKey) {
                setLocationDraftsRef.current.set(torrentKey, resolvedPath);
            }
            setLocationEditorStateRef.current = next;
            setEditorState(next);
            return next;
        },
        [getDraftPathForTorrent, setEditorState],
    );

    const patchEditorState = useCallback(
        (patch: Partial<Omit<LocationEditorState, "intentId">>) => {
            const current = setLocationEditorStateRef.current;
            if (!current) return;
            const next = { ...current, ...patch };
            setLocationEditorStateRef.current = next;
            setEditorState(next);
            return next;
        },
        [setEditorState],
    );

    const cancelSetLocationEditor = useCallback(() => {
        locationEditorOwnerRef.current = null;
        setLocationEditorStateRef.current = null;
        dispatchSetLocationEditor({ type: "close" });
    }, []);

    const confirmSetLocation = useCallback(async (): Promise<SetLocationConfirmOutcome> => {
        const current = setLocationEditorStateRef.current;
        if (!current) return { status: "canceled" };
        const intentId = current.intentId;
        const trimmed = current.inputPath.trim();
        if (!trimmed) {
            patchEditorState({
                error: t("directory_browser.validation_required"),
            });
            return { status: "validation_error" };
        }
        if (!isValidLocationPathForPolicy(trimmed, destinationPathPolicy)) {
            patchEditorState({
                error: t("set_location.reason.absolute_path_required"),
            });
            return { status: "validation_error" };
        }
        const torrentKey = current.torrentKey || null;
        const targetTorrent = getTorrentByKey(torrentKey);
        if (!targetTorrent) {
            patchEditorState({
                error: t("recovery.errors.missing_client_or_detail"),
            });
            return { status: "missing_target" };
        }
        patchEditorState({
            status: "submitting",
            error: undefined,
            inputPath: trimmed,
        });
        saveDraftForTorrent(torrentKey, trimmed);
        if (setLocationEditorStateRef.current?.intentId !== intentId) {
            return { status: "canceled" };
        }
        try {
            const recoverOutcome = await setLocationAndRecover(
                targetTorrent,
                trimmed,
                current.executionMode,
            );
            if (recoverOutcome.status === "cancelled") {
                if (setLocationEditorStateRef.current?.intentId === intentId) {
                    patchEditorState({
                        status: "idle",
                        error: undefined,
                        awaitingRecoveryFingerprint: null,
                    });
                }
                return { status: "canceled" };
            }
            if (recoverOutcome.status !== "applied") {
                const message =
                    recoverOutcome.reason === "method_missing"
                        ? t("recovery.errors.set_torrent_location_failed_default")
                        : t("toolbar.feedback.failed");
                if (setLocationEditorStateRef.current?.intentId === intentId) {
                    patchEditorState({
                        status: "idle",
                        error: message,
                        awaitingRecoveryFingerprint: null,
                    });
                }
                return { status: "failed" };
            }
            clearDraftForTorrent(torrentKey);
            if (recoverOutcome.awaitingRecovery !== true) {
                if (setLocationEditorStateRef.current?.intentId === intentId) {
                    cancelSetLocationEditor();
                }
                return { status: "submitted" };
            }
            if (setLocationEditorStateRef.current?.intentId !== intentId) {
                return { status: "submitted" };
            }
            const fingerprint = getRecoveryFingerprint(targetTorrent);
            patchEditorState({
                status: "verifying",
                awaitingRecoveryFingerprint: fingerprint,
                error: undefined,
            });
            return { status: "verifying" };
        } catch (error) {
            const message = error instanceof Error ? error.message : "Unknown error";
            if (setLocationEditorStateRef.current?.intentId === intentId) {
                patchEditorState({
                    status: "idle",
                    error: message,
                    awaitingRecoveryFingerprint: null,
                });
            }
            return { status: "failed" };
        }
    }, [
        cancelSetLocationEditor,
        patchEditorState,
        saveDraftForTorrent,
        setLocationAndRecover,
        t,
        destinationPathPolicy,
        getTorrentByKey,
        clearDraftForTorrent,
    ]);

    const handleSetLocationInputChange = useCallback(
        (value: string) => {
            const currentKey = setLocationEditorStateRef.current?.torrentKey;
            if (currentKey) {
                saveDraftForTorrent(currentKey, value);
            }
            patchEditorState({
                inputPath: value,
                error: undefined,
            });
        },
        [patchEditorState, saveDraftForTorrent],
    );

    const releaseSetLocationEditor = useCallback(() => {
        locationEditorOwnerRef.current = null;
        const current = setLocationEditorStateRef.current;
        setLocationEditorStateRef.current = null;
        setEditorState(null);
        if (current) {
            clearDraftForTorrent(current.torrentKey);
        }
    }, [clearDraftForTorrent, setEditorState]);

    const isLocationEditorOwner = useCallback((surface: SetLocationSurface, torrentKey: string) => {
        const owner = locationEditorOwnerRef.current;
        if (!owner) return false;
        return owner.surface === surface && owner.torrentKey === torrentKey;
    }, []);

    const tryAcquireLocationEditorOwner = useCallback(
        (surface: SetLocationSurface, torrentKey: string) => {
            const owner = locationEditorOwnerRef.current;
            if (!owner) {
                locationEditorOwnerRef.current = { surface, torrentKey };
                return { status: "acquired" as const };
            }
            if (isLocationEditorOwner(surface, torrentKey)) {
                return { status: "already_owned" as const };
            }
            return { status: "conflict" as const };
        },
        [isLocationEditorOwner],
    );

    const openManualEditorForTorrent = useCallback(
        (
            surface: SetLocationSurface,
            torrentKey: string,
            basePath: string,
            executionMode: SetLocationExecutionMode,
        ): SetLocationOutcome => {
            if (!torrentKey) {
                return { status: "failed", reason: "invalid_target" };
            }
            const acquisition = tryAcquireLocationEditorOwner(surface, torrentKey);
            if (acquisition.status === "conflict") {
                const currentState = setLocationEditorStateRef.current;
                if (currentState?.torrentKey === torrentKey) {
                    locationEditorOwnerRef.current = { surface, torrentKey };
                    patchEditorState({
                        surface,
                        executionMode,
                    });
                    return { status: "manual_opened" };
                }
                return { status: "conflict", reason: "owned_elsewhere" };
            }
            if (acquisition.status === "already_owned") {
                return { status: "manual_opened" };
            }
            openSetLocationEditor({
                surface,
                executionMode,
                torrentKey,
                initialPath: basePath,
                inputPath: basePath,
                status: "idle",
            });
            return { status: "manual_opened" };
        },
        [openSetLocationEditor, patchEditorState, tryAcquireLocationEditorOwner],
    );

    const resolveSetLocationExecutionMode = useCallback(
        (
            torrent: Torrent | TorrentDetail,
            surface: SetLocationSurface,
        ): SetLocationExecutionMode => {
            if (surface === "recovery-modal") {
                return "recover_existing";
            }
            return isActionableRecoveryErrorClass(
                torrent.errorEnvelope?.errorClass,
            )
                ? "recover_existing"
                : "move_data";
        },
        [],
    );

    useEffect(() => {
        const current = setLocationEditorStateRef.current;
        if (!current) return;
        clearDraftForTorrent(current.torrentKey);
        releaseSetLocationEditor();
    }, [canBrowse, supportsManual, clearDraftForTorrent, releaseSetLocationEditor]);

    const handleSetLocation = useCallback(
        async (torrent: Torrent | TorrentDetail, options?: SetLocationOptions): Promise<SetLocationOutcome> => {
            const surface = options?.surface ?? "general-tab";
            const basePath = resolveTorrentPath(torrent);
            const torrentKey = getRecoveryFingerprint(torrent);
            const executionMode = resolveSetLocationExecutionMode(
                torrent,
                surface,
            );
            const requestedManual = options?.mode === "manual";
            if (!requestedManual && canBrowse) {
                let browseOutcome: BrowseResult;
                try {
                    const next = await shellAgent.browseDirectory(
                        basePath || undefined,
                    );
                    browseOutcome = next
                        ? { status: "picked", path: next }
                        : { status: "cancelled" };
                } catch {
                    browseOutcome = { status: "failed" };
                }
                if (browseOutcome?.status === "picked") {
                    try {
                        const recoverOutcome = await setLocationAndRecover(
                            torrent,
                            browseOutcome.path,
                            executionMode,
                        );
                        if (recoverOutcome.status === "applied") {
                            return { status: "picked" };
                        }
                        if (recoverOutcome.status === "cancelled") {
                            return { status: "cancelled" };
                        }
                        if (recoverOutcome.reason === "method_missing") {
                            return {
                                status: "unsupported",
                                reason: "command_unsupported",
                            };
                        }
                        return {
                            status: "failed",
                            reason: "dispatch_failed",
                        };
                    } catch {
                        return {
                            status: "failed",
                            reason: "dispatch_failed",
                        };
                    }
                }
                if (browseOutcome?.status === "failed") {
                    return { status: "failed", reason: "browse_failed" };
                }
                // Browse was cancelled (or returned null).
                // If the calling surface has already been torn down
                // (e.g. context menu closed before opening browse),
                // falling through to the inline manual editor would
                // open an editor with no visible container. Return
                // "cancelled" instead so the caller gets a clean signal.
                if (surface === "context-menu") {
                    return { status: "cancelled" };
                }
                if (!supportsManual) {
                    return { status: "cancelled" };
                }
            }
            if (!supportsManual) {
                return {
                    status: "unsupported",
                    reason: requestedManual ? "manual_unavailable" : "browse_unavailable",
                };
            }
            return openManualEditorForTorrent(
                surface,
                torrentKey,
                basePath,
                executionMode,
            );
        },
        [
            canBrowse,
            resolveSetLocationExecutionMode,
            setLocationAndRecover,
            supportsManual,
            openManualEditorForTorrent,
        ],
    );

    useEffect(() => {
        const current = setLocationEditorState;
        if (!current || current.status !== "verifying") return;
        const torrentKey = current.torrentKey;
        if (!recoverySession) {
            clearDraftForTorrent(torrentKey);
            cancelSetLocationEditor();
            return;
        }
        const sessionKey = getRecoveryFingerprint(recoverySession.torrent);
        if (sessionKey !== torrentKey) {
            return;
        }
    }, [cancelSetLocationEditor, clearDraftForTorrent, setLocationEditorState, recoverySession]);

    return {
        setLocationEditorState,
        cancelSetLocationEditor,
        releaseSetLocationEditor,
        confirmSetLocation,
        handleSetLocationInputChange,
        handleSetLocation,
    };
}
