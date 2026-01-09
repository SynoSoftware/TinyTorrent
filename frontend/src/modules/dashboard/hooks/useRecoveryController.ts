import { useCallback, useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import type { EngineAdapter } from "@/services/rpc/engine-adapter";
import type { TorrentDetail } from "@/modules/dashboard/types/torrent";
import type { ErrorEnvelope } from "@/services/rpc/entities";
import type {
    RecoveryPlan,
    RecoveryOutcome,
    runDiskFullRecovery,
    runMissingFilesRecovery,
    runPartialFilesRecovery,
    runReannounce,
    planRecovery,
} from "@/services/recovery/recovery-controller";
import * as controller from "@/services/recovery/recovery-controller";

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
}) {
    const { client, detail, envelope } = params;
    const { t } = useTranslation();
    const [lastOutcome, setLastOutcome] = useState<RecoveryOutcome | null>(
        null
    );
    const [, forceUpdate] = useState(0);

    // Per-fingerprint in-flight map to dedupe and serialize recovery calls.
    const inFlight = useMemo(
        () => new Map<string, Promise<RecoveryOutcome>>(),
        []
    ) as Map<string, Promise<RecoveryOutcome>>;

    // Per-fingerprint busy states
    const busyStates = useMemo(() => new Map<string, number>(), []);

    // Clear in-flight and busy when torrent changes
    useEffect(() => {
        inFlight.clear();
        busyStates.clear();
        forceUpdate(Math.random());
    }, [detail?.id]);

    // Clear lastOutcome when envelope changes
    useEffect(() => {
        setLastOutcome(null);
    }, [envelope?.fingerprint]);

    const currentFp =
        envelope?.fingerprint ??
        String(detail?.id ?? detail?.hash ?? "<no-fp>");
    const isBusy = (busyStates.get(currentFp) ?? 0) > 0;

    const plan: RecoveryPlan | null = useMemo(() => {
        if (!detail || !envelope) return null;
        return controller.planRecovery(envelope, detail as any);
    }, [detail, envelope]);

    const handlePrimaryRecovery =
        useCallback(async (): Promise<RecoveryOutcome> => {
            if (!client || !detail || !envelope) {
                const r: RecoveryOutcome = {
                    kind: "error",
                    message: t(
                        "recovery.errors.missing_client_detail_envelope"
                    ),
                };
                setLastOutcome(r);
                return r;
            }

            // Determine fingerprint to dedupe concurrent operations
            const fp =
                envelope.fingerprint ??
                String(detail.id ?? detail.hash ?? "<no-fp>");
            const existing = inFlight.get(fp);
            if (existing) {
                // Reuse existing in-flight promise
                return existing;
            }

            const promise = (async () => {
                busyStates.set(fp, (busyStates.get(fp) ?? 0) + 1);
                forceUpdate(Math.random());
                try {
                    const ec = envelope.errorClass;
                    let out: RecoveryOutcome = {
                        kind: "noop",
                        message: "no_recovery_performed",
                    };
                    if (ec === "missingFiles") {
                        out = await controller.runMissingFilesRecovery({
                            client,
                            detail: detail as any,
                            envelope,
                        });
                    } else if (ec === "permissionDenied") {
                        out = await controller.runPermissionDeniedRecovery({
                            client,
                            detail: detail as any,
                            envelope,
                        });
                    } else if (ec === "diskFull") {
                        out = await controller.runDiskFullRecovery({
                            client,
                            detail: detail as any,
                            envelope,
                        });
                    } else if (ec === "partialFiles") {
                        out = await controller.runPartialFilesRecovery({
                            client,
                            detail: detail as any,
                            envelope,
                        });
                    } else if (
                        ec === "trackerWarning" ||
                        ec === "trackerError"
                    ) {
                        out = await controller.runReannounce({
                            client,
                            detail: detail as any,
                            envelope,
                        });
                    } else {
                        out = {
                            kind: "noop",
                            message: t(
                                "recovery.no_primary_recovery_for_error_class"
                            ),
                        };
                    }
                    setLastOutcome(out);
                    return out;
                } finally {
                    busyStates.set(fp, (busyStates.get(fp) ?? 1) - 1);
                    forceUpdate(Math.random());
                    inFlight.delete(fp);
                }
            })();

            inFlight.set(fp, promise);
            return promise;
        }, [client, detail, envelope, inFlight]);

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

            const fp =
                envelope?.fingerprint ??
                String(detail.id ?? detail.hash ?? "<no-fp>");
            const existing = inFlight.get(fp);
            if (existing) return existing;

            const promise = (async () => {
                busyStates.set(fp, (busyStates.get(fp) ?? 0) + 1);
                forceUpdate(Math.random());
                try {
                    try {
                        await client.setTorrentLocation?.(
                            detail.id,
                            path,
                            false
                        );
                    } catch (err) {
                        const errMsg = err
                            ? String(err)
                            : t(
                                  "recovery.errors.set_torrent_location_failed_default"
                              );
                        const r: RecoveryOutcome = {
                            kind: "error",
                            message: t(
                                "recovery.errors.set_torrent_location_failed",
                                {
                                    message: errMsg,
                                }
                            ),
                        };
                        setLastOutcome(r);
                        return r;
                    }
                    // After setting location, resume the torrent
                    try {
                        await client.resume([detail.id]);
                    } catch {}
                    const out: RecoveryOutcome = {
                        kind: "resolved",
                        message: "location_updated",
                    };
                    setLastOutcome(out);
                    return out;
                } finally {
                    busyStates.set(fp, (busyStates.get(fp) ?? 1) - 1);
                    forceUpdate(Math.random());
                    inFlight.delete(fp);
                }
            })();

            inFlight.set(fp, promise);
            return promise;
        },
        [client, detail, envelope, inFlight]
    );

    const handleVerify = useCallback(async (): Promise<RecoveryOutcome> => {
        if (!client || !detail)
            return {
                kind: "error",
                message: t("recovery.errors.missing_client_or_detail"),
            };
        const fp =
            envelope?.fingerprint ??
            String(detail.id ?? detail.hash ?? "<no-fp>");
        const existing = inFlight.get(fp);
        if (existing) return existing;
        const promise = (async () => {
            busyStates.set(fp, (busyStates.get(fp) ?? 0) + 1);
            forceUpdate(Math.random());
            try {
                const out = await controller.runPartialFilesRecovery({
                    client,
                    detail: detail as any,
                    envelope: undefined,
                });
                setLastOutcome(out);
                return out;
            } finally {
                busyStates.set(fp, (busyStates.get(fp) ?? 1) - 1);
                forceUpdate(Math.random());
                inFlight.delete(fp);
            }
        })();
        inFlight.set(fp, promise);
        return promise;
    }, [client, detail, envelope, inFlight]);

    const handleReannounce = useCallback(async (): Promise<RecoveryOutcome> => {
        if (!client || !detail)
            return {
                kind: "error",
                message: t("recovery.errors.missing_client_or_detail"),
            };
        const fp =
            envelope?.fingerprint ??
            String(detail.id ?? detail.hash ?? "<no-fp>");
        const existing = inFlight.get(fp);
        if (existing) return existing;
        const promise = (async () => {
            busyStates.set(fp, (busyStates.get(fp) ?? 0) + 1);
            forceUpdate(Math.random());
            try {
                const out = await controller.runReannounce({
                    client,
                    detail: detail as any,
                    envelope: undefined,
                });
                setLastOutcome(out);
                return out;
            } finally {
                busyStates.set(fp, (busyStates.get(fp) ?? 1) - 1);
                forceUpdate(Math.random());
                inFlight.delete(fp);
            }
        })();
        inFlight.set(fp, promise);
        return promise;
    }, [client, detail, envelope, inFlight]);

    return {
        plan,
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
