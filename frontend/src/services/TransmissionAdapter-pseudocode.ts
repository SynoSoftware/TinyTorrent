// ... imports
import { TransmissionRpcTransport } from "./transport";

export class TransmissionAdapter implements EngineAdapter {
    // Replace the raw fetch logic with your new Layer
    private transport: TransmissionRpcTransport;

    constructor(options: any) {
        this.transport = new TransmissionRpcTransport(options.endpoint, {
            user: options.username,
            pass: options.password,
        });
        // ... heartbeat setup
    }

    // New "send" method is now a thin wrapper around the transport
    private async send<T>(
        payload: { method: string; arguments?: any },
        schema: z.ZodSchema<T>
    ): Promise<T> {
        // 1. Delegate to the Transport Layer
        // Note: We can pass a flag for read-only methods to enable caching
        const isReadOnly =
            payload.method.startsWith("torrent-get") ||
            payload.method === "session-stats";

        const rawResult = await this.transport.request(
            payload.method,
            payload.arguments,
            { cache: isReadOnly } // Transport handles the caching logic now
        );

        // 2. Adapter Layer only handles Validation/Normalization
        return schema.parse(rawResult);
    }

    // ... The rest of the methods (getTorrents, addTorrent) remain the same,
    // ... but they now benefit from the architecture automatically.
}
