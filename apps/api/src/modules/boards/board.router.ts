import {
  createBoardRequestSchema,
  createInvitationRequestSchema,
  renameBoardRequestSchema,
  type BoardDto,
  type BoardMemberDetailDto,
  type InvitationCreateResponse,
} from '@nextask/contracts';
import { Router } from 'express';
import { AppError } from '../../lib/errors.js';
import { serializeBoard } from '../../lib/serialize.js';
import { createInvitation } from '../invitations/invitation.service.js';
import { createItemsRouter } from '../items/item.router.js';
import { createTasksRouter } from '../tasks/task.router.js';
import { loadBoardAccess, requireOwner } from './board-access.js';
import { createBoard, listBoardMembers, listBoardsForUser, renameBoard } from './board.service.js';

export function createBoardsRouter(): Router {
  const router = Router();

  router.get('/', async (request, response) => {
    if (!request.user) {
      throw new AppError(401, 'UNAUTHENTICATED', 'Cần đăng nhập');
    }

    const entries = await listBoardsForUser(request.user._id);
    response.json({
      data: entries.map(({ board, role }) => serializeBoard(board, role)),
      meta: { requestId: request.requestId },
    });
  });

  router.post('/', async (request, response) => {
    if (!request.user) {
      throw new AppError(401, 'UNAUTHENTICATED', 'Cần đăng nhập');
    }

    const input = createBoardRequestSchema.parse(request.body);
    const { board, role } = await createBoard(request.user._id, input);
    const data: BoardDto = serializeBoard(board, role);

    response.status(201).json({
      data,
      meta: { requestId: request.requestId },
    });
  });

  router.use('/:boardId', loadBoardAccess);

  router.get('/:boardId', (request, response) => {
    if (!request.board || !request.boardRole) {
      throw new AppError(404, 'NOT_FOUND', 'Không tìm thấy board');
    }

    const data: BoardDto = serializeBoard(request.board, request.boardRole);
    response.json({
      data,
      meta: { requestId: request.requestId },
    });
  });

  router.patch('/:boardId', requireOwner, async (request, response) => {
    if (!request.board || !request.boardRole) {
      throw new AppError(404, 'NOT_FOUND', 'Không tìm thấy board');
    }

    const input = renameBoardRequestSchema.parse(request.body);
    const board = await renameBoard(request.board, input);
    const data: BoardDto = serializeBoard(board, request.boardRole);
    response.json({
      data,
      meta: { requestId: request.requestId },
    });
  });

  router.get('/:boardId/members', async (request, response) => {
    if (!request.board) {
      throw new AppError(404, 'NOT_FOUND', 'Không tìm thấy board');
    }

    const members: BoardMemberDetailDto[] = await listBoardMembers(request.board);
    response.json({
      data: members,
      meta: { requestId: request.requestId },
    });
  });

  router.post('/:boardId/invitations', requireOwner, async (request, response) => {
    if (!request.board || !request.user) {
      throw new AppError(401, 'UNAUTHENTICATED', 'Cần đăng nhập');
    }

    const input = createInvitationRequestSchema.parse(request.body);
    const invitation = await createInvitation(request.board, request.user, input);
    const body: InvitationCreateResponse = {
      data: invitation,
      meta: { requestId: request.requestId },
    };

    response.status(201).json(body);
  });

  router.use('/:boardId/items', createItemsRouter());
  router.use('/:boardId/tasks', createTasksRouter());

  return router;
}
