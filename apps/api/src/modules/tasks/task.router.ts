import {
  createTaskRequestSchema,
  moveTaskRequestSchema,
  taskListQuerySchema,
  type TaskDto,
} from '@nextask/contracts';
import { Router } from 'express';
import { AppError } from '../../lib/errors.js';
import { serializeTask } from '../../lib/serialize.js';
import { createTask, listTasks, moveTask } from './task.service.js';

export function createTasksRouter(): Router {
  const router = Router({ mergeParams: true });

  router.get('/', async (request, response) => {
    if (!request.board) {
      throw new AppError(404, 'NOT_FOUND', 'Không tìm thấy board');
    }

    const query = taskListQuerySchema.parse(request.query);
    const labels = (query.labels ?? '')
      .split(',')
      .map((label) => label.trim())
      .filter((label) => label.length > 0);
    if (labels.length > 10 || labels.some((label) => label.length > 50)) {
      throw new AppError(422, 'VALIDATION_ERROR', 'Bộ lọc label không hợp lệ');
    }

    const result = await listTasks(request.board, {
      columnId: query.columnId,
      assigneeId: query.assigneeId,
      priority: query.priority,
      labels,
      q: query.q,
      limit: query.limit,
    });
    const data: TaskDto[] = result.tasks.map(serializeTask);

    response.json({
      data,
      meta: { requestId: request.requestId, hasMore: result.hasMore },
    });
  });

  router.post('/', async (request, response) => {
    if (!request.board || !request.user) {
      throw new AppError(401, 'UNAUTHENTICATED', 'Cần đăng nhập');
    }

    const input = createTaskRequestSchema.parse(request.body);
    const task = await createTask(request.board, request.user._id, input);
    const data: TaskDto = serializeTask(task);

    response.status(201).json({
      data,
      meta: { requestId: request.requestId },
    });
  });

  router.post('/:taskId/move', async (request, response) => {
    if (!request.board) {
      throw new AppError(404, 'NOT_FOUND', 'Không tìm thấy board');
    }

    const params = request.params as { taskId?: string };
    if (!params.taskId) {
      throw new AppError(404, 'NOT_FOUND', 'Không tìm thấy task');
    }

    const input = moveTaskRequestSchema.parse(request.body);
    const task = await moveTask(request.board, params.taskId, input);
    const data: TaskDto = serializeTask(task);

    response.json({
      data,
      meta: { requestId: request.requestId },
    });
  });

  return router;
}
