import type { Connection } from 'mongoose';
import { phase2aMigration } from './migrations/001-phase-2a.js';
import { phase2bMigration } from './migrations/002-phase-2b.js';
import { phase3aMigration } from './migrations/003-phase-3a.js';
import { phase4Migration } from './migrations/004-phase-4.js';
import { phase5aMigration } from './migrations/005-phase-5a.js';
import { phase6Migration } from './migrations/006-phase-6.js';
import { phase8bMigration } from './migrations/007-phase-8b.js';

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
export const MIGRATION_004_NAME = '004-phase-4';
export const MIGRATION_005_NAME = '005-phase-5a';
export const MIGRATION_006_NAME = '006-phase-6';
export const MIGRATION_007_NAME = '007-phase-8b';
export const LATEST_MIGRATION_NAME = MIGRATION_007_NAME;

interface SchemaMigrationDocument {
  _id: string;
  appliedAt: Date;
}

const migrations: Migration[] = [
  phase2aMigration,
  phase2bMigration,
  phase3aMigration,
  phase4Migration,
  phase5aMigration,
  phase6Migration,
  phase8bMigration,
];

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
