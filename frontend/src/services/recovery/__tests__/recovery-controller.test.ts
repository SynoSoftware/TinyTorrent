import { describe, it, expect } from "vitest";
import {
    planRecovery,
    runMissingFilesRecovery,
} from "@/services/recovery/recovery-controller";

describe("recovery-controller planRecovery", () => {
    it("plans missingFiles when envelope says missingFiles and suggests path when detail has downloadDir", () => {
        const envelope = { errorClass: "missingFiles" } as any;
        const detail = { downloadDir: "/tmp/foo" } as any;
        const plan = planRecovery(envelope, detail);
        expect(plan.primaryAction).toBe("reDownloadHere");
        expect(plan.requiresPath).toBe(false);
        expect(plan.suggestedPath).toBe("/tmp/foo");
    });

    it("plans pickPath when permissionDenied", () => {
        const p = planRecovery(
            { errorClass: "permissionDenied" } as any,
            {} as any
        );
        expect(p.primaryAction).toBe("pickPath");
        expect(p.requiresPath).toBe(true);
    });
});

describe("recovery-controller runMissingFilesRecovery", () => {
    it("returns path-needed if no downloadDir", async () => {
        const res = await runMissingFilesRecovery({
            client: {} as any,
            detail: {} as any,
        });
        expect(res.kind).toBe("path-needed");
    });

    it("interprets ENOENT via error.code and returns path-needed when createDirectory absent", async () => {
        const client = {
            checkFreeSpace: async (_: string) => {
                const e: any = new Error("no such file");
                e.code = "ENOENT";
                throw e;
            },
        } as any;
        const detail = { downloadDir: "/missing" } as any;
        const res = await runMissingFilesRecovery({ client, detail });
        expect(res.kind).toBe("path-needed");
        // reason may be missing; ensure message present
        expect(res.message).toBeTruthy();
    });

    it("interprets ENOSPC as disk-full", async () => {
        const client = {
            checkFreeSpace: async (_: string) => {
                const e: any = new Error("no space");
                e.code = "ENOSPC";
                throw e;
            },
        } as any;
        const detail = { downloadDir: "/dest" } as any;
        const res = await runMissingFilesRecovery({ client, detail });
        expect(res.kind).toBe("path-needed");
        expect((res as any).reason).toBe("disk-full");
    });

    it("returns resolved when free space check passes", async () => {
        const client = {
            checkFreeSpace: async (_: string) => ({ free: 1000 }),
        } as any;
        const detail = { downloadDir: "/dest" } as any;
        const res = await runMissingFilesRecovery({ client, detail });
        expect(res.kind).toBe("resolved");
        expect(res.message).toBe("path_ready");
    });

    it("returns resolved when directory is created successfully", async () => {
        const client = {
            checkFreeSpace: async (_: string) => {
                const e: any = new Error("no such file");
                e.code = "ENOENT";
                throw e;
            },
            createDirectory: async (_: string) => {},
        } as any;
        const detail = { downloadDir: "/missing" } as any;
        const res = await runMissingFilesRecovery({ client, detail });
        expect(res.kind).toBe("resolved");
        expect(res.message).toBe("directory_created");
    });

    it("returns resolved when checkFreeSpace not supported", async () => {
        const client = {} as any;
        const detail = { downloadDir: "/dest" } as any;
        const res = await runMissingFilesRecovery({ client, detail });
        expect(res.kind).toBe("resolved");
        expect(res.message).toBe("filesystem_probing_not_supported");
    });
});
