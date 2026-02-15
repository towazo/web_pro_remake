import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      '/anilist': {
        target: 'https://graphql.anilist.co',
        changeOrigin: true,
        secure: true,
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
          const rewritten = path.replace(/^\/anilist(?=\/|$)/, '');
          return rewritten === '' ? '/' : rewritten;
        },
      },
    },
  },
});