import { describe, expect, it } from 'vitest';
import {
  createTaskRequestSchema,
  moveTaskRequestSchema,
  taskListQuerySchema,
  taskPrioritySchema,
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
});
