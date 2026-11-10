import {
  BATCH_PROMOTE_CONFLICT_CODE,
  type BatchPromoteConflictDetails,
  type BatchPromoteRequest,
} from '@nextask/contracts';
import { generateKeyBetween } from 'fractional-indexing';
import mongoose, { Types } from 'mongoose';
import { AppError } from '../../lib/errors.js';
import type { ActivityDocument } from '../activities/activity.model.js';
import { PROMOTE_UNDO_WINDOW_MS, recordActivity } from '../activities/activity.service.js';
import type { BoardDocument } from '../boards/board.model.js';
import { TaskModel, type TaskDocument } from '../tasks/task.model.js';
import type { UserDocument } from '../users/user.model.js';
import { ItemModel, type ItemDocument } from './item.model.js';

type BatchError = BatchPromoteConflictDetails['errors'][number];

export interface BatchPromoteInput {
  board: BoardDocument;
  actor: UserDocument;
  request: BatchPromoteRequest;
  beforeTaskInsert?: () => Promise<void>;
  beforeItemUpdate?: () => Promise<void>;
  beforeActivityInsert?: () => Promise<void>;
}

export interface BatchPromoteResult {
  items: ItemDocument[];
  tasks: TaskDocument[];
  activities: ActivityDocument[];
}

function batchConflict(errors: BatchError[]): AppError {
  return new AppError(409, BATCH_PROMOTE_CONFLICT_CODE, 'Không promote được toàn bộ batch', {
    errors,
  });
}

function duplicateSourceItemId(error: unknown): string | null {
  const typed = error as {
    code?: number;
    keyValue?: { sourceItemId?: unknown };
    writeErrors?: Array<{ err?: { code?: number; keyValue?: { sourceItemId?: unknown } } }>;
  };
  const direct =
    typed.code === 11_000 && typed.keyValue?.sourceItemId
      ? String(typed.keyValue.sourceItemId)
      : null;
  const nested = typed.writeErrors?.[0]?.err;
  if (nested?.code === 11_000 && nested.keyValue?.sourceItemId) {
    return String(nested.keyValue.sourceItemId);
  }
  return direct;
}

function titleFor(content: string): string {
  const trimmed = content.trim();
  return trimmed.length > 0 ? trimmed.slice(0, 200) : 'Ghi chú không tiêu đề';
}

