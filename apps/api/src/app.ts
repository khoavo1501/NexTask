import cors from 'cors';
import express, { type Express, type Request } from 'express';
import helmet from 'helmet';
import { Types, type Connection } from 'mongoose';
import { pinoHttp } from 'pino-http';
import type { Logger } from './lib/logger.js';
import { createDemoOwnerMiddleware } from './middleware/demo-owner.js';
import { createErrorHandler, notFoundHandler } from './middleware/error-handler.js';
import { requestId } from './middleware/request-id.js';
import { createBoardsRouter } from './modules/boards/board.router.js';
import { createHealthRouter } from './modules/health/health.router.js';

export interface AppDependencies {
  connection: Connection;
  expectedReplicaSet: string;
  version: string;
  corsOrigin: string;
  logger: Logger;
  demoOwnerId: string;
}

export function createApp(deps: AppDependencies): Express {
  const app = express();
  const demoOwnerId = new Types.ObjectId(deps.demoOwnerId);
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
  app.use('/api/v1/boards', createDemoOwnerMiddleware(demoOwnerId), createBoardsRouter());

  app.use(notFoundHandler);
  app.use(createErrorHandler(deps.logger));
  return app;
}
