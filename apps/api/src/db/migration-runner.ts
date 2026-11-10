import type { Connection } from 'mongoose';
import { phase2aMigration } from './migrations/001-phase-2a.js';
import { phase2bMigration } from './migrations/002-phase-2b.js';
import { phase3aMigration } from './migrations/003-phase-3a.js';

export interface MigrationEnv {
  SEED_OWNER_EMAIL?: string;
  SEED_OWNER_PASSWORD?: string;
  SEED_OWNER_NAME?: string;
}

export interface MigrationOptions {
  connection: Connection;
  env: MigrationEnv;
}

export interface Migration {
  name: string;
  up(options: MigrationOptions): Promise<void>;
}

export const MIGRATION_001_NAME = '001-phase-2a';
export const MIGRATION_002_NAME = '002-phase-2b';
export const MIGRATION_003_NAME = '003-phase-3a';
export const LATEST_MIGRATION_NAME = MIGRATION_003_NAME;

interface SchemaMigrationDocument {
  _id: string;
  appliedAt: Date;
}

const migrations: Migration[] = [phase2aMigration, phase2bMigration, phase3aMigration];

export async function runMigrations(options: MigrationOptions): Promise<string[]> {
  const db = options.connection.db;
  if (!db) throw new Error('MongoDB connection is not ready');

  const collection = db.collection<SchemaMigrationDocument>('schema_migrations');
  const applied: string[] = [];

  for (const migration of migrations) {
    const existing = await collection.findOne({ _id: migration.name });
    if (existing) continue;

    await migration.up(options);
    await collection.insertOne({ _id: migration.name, appliedAt: new Date() });
    applied.push(migration.name);
  }

  return applied;
}
