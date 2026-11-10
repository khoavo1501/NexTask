import type { Db, Document } from 'mongodb';
import { COLLECTION_VALIDATORS } from '../collection-validators.js';
import type { Migration, MigrationOptions } from '../migration-runner.js';

const VALIDATION = {
  validationLevel: 'strict',
  validationAction: 'error',
} as const;

function requireValidator(name: 'activities' | 'tasks'): Document {
  const validator = COLLECTION_VALIDATORS[name];
  if (!validator) throw new Error(`Thiếu validator ${name}`);
  return validator;
}

async function ensureActivitiesCollection(db: Db): Promise<void> {
  const validator = requireValidator('activities');
  const [existing] = await db.listCollections({ name: 'activities' }, { nameOnly: true }).toArray();

  if (!existing) {
    await db.createCollection('activities', { validator, ...VALIDATION });
  } else {
    await db.command({ collMod: 'activities', validator, ...VALIDATION });
  }

  await db
    .collection('activities')
    .createIndex({ boardId: 1, createdAt: -1 }, { name: 'activities_board_created' });
  await db
    .collection('activities')
    .createIndex(
      { createdAt: 1 },
      { expireAfterSeconds: 7_776_000, name: 'activities_created_ttl' },
    );
}

async function updateTasksValidator(db: Db): Promise<void> {
  await db.command({
    collMod: 'tasks',
    validator: requireValidator('tasks'),
    ...VALIDATION,
  });
}

export const phase5aMigration: Migration = {
  name: '005-phase-5a',
  async up(options: MigrationOptions) {
    const db = options.connection.db;
    if (!db) throw new Error('MongoDB connection is not ready');
    await ensureActivitiesCollection(db);
    await updateTasksValidator(db);
  },
};
