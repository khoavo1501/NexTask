import { describe, expect, it } from 'vitest';
import { updateColumnsRequestSchema } from '@nextask/contracts';

describe('column contracts', () => {
  it('chấp nhận cột cũ và cột mới đúng một Done', () => {
    const parsed = updateColumnsRequestSchema.parse({
      columns: [
        { id: 'backlog', name: 'Backlog', isDone: false },
        { name: 'Done mới', isDone: true },
      ],
      expectedVersion: 3,
    });
    expect(parsed.columns).toHaveLength(2);
  });

  it('từ chối 0 hoặc 2 cột Done, id lặp, mảng rỗng', () => {
    const base = { columns: [{ name: 'A', isDone: false }], expectedVersion: 1 };
    expect(() => updateColumnsRequestSchema.parse(base)).toThrow();
    expect(() => updateColumnsRequestSchema.parse({ columns: [], expectedVersion: 1 })).toThrow();

    expect(() =>
      updateColumnsRequestSchema.parse({
        columns: [
          { name: 'A', isDone: true },
          { name: 'B', isDone: true },
        ],
        expectedVersion: 1,
      }),
    ).toThrow();

    expect(() =>
      updateColumnsRequestSchema.parse({
        columns: [
          { id: 'todo', name: 'A', isDone: true },
          { id: 'todo', name: 'B', isDone: false },
        ],
        expectedVersion: 1,
      }),
    ).toThrow();
  });
});
