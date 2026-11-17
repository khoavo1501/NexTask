import { describe, expect, it } from 'vitest';
import {
  BATCH_PROMOTE_CONFLICT_CODE,
  UNDO_NOT_AVAILABLE_CODE,
  UNDO_NO_LONGER_SAFE_CODE,
  batchPromoteRequestSchema,
  batchPromoteResponseSchema,
  undoPromoteResponseSchema,
} from '@nextask/contracts';

describe('phase 5b contracts', () => {
  it('batch request default assignToMe, tối đa 100 và itemId không trùng', () => {
    const parsed = batchPromoteRequestSchema.parse({
      columnId: 'todo',
      items: [{ itemId: '64b000000000000000000001', expectedItemVersion: 2 }],
    });
    expect(parsed.assignToMe).toBe(false);
    expect(parsed.items).toHaveLength(1);

    expect(() =>
      batchPromoteRequestSchema.parse({
        columnId: 'todo',
        items: [
          { itemId: '64b000000000000000000001', expectedItemVersion: 1 },
          { itemId: '64b000000000000000000001', expectedItemVersion: 1 },
        ],
      }),
    ).toThrow();

    expect(() =>
      batchPromoteRequestSchema.parse({
        columnId: 'todo',
        items: Array.from({ length: 101 }, (_, index) => ({
          itemId: `64b${String(index).padStart(21, '0')}`,
          expectedItemVersion: 1,
        })),
      }),
    ).toThrow();
  });

  it('batch response parse items/tasks/activities', () => {
    expect(
      batchPromoteResponseSchema.parse({
        data: { items: [], tasks: [], activities: [] },
        meta: { requestId: 'req' },
      }),
    ).toMatchObject({ data: { items: [], tasks: [], activities: [] } });
  });

  it('export error codes 5B', () => {
    expect(BATCH_PROMOTE_CONFLICT_CODE).toBe('BATCH_PROMOTE_CONFLICT');
    expect(UNDO_NOT_AVAILABLE_CODE).toBe('UNDO_NOT_AVAILABLE');
    expect(UNDO_NO_LONGER_SAFE_CODE).toBe('UNDO_NO_LONGER_SAFE');
    expect(undoPromoteResponseSchema).toBeDefined();
  });
});
