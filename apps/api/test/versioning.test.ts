import { describe, expect, it } from 'vitest';
import { AppError } from '../src/lib/errors.js';
import { columnNotEmpty, orderConflict, versionConflict } from '../src/lib/versioning.js';

describe('versionConflict', () => {
  it('tạo AppError 409 với currentVersion và shapeId', () => {
    const error = versionConflict(4, 'shape:one');

    expect(error).toBeInstanceOf(AppError);
    expect(error.status).toBe(409);
    expect(error.code).toBe('VERSION_CONFLICT');
    expect(error.details).toEqual({ currentVersion: 4, shapeId: 'shape:one' });
  });

  it('không thêm shapeId khi không truyền', () => {
    expect(versionConflict(2).details).toEqual({ currentVersion: 2 });
  });

  it('orderConflict trả 409 ORDER_CONFLICT kèm columnId', () => {
    const error = orderConflict('todo');

    expect(error).toBeInstanceOf(AppError);
    expect(error.status).toBe(409);
    expect(error.code).toBe('ORDER_CONFLICT');
    expect(error.details).toEqual({ columnId: 'todo' });
  });

  it('columnNotEmpty trả 409 kèm taskCount', () => {
    const error = columnNotEmpty('todo', 3);

    expect(error).toBeInstanceOf(AppError);
    expect(error.status).toBe(409);
    expect(error.code).toBe('COLUMN_NOT_EMPTY');
    expect(error.details).toEqual({ columnId: 'todo', taskCount: 3 });
  });
});
