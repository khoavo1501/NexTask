import cookieParser from 'cookie-parser';
import cors from 'cors';
import express, { type Express, type Request } from 'express';
import helmet from 'helmet';
import type { Connection } from 'mongoose';
import { pinoHttp } from 'pino-http';
import type { Logger } from './lib/logger.js';
import { createOriginGuard } from './middleware/origin-guard.js';
import { createErrorHandler, notFoundHandler } from './middleware/error-handler.js';
import { requestId } from './middleware/request-id.js';
import { createAuthenticate } from './modules/auth/auth.middleware.js';
import { createAuthRouter } from './modules/auth/auth.router.js';
import { createBoardsRouter } from './modules/boards/board.router.js';
import { createHealthRouter } from './modules/health/health.router.js';
import { createInvitationsRouter } from './modules/invitations/invitation.router.js';

export interface AppDependencies {
  connection: Connection;
  expectedReplicaSet: string;
  version: string;
  corsOrigin: string;
  logger: Logger;
  jwtSecret: string;
  cookieSecure: boolean;
  authRateLimitMax: number;
}

export function createApp(deps: AppDependencies): Express {
  const app = express();
  const authenticate = createAuthenticate(deps.jwtSecret);
  app.disable('x-powered-by');
  app.use(helmet());
  app.use(cors({ origin: deps.corsOrigin, credentials: true }));
  app.use(express.json({ limit: '1mb' }));
  app.use(cookieParser());
  app.use(requestId);
  app.use(
    pinoHttp({
      logger: deps.logger,
      genReqId: (request) => (request as unknown as Request).requestId,
    }),
  );
  app.use(createOriginGuard(deps.corsOrigin));

  app.use(
    '/api/v1/health',
    createHealthRouter({
      connection: deps.connection,
      expectedReplicaSet: deps.expectedReplicaSet,
      version: deps.version,
    }),
  );
  app.use(
    '/api/v1/auth',
    createAuthRouter({
      jwtSecret: deps.jwtSecret,
      cookieSecure: deps.cookieSecure,
      authRateLimitMax: deps.authRateLimitMax,
    }),
  );
  app.use('/api/v1/boards', authenticate, createBoardsRouter());
  app.use('/api/v1/invitations', authenticate, createInvitationsRouter());

  app.use(notFoundHandler);
  app.use(createErrorHandler(deps.logger));
  return app;
}
