import type { RealtimeEvent } from '@nextask/contracts';
import type { ChangeStreamDocument, Document } from 'mongodb';
import { serializeItem, serializeTask } from '../lib/serialize.js';
import { ItemModel } from '../modules/items/item.model.js';
import { TaskModel } from '../modules/tasks/task.model.js';
import { eventIdFromToken, type CheckpointCollection } from './checkpoint.service.js';

function occurredAt(value: unknown): string {
  const timestamp = value as { getHighBits?: () => number } | undefined;
  if (timestamp?.getHighBits) {
    return new Date(timestamp.getHighBits() * 1000).toISOString();
  }
  return new Date().toISOString();
}

export function mapChangeToEvent(
  collection: CheckpointCollection,
  change: ChangeStreamDocument<Document>,
  boardId: string,
): RealtimeEvent | null {
  const before =
    ((change as { fullDocumentBeforeChange?: Document | null }).fullDocumentBeforeChange as
      | Document
      | null
      | undefined) ?? null;
  const after =
    ((change as { fullDocument?: Document | null }).fullDocument as
      | Document
      | null
      | undefined) ?? null;
  const document = after ?? before;
  if (!document || String(document.boardId) !== boardId) return null;

  const base = {
    id: eventIdFromToken(change._id as Document),
    boardId,
    occurredAt: occurredAt(change.clusterTime),
    version: Number(after?.version ?? 0),
  };

  if (collection === 'tasks') {
    if (change.operationType === 'insert') {
      if (!after) return null;
      return {
        ...base,
        type: 'task:created',
        payload: { task: serializeTask(TaskModel.hydrate(after)) },
      };
    }
    if (change.operationType === 'delete') return null;
    if (!after) return null;

    if (before?.lifecycle === 'active' && after.lifecycle === 'demoted') {
      return {
        ...base,
        type: 'task:demoted',
        payload: {
          taskId: String(after._id),
          itemId: after.sourceItemId ? String(after.sourceItemId) : null,
        },
      };
    }
    if (before?.columnId !== after.columnId) {
      return {
        ...base,
        type: 'task:moved',
        payload: { task: serializeTask(TaskModel.hydrate(after)) },
      };
    }
    return {
      ...base,
      type: 'task:updated',
      payload: { task: serializeTask(TaskModel.hydrate(after)) },
    };
  }

  if (change.operationType === 'insert') {
    if (!after) return null;
    return {
      ...base,
      type: 'item:created',
      payload: { item: serializeItem(ItemModel.hydrate(after)) },
    };
  }
  if (change.operationType === 'delete') {
    return {
      ...base,
      type: 'item:deleted',
      payload: { itemId: String(change.documentKey._id) },
    };
  }
  if (!after) return null;

  const beforeTaskId = before?.promotedTaskId ? String(before.promotedTaskId) : null;
  const afterTaskId = after.promotedTaskId ? String(after.promotedTaskId) : null;
  if (!beforeTaskId && afterTaskId) {
    return {
      ...base,
      type: 'item:promoted',
      payload: { item: serializeItem(ItemModel.hydrate(after)), taskId: afterTaskId },
    };
  }
  if (beforeTaskId && !afterTaskId) {
    return {
      ...base,
      type: 'item:demoted',
      payload: { item: serializeItem(ItemModel.hydrate(after)), taskId: beforeTaskId },
    };
  }
  return {
    ...base,
    type: 'item:updated',
    payload: { item: serializeItem(ItemModel.hydrate(after)) },
  };
}
