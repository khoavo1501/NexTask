import { VERSION_CONFLICT_CODE, type DemoteTaskRequest } from '@nextask/contracts';
import mongoose, { Types } from 'mongoose';
import { AppError } from '../../lib/errors.js';
import type { ActivityDocument } from '../activities/activity.model.js';
import { recordActivity } from '../activities/activity.service.js';
import type { BoardDocument } from '../boards/board.model.js';
import { ItemModel, type ItemDocument } from '../items/item.model.js';
import type { UserDocument } from '../users/user.model.js';
import { TaskModel, type TaskDocument } from './task.model.js';

export interface DemoteInput {
  board: BoardDocument;
  taskId: string;
  actor: UserDocument;
  request: DemoteTaskRequest;
  beforeActivityInsert?: () => Promise<void>;
}

export interface DemoteResult {
  task: TaskDocument;
  item: ItemDocument;
  activity: ActivityDocument;
}

function notDemotable(message: string): AppError {
  return new AppError(409, 'TASK_NOT_DEMOTABLE', message);
}

function demoteConflict(currentVersion: number, field: 'task' | 'item'): AppError {
  return new AppError(409, VERSION_CONFLICT_CODE, 'Dữ liệu đã thay đổi, vui lòng tải lại', {
    currentVersion,
    field,
  });
}

function alreadyDemoted(): AppError {
  return new AppError(409, 'ALREADY_DEMOTED', 'Task đã được demote');
}

export async function demoteTask(input: DemoteInput): Promise<DemoteResult> {
  if (!Types.ObjectId.isValid(input.taskId)) {
    throw new AppError(404, 'NOT_FOUND', 'Không tìm thấy task');
  }

  const existing = await TaskModel.findOne({
    _id: input.taskId,
    boardId: input.board._id,
  }).exec();
  if (!existing) throw new AppError(404, 'NOT_FOUND', 'Không tìm thấy task');
  if (existing.lifecycle === 'demoted') throw alreadyDemoted();
  if (!existing.sourceItemId) throw notDemotable('Task không gắn với note');

  const session = await mongoose.startSession();
  try {
    const result = await session.withTransaction(
      async () => {
        const task = await TaskModel.findOne({
          _id: existing._id,
          boardId: input.board._id,
        }).session(session);
        if (!task) throw new AppError(404, 'NOT_FOUND', 'Không tìm thấy task');
        if (task.lifecycle === 'demoted') throw alreadyDemoted();
        if (!task.sourceItemId) throw notDemotable('Task không gắn với note');

        const item = await ItemModel.findOne({
          _id: task.sourceItemId,
          boardId: input.board._id,
        }).session(session);
        if (!item) throw notDemotable('Note nguồn không còn tồn tại');
        if (task.version !== input.request.expectedTaskVersion) {
          throw demoteConflict(task.version, 'task');
        }
        if (item.version !== input.request.expectedItemVersion) {
          throw demoteConflict(item.version, 'item');
        }
        if (!item.promotedTaskId || !item.promotedTaskId.equals(task._id)) {
          throw notDemotable('Task không còn liên kết với note');
        }

        const now = new Date();
        const updatedTask = await TaskModel.findOneAndUpdate(
          {
            _id: task._id,
            boardId: input.board._id,
            lifecycle: 'active',
            version: input.request.expectedTaskVersion,
          },
          {
            $set: {
              lifecycle: 'demoted',
              demotedAt: now,
              demotedBy: input.actor._id,
            },
            $inc: { version: 1 },
          },
          { returnDocument: 'after', session },
        ).exec();
        if (!updatedTask) {
          const current = await TaskModel.findOne({
            _id: task._id,
            boardId: input.board._id,
          })
            .session(session)
            .exec();
          if (!current) throw new AppError(404, 'NOT_FOUND', 'Không tìm thấy task');
          if (current.lifecycle === 'demoted') throw alreadyDemoted();
          throw demoteConflict(current.version, 'task');
        }

        const updatedItem = await ItemModel.findOneAndUpdate(
          {
            _id: item._id,
            boardId: input.board._id,
            promotedTaskId: task._id,
            version: input.request.expectedItemVersion,
          },
          { $set: { promotedTaskId: null }, $inc: { version: 1 } },
          { returnDocument: 'after', session },
        ).exec();
        if (!updatedItem) {
          const current = await ItemModel.findOne({
            _id: item._id,
            boardId: input.board._id,
          })
            .session(session)
            .exec();
          if (!current) throw notDemotable('Note nguồn không còn tồn tại');
          throw demoteConflict(current.version, 'item');
        }

        await input.beforeActivityInsert?.();
        const activity = await recordActivity({
          session,
          boardId: input.board._id,
          actorId: input.actor._id,
          action: 'item.demoted',
          refs: {
            itemId: updatedItem._id,
            taskId: updatedTask._id,
            columnId: updatedTask.columnId,
          },
          snapshot: {
            taskTitle: updatedTask.title,
            columnId: updatedTask.columnId,
          },
          undoableUntil: null,
        });

        return { task: updatedTask, item: updatedItem, activity };
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
