import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath, URL } from 'node:url';

export default defineConfig({
  plugins: [react()],
  root: 'src/frontend',
  publicDir: false,
  resolve: {
    alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
  },
  server: {
    port: 5173,
    proxy: {
      // Regex, damit nur echte API-Pfade (/api/...) proxied werden und nicht
      // z. B. das Frontend-Modul /api.ts.
      '^/api/': { target: 'http://localhost:3001', changeOrigin: true },
    },
  },
  build: { outDir: '../../dist/frontend', emptyOutDir: true },
});
