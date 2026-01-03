export class RpcCommandError extends Error {
    constructor(message: string, public readonly code?: string) {
        super(message);
        this.name = "RpcCommandError";
    }
}

export const isRpcCommandError = (
    value: unknown
): value is RpcCommandError => value instanceof RpcCommandError;
