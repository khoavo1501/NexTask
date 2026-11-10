import { activityListQuerySchema, type ActivityDto } from '@nextask/contracts';
import { Router } from 'express';
import { AppError } from '../../lib/errors.js';
import { serializeActivity } from '../../lib/serialize.js';
import { listActivities } from './activity.service.js';

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

  return router;
}
