import pino from 'pino';
import request, { type Response as SupertestResponse } from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../src/app.js';
import { signSessionToken } from '../src/modules/auth/jwt.js';
import { cleanDb, connectTestDb } from './helpers/test-db.js';

const logger = pino({ level: 'silent' });
const jwtSecret = 'local-test-jwt-secret-at-least-32-bytes-long';
let connection: Awaited<ReturnType<typeof connectTestDb>>;
let app: ReturnType<typeof createApp>;

beforeAll(async () => {
  connection = await connectTestDb();
  app = createApp({
    connection,
    expectedReplicaSet: 'rs0',
    version: '0.1.0-test',
    corsOrigin: 'http://localhost:3000',
    logger,
    demoOwnerId: '000000000000000000000001',
    jwtSecret,
    cookieSecure: false,
    authRateLimitMax: 100,
  });
});

beforeEach(async () => {
  await cleanDb();
});

afterAll(async () => {
  await connection.close();
});

const credentials = {
  email: 'Owner@Example.com',
  password: 'correct horse battery staple',
  name: 'Owner',
};

function setCookieHeader(response: SupertestResponse): string {
  const value: unknown = response.headers['set-cookie'];
  return Array.isArray(value) ? value.join('; ') : String(value);
}

describe('auth', () => {
  it('register, set cookie HttpOnly và trả user không có hash', async () => {
    const response = await request(app).post('/api/v1/auth/register').send(credentials).expect(201);

    expect(response.body.data.emailNormalized).toBe('owner@example.com');
    expect(response.body.data.passwordHash).toBeUndefined();
    const cookie = setCookieHeader(response);
    expect(cookie).toContain('nextask_session=');
    expect(cookie).toContain('HttpOnly');
    expect(cookie).toContain('SameSite=Lax');
  });

  it('email trùng trả 409', async () => {
    await request(app).post('/api/v1/auth/register').send(credentials).expect(201);
    await request(app).post('/api/v1/auth/register').send(credentials).expect(409);
  });

  it('login đúng và /me bằng cookie', async () => {
    const agent = request.agent(app);
    await agent.post('/api/v1/auth/register').send(credentials).expect(201);
    await agent.post('/api/v1/auth/logout').expect(204);
    await agent
      .post('/api/v1/auth/login')
      .send({ email: credentials.email, password: credentials.password })
      .expect(200);
    const me = await agent.get('/api/v1/auth/me').expect(200);
    expect(me.body.data.emailNormalized).toBe('owner@example.com');
  });

  it('login sai trả 401 chung', async () => {
    await request(app)
      .post('/api/v1/auth/login')
      .send({ email: 'missing@example.com', password: 'wrong password' })
      .expect(401);
  });

  it('logout xóa cookie', async () => {
    const agent = request.agent(app);
    await agent.post('/api/v1/auth/register').send(credentials).expect(201);
    const response = await agent.post('/api/v1/auth/logout').expect(204);
    const cookie = setCookieHeader(response);
    expect(cookie).toContain('nextask_session=;');
    expect(cookie).toContain('Expires=Thu, 01 Jan 1970');
  });

  it('thiếu cookie /me trả 401', async () => {
    await request(app).get('/api/v1/auth/me').expect(401);
  });

  it('token hết hạn bị từ chối', async () => {
    const token = await signSessionToken('000000000000000000000001', {
      secret: jwtSecret,
      ttl: '-1s',
    });
    const response = await request(app)
      .get('/api/v1/auth/me')
      .set('Cookie', `nextask_session=${token}`);
    expect(response.status).toBe(401);
  });

  it('origin lạ bị chặn ở mutation', async () => {
    await request(app)
      .post('/api/v1/auth/register')
      .set('Origin', 'http://evil.test')
      .send(credentials)
      .expect(403);
  });

  it('rate limit auth', async () => {
    const limitedApp = createApp({
      connection,
      expectedReplicaSet: 'rs0',
      version: '0.1.0-test',
      corsOrigin: 'http://localhost:3000',
      logger,
      demoOwnerId: '000000000000000000000001',
      jwtSecret,
      cookieSecure: false,
      authRateLimitMax: 1,
    });
    await request(limitedApp)
      .post('/api/v1/auth/login')
      .send({ email: 'a@b.test', password: 'wrong password' })
      .expect(401);
    await request(limitedApp)
      .post('/api/v1/auth/login')
      .send({ email: 'a@b.test', password: 'wrong password' })
      .expect(429);
  });
});
