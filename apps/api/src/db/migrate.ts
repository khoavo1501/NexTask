import { loadEnv } from '../config/env.js';
import { loadRootEnvFile } from '../config/load-env-file.js';
import { createLogger } from '../lib/logger.js';
import { runMigrations } from './migration-runner.js';
import { connectMongo } from './mongoose.js';

loadRootEnvFile();

async function main(): Promise<void> {
  const env = loadEnv();
  const logger = createLogger(env.LOG_LEVEL);
  const connection = await connectMongo({ uri: env.MONGODB_URI, logger });

  try {
    const applied = await runMigrations({
      connection,
      env: {
        SEED_OWNER_EMAIL: env.SEED_OWNER_EMAIL,
        SEED_OWNER_PASSWORD: env.SEED_OWNER_PASSWORD,
        SEED_OWNER_NAME: env.SEED_OWNER_NAME,
      },
    });
    logger.info({ applied }, 'Migrations complete');
  } finally {
    await connection.close();
  }
}

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
