import { describe, it, expect, beforeEach, vi } from "vitest";
import type { EngineAdapter } from "@/services/rpc/engine-adapter";
import type { ErrorEnvelope } from "@/services/rpc/entities";
import type { MissingFilesClassification } from "@/services/recovery/recovery-controller";
import {
    classifyMissingFilesState,
    recordVerifyAttempt,
    resetVerifyGuard,
    runMissingFilesRecoverySequence,
    shouldSkipVerify,
} from "@/services/recovery/recovery-controller";

describe("recovery-controller helpers", () => {
    beforeEach(() => {
        resetVerifyGuard();
    });

    it("classifies permission failures as accessDenied with likely confidence", () => {
        const envelope = {
            errorClass: "permissionDenied",
            errorMessage: "Access is denied by the operating system",
        } as ErrorEnvelope;
        const classification = classifyMissingFilesState(
            envelope,
            "C:\\Downloads",
            "unknown"
        );
        expect(classification.kind).toBe("accessDenied");
        expect(classification.confidence).toBe("likely");
        expect(classification.path).toBe("C:\\Downloads");
    });

    it("classifies missing folder errors as pathLoss", () => {
        const envelope = {
            errorClass: "missingFiles",
            errorMessage: "No such file or directory",
        } as ErrorEnvelope;
        const classification = classifyMissingFilesState(
            envelope,
            "C:\\Movies\\Avatar",
            "unknown"
        );
        expect(classification.kind).toBe("pathLoss");
        expect(classification.confidence).toBe("likely");
    });

    it("records verify attempts and skips repeat verifies", () => {
        recordVerifyAttempt("fingerprint-1", 1024);
        expect(shouldSkipVerify("fingerprint-1", 1024)).toBe(true);
        expect(shouldSkipVerify("fingerprint-1", 0)).toBe(false);
    });

    it("returns needsModal when the path is missing", async () => {
        const envelope = {
            errorClass: "missingFiles",
            errorMessage: "No such file",
        } as ErrorEnvelope;
        const torrent = {
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
            downloadDir: "C:\\Missing",
            savePath: "C:\\Missing",
        } as any;
        const classification = classifyMissingFilesState(
            envelope,
            "C:\\Missing",
            "unknown"
        );
        const client = {
            checkFreeSpace: async () => {
                const err: any = new Error("no such file");
                err.code = "ENOENT";
                throw err;
            },
        } as Partial<EngineAdapter> as EngineAdapter;
        const result = await runMissingFilesRecoverySequence({
            client,
            torrent,
            envelope,
            classification,
            serverClass: "unknown",
        });
        expect(result.status).toBe("needsModal");
        expect(result.blockingOutcome?.kind).toBe("path-needed");
    });

    const createDeferred = <T>() => {
        let resolve!: (value: T | PromiseLike<T>) => void;
        let reject!: (reason?: unknown) => void;
        const promise = new Promise<T>((res, rej) => {
            resolve = res;
            reject = rej;
        });
        return { promise, resolve, reject };
    };

    const baseTorrent = {
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
    };

    it("dedupes concurrent recovery calls using the same fingerprint", async () => {
        const deferred = createDeferred<{
            totalBytes: number;
            freeBytes: number;
        }>();
        let checkCalls = 0;
        const client: Partial<EngineAdapter> = {
            checkFreeSpace: vi.fn(async () => {
                checkCalls += 1;
                if (checkCalls === 1) {
                    return deferred.promise as any;
                }
                return { totalBytes: 100, freeBytes: 50 } as any;
            }),
            resume: vi.fn(async () => {}),
            verify: vi.fn(async () => {}),
            getTorrentDetails: vi.fn(async () => ({
                state: "downloading",
                leftUntilDone: 0,
            })) as any,
        };

        const envelope = {
            errorClass: "missingFiles",
            errorMessage: "No such file",
        } as ErrorEnvelope;
        const classification: MissingFilesClassification = {
            kind: "volumeLoss",
            confidence: "unknown",
            path: "D:\\Drive",
            root: "D:",
        };

        const run1 = runMissingFilesRecoverySequence({
            client: client as EngineAdapter,
            torrent: baseTorrent as any,
            envelope,
            classification,
            serverClass: "unknown",
        });
        const run2 = runMissingFilesRecoverySequence({
            client: client as EngineAdapter,
            torrent: baseTorrent as any,
            envelope,
            classification,
            serverClass: "unknown",
        });
        // Both calls should resolve to the same result; compare resolved values
        deferred.resolve({ totalBytes: 100, freeBytes: 50 });
        const [res1, res2] = await Promise.all([run1, run2]);
        expect(res1).toStrictEqual(res2);
    });

    it("retry-only runs availability reprobe without touching verify/resume/location", async () => {
        const client: Partial<EngineAdapter> = {
            checkFreeSpace: vi.fn(async () => ({
                totalBytes: 1024,
                freeBytes: 512,
            })) as any,
            resume: vi.fn(async () => {}),
            verify: vi.fn(async () => {}),
            setTorrentLocation: vi.fn(async () => {}),
        };
        const envelope = {
            errorClass: "missingFiles",
            errorMessage: "No such file",
        } as ErrorEnvelope;
        const classification: MissingFilesClassification = {
            kind: "volumeLoss",
            confidence: "unknown",
            path: "D:\\Drive",
            root: "D:",
        };
        const result = await runMissingFilesRecoverySequence({
            client: client as EngineAdapter,
            torrent: baseTorrent as any,
            envelope,
            classification,
            serverClass: "unknown",
            options: { retryOnly: true },
        });
        expect(result.status).toBe("noop");
        expect(client.verify).not.toHaveBeenCalled();
        expect(client.resume).not.toHaveBeenCalled();
        expect(client.setTorrentLocation).not.toHaveBeenCalled();
    });

    it("returns blocking outcome when free-space probing is unsupported", async () => {
        const client: Partial<EngineAdapter> = {
            resume: vi.fn(async () => {}),
        };
        const envelope = {
            errorClass: "missingFiles",
            errorMessage: "No such file",
        } as ErrorEnvelope;
        const classification: MissingFilesClassification = {
            kind: "volumeLoss",
            confidence: "unknown",
            path: "D:\\Drive",
            root: "D:",
        };
        const result = await runMissingFilesRecoverySequence({
            client: client as EngineAdapter,
            torrent: baseTorrent as any,
            envelope,
            classification,
            serverClass: "unknown",
        });
        expect(result.status).toBe("needsModal");
        expect(result.blockingOutcome?.message).toBe(
            "free_space_check_not_supported"
        );
    });

    it("re-uses minimal sequence after setTorrentLocation", async () => {
        const verify = vi.fn(async () => {});
        const resume = vi.fn(async () => {});
        const setLocation = vi.fn(async () => {});
        const getTorrentDetails = vi.fn(async () => ({
            state: "downloading",
            leftUntilDone: 0,
        }));
        const client: Partial<EngineAdapter> = {
            checkFreeSpace: vi.fn(async () => ({
                totalBytes: 4096,
                freeBytes: 2048,
            })) as any,
            resume,
            verify,
            setTorrentLocation: setLocation,
            getTorrentDetails: getTorrentDetails as any,
        };
        const envelope = {
            errorClass: "missingFiles",
            errorMessage: "No such file",
        } as ErrorEnvelope;
        const classification: MissingFilesClassification = {
            kind: "pathLoss",
            confidence: "unknown",
            path: "C:\\Missing",
        };
        const result = await runMissingFilesRecoverySequence({
            client: client as EngineAdapter,
            torrent: {
                ...baseTorrent,
                state: "missing_files",
                downloadDir: "C:\\Missing",
                savePath: "C:\\Missing",
                leftUntilDone: 1000,
            } as any,
            envelope,
            classification,
            serverClass: "unknown",
        });
        expect(result.status).toBe("resolved");
        expect(setLocation).toHaveBeenCalled();
        expect(verify).toHaveBeenCalled();
        expect(resume).toHaveBeenCalled();
    });

    it("fast-path returns all_verified_resuming when verify finishes with zero left", async () => {
        const verify = vi.fn(async () => {});
        const resume = vi.fn(async () => {});
        const getTorrentDetails = vi.fn(async () => ({
            state: "idle",
            leftUntilDone: 0,
        }));
        const client: Partial<EngineAdapter> = {
            checkFreeSpace: vi.fn(async () => ({
                totalBytes: 4096,
                freeBytes: 2048,
            })) as any,
            resume,
            verify,
            getTorrentDetails: getTorrentDetails as any,
        };
        const envelope = {
            errorClass: "missingFiles",
            errorMessage: "No such file",
        } as ErrorEnvelope;
        const classification: MissingFilesClassification = {
            kind: "pathLoss",
            confidence: "unknown",
            path: "C:\\Missing",
        };
        const result = await runMissingFilesRecoverySequence({
            client: client as EngineAdapter,
            torrent: {
                ...baseTorrent,
                state: "missing_files",
                downloadDir: "C:\\Missing",
                savePath: "C:\\Missing",
                leftUntilDone: 1000,
            } as any,
            envelope,
            classification,
            serverClass: "unknown",
        });
        expect(result.status).toBe("resolved");
        expect(result.log).toBe("all_verified_resuming");
        expect(verify).toHaveBeenCalled();
        expect(resume).toHaveBeenCalled();
    });
});
