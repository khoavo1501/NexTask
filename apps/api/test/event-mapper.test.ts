import { Types } from 'mongoose';
import { describe, expect, it } from 'vitest';
import { mapChangeToEvent } from '../src/realtime/event-mapper.js';

const boardId = new Types.ObjectId();

function taskDoc(overrides: Record<string, unknown> = {}) {
  return {
    _id: new Types.ObjectId(),
    boardId,
    columnId: 'todo',
    order: 'a0',
    title: 'Task',
    description: 'test',
    assigneeId: null,
    labels: [],
    priority: 'medium',
    dueDate: null,
    lifecycle: 'active',
    sourceItemId: null,
    origin: null,
    version: 1,
    createdBy: new Types.ObjectId(),
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

function change(operationType: string, after: unknown, before?: unknown) {
  const identity =
    (after as { _id?: unknown } | null)?._id ??
    (before as { _id?: unknown } | null)?._id ??
    new Types.ObjectId();
  return {
    _id: { _data: `${operationType}-${Math.random()}` },
    operationType,
    clusterTime: { getHighBits: () => 1_800_000_000 },
    fullDocument: after,
    fullDocumentBeforeChange: before ?? null,
    documentKey: { _id: identity },
  } as never;
}

describe('event mapper', () => {
  it('map task insert/move/update', () => {
    const created = mapChangeToEvent('tasks', change('insert', taskDoc()), boardId.toHexString());
    expect(created).toMatchObject({ type: 'task:created', version: 1 });

    const moved = mapChangeToEvent(
      'tasks',
      change('update', taskDoc({ columnId: 'done', version: 2 }), taskDoc({ version: 1 })),
      boardId.toHexString(),
    );
    expect(moved).toMatchObject({ type: 'task:moved', version: 2 });
  });

  it('map item promote/delete', () => {
    const item = {
      _id: new Types.ObjectId(),
      boardId,
      shapeId: 'shape:one',
      type: 'note',
      content: 'Note',
      style: {},
      props: {},
      position: { x: 1, y: 2 },
      size: { w: 10, h: 10 },
      rotation: 0,
      tldrawIndex: 'a0',
      parentFrameId: null,
      authorId: new Types.ObjectId(),
      votes: [],
      promotedTaskId: null,
      version: 1,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    const promoted = mapChangeToEvent(
      'items',
      change('update', { ...item, promotedTaskId: new Types.ObjectId(), version: 2 }, item),
      boardId.toHexString(),
    );
    expect(promoted).toMatchObject({ type: 'item:promoted' });

    const deleted = mapChangeToEvent('items', change('delete', null, item), boardId.toHexString());
    expect(deleted).toMatchObject({
      type: 'item:deleted',
      payload: { itemId: item._id.toHexString() },
    });
  });
});
