import type { PromoteRequest } from '@nextask/contracts';
import { generateKeyBetween } from 'fractional-indexing';
import mongoose, { Types } from 'mongoose';
import { AppError } from '../../lib/errors.js';
import type { BoardDocument } from '../boards/board.model.js';
import { TaskModel, type TaskDocument } from '../tasks/task.model.js';
import type { UserDocument } from '../users/user.model.js';
import { ItemModel, type ItemDocument } from './item.model.js';

export interface PromoteInput {
  board: BoardDocument;
  itemId: string;
  actor: UserDocument;
  request: PromoteRequest;
  afterTaskInsert?: () => Promise<void>;
}

export interface PromoteResult {
  item: ItemDocument;
  task: TaskDocument;
}

function assertObjectId(value: string, message: string): void {
  if (!Types.ObjectId.isValid(value)) {
    throw new AppError(404, 'NOT_FOUND', message);
  }
}

export async function promoteItem(input: PromoteInput): Promise<PromoteResult> {
  assertObjectId(input.itemId, 'Không tìm thấy item');

  const session = await mongoose.startSession();
  try {
    const result = await session.withTransaction(
      async () => {
        const column = input.board.columns.find((entry) => entry.id === input.request.columnId);
        if (!column) {
          throw new AppError(422, 'VALIDATION_ERROR', 'Cột đích không tồn tại');
        }

        const item = await ItemModel.findOne({
          _id: input.itemId,
          boardId: input.board._id,
        }).session(session);
        if (!item) {
          throw new AppError(404, 'NOT_FOUND', 'Không tìm thấy item');
        }
        if (item.promotedTaskId) {
          throw new AppError(409, 'ALREADY_PROMOTED', 'Item đã được promote');
        }

        const lastTask = await TaskModel.findOne({
          boardId: input.board._id,
          columnId: column.id,
          lifecycle: 'active',
        })
          .sort({ order: -1 })
          .session(session);
        const order = generateKeyBetween(lastTask?.order ?? null, null);
        const content = item.content.trim();
        const title = content.length > 0 ? content.slice(0, 200) : 'Ghi chú không tiêu đề';

        const [task] = await TaskModel.create(
          [
            {
              boardId: input.board._id,
              columnId: column.id,
              order,
              title,
              description: item.content,
              assigneeId: input.request.assignToMe ? input.actor._id : null,
              labels: [],
              priority: 'medium',
              dueDate: null,
              lifecycle: 'active',
              sourceItemId: item._id,
              origin: {
                itemId: item._id,
                frameId: item.parentFrameId,
                position: { x: item.position.x, y: item.position.y },
                voteCount: item.votes.length,
                authorId: item.authorId,
                itemCreatedAt: item.createdAt,
              },
              version: 1,
              createdBy: input.actor._id,
            },
          ],
          { session },
        );
        if (!task) {
          throw new Error('Không tạo được task');
        }

        await input.afterTaskInsert?.();

        const updatedItem = await ItemModel.findOneAndUpdate(
          {
            _id: item._id,
            boardId: input.board._id,
            promotedTaskId: null,
          },
          {
            $set: { promotedTaskId: task._id },
            $inc: { version: 1 },
          },
          { returnDocument: 'after', session },
        );
        if (!updatedItem) {
          throw new AppError(409, 'ALREADY_PROMOTED', 'Item đã được promote');
        }

        return { item: updatedItem, task };
      },
      {
        readConcern: { level: 'snapshot' },
        writeConcern: { w: 'majority', j: true },
        readPreference: 'primary',
      },
    );

    if (!result) {
      throw new AppError(
        503,
        'TRANSACTION_OUTCOME_UNKNOWN',
        'Không xác định được kết quả transaction',
      );
    }
    return result;
  } finally {
    await session.endSession();
  }
}
