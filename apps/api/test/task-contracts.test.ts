import { describe, expect, it } from 'vitest';
import {
  createTaskRequestSchema,
  moveTaskRequestSchema,
  taskCursorSchema,
  taskListQuerySchema,
  taskPrioritySchema,
  tasksListResponseSchema,
  updateTaskRequestSchema,
} from '@nextask/contracts';

describe('task contracts', () => {
  it('move mặc định beforeTaskId null và bắt buộc expectedVersion', () => {
    expect(moveTaskRequestSchema.parse({ columnId: 'todo', expectedVersion: 2 })).toEqual({
      columnId: 'todo',
      beforeTaskId: null,
      expectedVersion: 2,
    });

    expect(() => moveTaskRequestSchema.parse({ columnId: 'todo' })).toThrow();
  });

  it('parse filter hợp lệ', () => {
    expect(
      taskListQuerySchema.parse({
        columnId: 'todo',
        assigneeId: 'none',
        priority: 'high',
        labels: 'bug,ux',
        q: '  daily  ',
        limit: '25',
      }),
    ).toEqual({
      columnId: 'todo',
      assigneeId: 'none',
      priority: 'high',
      labels: 'bug,ux',
      q: 'daily',
      limit: 25,
    });
  });

  it('từ chối priority/limit/assignee sai', () => {
    expect(() => taskPrioritySchema.parse('critical')).toThrow();
    expect(() => taskListQuerySchema.parse({ limit: '101' })).toThrow();
    expect(() => taskListQuerySchema.parse({ assigneeId: 'bad' })).toThrow();
  });

  it('create task trim title và optional field', () => {
    expect(createTaskRequestSchema.parse({ columnId: 'todo', title: '  Task mới  ' })).toEqual({
      columnId: 'todo',
      title: 'Task mới',
    });
  });

  it('update task cần expectedVersion và ít nhất một field', () => {
    expect(() => updateTaskRequestSchema.parse({ expectedVersion: 1 })).toThrow();
    expect(updateTaskRequestSchema.parse({ expectedVersion: 2, title: 'Mới' })).toMatchObject({
      expectedVersion: 2,
      title: 'Mới',
    });
  });

  it('cursor và nextCursor contract', () => {
    expect(
      taskCursorSchema.parse({
        columnId: 'todo',
        order: 'a0',
        id: '000000000000000000000001',
      }),
    ).toEqual({
      columnId: 'todo',
      order: 'a0',
      id: '000000000000000000000001',
    });
    expect(taskListQuerySchema.parse({ cursor: 'opaque' }).cursor).toBe('opaque');
    const body = tasksListResponseSchema.parse({
      data: [],
      meta: { requestId: 'req', hasMore: false, nextCursor: null },
    });
    expect(body.meta.nextCursor).toBeNull();
  });
});
