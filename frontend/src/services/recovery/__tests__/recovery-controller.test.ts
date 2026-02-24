import { describe, it, expect, beforeEach, vi } from "vitest";
import type { EngineAdapter } from "@/services/rpc/engine-adapter";
import { DEFAULT_ENGINE_CAPABILITIES } from "@/services/rpc/engine-adapter";
import type { ErrorEnvelope, TorrentDetailEntity } from "@/services/rpc/entities";
import type { TransmissionFreeSpace } from "@/services/rpc/types";
import type { MissingFilesClassification } from "@/services/recovery/recovery-controller";
import {
    classifyMissingFilesState,
    deriveRecommendedActions,
    recordVerifyAttempt,
    resetVerifyGuard,
    recoverMissingFiles,
    shouldSkipVerify,
} from "@/services/recovery/recovery-controller";

function makeEnvelope(overrides: Partial<ErrorEnvelope> = {}): ErrorEnvelope {
    return {
        errorClass: "missingFiles",
        errorMessage: "No such file",
        lastErrorAt: null,
        recoveryState: "blocked",
        retryCount: null,
        nextRetryAt: null,
        recoveryActions: [],
        automationHint: null,
        fingerprint: null,
        primaryAction: null,
        ...overrides,
    };
}

function makeTorrent(overrides: Partial<TorrentDetailEntity> = {}): TorrentDetailEntity {
    return {
        id: "torrent-1",
        hash: "hash-1",
        name: "Missing",
        state: "missing_files",
        speed: { down: 0, up: 0 },
        peerSummary: { connected: 0 },
        totalSize: 0,
        eta: 0,
        ratio: 0,
        uploaded: 0,
        downloaded: 0,
        leftUntilDone: 123456,
        downloadDir: "D:\\Drive",
        savePath: "D:\\Drive",
        added: Date.now(),
        ...overrides,
    };
}

function makeFreeSpace(path: string, sizeBytes: number, totalSize: number): TransmissionFreeSpace {
    return { path, sizeBytes, totalSize };
}

const createDeferred = <T>() => {
    let resolve!: (value: T | PromiseLike<T>) => void;
    let reject!: (reason?: unknown) => void;
    const promise = new Promise<T>((res, rej) => {
        resolve = res;
        reject = rej;
    });
    return { promise, resolve, reject };
};

