// vite.config.ts
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  root: "src",
  plugins: [react()],
  resolve: {
    dedupe: ["@mantine/core", "react", "react-dom"],
  },
  build: {
    outDir: "../dist",
    emptyOutDir: true,
  },
  // Dev-only: in production nginx proxies /api to KBRD-API (see
  // kbrd-os/board/kbrd/rootfs-overlay/etc/nginx/conf.d/kbrd-web.conf) —
  // `vite build` ignores this block entirely, so it's harmless there.
  server: {
    // Vite's own default only binds the dev server to localhost — fine
    // when the browser runs on the same machine, but this is usually
    // developed inside a VM/container with the browser outside it. `true`
    // binds every interface (0.0.0.0) instead, so a forwarded/bridged port
    // can actually reach it from there.
    host: true,
    proxy: {
      "/api": {
        target: "http://127.0.0.1:8081",
        // `root: "src"` above means Vite also serves src/api/*.ts as
        // modules under the /api/... URL space (e.g. /api/workspaces.ts).
        // Without this bypass those requests would be proxied to
        // KBRD-API instead of served by Vite, and 404.
        bypass(req) {
          // Strip the query first: HMR re-requests carry a cache-busting
          // `?t=<timestamp>`, so testing the raw URL would miss them and
          // proxy the module to KBRD-API on every hot update.
          const path = req.url?.split("?", 1)[0];
          if (path?.endsWith(".ts") || path?.endsWith(".tsx")) {
            return req.url;
          }
        },
      },
    },
  },
});
