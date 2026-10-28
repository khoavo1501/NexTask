import { describe, expect, it } from 'vitest';
import { loadEnv } from '../src/config/env.js';

const validEnv = {
  NODE_ENV: 'test',
  PORT: '4000',
  MONGODB_URI: 'mongodb://localhost:27017/nextask_phase0_test?directConnection=true',
  MONGODB_REPLICA_SET: 'rs0',
  CORS_ORIGIN: 'http://localhost:3000',
  LOG_LEVEL: 'silent',
  SERVICE_VERSION: '0.1.0',
  JWT_SECRET: 'local-test-jwt-secret-at-least-32-bytes-long',
  COOKIE_SECURE: 'false',
  SEED_OWNER_EMAIL: 'owner@nextask.local',
  SEED_OWNER_PASSWORD: 'nextask-local-owner-2026',
  SEED_OWNER_NAME: 'Demo Owner',
};

describe('loadEnv', () => {
  it('parse hợp lệ và coerce PORT', () => {
    const env = loadEnv(validEnv);
    expect(env.PORT).toBe(4000);
    expect(env.MONGODB_REPLICA_SET).toBe('rs0');
  });

  it('từ chối thiếu MONGODB_URI', () => {
    const input = { ...validEnv, MONGODB_URI: undefined };
    expect(() => loadEnv(input)).toThrow(/MONGODB_URI/);
  });

  it('từ chối URI không phải MongoDB', () => {
    const input = { ...validEnv, MONGODB_URI: 'http://localhost:27017' };
    expect(() => loadEnv(input)).toThrow(/MONGODB_URI/);
  });

  it('từ chối JWT_SECRET ngắn', () => {
    expect(() => loadEnv({ ...validEnv, JWT_SECRET: 'short' })).toThrow(/JWT_SECRET/);
  });
});
