import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "path";

export default defineConfig({
    plugins: [react()],
    resolve: {
        alias: {
            "@": path.resolve(__dirname, "src"),
        },
    },
    server: {
        fs: {
            allow: [".."],
        },
        proxy: {
            // Explicit RPC proxy to avoid CORS during development. Keep the
            // broader `/transmission` proxy for other resources.
            "/transmission/rpc": {
                target: "http://localhost:9091",
                changeOrigin: true,
                secure: false,
                ws: true,
            },
            "/transmission": {
                target: "http://localhost:9091", // Points to your installed daemon
                changeOrigin: true,
            },
        },
    },
    build: {
        chunkSizeWarningLimit: 3000,
        cssCodeSplit: false,
        rollupOptions: {
            output: {
                manualChunks() {
                    return "bundle";
                },
            },
        },
    },
    test: {
        // Use the same DOM-like environment as the project tests expect
        environment: "happy-dom",
        // Only run tests placed under `__tests__` to avoid legacy manual runners
        include: [
            "src/**/__tests__/**/*.test.ts",
            "src/**/__tests__/**/*.spec.ts",
        ],
    },
} as any);
