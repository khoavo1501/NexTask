import cors from 'cors';
import express, { type Express, type Request } from 'express';
import helmet from 'helmet';
import type { Connection } from 'mongoose';
import { pinoHttp } from 'pino-http';
import type { Logger } from './lib/logger.js';
import { createErrorHandler, notFoundHandler } from './middleware/error-handler.js';
import { requestId } from './middleware/request-id.js';
import { createHealthRouter } from './modules/health/health.router.js';

export interface AppDependencies {
  connection: Connection;
  expectedReplicaSet: string;
  version: string;
  corsOrigin: string;
  logger: Logger;
}

export function createApp(deps: AppDependencies): Express {
  const app = express();
  app.disable('x-powered-by');
  app.use(helmet());
  app.use(cors({ origin: deps.corsOrigin, credentials: true }));
  app.use(express.json({ limit: '1mb' }));
  app.use(requestId);
  app.use(
    pinoHttp({
      logger: deps.logger,
      genReqId: (request) => (request as unknown as Request).requestId,
    }),
  );

  app.use(
    '/api/v1/health',
    createHealthRouter({
      connection: deps.connection,
      expectedReplicaSet: deps.expectedReplicaSet,
      version: deps.version,
    }),
  );

  app.use(notFoundHandler);
  app.use(createErrorHandler(deps.logger));
  return app;
}
