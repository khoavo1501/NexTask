import type { BoardDto } from '@nextask/contracts';
import { Router } from 'express';
import { AppError } from '../../lib/errors.js';
import { serializeBoard } from '../../lib/serialize.js';
import { acceptInvitation } from './invitation.service.js';

export function createInvitationsRouter(): Router {
  const router = Router();

  router.post('/:token/accept', async (request, response) => {
    if (!request.user) {
      throw new AppError(401, 'UNAUTHENTICATED', 'Cần đăng nhập');
    }

    const token = request.params.token;
    if (typeof token !== 'string' || !token) {
      throw new AppError(404, 'INVITATION_INVALID', 'Lời mời không hợp lệ');
    }

    const { board, role } = await acceptInvitation(token, request.user);
    const data: BoardDto = serializeBoard(board, role);

    response.json({
      data,
      meta: { requestId: request.requestId },
    });
  });

  return router;
}
