import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath, URL } from 'node:url';

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  server: {
    port: 5173,
    host: true, // aceita conexões externas (túnel)
    allowedHosts: ['.trycloudflare.com', '.loca.lt', '.ngrok-free.app', '.ngrok.io'],
    proxy: {
      '/api': { target: 'http://localhost:3001', changeOrigin: true },
      '/uploads': { target: 'http://localhost:3001', changeOrigin: true },
      '/ws': { target: 'http://localhost:3001', ws: true },
    },
  },
});
