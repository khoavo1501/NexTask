import type { Connection } from 'mongoose';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { TaskModel } from '../src/modules/tasks/task.model.js';
import { connectTestDb } from './helpers/test-db.js';

let connection: Connection;

beforeAll(async () => {
  connection = await connectTestDb();
});

afterAll(async () => {
  await connection.close();
});

describe('indexes', () => {
  it('có unique partial index cho sourceItemId active', async () => {
    const indexes = await TaskModel.collection.indexes();
    const index = indexes.find((entry) => entry.name === 'uniq_active_task_per_item');

    expect(index).toBeDefined();
    expect(index?.unique).toBe(true);
    expect(index?.partialFilterExpression).toEqual({
      sourceItemId: { $type: 'objectId' },
      lifecycle: 'active',
    });
  });

  it('có unique order index và filter indexes cho Kanban', async () => {
    const indexes = await TaskModel.collection.indexes();
    const order = indexes.find((entry) => entry.name === 'tasks_kanban_order');

    expect(order).toBeDefined();
    expect(order?.unique).toBe(true);
    expect(order?.partialFilterExpression).toEqual({ lifecycle: 'active' });
    for (const name of ['tasks_board_assignee', 'tasks_board_priority', 'tasks_board_labels']) {
      expect(indexes.some((entry) => entry.name === name), name).toBe(true);
    }
  });
});
