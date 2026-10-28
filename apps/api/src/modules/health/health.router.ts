import type { HealthResponse } from '@nextask/contracts';
import { Router } from 'express';
import type { Connection } from 'mongoose';
import { checkHealth } from './health.service.js';

interface HealthRouterOptions {
  connection: Connection;
  expectedReplicaSet: string;
  version: string;
}

export function createHealthRouter({
  connection,
  expectedReplicaSet,
  version,
}: HealthRouterOptions): Router {
  const router = Router();

  router.get('/', async (request, response) => {
    const data = await checkHealth(connection, expectedReplicaSet, version);
    const body: HealthResponse = {
      data,
      meta: { requestId: request.requestId },
    };
    response.status(data.status === 'ok' ? 200 : 503).json(body);
  });

  return router;
}
