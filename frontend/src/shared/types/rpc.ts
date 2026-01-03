export type RpcStatus = "idle" | "connected" | "error";

export type ReportTransportErrorFn = (error?: unknown) => void;
export type ReportCommandErrorFn = (error?: unknown) => void;
export type ReportReadErrorFn = (error?: unknown) => void;
