import type { Connection } from 'mongoose';
import mongoose from 'mongoose';
import pino from 'pino';
import { connectMongo } from '../../src/db/mongoose.js';
import { ensureIndexes } from '../../src/db/indexes.js';

export const testUri =
  process.env.MONGODB_TEST_URI ??
  'mongodb://localhost:27017/nextask_phase1_test?directConnection=true';

export const testLogger = pino({ level: 'silent' });

export async function connectTestDb(): Promise<Connection> {
  const connection = await connectMongo({ uri: testUri, logger: testLogger });
  await ensureIndexes();
  return connection;
}

export async function cleanDb(): Promise<void> {
  const db = mongoose.connection.db;
  if (!db) throw new Error('Test DB chưa kết nối');

  const collections = await db.listCollections({}, { nameOnly: true }).toArray();
  await Promise.all(
    collections
      .filter((collection) => !collection.name.startsWith('system.'))
      .map((collection) => db.collection(collection.name).deleteMany({})),
  );
}
