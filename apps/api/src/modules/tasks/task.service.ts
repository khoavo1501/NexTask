import type { MoveTaskRequest } from '@nextask/contracts';
import { generateKeyBetween } from 'fractional-indexing';
import { Types } from 'mongoose';
import { AppError } from '../../lib/errors.js';
import { getBoardForOwner } from '../boards/board.service.js';
import { TaskModel, type TaskDocument } from './task.model.js';

export async function listTasks(boardId: string, ownerId: Types.ObjectId): Promise<TaskDocument[]> {
  const board = await getBoardForOwner(boardId, ownerId);
  return TaskModel.find({ boardId: board._id, lifecycle: 'active' })
    .sort({ columnId: 1, order: 1 })
    .exec();
}

export async function moveTask(
  boardId: string,
  taskId: string,
  ownerId: Types.ObjectId,
  input: MoveTaskRequest,
): Promise<TaskDocument> {
  const board = await getBoardForOwner(boardId, ownerId);
  if (!Types.ObjectId.isValid(taskId)) {
    throw new AppError(404, 'NOT_FOUND', 'Không tìm thấy task');
  }

  const targetColumn = board.columns.find((column) => column.id === input.columnId);
  if (!targetColumn) {
    throw new AppError(422, 'VALIDATION_ERROR', 'Cột đích không tồn tại');
  }

  const task = await TaskModel.findOne({
    _id: taskId,
    boardId: board._id,
    lifecycle: 'active',
  }).exec();
  if (!task) {
    throw new AppError(404, 'NOT_FOUND', 'Không tìm thấy task');
  }
  if (task.columnId === targetColumn.id) {
    return task;
  }

  const lastTask = await TaskModel.findOne({
    boardId: board._id,
    columnId: targetColumn.id,
    lifecycle: 'active',
    _id: { $ne: task._id },
  })
    .sort({ order: -1 })
    .exec();
  const order = generateKeyBetween(lastTask?.order ?? null, null);

  const updated = await TaskModel.findOneAndUpdate(
    { _id: task._id, boardId: board._id, lifecycle: 'active' },
    { $set: { columnId: targetColumn.id, order }, $inc: { version: 1 } },
    { returnDocument: 'after' },
  ).exec();

  if (!updated) {
    throw new AppError(404, 'NOT_FOUND', 'Không tìm thấy task');
  }
  return updated;
}
