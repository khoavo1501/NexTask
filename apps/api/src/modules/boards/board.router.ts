import { createBoardRequestSchema, type BoardDto } from '@nextask/contracts';
import { Router } from 'express';
import { serializeBoard } from '../../lib/serialize.js';
import { createItemsRouter } from '../items/item.router.js';
import { createTasksRouter } from '../tasks/task.router.js';
import { createBoard, getBoardForOwner, listBoards } from './board.service.js';

export function createBoardsRouter(): Router {
  const router = Router();

  router.get('/', async (request, response) => {
    const boards = await listBoards(request.ownerId);
    const data: BoardDto[] = boards.map(serializeBoard);
    response.json({
      data,
      meta: { requestId: request.requestId },
    });
  });

  router.post('/', async (request, response) => {
    const input = createBoardRequestSchema.parse(request.body);
    const board = await createBoard(request.ownerId, input);
    const data: BoardDto = serializeBoard(board);

    response.status(201).json({
      data,
      meta: { requestId: request.requestId },
    });
  });

  router.get('/:boardId', async (request, response) => {
    const boardId = request.params.boardId;
    if (!boardId) {
      throw new Error('boardId is required');
    }
    const board = await getBoardForOwner(boardId, request.ownerId);
    const data: BoardDto = serializeBoard(board);

    response.json({
      data,
      meta: { requestId: request.requestId },
    });
  });

  router.use('/:boardId/items', createItemsRouter());
  router.use('/:boardId/tasks', createTasksRouter());

  return router;
}
