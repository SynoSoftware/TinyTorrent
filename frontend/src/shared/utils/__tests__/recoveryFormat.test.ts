import { describe, expect, it } from "vitest";
import type { TFunction } from "i18next";
import { formatRecoveryTooltip } from "../recoveryFormat";
import type { ErrorEnvelope, RecoveryState } from "@/services/rpc/entities";

describe("formatRecoveryTooltip", () => {
    it("does not duplicate identical parts", () => {
        const envelope: ErrorEnvelope = {
            errorClass: "missingFiles",
            errorMessage: null,
            lastErrorAt: null,
            recoveryState: "missing_files" as RecoveryState,
            recoveryActions: [],
        };
        const t = ((_: string) => "Missing files") as TFunction;
        const tooltip = formatRecoveryTooltip(envelope, t);
        expect(tooltip).toBe("Missing files");
    });
});
