import { generateKeyBetween } from 'fractional-indexing';
import type { Migration, MigrationOptions } from '../migration-runner.js';

async function dropIndexIfExists(
  options: MigrationOptions,
  collectionName: string,
  indexName: string,
): Promise<void> {
  const db = options.connection.db;
  if (!db) throw new Error('MongoDB connection is not ready');
  const collection = db.collection(collectionName);

  try {
    const indexes = await collection.indexes();
    if (indexes.some((index) => index.name === indexName)) {
      await collection.dropIndex(indexName);
    }
  } catch (error) {
    if ((error as { codeName?: string }).codeName === 'NamespaceNotFound') return;
    throw error;
  }
}

async function backfillDuplicateOrders(options: MigrationOptions): Promise<void> {
  const db = options.connection.db;
  if (!db) throw new Error('MongoDB connection is not ready');
  const collection = db.collection('tasks');
  const tasks = await collection
    .find({ lifecycle: 'active' })
    .sort({ boardId: 1, columnId: 1, order: 1, _id: 1 })
    .toArray();

  let previousGroup = '';
  let previousOrder: string | null = null;

  for (const task of tasks) {
    const group = `${String(task.boardId)}:${String(task.columnId)}`;
    const order = String(task.order);
    if (group === previousGroup && order === previousOrder) {
      const nextOrder = generateKeyBetween(previousOrder, null);
      await collection.updateOne(
        { _id: task._id },
        { $set: { order: nextOrder, updatedAt: new Date() }, $inc: { version: 1 } },
      );
      previousOrder = nextOrder;
      continue;
    }

    previousGroup = group;
    previousOrder = order;
  }
}

async function ensureIndexes(options: MigrationOptions): Promise<void> {
  const db = options.connection.db;
  if (!db) throw new Error('MongoDB connection is not ready');

  await dropIndexIfExists(options, 'tasks', 'tasks_kanban_order');
  await Promise.all([
    db.collection('tasks').createIndex(
      { boardId: 1, columnId: 1, order: 1 },
      {
        unique: true,
        partialFilterExpression: { lifecycle: 'active' },
        name: 'tasks_kanban_order',
      },
    ),
    db.collection('tasks').createIndex(
      { boardId: 1, lifecycle: 1, assigneeId: 1, columnId: 1, order: 1 },
      {
        partialFilterExpression: { lifecycle: 'active' },
        name: 'tasks_board_assignee',
      },
    ),
    db.collection('tasks').createIndex(
      { boardId: 1, lifecycle: 1, priority: 1, columnId: 1, order: 1 },
      {
        partialFilterExpression: { lifecycle: 'active' },
        name: 'tasks_board_priority',
      },
    ),
    db.collection('tasks').createIndex(
      { boardId: 1, lifecycle: 1, labels: 1, columnId: 1, order: 1 },
      {
        partialFilterExpression: { lifecycle: 'active' },
        name: 'tasks_board_labels',
      },
    ),
  ]);
}

export const phase3aMigration: Migration = {
  name: '003-phase-3a',
  async up(options) {
    await backfillDuplicateOrders(options);
    await ensureIndexes(options);
  },
};
