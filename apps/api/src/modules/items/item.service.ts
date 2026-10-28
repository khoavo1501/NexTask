import type { SyncItemInput } from '@nextask/contracts';
import type { Types } from 'mongoose';
import { getBoardForOwner } from '../boards/board.service.js';
import { ItemModel, type ItemDocument } from './item.model.js';

export async function listItems(boardId: string, ownerId: Types.ObjectId): Promise<ItemDocument[]> {
  const board = await getBoardForOwner(boardId, ownerId);
  return ItemModel.find({ boardId: board._id, type: 'note' }).sort({ createdAt: 1 }).exec();
}

export async function syncItems(
  boardId: string,
  ownerId: Types.ObjectId,
  items: SyncItemInput[],
): Promise<ItemDocument[]> {
  const board = await getBoardForOwner(boardId, ownerId);
  const now = new Date();
  const shapeIds = items.map((item) => item.shapeId);

  if (items.length > 0) {
    await ItemModel.bulkWrite(
      items.map((item) => ({
        updateOne: {
          filter: { boardId: board._id, shapeId: item.shapeId },
          update: {
            $set: {
              type: 'note',
              content: item.content,
              style: item.style,
              props: item.props,
              position: item.position,
              size: item.size,
              rotation: item.rotation,
              tldrawIndex: item.tldrawIndex,
              parentFrameId: null,
              updatedAt: now,
            },
            $setOnInsert: {
              boardId: board._id,
              shapeId: item.shapeId,
              authorId: ownerId,
              votes: [],
              promotedTaskId: null,
              createdAt: now,
            },
            $inc: { version: 1 },
          },
          upsert: true,
        },
      })),
    );
  }

  await ItemModel.deleteMany({
    boardId: board._id,
    type: 'note',
    promotedTaskId: null,
    shapeId: { $nin: shapeIds },
  });

  return ItemModel.find({ boardId: board._id, type: 'note' }).sort({ createdAt: 1 }).exec();
}
