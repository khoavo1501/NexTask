import { COLLECTION_VALIDATORS } from '../collection-validators.js';
import type { Migration, MigrationOptions } from '../migration-runner.js';

const VALIDATION = {
  validationLevel: 'strict',
  validationAction: 'error',
} as const;

export const phase8bMigration: Migration = {
  name: '007-phase-8b',
  async up(options: MigrationOptions) {
    const db = options.connection.db;
    if (!db) throw new Error('MongoDB connection is not ready');

    const validator = COLLECTION_VALIDATORS.items;
    if (!validator) throw new Error('Thiếu validator items');
    await db.command({ collMod: 'items', validator, ...VALIDATION });
  },
};
