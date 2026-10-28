import type { Connection } from 'mongoose';
import pino from 'pino';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createApp } from '../src/app.js';
import { connectMongo } from '../src/db/mongoose.js';
import { checkHealth } from '../src/modules/health/health.service.js';

const testUri =
  process.env.MONGODB_TEST_URI ??
  'mongodb://localhost:27017/nextask_phase0_test?directConnection=true';

const logger = pino({ level: 'silent' });
let connection: Connection;

beforeAll(async () => {
  connection = await connectMongo({ uri: testUri, logger });
});

afterAll(async () => {
  await connection.close();
});

describe('health với MongoDB thật', () => {
  it('trả ok khi replica set đúng và primary', async () => {
    const health = await checkHealth(connection, 'rs0', '0.1.0-test');
    expect(health.status).toBe('ok');
    expect(health.checks.mongo.replicaSet).toBe('rs0');
    expect(health.checks.mongo.primary).toBe(true);
    expect(health.checks.mongo.latencyMs).toBeGreaterThanOrEqual(0);
  });

  it('trả degraded khi tên replica set không khớp', async () => {
    const health = await checkHealth(connection, 'rs-other', '0.1.0-test');
    expect(health.status).toBe('degraded');
    expect(health.checks.mongo.reason).toBe('replica_set_mismatch');
  });

  it('GET /api/v1/health trả envelope và request id', async () => {
    const app = createApp({
      connection,
      expectedReplicaSet: 'rs0',
      version: '0.1.0-test',
      corsOrigin: 'http://localhost:3000',
      logger,
      demoOwnerId: '000000000000000000000001',
    });

    const response = await request(app).get('/api/v1/health');
    expect(response.status).toBe(200);
    expect(response.body.data.status).toBe('ok');
    expect(response.body.data.checks.mongo.replicaSet).toBe('rs0');
    expect(response.body.meta.requestId).toEqual(expect.any(String));
    expect(response.headers['x-request-id']).toBe(response.body.meta.requestId);
  });
});
