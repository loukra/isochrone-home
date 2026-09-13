import express from 'express';
import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { isDomainError } from '../domain/models/errors.js';
import { loadConfig } from '../infrastructure/configuration/config.js';
import { createContainer } from '../infrastructure/configuration/container.js';
import { errorHandler } from './error-handler.js';
import { createApiRouter } from './routes/index.js';

/**
 * Die gebaute Oberfläche wird relativ zu dieser Datei gesucht, nicht zum
 * Arbeitsverzeichnis: Die Mac-App startet den Server aus dem Programmordner
 * heraus, dort läge `dist/` nirgends.
 */
const frontendDirectory = join(
  dirname(fileURLToPath(import.meta.url)),
  '..',
  '..',
  'dist',
  'frontend',
);

/** Zeile, an der die Mac-App den tatsächlich vergebenen Port abliest. */
const READY_PREFIX = 'location-optimizer:ready';

export const createApp = (config = loadConfig()): express.Express => {
  const container = createContainer(config);

  const app = express();
  app.use(express.json({ limit: '256kb' }));
  app.use('/api', createApiRouter(container));

  // Im Entwicklungsbetrieb liefert Vite die Oberfläche aus. Existiert ein Build,
  // übernimmt der Server das selbst -- dann genügt ein Prozess ohne Proxy, und
  // genau davon lebt die Mac-App.
  if (existsSync(frontendDirectory)) {
    app.use(express.static(frontendDirectory));

    // Einzelseite: Jeder unbekannte Pfad bekommt die index.html. Bewusst als
    // Middleware statt als Route -- Express 5 kennt kein blosses '*' mehr.
    app.use((request, response, next) => {
      if (request.method !== 'GET' || request.path.startsWith('/api/')) {
        next();
        return;
      }

      response.sendFile(join(frontendDirectory, 'index.html'));
    });
  }

  app.use(errorHandler);

  return app;
};

/**
 * Stirbt die Mac-App, schliesst das Betriebssystem die Pipe auf `stdin` -- auch
 * bei "Sofort beenden", wo die App selbst nichts mehr aufräumen könnte. Ohne das
 * bliebe ein Node-Prozess zurück, der den Port belegt und beim nächsten Start
 * wortlos im Weg steht.
 *
 * Nur aktiv, wenn die App es anfordert: Im Terminal ist `stdin` ein Endgerät,
 * das nie ein `end` schickt, und unter `npm run dev` wäre ein Abbruch daran eine
 * Überraschung.
 */
const exitWhenParentDies = (): void => {
  if (process.env['LOCATION_OPTIMIZER_PARENT_PIPE'] !== '1') return;

  const quit = (): void => {
    process.exit(0);
  };

  process.stdin.on('end', quit);
  process.stdin.on('close', quit);
  process.stdin.on('error', quit);
  process.stdin.resume();
};

const start = (): void => {
  try {
    const config = loadConfig();
    const app = createApp(config);

    const server = app.listen(config.port, () => {
      const address = server.address();

      // Express 5 ruft diesen Rückruf auch dann auf, wenn der Bind gescheitert
      // ist -- erkennbar einzig daran, dass address() null liefert; der
      // EADDRINUSE-Fehler folgt erst danach. Ohne diese Prüfung meldete der
      // Server Bereitschaft auf einem Port, auf dem ein *fremder* Prozess
      // lauscht, und die Mac-App zeigte dessen Oberfläche statt dieser hier.
      if (address === null || typeof address !== 'object') return;

      // Die maschinenlesbare Zeile zuerst: Bei PORT=0 erfährt erst hier jemand,
      // welchen Port das Betriebssystem vergeben hat.
      console.log(`${READY_PREFIX} ${address.port}`);
      console.log(`Location Optimizer API läuft auf http://localhost:${address.port}`);
      console.log(`Strategie: ${config.analysisStrategy}`);
    });

    // Ohne eigenen Handler endet ein belegter Port in einem Stapelauszug. Die
    // Mac-App zeigt genau diesen Text im Fehlerdialog -- er muss also erklären,
    // was zu tun ist.
    server.on('error', (error: NodeJS.ErrnoException) => {
      if (error.code === 'EADDRINUSE') {
        console.error(
          `\nPort ${config.port} ist bereits belegt.\n` +
            'Vermutlich läuft die App oder ein Server bereits. Beende ihn und ' +
            'versuche es erneut.\n',
        );
        process.exit(1);
      }

      throw error;
    });

    exitWhenParentDies();
  } catch (error) {
    if (isDomainError(error) && error.code === 'CONFIGURATION_ERROR') {
      console.error(`\nKonfigurationsfehler: ${error.message}`);
      if (error.details !== undefined) console.error(error.details);
      console.error('');
      process.exit(1);
    }
    throw error;
  }
};

// Nur starten, wenn direkt ausgeführt -- nicht beim Import in Tests.
if (process.argv[1]?.includes('server')) {
  start();
}
