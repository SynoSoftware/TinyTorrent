import { status } from "@/shared/status";
import type { ConnectionStatus } from "@/shared/status";
export type { ConnectionStatus } from "@/shared/status";

export const normalizeRpcStatus = (s: string): ConnectionStatus => {
    switch (s) {
        case status.connection.connected:
            return status.connection.connected;
        case status.connection.idle:
            return status.connection.idle;
        case status.connection.error:
            return status.connection.error;
        default:
            return status.connection.offline ?? status.connection.idle;
    }
};

export type ReportTransportErrorFn = (error?: unknown) => void;
export type ReportCommandErrorFn = (error?: unknown) => void;
export type ReportReadErrorFn = (error?: unknown) => void;

export type RpcConnectionAction = "probe" | "reconnect";

export type RpcConnectionOutcome =
    | {
          status: "connected";
          action: RpcConnectionAction;
      }
    | {
          status: "failed";
          action: RpcConnectionAction;
          reason: "probe_failed" | "reconnect_failed";
      };
