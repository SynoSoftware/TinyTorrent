import { STATUS } from "@/shared/status";
import type { ConnectionStatus } from "@/shared/status";
export type { ConnectionStatus } from "@/shared/status";

export const normalizeRpcStatus = (s: string): ConnectionStatus => {
    switch (s) {
        case STATUS.connection.CONNECTED:
            return STATUS.connection.CONNECTED;
        case STATUS.connection.IDLE:
            return STATUS.connection.IDLE;
        case STATUS.connection.ERROR:
            return STATUS.connection.ERROR;
        default:
            return STATUS.connection.OFFLINE ?? STATUS.connection.IDLE;
    }
};

export type ReportTransportErrorFn = (error?: unknown) => void;
export type ReportCommandErrorFn = (error?: unknown) => void;
export type ReportReadErrorFn = (error?: unknown) => void;

export type RpcConnectionAction = "probe" | "reconnect";

export type RpcConnectionOutcome =
    | {
          status: typeof STATUS.connection.CONNECTED;
          action: RpcConnectionAction;
      }
    | {
          status: "failed";
          action: RpcConnectionAction;
          reason: "probe_failed" | "reconnect_failed";
      };
