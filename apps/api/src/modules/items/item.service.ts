import type { SyncItemsRequest } from '@nextask/contracts';
import mongoose, { type Types } from 'mongoose';
import { AppError } from '../../lib/errors.js';
import { versionConflict } from '../../lib/versioning.js';
import type { BoardDocument } from '../boards/board.model.js';
import { ItemModel, type ItemDocument } from './item.model.js';

interface DuplicateKeyShape {
  shapeId?: unknown;
}

function duplicateShapeId(error: unknown): string | null {
  const direct = error as { code?: number; keyValue?: DuplicateKeyShape };
  if (direct.code === 11_000 && typeof direct.keyValue?.shapeId === 'string') {
    return direct.keyValue.shapeId;
  }

  const writeErrors = (
    error as {
      writeErrors?: Array<{ err?: { code?: number; keyValue?: DuplicateKeyShape } }>;
    }
  ).writeErrors;
  const first = writeErrors?.[0]?.err;
  if (first?.code === 11_000 && typeof first.keyValue?.shapeId === 'string') {
    return first.keyValue.shapeId;
  }

  return null;
}

export async function listItems(board: BoardDocument): Promise<ItemDocument[]> {
  return ItemModel.find({ boardId: board._id, type: 'note' }).sort({ createdAt: 1, _id: 1 }).exec();
}

async function runSyncTransaction(
  board: BoardDocument,
  userId: Types.ObjectId,
  input: SyncItemsRequest,
): Promise<ItemDocument[]> {
  const session = await mongoose.startSession();

  try {
    const result = await session.withTransaction(
      async () => {
        const shapeIds = [
          ...input.items.map((item) => item.shapeId),
          ...input.deleted.map((item) => item.shapeId),
        ];
        const existing = await ItemModel.find({
          boardId: board._id,
          type: 'note',
          shapeId: { $in: shapeIds },
        }).session(session);
        const byShapeId = new Map(existing.map((item) => [item.shapeId, item]));

        for (const item of input.items) {
          const current = byShapeId.get(item.shapeId);
          if (!current) {
            if (item.expectedVersion !== 0) {
              throw versionConflict(0, item.shapeId);
            }
            continue;
          }
          if (current.version !== item.expectedVersion) {
            throw versionConflict(current.version, item.shapeId);
          }
        }

        for (const deleted of input.deleted) {
          const current = byShapeId.get(deleted.shapeId);
          if (!current || current.promotedTaskId) continue;
          if (current.version !== deleted.expectedVersion) {
            throw versionConflict(current.version, deleted.shapeId);
          }
        }

        const now = new Date();
        const updateOps = input.items.map((item) => {
          const current = byShapeId.get(item.shapeId);
          const fields = {
            type: 'note' as const,
            content: item.content,
            style: item.style,
            props: item.props,
            position: item.position,
            size: item.size,
            rotation: item.rotation,
            tldrawIndex: item.tldrawIndex,
            parentFrameId: null,
            updatedAt: now,
          };

          if (!current) {
            return {
              updateOne: {
                filter: { boardId: board._id, shapeId: item.shapeId, version: 0 },
                update: {
                  $set: fields,
                  $setOnInsert: {
                    authorId: userId,
                    votes: [],
                    promotedTaskId: null,
                    createdAt: now,
                  },
                  $inc: { version: 1 },
                },
                upsert: true,
              },
            };
          }

          return {
            updateOne: {
              filter: { _id: current._id, version: item.expectedVersion },
              update: {
                $set: fields,
                $inc: { version: 1 },
              },
            },
          };
        });

        const deleteOps = input.deleted.flatMap((deleted) => {
          const current = byShapeId.get(deleted.shapeId);
          if (!current || current.promotedTaskId) return [];
          return [
            {
              deleteOne: {
                filter: { _id: current._id, version: deleted.expectedVersion },
              },
            },
          ];
        });

        if (updateOps.length > 0) {
          await ItemModel.bulkWrite(updateOps, { session });
        }
        if (deleteOps.length > 0) {
          await ItemModel.bulkWrite(deleteOps, { session });
        }

        return ItemModel.find({ boardId: board._id, type: 'note' })
          .sort({ createdAt: 1, _id: 1 })
          .session(session)
          .exec();
      },
      {
        readConcern: { level: 'snapshot' },
        writeConcern: { w: 'majority', j: true },
        readPreference: 'primary',
      },
    );

    if (!result) {
      throw new AppError(
        503,
        'TRANSACTION_OUTCOME_UNKNOWN',
        'Không xác định được kết quả transaction',
      );
    }
    return result;
  } finally {
    await session.endSession();
  }
}

export async function syncItems(
  board: BoardDocument,
  userId: Types.ObjectId,
  input: SyncItemsRequest,
): Promise<ItemDocument[]> {
  try {
    return await runSyncTransaction(board, userId, input);
  } catch (error) {
    const shapeId = duplicateShapeId(error);
    if (!shapeId) throw error;

    const current = await ItemModel.findOne({
      boardId: board._id,
      shapeId,
    }).exec();
    throw versionConflict(current?.version ?? 1, shapeId);
  }
}
