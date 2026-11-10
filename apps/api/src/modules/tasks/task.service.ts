import type {
  CreateTaskRequest,
  MoveTaskRequest,
  TaskPriority,
  UpdateTaskRequest,
} from '@nextask/contracts';
import { generateKeyBetween } from 'fractional-indexing';
import { Types } from 'mongoose';
import type { Filter } from 'mongodb';
import { AppError } from '../../lib/errors.js';
import { orderConflict, versionConflict } from '../../lib/versioning.js';
import type { BoardDocument } from '../boards/board.model.js';
import { TaskModel, type Task, type TaskDocument } from './task.model.js';

export interface TaskListOptions {
  columnId?: string;
  assigneeId?: string;
  priority?: TaskPriority;
  labels: string[];
  q?: string;
  limit: number;
}

export interface TaskListResult {
  tasks: TaskDocument[];
  hasMore: boolean;
}

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export async function listTasks(
  board: BoardDocument,
  options: TaskListOptions,
): Promise<TaskListResult> {
  if (options.columnId && !board.columns.some((column) => column.id === options.columnId)) {
    throw new AppError(422, 'VALIDATION_ERROR', 'Cột lọc không tồn tại');
  }

  const filter: Filter<Task> = {
    boardId: board._id,
    lifecycle: 'active',
  };
  if (options.columnId) filter.columnId = options.columnId;
  if (options.assigneeId === 'none') {
    filter.assigneeId = null;
  } else if (options.assigneeId) {
    filter.assigneeId = new Types.ObjectId(options.assigneeId);
  }
  if (options.priority) filter.priority = options.priority;
  if (options.labels.length > 0) filter.labels = { $all: options.labels };

  const q = options.q?.trim();
  if (q) {
    const regex = new RegExp(escapeRegex(q), 'i');
    filter.$or = [{ title: regex }, { description: regex }];
  }

  const tasks = await TaskModel.find(filter)
    .sort({ columnId: 1, order: 1, _id: 1 })
    .limit(options.limit + 1)
    .exec();

  return {
    tasks: tasks.slice(0, options.limit),
    hasMore: tasks.length > options.limit,
  };
}

function isDuplicateKeyError(error: unknown): boolean {
  const direct = error as { code?: number };
  if (direct.code === 11_000) return true;

  const writeErrors = (error as { writeErrors?: Array<{ err?: { code?: number } }> }).writeErrors;
  return writeErrors?.[0]?.err?.code === 11_000;
}

function normalizeLabels(labels?: string[]): string[] | undefined {
  if (labels === undefined) return undefined;
  return [...new Set(labels.map((label) => label.trim()).filter(Boolean))];
}

function assertAssigneeMember(
  board: BoardDocument,
  assigneeId: string | null | undefined,
): void {
  if (!assigneeId) return;
  if (!board.members.some((member) => member.userId.equals(assigneeId))) {
    throw new AppError(422, 'VALIDATION_ERROR', 'Assignee phải là thành viên board');
  }
}

async function appendOrder(board: BoardDocument, columnId: string): Promise<string> {
  const lastTask = await TaskModel.findOne({
    boardId: board._id,
    columnId,
    lifecycle: 'active',
  })
    .sort({ order: -1 })
    .exec();
  return generateKeyBetween(lastTask?.order ?? null, null);
}

export async function createTask(
  board: BoardDocument,
  actorId: Types.ObjectId,
  input: CreateTaskRequest,
): Promise<TaskDocument> {
  const column = board.columns.find((entry) => entry.id === input.columnId);
  if (!column) {
    throw new AppError(422, 'VALIDATION_ERROR', 'Cột đích không tồn tại');
  }
  assertAssigneeMember(board, input.assigneeId);

  const labels = normalizeLabels(input.labels) ?? [];
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const order = await appendOrder(board, column.id);
    try {
      return await TaskModel.create({
        boardId: board._id,
        columnId: column.id,
        order,
        title: input.title,
        description: input.description ?? '',
        assigneeId: input.assigneeId ?? null,
        labels,
        priority: input.priority ?? 'medium',
        dueDate: input.dueDate ? new Date(input.dueDate) : null,
        lifecycle: 'active',
        sourceItemId: null,
        origin: null,
        version: 1,
        createdBy: actorId,
      });
    } catch (error) {
      if (!isDuplicateKeyError(error)) throw error;
      if (attempt === 1) throw orderConflict(column.id);
    }
  }

  throw orderConflict(column.id);
}

export async function updateTask(
  board: BoardDocument,
  taskId: string,
  input: UpdateTaskRequest,
): Promise<TaskDocument> {
  if (!Types.ObjectId.isValid(taskId)) {
    throw new AppError(404, 'NOT_FOUND', 'Không tìm thấy task');
  }

  const task = await TaskModel.findOne({
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
  assertAssigneeMember(board, input.assigneeId);

  const updates: Record<string, unknown> = {};
  if (input.title !== undefined) updates.title = input.title;
  if (input.description !== undefined) updates.description = input.description;
  if (input.assigneeId !== undefined) {
    updates.assigneeId = input.assigneeId ? new Types.ObjectId(input.assigneeId) : null;
  }
  if (input.labels !== undefined) updates.labels = normalizeLabels(input.labels);
  if (input.priority !== undefined) updates.priority = input.priority;
  if (input.dueDate !== undefined) {
    updates.dueDate = input.dueDate ? new Date(input.dueDate) : null;
  }

  const updated = await TaskModel.findOneAndUpdate(
    {
      _id: task._id,
      boardId: board._id,
      lifecycle: 'active',
      version: input.expectedVersion,
    },
    { $set: updates, $inc: { version: 1 } },
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
