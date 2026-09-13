import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import { readFile } from 'node:fs/promises';
import { fileURLToPath, URL } from 'node:url';

/**
 * MapLibre bestimmt die Adresse seines Workers erst zur Laufzeit
 * (`new URL('./maplibre-gl-worker.mjs', import.meta.url)`). Weil der Name aus
 * einer Variablen kommt, sieht der Bundler die Referenz nicht und legt die
 * Datei nicht ins Build -- die Karte bleibt dann leer, und der Fehler lautet
 * irrefuehrend "non-JavaScript MIME type", weil der Einzelseiten-Rueckfall die
 * index.html ausliefert.
 *
 * Beide Dateien behalten ihren Namen und liegen neben dem Hauptbundle: Der
 * Worker importiert `./maplibre-gl-shared.mjs` relativ zu sich selbst.
 */
const maplibreWorkerAssets = (): Plugin => {
  const files = ['maplibre-gl-worker.mjs', 'maplibre-gl-shared.mjs'];

  return {
    name: 'maplibre-worker-assets',
    apply: 'build',
    async generateBundle() {
      for (const file of files) {
        const source = await readFile(
          fileURLToPath(new URL(`./node_modules/maplibre-gl/dist/${file}`, import.meta.url)),
          'utf8',
        );

        this.emitFile({ type: 'asset', fileName: `assets/${file}`, source });
      }
    },
  };
};

export default defineConfig({
  plugins: [react(), maplibreWorkerAssets()],
  root: 'src/frontend',
  // MapLibre parst Kacheln und GeoJSON in einem Web Worker. Der Dependency-
  // Optimizer zerlegt diesen Worker, wodurch Kacheln zwar geladen, aber nie
  // gerendert werden (leere Karte, 'load' feuert nie).
  optimizeDeps: { exclude: ['maplibre-gl'] },
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
