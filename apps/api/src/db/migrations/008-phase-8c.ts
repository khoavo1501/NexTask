import type { Migration, MigrationOptions } from '../migration-runner.js';

export const phase8cMigration: Migration = {
  name: '008-phase-8c',
  async up(options: MigrationOptions) {
    const db = options.connection.db;
    if (!db) throw new Error('MongoDB connection is not ready');

    await db.collection('tasks').createIndex(
      { boardId: 1, lifecycle: 1, title: 'text', description: 'text' },
      { name: 'tasks_board_text', default_language: 'none' },
    );
  },
};
