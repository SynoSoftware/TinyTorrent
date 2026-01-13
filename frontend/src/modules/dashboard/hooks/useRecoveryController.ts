import { useCallback, useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import type { EngineAdapter } from "@/services/rpc/engine-adapter";
import type { TorrentDetail } from "@/modules/dashboard/types/torrent";
import type { ErrorEnvelope } from "@/services/rpc/entities";
import {
    runPartialFilesRecovery,
    runReannounce,
} from "@/services/recovery/recovery-controller";
import type { RecoveryOutcome } from "@/services/recovery/recovery-controller";
import type {
    RecoveryGateCallback,
    RecoveryGateOutcome,
} from "@/app/types/recoveryGate";
import type { TorrentIntentExtended } from "@/app/intents/torrentIntents";
import { TorrentIntents } from "@/app/intents/torrentIntents";

export type RecoveryCallbacks = {
    handlePrimaryRecovery: () => Promise<RecoveryOutcome>;
    handlePickPath: (path: string) => Promise<RecoveryOutcome>;
    handleVerify: () => Promise<RecoveryOutcome>;
    handleReannounce: () => Promise<RecoveryOutcome>;
};

export function useRecoveryController(params: {
    client: EngineAdapter | null | undefined;
    detail: TorrentDetail | null | undefined;
    envelope: ErrorEnvelope | null | undefined;
    requestRecovery?: RecoveryGateCallback;
    dispatch: (intent: TorrentIntentExtended) => Promise<void>;
}) {
    const { client, detail, envelope, requestRecovery, dispatch } = params;
    const { t } = useTranslation();
    const [lastOutcome, setLastOutcome] = useState<RecoveryOutcome | null>(
        null
    );
    // Clear lastOutcome when envelope changes
    useEffect(() => {
        setLastOutcome(null);
    }, [envelope?.fingerprint]);
    const currentFp =
        envelope?.fingerprint ??
        String(detail?.id ?? detail?.hash ?? "<no-fp>");
    const isBusy = false;


    const mapGateOutcomeToRecoveryOutcome = useCallback(
        (outcome: RecoveryGateOutcome | null): RecoveryOutcome => {
            if (!outcome) {
                return {
                    kind: "error",
                    message: "no_outcome_from_gate",
                };
            }
            switch (outcome.status) {
                case "handled":
                    return {
                        kind: "resolved",
                        message: "recovery_handled",
                    };
                case "continue":
                    return {
                        kind: "noop",
                        message: "recovery_continued",
                    };
                case "cancelled":
                    return {
                        kind: "error",
                        message: "recovery_cancelled",
                    };
            }
        },
        []
    );

    const handlePrimaryRecovery =
        useCallback(async (): Promise<RecoveryOutcome> => {
            if (!client || !detail || !envelope || !requestRecovery) {
                const r: RecoveryOutcome = {
                    kind: "error",
                    message: t(
                        "recovery.errors.missing_client_detail_envelope"
                    ),
                };
                setLastOutcome(r);
                return r;
            }

            // First consult the recovery gate to determine whether recovery should proceed.
            const gateOutcome = await requestRecovery({
                torrent: detail,
                action: "resume",
            });
        const mapped = mapGateOutcomeToRecoveryOutcome(gateOutcome);
        setLastOutcome(mapped);

        // If the gate indicates we should continue, delegate the engine action
        // to the TorrentActions provider (single action owner).
        if (gateOutcome && gateOutcome.status === "continue") {
            try {
                await dispatch(
                    TorrentIntents.ensureActive(detail.id ?? detail.hash)
                );
                return { kind: "resolved", message: "recovery_handled" };
            } catch (err) {
                return { kind: "error", message: String(err ?? "error") };
            }
        }

        return mapped;
    }, [
        client,
        detail,
        envelope,
        requestRecovery,
        mapGateOutcomeToRecoveryOutcome,
        dispatch,
        t,
    ]);

    const handlePickPath = useCallback(
        async (path: string): Promise<RecoveryOutcome> => {
            if (!client || !detail) {
                const r: RecoveryOutcome = {
                    kind: "error",
                    message: t("recovery.errors.missing_client_or_detail"),
                };
                setLastOutcome(r);
                return r;
            }

            // Delegate pick-path to the provider. The provider implements the
            // actual setTorrentLocation + resume behavior for the given torrent.
            try {
                await dispatch(
                    TorrentIntents.ensureAtLocation(
                        detail.id ?? detail.hash,
                        path
                    )
                );
                const out: RecoveryOutcome = {
                    kind: "resolved",
                    message: "location_updated",
                };
                setLastOutcome(out);
                return out;
            } catch (err) {
                const errMsg = err
                    ? String(err)
                    : t("recovery.errors.set_torrent_location_failed_default");
                const r: RecoveryOutcome = {
                    kind: "error",
                    message: t("recovery.errors.set_torrent_location_failed", {
                        message: errMsg,
                    }),
                };
                setLastOutcome(r);
                return r;
            }
        },
        [client, detail, envelope, dispatch, t]
    );

    const handleVerify = useCallback(async (): Promise<RecoveryOutcome> => {
        if (!client || !detail)
            return {
                kind: "error",
                message: t("recovery.errors.missing_client_or_detail"),
            };
        try {
            const out = await runPartialFilesRecovery({
                client: client as EngineAdapter,
                detail: detail as any,
                envelope: undefined,
            });
            setLastOutcome(out);
            return out;
        } catch (err) {
            const r: RecoveryOutcome = {
                kind: "error",
                message: String(err ?? "verify_failed"),
            };
            setLastOutcome(r);
            return r;
        }
    }, [client, detail, envelope]);

    const handleReannounce = useCallback(async (): Promise<RecoveryOutcome> => {
        if (!client || !detail)
            return {
                kind: "error",
                message: t("recovery.errors.missing_client_or_detail"),
            };
        try {
            const out = await runReannounce({
                client: client as EngineAdapter,
                detail: detail as any,
                envelope: undefined,
            });
            setLastOutcome(out);
            return out;
        } catch (err) {
            const r: RecoveryOutcome = {
                kind: "error",
                message: String(err ?? "reannounce_failed"),
            };
            setLastOutcome(r);
            return r;
        }
    }, [client, detail, envelope]);

    return {
        recoveryCallbacks: {
            handlePrimaryRecovery,
            handlePickPath,
            handleVerify,
            handleReannounce,
        } as RecoveryCallbacks,
        isBusy,
        lastOutcome,
    };
}
