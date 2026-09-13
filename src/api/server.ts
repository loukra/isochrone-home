import express from 'express';
import { isDomainError } from '../domain/models/errors.js';
import { loadConfig } from '../infrastructure/configuration/config.js';
import { createContainer } from '../infrastructure/configuration/container.js';
import { errorHandler } from './error-handler.js';
import { createApiRouter } from './routes/index.js';

export const createApp = (config = loadConfig()): express.Express => {
  const container = createContainer(config);

  const app = express();
  app.use(express.json({ limit: '256kb' }));
  app.use('/api', createApiRouter(container));
  app.use(errorHandler);

  return app;
};

const start = (): void => {
  try {
    const config = loadConfig();
    const app = createApp(config);

    app.listen(config.port, () => {
      console.log(`Location Optimizer API läuft auf http://localhost:${config.port}`);
      console.log(`Strategie: ${config.analysisStrategy}`);
    });
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