describe("recovery-controller helpers", () => {
    beforeEach(() => {
        resetVerifyGuard();
    });

    it("classifies permission failures as accessDenied with likely confidence", () => {
        const envelope = makeEnvelope({
            errorClass: "permissionDenied",
            errorMessage: "Access is denied by the operating system",
        });
        const classification = classifyMissingFilesState(envelope, "C:\\Downloads", {
            engineCapabilities: DEFAULT_ENGINE_CAPABILITIES,
        });
        expect(classification.kind).toBe("accessDenied");
        expect(classification.confidence).toBe("likely");
        expect(classification.path).toBe("C:\\Downloads");
    });

    it("classifies missing folder errors as pathLoss", () => {
        const envelope = makeEnvelope({
            errorClass: "missingFiles",
            errorMessage: "No such file or directory",
        });
        const classification = classifyMissingFilesState(envelope, "C:\\Movies\\Avatar", {
            engineCapabilities: DEFAULT_ENGINE_CAPABILITIES,
        });
        expect(classification.kind).toBe("pathLoss");
        expect(classification.confidence).toBe("likely");
    });

    it("records verify attempts and skips repeat verifies", () => {
        recordVerifyAttempt("fingerprint-1", 1024);
        expect(shouldSkipVerify("fingerprint-1", 1024)).toBe(true);
        expect(shouldSkipVerify("fingerprint-1", 0)).toBe(false);
    });

    it("returns needsModal when the path is missing", async () => {
        const envelope = makeEnvelope();
        const torrent = makeTorrent({
            id: "torrent-1",
            hash: "hash-1",
            downloadDir: "C:\\Missing",
            savePath: "C:\\Missing",
        });
        const classification = classifyMissingFilesState(envelope, "C:\\Missing", {
            torrentId: "torrent-1",
            engineCapabilities: DEFAULT_ENGINE_CAPABILITIES,
        });
        const client = {
            checkFreeSpace: async () => {
                const err = new Error("no such file") as Error & {
                    code?: string;
                };
                err.code = "ENOENT";
                throw err;
            },
        } as Partial<EngineAdapter>;
        const result = await recoverMissingFiles({
            client: client as EngineAdapter,
            torrent,
            envelope,
            classification,
            engineCapabilities: DEFAULT_ENGINE_CAPABILITIES,
        });
        expect(result.status).toBe("needsModal");
        if (result.status !== "needsModal") {
            throw new Error("expected_needs_modal");
        }
        expect(result.blockingOutcome.kind).toBe("blocked");
    });

    const baseTorrent = makeTorrent({
        id: "torrent-1",
        hash: "hash-1",
        downloadDir: "D:\\Drive",
        savePath: "D:\\Drive",
        leftUntilDone: 123456,
    });

    it("dedupes concurrent recovery calls using the same fingerprint", async () => {
        const deferred = createDeferred<TransmissionFreeSpace>();
        let checkCalls = 0;
        const client: Partial<EngineAdapter> = {
            checkFreeSpace: vi.fn(async () => {
                checkCalls += 1;
                if (checkCalls === 1) {
                    return deferred.promise;
                }
                return makeFreeSpace("D:\\Drive", 50, 100);
            }),
            resume: vi.fn(async () => {}),
            verify: vi.fn(async () => {}),
            getTorrentDetails: vi.fn(async () =>
                makeTorrent({
                    id: baseTorrent.id,
                    hash: baseTorrent.hash,
                    state: "downloading",
                    leftUntilDone: 0,
                }),
            ),
        };

        const envelope = makeEnvelope();
        const classification: MissingFilesClassification = {
            kind: "volumeLoss",
            confidence: "unknown",
            path: "D:\\Drive",
            root: "D:",
            recommendedActions: deriveRecommendedActions("volumeLoss"),
        };

        const run1 = recoverMissingFiles({
            client: client as EngineAdapter,
            torrent: baseTorrent,
            envelope,
            classification,
            engineCapabilities: DEFAULT_ENGINE_CAPABILITIES,
        });
        const run2 = recoverMissingFiles({
            client: client as EngineAdapter,
            torrent: baseTorrent,
            envelope,
            classification,
            engineCapabilities: DEFAULT_ENGINE_CAPABILITIES,
        });
        deferred.resolve(makeFreeSpace("D:\\Drive", 50, 100));
        const [res1, res2] = await Promise.all([run1, run2]);
        expect(res1).toStrictEqual(res2);
    });

    it("retry-only runs availability reprobe without touching verify/resume/location", async () => {
        const client: Partial<EngineAdapter> = {
            checkFreeSpace: vi.fn(async () => makeFreeSpace("D:\\Drive", 512, 1024)),
            resume: vi.fn(async () => {}),
            verify: vi.fn(async () => {}),
            setTorrentLocation: vi.fn(async () => {}),
        };
        const envelope = makeEnvelope();
        const classification: MissingFilesClassification = {
            kind: "volumeLoss",
            confidence: "unknown",
            path: "D:\\Drive",
            root: "D:",
            recommendedActions: deriveRecommendedActions("volumeLoss"),
        };
        const result = await recoverMissingFiles({
            client: client as EngineAdapter,
            torrent: baseTorrent,
            envelope,
            classification,
            engineCapabilities: DEFAULT_ENGINE_CAPABILITIES,
            options: { retryOnly: true },
        });
        expect(result.status).toBe("noop");
        expect(client.verify).not.toHaveBeenCalled();
        expect(client.resume).not.toHaveBeenCalled();
        expect(client.setTorrentLocation).not.toHaveBeenCalled();
    });

    it("forces setTorrentLocation even when the path is unchanged", async () => {
        const setLocation = vi.fn(async () => {});
        const client: Partial<EngineAdapter> = {
            checkFreeSpace: vi.fn(async () => makeFreeSpace("D:\\Drive", 200000, 400000)),
            resume: vi.fn(async () => {}),
            verify: vi.fn(async () => {}),
            setTorrentLocation: setLocation,
        };
        const envelope = makeEnvelope();
        const classification: MissingFilesClassification = {
            kind: "pathLoss",
            confidence: "likely",
            path: "D:\\Drive",
            root: "D:",
            recommendedActions: deriveRecommendedActions("pathLoss"),
        };
        await recoverMissingFiles({
            client: client as EngineAdapter,
            torrent: baseTorrent,
            envelope,
            classification,
            engineCapabilities: DEFAULT_ENGINE_CAPABILITIES,
        });
        expect(setLocation).toHaveBeenCalledWith("torrent-1", "D:\\Drive\\", false);
    });

    it("forces setTorrentLocation using POSIX separators for POSIX paths", async () => {
        const setLocation = vi.fn(async () => {});
        const client: Partial<EngineAdapter> = {
            checkFreeSpace: vi.fn(async () => makeFreeSpace("/mnt/downloads", 200000, 400000)),
            resume: vi.fn(async () => {}),
            verify: vi.fn(async () => {}),
            setTorrentLocation: setLocation,
            getTorrentDetails: vi.fn(async () =>
                makeTorrent({
                    id: "torrent-1",
                    hash: "hash-1",
                    state: "downloading",
                    leftUntilDone: 0,
                    downloadDir: "/mnt/downloads",
                    savePath: "/mnt/downloads",
                }),
            ),
        };
        const envelope = makeEnvelope();
        const classification: MissingFilesClassification = {
            kind: "pathLoss",
            confidence: "likely",
            path: "/mnt/downloads",
            root: "/",
            recommendedActions: deriveRecommendedActions("pathLoss"),
        };
        await recoverMissingFiles({
            client: client as EngineAdapter,
            torrent: makeTorrent({
                id: "torrent-1",
                hash: "hash-1",
                downloadDir: "/mnt/downloads",
                savePath: "/mnt/downloads",
                leftUntilDone: 1000,
            }),
            envelope,
            classification,
            engineCapabilities: DEFAULT_ENGINE_CAPABILITIES,
        });
        expect(setLocation).toHaveBeenCalledWith("torrent-1", "/mnt/downloads/", false);
    });

    it("returns blocking outcome when free-space probing is unsupported", async () => {
        const client: Partial<EngineAdapter> = {
            resume: vi.fn(async () => {}),
        };
        const envelope = makeEnvelope();
        const classification: MissingFilesClassification = {
            kind: "volumeLoss",
            confidence: "unknown",
            path: "D:\\Drive",
            root: "D:",
            recommendedActions: deriveRecommendedActions("volumeLoss"),
        };
        const result = await recoverMissingFiles({
            client: client as EngineAdapter,
            torrent: baseTorrent,
            envelope,
            classification,
            engineCapabilities: DEFAULT_ENGINE_CAPABILITIES,
        });
        expect(result.status).toBe("needsModal");
        if (result.status !== "needsModal") {
            throw new Error("expected_needs_modal");
        }
        expect(result.blockingOutcome.message).toBe("free_space_check_not_supported");
    });

    it("re-uses minimal sequence after setTorrentLocation", async () => {
        const verify = vi.fn(async () => {});
        const resume = vi.fn(async () => {});
        const setLocation = vi.fn(async () => {});
        const getTorrentDetails = vi.fn(async () =>
            makeTorrent({
                id: baseTorrent.id,
                hash: baseTorrent.hash,
                state: "downloading",
                leftUntilDone: 0,
                downloadDir: "C:\\Missing",
                savePath: "C:\\Missing",
            }),
        );
        const client: Partial<EngineAdapter> = {
            checkFreeSpace: vi.fn(async () => makeFreeSpace("C:\\Missing", 2048, 4096)),
            resume,
            verify,
            setTorrentLocation: setLocation,
            getTorrentDetails,
        };
        const envelope = makeEnvelope();
        const classification: MissingFilesClassification = {
            kind: "pathLoss",
            confidence: "unknown",
            path: "C:\\Missing",
            recommendedActions: deriveRecommendedActions("pathLoss"),
        };
        const result = await recoverMissingFiles({
            client: client as EngineAdapter,
            torrent: makeTorrent({
                ...baseTorrent,
                state: "missing_files",
                downloadDir: "C:\\Missing",
                savePath: "C:\\Missing",
                leftUntilDone: 1000,
            }),
            envelope,
            classification,
            engineCapabilities: DEFAULT_ENGINE_CAPABILITIES,
        });
        expect(result.status).toBe("resolved");
        expect(setLocation).toHaveBeenCalled();
        expect(verify).toHaveBeenCalled();
        expect(resume).toHaveBeenCalled();
    });

    it("fast-path returns all_verified_resuming when verify finishes with zero left", async () => {
        const verify = vi.fn(async () => {});
        const resume = vi.fn(async () => {});
        const getTorrentDetails = vi.fn(async () =>
            makeTorrent({
                id: baseTorrent.id,
                hash: baseTorrent.hash,
                state: "downloading",
                leftUntilDone: 0,
                downloadDir: "C:\\Missing",
                savePath: "C:\\Missing",
            }),
        );
        const client: Partial<EngineAdapter> = {
            checkFreeSpace: vi.fn(async () => makeFreeSpace("C:\\Missing", 2048, 4096)),
            resume,
            verify,
            getTorrentDetails,
        };
        const envelope = makeEnvelope();
        const classification: MissingFilesClassification = {
            kind: "pathLoss",
            confidence: "unknown",
            path: "C:\\Missing",
            recommendedActions: deriveRecommendedActions("pathLoss"),
        };
        const result = await recoverMissingFiles({
            client: client as EngineAdapter,
            torrent: makeTorrent({
                ...baseTorrent,
                state: "missing_files",
                downloadDir: "C:\\Missing",
                savePath: "C:\\Missing",
                leftUntilDone: 1000,
            }),
            envelope,
            classification,
            engineCapabilities: DEFAULT_ENGINE_CAPABILITIES,
        });
        expect(result.status).toBe("resolved");
        if (result.status !== "resolved") {
            throw new Error("expected_resolved");
        }
        expect(result.log).toBe("all_verified_resuming");
        expect(verify).toHaveBeenCalled();
        expect(resume).toHaveBeenCalled();
    });

    it("does not auto-resume when verify exits into paused state", async () => {
        const verify = vi.fn(async () => {});
        const resume = vi.fn(async () => {});
        const getTorrentDetails = vi.fn(async () =>
            makeTorrent({
                id: baseTorrent.id,
                hash: baseTorrent.hash,
                state: "paused",
                leftUntilDone: 640,
                downloadDir: "C:\\Missing",
                savePath: "C:\\Missing",
            }),
        );
        const client: Partial<EngineAdapter> = {
            checkFreeSpace: vi.fn(async () => makeFreeSpace("C:\\Missing", 2048, 4096)),
            resume,
            verify,
            getTorrentDetails,
        };
        const envelope = makeEnvelope();
        const classification: MissingFilesClassification = {
            kind: "pathLoss",
            confidence: "unknown",
            path: "C:\\Missing",
            recommendedActions: deriveRecommendedActions("pathLoss"),
        };
        const result = await recoverMissingFiles({
            client: client as EngineAdapter,
            torrent: makeTorrent({
                ...baseTorrent,
                state: "missing_files",
                downloadDir: "C:\\Missing",
                savePath: "C:\\Missing",
                leftUntilDone: 1000,
            }),
            envelope,
            classification,
            engineCapabilities: DEFAULT_ENGINE_CAPABILITIES,
        });
        expect(result.status).toBe("resolved");
        if (result.status !== "resolved") {
            throw new Error("expected_resolved");
        }
        expect(result.log).toBe("verify_completed_paused");
        expect(verify).toHaveBeenCalled();
        expect(resume).not.toHaveBeenCalled();
    });
});
