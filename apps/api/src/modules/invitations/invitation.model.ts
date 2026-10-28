import mongoose, { Schema, type HydratedDocument, type Model } from 'mongoose';

export interface Invitation {
  boardId: mongoose.Types.ObjectId;
  emailNormalized: string | null;
  tokenHash: string;
  role: 'member';
  createdBy: mongoose.Types.ObjectId;
  expiresAt: Date;
  usedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export type InvitationDocument = HydratedDocument<Invitation>;

const invitationSchema = new Schema<Invitation>(
  {
    boardId: { type: Schema.Types.ObjectId, required: true },
    emailNormalized: { type: String, default: null },
    tokenHash: { type: String, required: true },
    role: { type: String, enum: ['member'], required: true, default: 'member' },
    createdBy: { type: Schema.Types.ObjectId, required: true },
    expiresAt: { type: Date, required: true },
    usedAt: { type: Date, default: null },
  },
  { timestamps: true, versionKey: false },
);

export const InvitationModel: Model<Invitation> =
  (mongoose.models.Invitation as Model<Invitation> | undefined) ??
  mongoose.model<Invitation>('Invitation', invitationSchema);
