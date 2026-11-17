import { reportQuerySchema } from '@nextask/contracts';
import { Router } from 'express';
import { AppError } from '../../lib/errors.js';
import { getStalledIdeasReport } from './report.service.js';

export function createReportsRouter(): Router {
  const router = Router({ mergeParams: true });

  router.get('/stalled-ideas', async (request, response) => {
    if (!request.board) {
      throw new AppError(404, 'NOT_FOUND', 'Không tìm thấy board');
    }
    const query = reportQuerySchema.parse(request.query);
    const data = await getStalledIdeasReport(request.board, {
      minVotes: query.minVotes ?? request.board.settings.minVotes,
      stalledDays: query.stalledDays ?? request.board.settings.stalledAfterDays,
      limit: query.limit,
    });
    response.json({ data, meta: { requestId: request.requestId } });
  });

  return router;
}
