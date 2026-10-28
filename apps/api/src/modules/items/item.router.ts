import { promoteRequestSchema, syncItemsRequestSchema, type ItemDto } from '@nextask/contracts';
import { Router } from 'express';
import { AppError } from '../../lib/errors.js';
import { serializeItem, serializeTask } from '../../lib/serialize.js';
import { listItems, syncItems } from './item.service.js';
import { promoteItem } from './promotion.service.js';

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

  router.post('/:itemId/promote', async (request, response) => {
    const params = request.params as { boardId?: string; itemId?: string };
    if (!params.boardId || !params.itemId) {
      throw new AppError(404, 'NOT_FOUND', 'Không tìm thấy item');
    }

    const input = promoteRequestSchema.parse(request.body);
    const result = await promoteItem({
      boardId: params.boardId,
      itemId: params.itemId,
      ownerId: request.ownerId,
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
