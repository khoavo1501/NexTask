import { voteResultsQuerySchema } from '@nextask/contracts';
import { Router } from 'express';
import { AppError } from '../../lib/errors.js';
import { getVoteResults } from './voting.service.js';

export function createVotesRouter(): Router {
  const router = Router({ mergeParams: true });

  router.get('/results', async (request, response) => {
    if (!request.board || !request.user) {
      throw new AppError(401, 'UNAUTHENTICATED', 'Cần đăng nhập');
    }
    const query = voteResultsQuerySchema.parse(request.query);
    const data = await getVoteResults(request.board, request.user._id, query.limit);
    response.json({ data, meta: { requestId: request.requestId } });
  });

  return router;
}