export async function promoteBatch(input: BatchPromoteInput): Promise<BatchPromoteResult> {
  const column = input.board.columns.find((entry) => entry.id === input.request.columnId);
  if (!column) {
    throw new AppError(422, 'VALIDATION_ERROR', 'Cột đích không tồn tại');
  }
  if (input.request.items.length > 100) {
    throw new AppError(422, 'VALIDATION_ERROR', 'Batch tối đa 100 item');
  }

  const errors: BatchError[] = [];
  for (const entry of input.request.items) {
    if (!Types.ObjectId.isValid(entry.itemId)) {
      errors.push({
        itemId: entry.itemId,
        code: 'NOT_FOUND',
        message: 'Item không hợp lệ',
      });
    }
  }
  if (errors.length > 0) throw batchConflict(errors);

  const session = await mongoose.startSession();
  try {
    let result: BatchPromoteResult | null = null;
    try {
      result = await session.withTransaction(
        async () => {
          const objectIds = input.request.items.map((entry) => new Types.ObjectId(entry.itemId));
          const found = await ItemModel.find({
            _id: { $in: objectIds },
            boardId: input.board._id,
          }).session(session);
          const byId = new Map(found.map((item) => [item._id.toHexString(), item]));
          const itemErrors: BatchError[] = [];
          const orderedItems: ItemDocument[] = [];

          for (const entry of input.request.items) {
            const item = byId.get(entry.itemId);
            if (!item) {
              itemErrors.push({
                itemId: entry.itemId,
                code: 'NOT_FOUND',
                message: 'Không tìm thấy item',
              });
              continue;
            }
            if (item.type !== 'note') {
              itemErrors.push({
                itemId: entry.itemId,
                shapeId: item.shapeId,
                code: 'NOT_A_NOTE',
                message: 'Item không phải note',
              });
              continue;
            }
            if (item.promotedTaskId) {
              itemErrors.push({
                itemId: entry.itemId,
                shapeId: item.shapeId,
                code: 'ALREADY_PROMOTED',
                message: 'Item đã được promote',
              });
              continue;
            }
            if (item.version !== entry.expectedItemVersion) {
              itemErrors.push({
                itemId: entry.itemId,
                shapeId: item.shapeId,
                code: 'VERSION_CONFLICT',
                currentVersion: item.version,
                message: 'Item đã thay đổi',
              });
              continue;
            }
            orderedItems.push(item);
          }

          if (itemErrors.length > 0) throw batchConflict(itemErrors);

          const lastTask = await TaskModel.findOne({
            boardId: input.board._id,
            columnId: column.id,
            lifecycle: 'active',
          })
            .sort({ order: -1 })
            .session(session);

          let previousOrder = lastTask?.order ?? null;
          const taskPayloads = orderedItems.map((item) => {
            const order = generateKeyBetween(previousOrder, null);
            previousOrder = order;
            return {
              boardId: input.board._id,
              columnId: column.id,
              order,
              title: titleFor(item.content),
              description: item.content,
              assigneeId: input.request.assignToMe ? input.actor._id : null,
              labels: [],
              priority: 'medium' as const,
              dueDate: null,
              lifecycle: 'active' as const,
              sourceItemId: item._id,
              origin: {
                itemId: item._id,
                frameId: item.parentFrameId,
                position: { x: item.position.x, y: item.position.y },
                voteCount: item.votes.length,
                authorId: item.authorId,
                itemCreatedAt: item.createdAt,
              },
              version: 1,
              createdBy: input.actor._id,
            };
          });

          await input.beforeTaskInsert?.();
          const tasks = await TaskModel.create(taskPayloads, { session, ordered: true });
          if (tasks.length !== orderedItems.length) {
            throw new Error('Không tạo đủ task cho batch');
          }

          await input.beforeItemUpdate?.();
          const updatedItems: ItemDocument[] = [];
          for (let index = 0; index < orderedItems.length; index += 1) {
            const item = orderedItems[index];
            const task = tasks[index];
            if (!item || !task) throw new Error('Batch item/task thiếu');
            const updated = await ItemModel.findOneAndUpdate(
              {
                _id: item._id,
                boardId: input.board._id,
                promotedTaskId: null,
                version: input.request.items[index]?.expectedItemVersion,
              },
              { $set: { promotedTaskId: task._id }, $inc: { version: 1 } },
              { returnDocument: 'after', session },
            ).exec();
            if (!updated) {
              throw batchConflict([
                {
                  itemId: item._id.toHexString(),
                  shapeId: item.shapeId,
                  code: 'VERSION_CONFLICT',
                  message: 'Item đã thay đổi trong batch',
                },
              ]);
            }
            updatedItems.push(updated);
          }

          await input.beforeActivityInsert?.();
          const activities: ActivityDocument[] = [];
          for (let index = 0; index < updatedItems.length; index += 1) {
            const item = updatedItems[index];
            const task = tasks[index];
            if (!item || !task) throw new Error('Batch activity thiếu item/task');
            activities.push(
              await recordActivity({
                session,
                boardId: input.board._id,
                actorId: input.actor._id,
                action: 'item.promoted',
                refs: {
                  itemId: item._id,
                  taskId: task._id,
                  columnId: task.columnId,
                },
                snapshot: {
                  taskTitle: task.title,
                  columnId: task.columnId,
                  taskVersionAtPromote: task.version,
                  itemVersionAtPromote: item.version,
                },
                undoableUntil: new Date(Date.now() + PROMOTE_UNDO_WINDOW_MS),
              }),
            );
          }

          return { items: updatedItems, tasks, activities };
        },
        {
          readConcern: { level: 'snapshot' },
          writeConcern: { w: 'majority', j: true },
          readPreference: 'primary',
        },
      );
    } catch (error) {
      const sourceItemId = duplicateSourceItemId(error);
      if (sourceItemId) {
        throw batchConflict([
          {
            itemId: sourceItemId,
            code: 'ALREADY_PROMOTED',
            message: 'Item đã được promote',
          },
        ]);
      }
      throw error;
    }

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
