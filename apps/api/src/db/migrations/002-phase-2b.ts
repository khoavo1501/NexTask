import { COLLECTION_VALIDATORS } from '../collection-validators.js';
import type { Migration, MigrationOptions } from '../migration-runner.js';

const VALIDATION = {
  validationLevel: 'strict',
  validationAction: 'error',
} as const;

async function applyValidators(options: MigrationOptions): Promise<void> {
  const db = options.connection.db;
  if (!db) throw new Error('MongoDB connection is not ready');

  for (const [name, validator] of Object.entries(COLLECTION_VALIDATORS)) {
    const existing = await db.listCollections({ name }, { nameOnly: true }).toArray();
    if (existing.length === 0) {
      await db.createCollection(name, { validator, ...VALIDATION });
      continue;
    }

    await db.command({ collMod: name, validator, ...VALIDATION });
  }
}

export const phase2bMigration: Migration = {
  name: '002-phase-2b',
  async up(options) {
    await applyValidators(options);
  },
};
