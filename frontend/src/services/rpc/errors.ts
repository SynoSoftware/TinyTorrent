export class RpcCommandError extends Error {
    public readonly code?: string;

    constructor(message: string, code?: string) {
        super(message);
        this.code = code;
        this.name = "RpcCommandError";
    }
}

export const isRpcCommandError = (
    value: unknown
): value is RpcCommandError => value instanceof RpcCommandError;
