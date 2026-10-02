import path from "path";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  server: {
    port: Number(process.env.WEB_PORT || 3000),
    strictPort: true,
    host: "127.0.0.1",
    proxy: {
      "/api": {
        target:
          "http://127.0.0.1:" +
          Number(process.env.PROXY_PORT || process.env.PORT || 8787),
        changeOrigin: true,
      },
    },
  },
  plugins: [react()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "."),
    },
  },
});
