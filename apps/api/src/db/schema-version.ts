import type { Connection } from 'mongoose';

interface SchemaMigrationDocument {
  _id: string;
  appliedAt: Date;
}

export async function assertSchemaVersion(
  connection: Connection,
  expectedVersion: string,
): Promise<void> {
  const db = connection.db;
  if (!db) throw new Error('MongoDB connection is not ready');

  const applied = await db
    .collection<SchemaMigrationDocument>('schema_migrations')
    .findOne({ _id: expectedVersion });
  if (!applied) {
    throw new Error(
      `Database schema is not migrated: expected "${expectedVersion}". Run npm run db:migrate.`,
    );
  }
}
