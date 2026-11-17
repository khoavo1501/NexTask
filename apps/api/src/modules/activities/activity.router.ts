import { activityListQuerySchema, type ActivityDto } from '@nextask/contracts';
import { Router } from 'express';
import { AppError } from '../../lib/errors.js';
import { serializeActivity, serializeItem, serializeTask } from '../../lib/serialize.js';
import { listActivities } from './activity.service.js';
import { undoPromote } from './undo.service.js';

export function createActivitiesRouter(): Router {
  const router = Router({ mergeParams: true });

  router.get('/', async (request, response) => {
    if (!request.board) {
      throw new AppError(404, 'NOT_FOUND', 'Không tìm thấy board');
    }

    const query = activityListQuerySchema.parse(request.query);
    const activities = await listActivities(request.board._id, query.limit);
    const data: ActivityDto[] = activities.map(serializeActivity);

    response.json({
      data,
      meta: { requestId: request.requestId },
    });
  });

  router.post('/:activityId/undo', async (request, response) => {
    if (!request.board || !request.user) {
      throw new AppError(401, 'UNAUTHENTICATED', 'Cần đăng nhập');
    }

    const params = request.params as { activityId?: string };
    if (!params.activityId) {
      throw new AppError(404, 'NOT_FOUND', 'Không tìm thấy activity');
    }

    const result = await undoPromote({
      board: request.board,
      actor: request.user,
      activityId: params.activityId,
    });

    response.json({
      data: {
        task: serializeTask(result.task),
        item: serializeItem(result.item),
        activity: serializeActivity(result.activity),
      },
      meta: { requestId: request.requestId },
    });
  });

  return router;
}
