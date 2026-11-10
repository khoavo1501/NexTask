import type { ActivityAction } from '@nextask/contracts';
import mongoose, { Schema, type HydratedDocument, type Model } from 'mongoose';

export interface ActivityRefs {
  itemId: mongoose.Types.ObjectId | null;
  taskId: mongoose.Types.ObjectId | null;
  columnId: string | null;
}

export interface Activity {
  boardId: mongoose.Types.ObjectId;
  actorId: mongoose.Types.ObjectId;
  action: ActivityAction;
  refs: ActivityRefs;
  snapshot: Record<string, unknown>;
  undoableUntil: Date | null;
  createdAt: Date;
}

export type ActivityDocument = HydratedDocument<Activity>;

const refsSchema = new Schema<ActivityRefs>(
  {
    itemId: { type: Schema.Types.ObjectId, default: null },
    taskId: { type: Schema.Types.ObjectId, default: null },
    columnId: { type: String, default: null },
  },
  { _id: false },
);

const activitySchema = new Schema<Activity>(
  {
    boardId: { type: Schema.Types.ObjectId, required: true },
    actorId: { type: Schema.Types.ObjectId, required: true },
    action: {
      type: String,
      enum: ['item.promoted', 'item.demoted', 'item.promote_undone'],
      required: true,
    },
    refs: { type: refsSchema, required: true },
    snapshot: { type: Schema.Types.Mixed, required: true, default: {} },
    undoableUntil: { type: Date, default: null },
  },
  { timestamps: { createdAt: true, updatedAt: false }, versionKey: false },
);

export const ActivityModel: Model<Activity> =
  (mongoose.models.Activity as Model<Activity> | undefined) ??
  mongoose.model<Activity>('Activity', activitySchema);
