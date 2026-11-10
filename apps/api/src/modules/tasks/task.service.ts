import type { MoveTaskRequest } from '@nextask/contracts';
import { generateKeyBetween } from 'fractional-indexing';
import { Types } from 'mongoose';
import { AppError } from '../../lib/errors.js';
import { orderConflict, versionConflict } from '../../lib/versioning.js';
import type { BoardDocument } from '../boards/board.model.js';
import { TaskModel, type TaskDocument } from './task.model.js';

export async function listTasks(board: BoardDocument): Promise<TaskDocument[]> {
  return TaskModel.find({ boardId: board._id, lifecycle: 'active' })
    .sort({ columnId: 1, order: 1 })
    .exec();
}

function isDuplicateKeyError(error: unknown): boolean {
  const direct = error as { code?: number };
  if (direct.code === 11_000) return true;

  const writeErrors = (error as { writeErrors?: Array<{ err?: { code?: number } }> })
    .writeErrors;
  return writeErrors?.[0]?.err?.code === 11_000;
}

async function resolveOrder(
  board: BoardDocument,
  task: TaskDocument,
  targetColumnId: string,
  beforeTaskId: string | null,
): Promise<string> {
  let beforeTask: TaskDocument | null = null;
  if (beforeTaskId) {
    beforeTask = await TaskModel.findOne({
      _id: beforeTaskId,
      boardId: board._id,
      columnId: targetColumnId,
      lifecycle: 'active',
    }).exec();
    if (!beforeTask) {
      throw new AppError(422, 'VALIDATION_ERROR', 'Task mốc không tồn tại trong cột đích');
    }
  }

  const prevTask = await TaskModel.findOne({
    boardId: board._id,
    columnId: targetColumnId,
    lifecycle: 'active',
    _id: { $ne: task._id },
    ...(beforeTask ? { order: { $lt: beforeTask.order } } : {}),
  })
    .sort({ order: -1 })
    .exec();

  return generateKeyBetween(prevTask?.order ?? null, beforeTask?.order ?? null);
}

export async function moveTask(
  board: BoardDocument,
  taskId: string,
  input: MoveTaskRequest,
): Promise<TaskDocument> {
  if (!Types.ObjectId.isValid(taskId)) {
    throw new AppError(404, 'NOT_FOUND', 'Không tìm thấy task');
  }

  const targetColumn = board.columns.find((column) => column.id === input.columnId);
  if (!targetColumn) {
    throw new AppError(422, 'VALIDATION_ERROR', 'Cột đích không tồn tại');
  }
  if (input.beforeTaskId === taskId) {
    throw new AppError(422, 'VALIDATION_ERROR', 'Không thể chèn task trước chính nó');
  }

  let task = await TaskModel.findOne({
    _id: taskId,
    boardId: board._id,
    lifecycle: 'active',
  }).exec();
  if (!task) {
    throw new AppError(404, 'NOT_FOUND', 'Không tìm thấy task');
  }
  if (task.version !== input.expectedVersion) {
    throw versionConflict(task.version);
  }

  for (let attempt = 0; attempt < 2; attempt += 1) {
    const order = await resolveOrder(board, task, targetColumn.id, input.beforeTaskId);
    if (task.columnId === targetColumn.id && order === task.order) {
      return task;
    }

    try {
      const updated = await TaskModel.findOneAndUpdate(
        {
          _id: task._id,
          boardId: board._id,
          lifecycle: 'active',
          version: input.expectedVersion,
        },
        { $set: { columnId: targetColumn.id, order }, $inc: { version: 1 } },
        { returnDocument: 'after' },
      ).exec();

      if (!updated) {
        const current = await TaskModel.findOne({
          _id: task._id,
          boardId: board._id,
          lifecycle: 'active',
        }).exec();
        if (!current) {
          throw new AppError(404, 'NOT_FOUND', 'Không tìm thấy task');
        }
        throw versionConflict(current.version);
      }
      return updated;
    } catch (error) {
      if (!isDuplicateKeyError(error)) throw error;
      if (attempt === 1) throw orderConflict(targetColumn.id);

      const current = await TaskModel.findById(task._id).exec();
      if (!current) {
        throw new AppError(404, 'NOT_FOUND', 'Không tìm thấy task');
      }
      if (current.version !== input.expectedVersion) {
        throw versionConflict(current.version);
      }
      task = current;
    }
  }

  throw orderConflict(targetColumn.id);
}
