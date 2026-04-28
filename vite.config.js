import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      '/anilist': {
        target: 'http://localhost:8787',
        changeOrigin: true,
        secure: false,
        configure: (proxy) => {
          proxy.on('error', (err, _req, _res) => {
            console.log('[proxy:/anilist] error', err?.message || err);
          });
          proxy.on('proxyReq', (proxyReq, req, _res) => {
            console.log('[proxy:/anilist] ->', req.method, req.url, 'target:', proxyReq?.path);
          });
          proxy.on('proxyRes', (proxyRes, req, _res) => {
            console.log('[proxy:/anilist] <-', req.method, req.url, 'status:', proxyRes.statusCode);
          });
        },
        rewrite: (path) => {
          const rewritten = path.replace(/^\/anilist(?=\/|$)/, '/anilist');
          return rewritten || '/anilist';
        },
      },
      '/api': {
        target: 'http://localhost:8787',
        changeOrigin: true,
        secure: false,
      },
    },
  },
});
