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
});
