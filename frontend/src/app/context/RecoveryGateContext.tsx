import {
    createContext,
    useCallback,
    useContext,
    useMemo,
    useRef,
    useState,
} from "react";
import { useTranslation } from "react-i18next";
import { useActionFeedback } from "@/app/hooks/useActionFeedback";
import type { MutableRefObject, ReactNode } from "react";
import type { EngineAdapter } from "@/services/rpc/engine-adapter";
import type {
    ServerClass,
    TorrentEntity,
    TorrentDetailEntity,
} from "@/services/rpc/entities";
import type { Torrent, TorrentDetail } from "@/modules/dashboard/types/torrent";
import type { RecoveryOutcome } from "@/services/recovery/recovery-controller";
import {
    classifyMissingFilesState,
    runMissingFilesRecoverySequence,
} from "@/services/recovery/recovery-controller";
import {
    getRecoveryFingerprint,
    derivePathReason,
} from "@/app/domain/recoveryUtils";
import { useRecoveryController } from "@/modules/dashboard/hooks/useRecoveryController";
import type {
    RecoveryGateAction,
    RecoveryGateCallback,
    RecoveryGateOutcome,
} from "@/app/types/recoveryGate";

export interface RecoveryGateContextValue {
    requestRecovery: RecoveryGateCallback;
    recoverySession: {
        torrent: Torrent | TorrentDetail;
        action: RecoveryGateAction;
        outcome?: RecoveryOutcome | null;
    } | null;
    recoveryCallbacks: ReturnType<
        typeof useRecoveryController
    >["recoveryCallbacks"];
    isRecoveryBusy: boolean;
    lastRecoveryOutcome: RecoveryOutcome | null;
    handleRecoveryClose: () => void;
    runRecoveryOperation: (
        operation?: () => Promise<RecoveryOutcome>
    ) => Promise<void>;
}

const RecoveryGateContext = createContext<RecoveryGateContextValue | null>(
    null
);

export interface RecoveryGateProviderProps {
    clientRef: MutableRefObject<EngineAdapter | null>;
    serverClass: ServerClass;
    children: ReactNode | ((value: RecoveryGateContextValue) => ReactNode);
}

