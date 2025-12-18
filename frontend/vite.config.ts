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
        chunkSizeWarningLimit: 900,
        rollupOptions: {
            output: {
                manualChunks(id) {
                    if (!id.endsWith(".js")) return;
                    if (id.includes("node_modules")) {
                        if (id.includes("@heroui")) return "heroui";
                        if (id.includes("lucide-react")) return "icons";
                        if (id.includes("framer-motion")) return "motion";
                        if (id.includes("@dnd-kit")) return "drag-kit";
                        if (id.includes("@tanstack")) return "table";
                        return "vendor";
                    }
                },
            },
        },
    },
});
