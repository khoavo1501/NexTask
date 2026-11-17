import mongoose, { Schema, type HydratedDocument, type Model } from 'mongoose';

export interface VoterBudget {
  boardId: mongoose.Types.ObjectId;
  userId: mongoose.Types.ObjectId;
  used: number;
  limit: number;
  version: number;
  createdAt: Date;
  updatedAt: Date;
}

export type VoterBudgetDocument = HydratedDocument<VoterBudget>;

const voterBudgetSchema = new Schema<VoterBudget>(
  {
    boardId: { type: Schema.Types.ObjectId, required: true },
    userId: { type: Schema.Types.ObjectId, required: true },
    used: { type: Number, required: true, default: 0, min: 0 },
    limit: { type: Number, required: true, min: 0 },
    version: { type: Number, required: true, default: 1 },
  },
  { timestamps: true, versionKey: false },
);

export const VoterBudgetModel: Model<VoterBudget> =
  (mongoose.models.VoterBudget as Model<VoterBudget> | undefined) ??
  mongoose.model<VoterBudget>('VoterBudget', voterBudgetSchema);
