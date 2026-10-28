import { BoardModel } from '../modules/boards/board.model.js';
import { ItemModel } from '../modules/items/item.model.js';
import { TaskModel } from '../modules/tasks/task.model.js';

export async function ensureIndexes(): Promise<void> {
  await Promise.all([
    BoardModel.collection.createIndex(
      { ownerId: 1, updatedAt: -1 },
      { name: 'boards_owner_updated' },
    ),
    ItemModel.collection.createIndex(
      { boardId: 1, shapeId: 1 },
      { unique: true, name: 'items_board_shape_unique' },
    ),
    ItemModel.collection.createIndex({ boardId: 1, type: 1 }, { name: 'items_board_type' }),
    TaskModel.collection.createIndex(
      { sourceItemId: 1 },
      {
        unique: true,
        partialFilterExpression: {
          sourceItemId: { $type: 'objectId' },
          lifecycle: 'active',
        },
        name: 'uniq_active_task_per_item',
      },
    ),
    TaskModel.collection.createIndex(
      { boardId: 1, columnId: 1, order: 1 },
      {
        partialFilterExpression: { lifecycle: 'active' },
        name: 'tasks_kanban_order',
      },
    ),
  ]);
}
