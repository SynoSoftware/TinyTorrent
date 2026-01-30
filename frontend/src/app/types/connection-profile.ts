export type ConnectionScheme = "http" | "https";

export interface ConnectionProfile {
    id: string;
    label: string;
    scheme: ConnectionScheme;
    host: string;
    port: string;
    username: string;
    password: string;
}
