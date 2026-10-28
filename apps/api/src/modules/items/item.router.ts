import { promoteRequestSchema, syncItemsRequestSchema, type ItemDto } from '@nextask/contracts';
import { Router } from 'express';
import { AppError } from '../../lib/errors.js';
import { serializeItem, serializeTask } from '../../lib/serialize.js';
import { listItems, syncItems } from './item.service.js';
import { promoteItem } from './promotion.service.js';

export function createItemsRouter(): Router {
  const router = Router({ mergeParams: true });

  router.get('/', async (request, response) => {
    if (!request.board) {
      throw new AppError(404, 'NOT_FOUND', 'Không tìm thấy board');
    }

    const items = await listItems(request.board);
    response.json({
      data: items.map(serializeItem),
      meta: { requestId: request.requestId },
    });
  });

  router.put('/', async (request, response) => {
    if (!request.board || !request.user) {
      throw new AppError(401, 'UNAUTHENTICATED', 'Cần đăng nhập');
    }

    const input = syncItemsRequestSchema.parse(request.body);
    const items = await syncItems(request.board, request.user._id, input.items);
    const data: ItemDto[] = items.map(serializeItem);

    response.json({
      data,
      meta: { requestId: request.requestId },
    });
  });

  router.post('/:itemId/promote', async (request, response) => {
    if (!request.board || !request.user) {
      throw new AppError(401, 'UNAUTHENTICATED', 'Cần đăng nhập');
    }

    const params = request.params as { itemId?: string };
    if (!params.itemId) {
      throw new AppError(404, 'NOT_FOUND', 'Không tìm thấy item');
    }

    const input = promoteRequestSchema.parse(request.body);
    const result = await promoteItem({
      board: request.board,
      itemId: params.itemId,
      actor: request.user,
      request: input,
    });

    response.status(201).json({
      data: {
        item: serializeItem(result.item),
        task: serializeTask(result.task),
      },
      meta: { requestId: request.requestId },
    });
  });

  return router;
}
