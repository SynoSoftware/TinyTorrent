import { describe, expect, it } from "vitest";
import type { TFunction } from "i18next";
import {
    formatPrimaryActionHintFromClassification,
    formatRecoveryTooltip,
} from "@/shared/utils/recoveryFormat";
import type { ErrorEnvelope } from "@/services/rpc/entities";
import type { MissingFilesClassification } from "@/services/recovery/recovery-controller";

describe("formatRecoveryTooltip", () => {
    it("does not duplicate identical parts", () => {
        const envelope: ErrorEnvelope = {
            errorClass: "missingFiles",
            errorMessage: null,
            lastErrorAt: null,
            recoveryState: "needsUserAction",
            recoveryActions: [],
        };
        const t = ((key: string) =>
            key ? "Missing files" : "Missing files") as TFunction;
        const tooltip = formatRecoveryTooltip(envelope, t);
        expect(tooltip).toBe("Missing files");
    });
});

describe("formatPrimaryActionHintFromClassification", () => {
    it("resolves modern recovery action keys like locate", () => {
        const classification: MissingFilesClassification = {
            kind: "pathLoss",
            confidence: "certain",
            path: "c:\\temp",
            recommendedActions: ["locate"],
        };
        const dict: Record<string, string> = {
            "recovery.hint.locate": "Needs file relocation",
            "recovery.hint.unknown": "See details",
        };
        const t = ((key: string) => dict[key] ?? key) as TFunction;
        const hint = formatPrimaryActionHintFromClassification(classification, t);
        expect(hint).toBe("Needs file relocation");
    });

    it("falls back to recovery.hint.unknown when action translation is missing", () => {
        const classification: MissingFilesClassification = {
            kind: "volumeLoss",
            confidence: "likely",
            path: "c:\\temp",
            recommendedActions: ["retry"],
        };
        const dict: Record<string, string> = {
            "recovery.hint.unknown": "See details",
        };
        const t = ((key: string) => dict[key] ?? key) as TFunction;
        const hint = formatPrimaryActionHintFromClassification(classification, t);
        expect(hint).toBe("See details");
    });
});
