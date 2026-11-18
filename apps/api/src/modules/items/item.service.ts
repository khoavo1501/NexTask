import type { SyncItemInput, SyncItemsRequest } from '@nextask/contracts';
import mongoose, { type Types } from 'mongoose';
import { AppError } from '../../lib/errors.js';
import { versionConflict } from '../../lib/versioning.js';
import type { BoardDocument } from '../boards/board.model.js';
import { ItemModel, type ItemDocument } from './item.model.js';

interface DuplicateKeyShape {
  shapeId?: unknown;
}

type FrameSyncItem = Extract<SyncItemInput, { type: 'frame' }>;
type NoteSyncItem = Extract<SyncItemInput, { type: 'note' }>;

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
  return ItemModel.find({ boardId: board._id, type: { $in: ['note', 'frame'] } })
    .sort({ createdAt: 1, _id: 1 })
    .exec();
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
          type: { $in: ['note', 'frame'] },
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
          if (!current) continue;
          if (current.type === 'note' && current.promotedTaskId) continue;
          if (current.version !== deleted.expectedVersion) {
            throw versionConflict(current.version, deleted.shapeId);
          }
        }

        const now = new Date();
        const frameInputs = input.items.filter(
          (item): item is FrameSyncItem => item.type === 'frame',
        );
        const noteInputs = input.items.filter(
          (item): item is NoteSyncItem => item.type === 'note',
        );

        for (const item of frameInputs) {
          if (item.size.w !== item.props.w || item.size.h !== item.props.h) {
            throw new AppError(422, 'VALIDATION_ERROR', 'Frame size không khớp props');
          }
        }

        const frameOps = frameInputs.map((item) => {
          const current = byShapeId.get(item.shapeId);
          const fields = {
            type: 'frame' as const,
            content: '',
            style: item.style,
            props: item.props,
            position: item.position,
            size: { w: item.props.w, h: item.props.h },
            rotation: 0,
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

        if (frameOps.length > 0) {
          await ItemModel.bulkWrite(frameOps, { session });
        }

        const frameByShapeId = new Map<string, Types.ObjectId>();
        if (frameInputs.length > 0) {
          const frames = await ItemModel.find({
            boardId: board._id,
            type: 'frame',
            shapeId: { $in: frameInputs.map((item) => item.shapeId) },
          }).session(session);
          for (const frame of frames) frameByShapeId.set(frame.shapeId, frame._id);
        }

        const missingParentShapeIds = [
          ...new Set(
            noteInputs
              .map((item) => item.parentShapeId)
              .filter(
                (shapeId): shapeId is string =>
                  shapeId !== null && !frameByShapeId.has(shapeId),
              ),
          ),
        ];
        if (missingParentShapeIds.length > 0) {
          const frames = await ItemModel.find({
            boardId: board._id,
            type: 'frame',
            shapeId: { $in: missingParentShapeIds },
          }).session(session);
          for (const frame of frames) frameByShapeId.set(frame.shapeId, frame._id);
        }

        for (const item of noteInputs) {
          if (item.parentShapeId && !frameByShapeId.has(item.parentShapeId)) {
            throw new AppError(422, 'FRAME_NOT_FOUND', 'Frame cha không tồn tại');
          }
        }

        const noteOps = noteInputs.map((item) => {
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
            parentFrameId: item.parentShapeId
              ? (frameByShapeId.get(item.parentShapeId) ?? null)
              : null,
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
          if (!current || current.type !== 'note' || current.promotedTaskId) return [];
          return [
            {
              deleteOne: {
                filter: { _id: current._id, version: deleted.expectedVersion },
              },
            },
          ];
        });

        if (noteOps.length > 0) {
          await ItemModel.bulkWrite(noteOps, { session });
        }
        if (deleteOps.length > 0) {
          await ItemModel.bulkWrite(deleteOps, { session });
        }

        const framesToDelete: ItemDocument[] = [];
        for (const deleted of input.deleted) {
          const current = byShapeId.get(deleted.shapeId);
          if (current?.type === 'frame') framesToDelete.push(current);
        }

        for (const frame of framesToDelete) {
          const children = await ItemModel.find({
            boardId: board._id,
            parentFrameId: frame._id,
          }).session(session);
          for (const child of children) {
            const updatedChild = await ItemModel.updateOne(
              { _id: child._id, version: child.version },
              {
                $set: {
                  parentFrameId: null,
                  position: {
                    x: frame.position.x + child.position.x,
                    y: frame.position.y + child.position.y,
                  },
                  updatedAt: now,
                },
                $inc: { version: 1 },
              },
              { session },
            );
            if (updatedChild.matchedCount !== 1) {
              throw versionConflict(child.version, child.shapeId);
            }
          }

          const deletedFrame = await ItemModel.deleteOne(
            { _id: frame._id, version: frame.version },
            { session },
          );
          if (deletedFrame.deletedCount !== 1) {
            throw versionConflict(frame.version, frame.shapeId);
          }
        }

        return ItemModel.find({ boardId: board._id, type: { $in: ['note', 'frame'] } })
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
