import mongoose, { Schema, type HydratedDocument, type Model } from 'mongoose';

export interface ItemVote {
  userId: mongoose.Types.ObjectId;
  createdAt: Date;
}

export interface Item {
  boardId: mongoose.Types.ObjectId;
  shapeId: string;
  type: 'note';
  content: string;
  style: Record<string, unknown>;
  props: Record<string, unknown>;
  position: { x: number; y: number };
  size: { w: number; h: number };
  rotation: number;
  tldrawIndex: string;
  parentFrameId: mongoose.Types.ObjectId | null;
  authorId: mongoose.Types.ObjectId;
  votes: ItemVote[];
  promotedTaskId: mongoose.Types.ObjectId | null;
  version: number;
  createdAt: Date;
  updatedAt: Date;
}

export type ItemDocument = HydratedDocument<Item>;

const voteSchema = new Schema<ItemVote>(
  {
    userId: { type: Schema.Types.ObjectId, required: true },
    createdAt: { type: Date, required: true },
  },
  { _id: false },
);

const itemSchema = new Schema<Item>(
  {
    boardId: { type: Schema.Types.ObjectId, required: true },
    shapeId: { type: String, required: true },
    type: { type: String, enum: ['note'], required: true },
    content: { type: String, required: true, default: '' },
    style: { type: Schema.Types.Mixed, required: true, default: {} },
    props: { type: Schema.Types.Mixed, required: true, default: {} },
    position: {
      x: { type: Number, required: true },
      y: { type: Number, required: true },
    },
    size: {
      w: { type: Number, required: true },
      h: { type: Number, required: true },
    },
    rotation: { type: Number, required: true, default: 0 },
    tldrawIndex: { type: String, required: true },
    parentFrameId: { type: Schema.Types.ObjectId, default: null },
    authorId: { type: Schema.Types.ObjectId, required: true },
    votes: { type: [voteSchema], required: true, default: [] },
    promotedTaskId: { type: Schema.Types.ObjectId, default: null },
    version: { type: Number, required: true, default: 1 },
  },
  { timestamps: true, versionKey: false },
);

export const ItemModel: Model<Item> =
  (mongoose.models.Item as Model<Item> | undefined) ?? mongoose.model<Item>('Item', itemSchema);
