import { UNDO_NO_LONGER_SAFE_CODE, UNDO_NOT_AVAILABLE_CODE } from '@nextask/contracts';
import mongoose, { Types } from 'mongoose';
import { AppError } from '../../lib/errors.js';
import type { BoardDocument } from '../boards/board.model.js';
import { ItemModel, type ItemDocument } from '../items/item.model.js';
import { TaskModel, type TaskDocument } from '../tasks/task.model.js';
import type { UserDocument } from '../users/user.model.js';
import { ActivityModel, type ActivityDocument } from './activity.model.js';
import { recordActivity } from './activity.service.js';

export interface UndoPromoteInput {
  board: BoardDocument;
  actor: UserDocument;
  activityId: string;
  beforeTaskUpdate?: () => Promise<void>;
  beforeActivityInsert?: () => Promise<void>;
}

export interface UndoPromoteResult {
  task: TaskDocument;
  item: ItemDocument;
  activity: ActivityDocument;
}

function undoNoLongerSafe(): AppError {
  return new AppError(409, UNDO_NO_LONGER_SAFE_CODE, 'Không thể hoàn tác promote lúc này');
}

export async function undoPromote(input: UndoPromoteInput): Promise<UndoPromoteResult> {
  if (!Types.ObjectId.isValid(input.activityId)) {
    throw new AppError(404, 'NOT_FOUND', 'Không tìm thấy activity');
  }

  const activity = await ActivityModel.findOne({
    _id: input.activityId,
    boardId: input.board._id,
  }).exec();
  if (!activity) throw new AppError(404, 'NOT_FOUND', 'Không tìm thấy activity');
  if (activity.action !== 'item.promoted') {
    throw new AppError(409, UNDO_NOT_AVAILABLE_CODE, 'Activity này không thể undo');
  }
  if (!activity.refs.taskId || !activity.refs.itemId) {
    throw new AppError(409, UNDO_NOT_AVAILABLE_CODE, 'Activity thiếu tham chiếu');
  }
  if (!activity.undoableUntil || activity.undoableUntil.getTime() <= Date.now()) {
    throw undoNoLongerSafe();
  }
  const expectedTaskVersion = Number(activity.snapshot.taskVersionAtPromote);
  if (!Number.isInteger(expectedTaskVersion) || expectedTaskVersion < 1) {
    throw new AppError(409, UNDO_NOT_AVAILABLE_CODE, 'Activity thiếu version promote');
  }

  const task = await TaskModel.findOne({
    _id: activity.refs.taskId,
    boardId: input.board._id,
    lifecycle: 'active',
    version: expectedTaskVersion,
  }).exec();
  const item = await ItemModel.findOne({
    _id: activity.refs.itemId,
    boardId: input.board._id,
  }).exec();
  if (!task || !item || !item.promotedTaskId?.equals(task._id)) {
    throw undoNoLongerSafe();
  }

  const session = await mongoose.startSession();
  try {
    const result = await session.withTransaction(
      async () => {
        await input.beforeTaskUpdate?.();
        const updatedTask = await TaskModel.findOneAndUpdate(
          {
            _id: task._id,
            boardId: input.board._id,
            lifecycle: 'active',
            version: expectedTaskVersion,
          },
          {
            $set: {
              lifecycle: 'demoted',
              demotedAt: new Date(),
              demotedBy: input.actor._id,
            },
            $inc: { version: 1 },
          },
          { returnDocument: 'after', session },
        ).exec();
        if (!updatedTask) throw undoNoLongerSafe();

        const updatedItem = await ItemModel.findOneAndUpdate(
          {
            _id: item._id,
            boardId: input.board._id,
            promotedTaskId: task._id,
          },
          { $set: { promotedTaskId: null }, $inc: { version: 1 } },
          { returnDocument: 'after', session },
        ).exec();
        if (!updatedItem) throw undoNoLongerSafe();

        await input.beforeActivityInsert?.();
        const undoActivity = await recordActivity({
          session,
          boardId: input.board._id,
          actorId: input.actor._id,
          action: 'item.promote_undone',
          refs: {
            itemId: updatedItem._id,
            taskId: updatedTask._id,
            columnId: updatedTask.columnId,
          },
          snapshot: {
            taskTitle: updatedTask.title,
            columnId: updatedTask.columnId,
            originalActivityId: activity._id.toHexString(),
          },
          undoableUntil: null,
        });

        return { task: updatedTask, item: updatedItem, activity: undoActivity };
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
