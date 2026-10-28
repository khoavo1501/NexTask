import { moveTaskRequestSchema, type TaskDto } from '@nextask/contracts';
import { Router } from 'express';
import { AppError } from '../../lib/errors.js';
import { serializeTask } from '../../lib/serialize.js';
import { listTasks, moveTask } from './task.service.js';

export function createTasksRouter(): Router {
  const router = Router({ mergeParams: true });

  router.get('/', async (request, response) => {
    const boardId = (request.params as { boardId?: string }).boardId;
    if (!boardId) {
      throw new AppError(404, 'NOT_FOUND', 'Không tìm thấy board');
    }

    const tasks = await listTasks(boardId, request.ownerId);
    const data: TaskDto[] = tasks.map(serializeTask);
    response.json({
      data,
      meta: { requestId: request.requestId },
    });
  });

  router.patch('/:taskId', async (request, response) => {
    const params = request.params as { boardId?: string; taskId?: string };
    if (!params.boardId || !params.taskId) {
      throw new AppError(404, 'NOT_FOUND', 'Không tìm thấy task');
    }

    const input = moveTaskRequestSchema.parse(request.body);
    const task = await moveTask(params.boardId, params.taskId, request.ownerId, input);
    const data: TaskDto = serializeTask(task);

    response.json({
      data,
      meta: { requestId: request.requestId },
    });
  });

  return router;
}
