import path from "path";
import fs from "node:fs";
import { execFileSync } from "node:child_process";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

const licenseFiles = ["LICENSE", "NOTICE", "THIRD_PARTY_NOTICES.md", "BUNDLED_LICENSES.txt"];
const revision = (() => {
  if (process.env.VERCEL_GIT_COMMIT_SHA) return process.env.VERCEL_GIT_COMMIT_SHA;
  try { return execFileSync("git", ["rev-parse", "HEAD"], { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim(); }
  catch { return "arch/music-learning-2026-v1-2026-09-28"; }
})();

export default defineConfig({
  optimizeDeps: { include: ["acorn", "@strudel/core", "@strudel/mini", "@strudel/tonal", "@strudel/transpiler", "@strudel/webaudio", "@strudel/draw"] },
  define: { "import.meta.env.VITE_SOURCE_REVISION": JSON.stringify(revision) },
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
  plugins: [react(), {
    name: "project-license-files",
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        const name = req.url?.split("?")[0].slice(1);
        if (!name || !licenseFiles.includes(name)) return next();
        res.setHeader("Content-Type", "text/plain; charset=utf-8");
        res.end(fs.readFileSync(path.resolve(__dirname, name)));
      });
    },
    generateBundle() {
      for (const name of licenseFiles)
        this.emitFile({ type: "asset", fileName: name, source: fs.readFileSync(path.resolve(__dirname, name), "utf8") });
    },
  }],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "."),
    },
  },
});
