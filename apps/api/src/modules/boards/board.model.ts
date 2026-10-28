import mongoose, { Schema, type HydratedDocument, type Model } from 'mongoose';

export interface BoardColumn {
  id: string;
  name: string;
  order: number;
  isDone: boolean;
}

export interface BoardSettings {
  votingLimit: number;
  minVotes: number;
  stalledAfterDays: number;
}

export interface BoardMember {
  userId: mongoose.Types.ObjectId;
  role: 'owner' | 'member';
  joinedAt: Date;
}

export interface Board {
  name: string;
  ownerId: mongoose.Types.ObjectId;
  members: BoardMember[];
  columns: BoardColumn[];
  settings: BoardSettings;
  version: number;
  createdAt: Date;
  updatedAt: Date;
}

export type BoardDocument = HydratedDocument<Board>;

const columnSchema = new Schema<BoardColumn>(
  {
    id: { type: String, required: true },
    name: { type: String, required: true },
    order: { type: Number, required: true },
    isDone: { type: Boolean, required: true },
  },
  { _id: false },
);

const settingsSchema = new Schema<BoardSettings>(
  {
    votingLimit: { type: Number, required: true, default: 3 },
    minVotes: { type: Number, required: true, default: 3 },
    stalledAfterDays: { type: Number, required: true, default: 7 },
  },
  { _id: false },
);

const memberSchema = new Schema<BoardMember>(
  {
    userId: { type: Schema.Types.ObjectId, required: true },
    role: { type: String, enum: ['owner', 'member'], required: true },
    joinedAt: { type: Date, required: true },
  },
  { _id: false },
);

const boardSchema = new Schema<Board>(
  {
    name: { type: String, required: true, trim: true, maxlength: 80 },
    ownerId: { type: Schema.Types.ObjectId, required: true },
    members: { type: [memberSchema], required: true, default: [] },
    columns: { type: [columnSchema], required: true },
    settings: { type: settingsSchema, required: true },
    version: { type: Number, required: true, default: 1 },
  },
  { timestamps: true, versionKey: false },
);

export const DEFAULT_COLUMNS: BoardColumn[] = [
  { id: 'backlog', name: 'Backlog', order: 0, isDone: false },
  { id: 'todo', name: 'To Do', order: 1, isDone: false },
  { id: 'in-progress', name: 'In Progress', order: 2, isDone: false },
  { id: 'review', name: 'Review', order: 3, isDone: false },
  { id: 'done', name: 'Done', order: 4, isDone: true },
];

export const BoardModel: Model<Board> =
  (mongoose.models.Board as Model<Board> | undefined) ??
  mongoose.model<Board>('Board', boardSchema);
