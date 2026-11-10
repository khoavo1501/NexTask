import mongoose, { Schema, type HydratedDocument, type Model } from 'mongoose';

export interface TaskOrigin {
  itemId: mongoose.Types.ObjectId;
  frameId: mongoose.Types.ObjectId | null;
  position: { x: number; y: number };
  voteCount: number;
  authorId: mongoose.Types.ObjectId;
  itemCreatedAt: Date;
}

export interface Task {
  boardId: mongoose.Types.ObjectId;
  columnId: string;
  order: string;
  title: string;
  description: string;
  assigneeId: mongoose.Types.ObjectId | null;
  labels: string[];
  priority: 'low' | 'medium' | 'high' | 'urgent';
  dueDate: Date | null;
  lifecycle: 'active' | 'demoted';
  sourceItemId: mongoose.Types.ObjectId | null;
  origin: TaskOrigin | null;
  version: number;
  createdBy: mongoose.Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

export type TaskDocument = HydratedDocument<Task>;

const originSchema = new Schema<TaskOrigin>(
  {
    itemId: { type: Schema.Types.ObjectId, required: true },
    frameId: { type: Schema.Types.ObjectId, default: null },
    position: {
      x: { type: Number, required: true },
      y: { type: Number, required: true },
    },
    voteCount: { type: Number, required: true },
    authorId: { type: Schema.Types.ObjectId, required: true },
    itemCreatedAt: { type: Date, required: true },
  },
  { _id: false },
);

const taskSchema = new Schema<Task>(
  {
    boardId: { type: Schema.Types.ObjectId, required: true },
    columnId: { type: String, required: true },
    order: { type: String, required: true },
    title: { type: String, required: true, trim: true, maxlength: 200 },
    description: { type: String, default: '' },
    assigneeId: { type: Schema.Types.ObjectId, default: null },
    labels: { type: [String], required: true, default: [] },
    priority: {
      type: String,
      enum: ['low', 'medium', 'high', 'urgent'],
      required: true,
      default: 'medium',
    },
    dueDate: { type: Date, default: null },
    lifecycle: {
      type: String,
      enum: ['active', 'demoted'],
      required: true,
      default: 'active',
    },
    sourceItemId: { type: Schema.Types.ObjectId, default: null },
    origin: { type: originSchema, default: null },
    version: { type: Number, required: true, default: 1 },
    createdBy: { type: Schema.Types.ObjectId, required: true },
  },
  { timestamps: true, versionKey: false },
);

export const TaskModel: Model<Task> =
  (mongoose.models.Task as Model<Task> | undefined) ?? mongoose.model<Task>('Task', taskSchema);
