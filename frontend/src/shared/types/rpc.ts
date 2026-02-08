import { STATUS } from "@/shared/status";

// Canonical connection status type derived from the shared STATUS map.
export type ConnectionStatus =
    (typeof STATUS.connection)[keyof typeof STATUS.connection];

export const normalizeRpcStatus = (s: string): ConnectionStatus => {
    switch (s) {
        case "connected":
            return STATUS.connection.CONNECTED;
        case "idle":
            return STATUS.connection.IDLE;
        case "error":
            return STATUS.connection.ERROR;
        default:
            return (STATUS.connection as any).OFFLINE ?? STATUS.connection.IDLE;
    }
};

export type ReportTransportErrorFn = (error?: unknown) => void;
export type ReportCommandErrorFn = (error?: unknown) => void;
export type ReportReadErrorFn = (error?: unknown) => void;

export type RpcConnectionAction = "probe" | "reconnect";

export type RpcConnectionOutcome =
    | { status: "connected"; action: RpcConnectionAction }
    | {
          status: "failed";
          action: RpcConnectionAction;
          reason: "probe_failed" | "reconnect_failed";
      };
