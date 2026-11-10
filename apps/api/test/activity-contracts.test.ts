import { describe, expect, it } from 'vitest';
import {
  activityListQuerySchema,
  activitySchema,
  demoteTaskRequestSchema,
  taskSchema,
} from '@nextask/contracts';

const validTask = {
  _id: '64b000000000000000000001',
  boardId: '64b000000000000000000002',
  columnId: 'todo',
  order: 'a0',
  title: 'Task',
  description: '',
  assigneeId: null,
  labels: [],
  priority: 'medium',
  dueDate: null,
  lifecycle: 'demoted',
  sourceItemId: '64b000000000000000000003',
  origin: null,
  version: 2,
  createdBy: '64b000000000000000000004',
  createdAt: '2026-11-10T00:00:00.000Z',
  updatedAt: '2026-11-10T00:00:00.000Z',
  demotedAt: '2026-11-10T00:00:00.000Z',
  demotedBy: '64b000000000000000000004',
};

describe('phase 5a contracts', () => {
  it('demote request cần hai version dương', () => {
    expect(
      demoteTaskRequestSchema.parse({ expectedTaskVersion: 2, expectedItemVersion: 3 }),
    ).toEqual({ expectedTaskVersion: 2, expectedItemVersion: 3 });
    expect(() =>
      demoteTaskRequestSchema.parse({ expectedTaskVersion: 0, expectedItemVersion: 3 }),
    ).toThrow();
    expect(() => demoteTaskRequestSchema.parse({ expectedTaskVersion: 2 })).toThrow();
  });

  it('activity schema parse action/refs/snapshot', () => {
    expect(
      activitySchema.parse({
        _id: '64b000000000000000000010',
        boardId: '64b000000000000000000002',
        actorId: '64b000000000000000000004',
        action: 'item.demoted',
        refs: {
          itemId: '64b000000000000000000003',
          taskId: '64b000000000000000000001',
          columnId: 'todo',
        },
        snapshot: { taskTitle: 'Task', columnId: 'todo' },
        undoableUntil: null,
        createdAt: '2026-11-10T00:00:00.000Z',
      }),
    ).toMatchObject({ action: 'item.demoted', undoableUntil: null });
    expect(() =>
      activitySchema.parse({
        _id: '64b000000000000000000010',
        boardId: '64b000000000000000000002',
        actorId: '64b000000000000000000004',
        action: 'task.moved',
        refs: { itemId: null, taskId: null, columnId: null },
        snapshot: {},
        undoableUntil: null,
        createdAt: '2026-11-10T00:00:00.000Z',
      }),
    ).toThrow();
  });

  it('activity query limit mặc định 50 và tối đa 100', () => {
    expect(activityListQuerySchema.parse({})).toEqual({ limit: 50 });
    expect(activityListQuerySchema.parse({ limit: '100' })).toEqual({ limit: 100 });
    expect(() => activityListQuerySchema.parse({ limit: '101' })).toThrow();
    expect(() => activityListQuerySchema.parse({ limit: '0' })).toThrow();
  });

  it('TaskDto nhận lifecycle demoted và field demote nullable', () => {
    expect(taskSchema.parse(validTask)).toMatchObject({
      lifecycle: 'demoted',
      demotedBy: '64b000000000000000000004',
    });
    expect(
      taskSchema.parse({ ...validTask, lifecycle: 'active', demotedAt: null, demotedBy: null }),
    ).toMatchObject({ lifecycle: 'active', demotedAt: null });
    expect(() => taskSchema.parse({ ...validTask, lifecycle: 'archived' })).toThrow();
  });
});
