import type { Db } from 'mongodb';
import type { Migration, MigrationOptions } from '../migration-runner.js';

const CHECKPOINT_VALIDATOR = {
  $jsonSchema: {
    bsonType: 'object',
    required: ['boardId', 'collection', 'token', 'updatedAt'],
    additionalProperties: false,
    properties: {
      _id: { bsonType: 'objectId' },
      boardId: { bsonType: 'objectId' },
      collection: { bsonType: 'string', enum: ['items', 'tasks'] },
      token: { bsonType: ['object', 'binData'] },
      updatedAt: { bsonType: 'date' },
    },
  },
} as const;

async function ensureCheckpointCollection(db: Db): Promise<void> {
  const [existing] = await db
    .listCollections({ name: 'change_stream_checkpoints' })
    .toArray();

  if (!existing) {
    await db.createCollection('change_stream_checkpoints', {
      validator: CHECKPOINT_VALIDATOR,
      validationLevel: 'strict',
      validationAction: 'error',
    });
  } else {
    await db.command({
      collMod: 'change_stream_checkpoints',
      validator: CHECKPOINT_VALIDATOR,
      validationLevel: 'strict',
      validationAction: 'error',
    });
  }

  await db.collection('change_stream_checkpoints').createIndex(
    { boardId: 1, collection: 1 },
    {
      unique: true,
      name: 'change_stream_checkpoints_board_collection',
    },
  );
}

async function enablePrePostImages(db: Db): Promise<void> {
  for (const name of ['items', 'tasks']) {
    await db.command({
      collMod: name,
      changeStreamPreAndPostImages: { enabled: true },
    });
  }
}

export const phase4Migration: Migration = {
  name: '004-phase-4',
  async up(options: MigrationOptions) {
    const db = options.connection.db;
    if (!db) throw new Error('MongoDB connection is not ready');
    await ensureCheckpointCollection(db);
    await enablePrePostImages(db);
  },
};
