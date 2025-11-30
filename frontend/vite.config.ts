import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      "/transmission": {
        target: "http://localhost:9091", // Points to your installed daemon
        changeOrigin: true,
      },
    },
  },
});
