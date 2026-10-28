import { syncItemsRequestSchema, type ItemDto } from '@nextask/contracts';
import { Router } from 'express';
import { AppError } from '../../lib/errors.js';
import { serializeItem } from '../../lib/serialize.js';
import { listItems, syncItems } from './item.service.js';

export function createItemsRouter(): Router {
  const router = Router({ mergeParams: true });

  router.get('/', async (request, response) => {
    const boardId = (request.params as { boardId?: string }).boardId;
    if (!boardId) {
      throw new AppError(404, 'NOT_FOUND', 'Không tìm thấy board');
    }

    const items = await listItems(boardId, request.ownerId);
    response.json({
      data: items.map(serializeItem),
      meta: { requestId: request.requestId },
    });
  });

  router.put('/', async (request, response) => {
    const boardId = (request.params as { boardId?: string }).boardId;
    if (!boardId) {
      throw new AppError(404, 'NOT_FOUND', 'Không tìm thấy board');
    }

    const input = syncItemsRequestSchema.parse(request.body);
    const items = await syncItems(boardId, request.ownerId, input.items);
    const data: ItemDto[] = items.map(serializeItem);

    response.json({
      data,
      meta: { requestId: request.requestId },
    });
  });

  return router;
}
