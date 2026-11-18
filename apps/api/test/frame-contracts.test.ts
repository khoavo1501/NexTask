import { describe, expect, it } from 'vitest';
import { syncItemsRequestSchema } from '@nextask/contracts';

const frame = {
  shapeId: 'shape:frame1',
  type: 'frame',
  style: { color: 'yellow' },
  props: { w: 220, h: 700, name: 'Start', color: 'yellow' },
  position: { x: 0, y: 0 },
  size: { w: 220, h: 700 },
  rotation: 0,
  tldrawIndex: 'a1',
  parentShapeId: null,
  expectedVersion: 0,
};

const note = {
  shapeId: 'shape:note1',
  type: 'note',
  content: 'Xin chào',
  style: { color: 'yellow' },
  props: { color: 'yellow' },
  position: { x: 10, y: 20 },
  size: { w: 200, h: 200 },
  rotation: 0,
  tldrawIndex: 'a2',
  parentShapeId: 'shape:frame1',
  expectedVersion: 0,
};

describe('frame contracts', () => {
  it('nhận frame và note có parentShapeId', () => {
    const parsed = syncItemsRequestSchema.parse({ items: [frame, note] });
    expect(parsed.items[0]).toMatchObject({ type: 'frame', parentShapeId: null });
    expect(parsed.items[1]).toMatchObject({ type: 'note', parentShapeId: 'shape:frame1' });
  });

  it('từ chối frame có parent hoặc rotation khác 0', () => {
    expect(
      syncItemsRequestSchema.safeParse({
        items: [{ ...frame, parentShapeId: 'shape:other' }],
      }).success,
    ).toBe(false);
    expect(
      syncItemsRequestSchema.safeParse({
        items: [{ ...frame, rotation: 1 }],
      }).success,
    ).toBe(false);
  });

  it('từ chối frame thiếu name hoặc kích thước không dương', () => {
    expect(
      syncItemsRequestSchema.safeParse({
        items: [{ ...frame, props: { w: 0, h: 700, name: 'Start', color: 'yellow' } }],
      }).success,
    ).toBe(false);
    expect(
      syncItemsRequestSchema.safeParse({
        items: [{ ...frame, props: { w: 220, h: 700, color: 'yellow' } }],
      }).success,
    ).toBe(false);
  });
});