export function RecoveryGateProvider({
    clientRef,
    serverClass,
    children,
}: RecoveryGateProviderProps) {
    const [recoverySession, setRecoverySession] = useState<{
        torrent: Torrent | TorrentDetail;
        action: RecoveryGateAction;
        outcome?: RecoveryOutcome | null;
    } | null>(null);
    const recoveryResolverRef = useRef<
        ((result: RecoveryGateOutcome) => void) | null
    >(null);
    const recoveryFingerprintRef = useRef<string | null>(null);
    const recoveryPromiseRef = useRef<Promise<RecoveryGateOutcome> | null>(
        null
    );

    const runMissingFilesFlow = useCallback(
        async (
            torrent: Torrent | TorrentDetail,
            options?: { recreateFolder?: boolean }
        ) => {
            const client = clientRef.current;
            const envelope = torrent.errorEnvelope;
            if (!client || !envelope) return null;
            const classification = classifyMissingFilesState(
                envelope,
                torrent.savePath ?? torrent.downloadDir ?? "",
                serverClass
            );
            try {
                return await runMissingFilesRecoverySequence({
                    client,
                    torrent,
                    envelope,
                    classification,
                    serverClass,
                    options,
                });
            } catch (err) {
                console.error("missing files recovery flow failed", err);
                throw err;
            }
        },
        [serverClass, clientRef]
    );

    const { showFeedback } = useActionFeedback();
    const { t } = useTranslation();

    const finalizeRecovery = useCallback((result: RecoveryGateOutcome) => {
        const resolver = recoveryResolverRef.current;
        recoveryResolverRef.current = null;
        recoveryFingerprintRef.current = null;
        recoveryPromiseRef.current = null;
        setRecoverySession(null);
        resolver?.(result);
    }, []);

    const interpretRecoveryOutcome = useCallback(
        (
            action: RecoveryGateAction,
            outcome: RecoveryOutcome | null | undefined
        ): RecoveryGateOutcome | null => {
            if (!outcome) return null;
            switch (outcome.kind) {
                case "resolved":
                case "noop":
                    return { status: "continue" };
                case "verify-started":
                    return action === "recheck"
                        ? { status: "handled" }
                        : { status: "continue" };
                case "reannounce-started":
                    return { status: "continue" };
                case "path-needed":
                    return null;
                case "error":
                    return { status: "cancelled" };
                default:
                    return { status: "continue" };
            }
        },
        []
    );

    const handleRecoveryOutcome = useCallback(
        (outcome: RecoveryOutcome | null | undefined) => {
            if (!recoverySession) return;
            const result = interpretRecoveryOutcome(
                recoverySession.action,
                outcome
            );
            if (result) {
                finalizeRecovery(result);
            }
        },
        [finalizeRecovery, interpretRecoveryOutcome, recoverySession]
    );

    const runRecoveryOperation = useCallback(
        async (operation?: () => Promise<RecoveryOutcome>) => {
            if (!operation) return;
            const outcome = await operation();
            handleRecoveryOutcome(outcome);
        },
        [handleRecoveryOutcome]
    );

    const handleRecoveryClose = useCallback(() => {
        if (!recoveryResolverRef.current) return;
        finalizeRecovery({ status: "cancelled" });
    }, [finalizeRecovery]);

    const requestRecovery: RecoveryGateCallback = useCallback(
        async ({ torrent, action, options }) => {
            const envelope = torrent.errorEnvelope;
            if (!envelope) return null;
            if (action === "setLocation") return null;

            let blockingOutcome: RecoveryOutcome | null = null;
            try {
                const flowResult = await runMissingFilesFlow(torrent, options);
                if (flowResult?.status === "resolved") {
                    console.info(
                        `[tiny-torrent][recovery] ${action} executed recovery for torrent=${torrent.id}`
                    );
                    // Surface a toast if the recovery controller indicated an all-verified fast-path
                    if (flowResult.log === "all_verified_resuming") {
                        try {
                            showFeedback(
                                t("recovery.feedback.all_verified_resuming"),
                                "info"
                            );
                        } catch (err) {
                            // best-effort; do not fail recovery if toast cannot be shown
                        }
                    }
                    return { status: "handled" };
                }
                if (flowResult?.status === "needsModal") {
                    blockingOutcome = flowResult.blockingOutcome ?? null;
                }
            } catch (err) {
                console.error("recovery flow failed", err);
                blockingOutcome = {
                    kind: "path-needed",
                    reason: derivePathReason(envelope.errorClass),
                };
            }

            if (!blockingOutcome) {
                return null;
            }

            if (action === "recheck") {
                return { status: "continue" };
            }

            const fingerprint = getRecoveryFingerprint(torrent);
            const activeFingerprint = recoveryFingerprintRef.current;
            if (activeFingerprint) {
                if (activeFingerprint === fingerprint) {
                    return recoveryPromiseRef.current ?? null;
                }
                return { status: "cancelled" };
            }
            if (recoveryResolverRef.current) {
                return { status: "cancelled" };
            }
            const promise = new Promise<RecoveryGateOutcome>((resolve) => {
                recoveryResolverRef.current = resolve;
                setRecoverySession({
                    torrent,
                    action,
                    outcome: blockingOutcome,
                });
            });
            recoveryFingerprintRef.current = fingerprint;
            recoveryPromiseRef.current = promise;
            return promise;
        },
        [runMissingFilesFlow]
    );

    const { recoveryCallbacks, isBusy, lastOutcome } = useRecoveryController({
        client: clientRef.current ?? undefined,
        detail: recoverySession?.torrent ?? null,
        envelope: recoverySession?.torrent?.errorEnvelope ?? null,
        requestRecovery,
    });

    const contextValue = useMemo(
        () => ({
            requestRecovery,
            recoverySession,
            recoveryCallbacks,
            isRecoveryBusy: isBusy,
            lastRecoveryOutcome: lastOutcome,
            handleRecoveryClose,
            runRecoveryOperation,
        }),
        [
            requestRecovery,
            recoverySession,
            recoveryCallbacks,
            isBusy,
            lastOutcome,
            handleRecoveryClose,
            runRecoveryOperation,
        ]
    );

    return (
        <RecoveryGateContext.Provider value={contextValue}>
            {typeof children === "function" ? children(contextValue) : children}
        </RecoveryGateContext.Provider>
    );
}

export function useRecoveryGate() {
    const context = useContext(RecoveryGateContext);
    if (!context) {
        throw new Error(
            "useRecoveryGate must be used within a RecoveryGateProvider"
        );
    }
    return context;
}
