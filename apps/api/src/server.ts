import { createServer } from 'node:http';
import { createApp } from './app.js';
import { loadEnv } from './config/env.js';
import { loadRootEnvFile } from './config/load-env-file.js';
import { MIGRATION_001_NAME } from './db/migration-runner.js';
import { assertReplicaSet, connectMongo } from './db/mongoose.js';
import { assertSchemaVersion } from './db/schema-version.js';
import { createLogger } from './lib/logger.js';

loadRootEnvFile();

async function main(): Promise<void> {
  const env = loadEnv();
  const logger = createLogger(env.LOG_LEVEL);
  const connection = await connectMongo({ uri: env.MONGODB_URI, logger });
  const replica = await assertReplicaSet(connection, env.MONGODB_REPLICA_SET);

  if (!replica.primary) {
    throw new Error('MongoDB replica set has no primary');
  }

  await assertSchemaVersion(connection, MIGRATION_001_NAME);

  const app = createApp({
    connection,
    expectedReplicaSet: env.MONGODB_REPLICA_SET,
    version: env.SERVICE_VERSION,
    corsOrigin: env.CORS_ORIGIN,
    logger,
    demoOwnerId: env.DEMO_OWNER_ID,
    jwtSecret: env.JWT_SECRET,
    cookieSecure: env.COOKIE_SECURE,
    authRateLimitMax: 5,
  });
  const server = createServer(app);

  server.listen(env.PORT, '0.0.0.0', () => {
    logger.info({ port: env.PORT, replicaSet: replica.replicaSet }, 'Nextask API listening');
  });

  let shuttingDown = false;
  const shutdown = (signal: string) => {
    if (shuttingDown) return;
    shuttingDown = true;
    logger.info({ signal }, 'Shutting down');
    server.close(() => {
      void connection.close().finally(() => process.exit(0));
    });
    setTimeout(() => process.exit(1), 10_000).unref();
  };

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
}

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
