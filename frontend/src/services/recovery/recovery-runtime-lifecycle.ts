import { resetNormalizerRuntimeState } from "@/services/rpc/normalizers";
import { resetRecoveryAutomationRuntimeState } from "@/services/rpc/recoveryAutomation";
import { resetRecoveryControllerState } from "@/services/recovery/recovery-controller";
import { resetMissingFilesStore } from "@/services/recovery/missingFilesStore";

/**
 * Session-boundary owner for mutable recovery/normalization runtime state.
 * Lifecycle: per RPC client session.
 */
export function resetRecoveryRuntimeSessionState() {
    resetRecoveryAutomationRuntimeState();
    resetNormalizerRuntimeState();
    resetRecoveryControllerState();
    resetMissingFilesStore();
}
