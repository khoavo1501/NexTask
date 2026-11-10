import type { ActivityAction } from '@nextask/contracts';
import type { ClientSession, Types } from 'mongoose';
import { ActivityModel, type ActivityDocument } from './activity.model.js';

export const PROMOTE_UNDO_WINDOW_MS = 10 * 60 * 1000;

export interface RecordActivityInput {
  session: ClientSession;
  boardId: Types.ObjectId;
  actorId: Types.ObjectId;
  action: ActivityAction;
  refs: {
    itemId: Types.ObjectId | null;
    taskId: Types.ObjectId | null;
    columnId: string | null;
  };
  snapshot: Record<string, unknown>;
  undoableUntil: Date | null;
}

export async function recordActivity(input: RecordActivityInput): Promise<ActivityDocument> {
  const [activity] = await ActivityModel.create(
    [
      {
        boardId: input.boardId,
        actorId: input.actorId,
        action: input.action,
        refs: input.refs,
        snapshot: input.snapshot,
        undoableUntil: input.undoableUntil,
      },
    ],
    { session: input.session },
  );
  if (!activity) throw new Error('Không tạo được activity');
  return activity;
}

export async function listActivities(
  boardId: Types.ObjectId,
  limit: number,
): Promise<ActivityDocument[]> {
  return ActivityModel.find({ boardId }).sort({ createdAt: -1, _id: -1 }).limit(limit).exec();
}
