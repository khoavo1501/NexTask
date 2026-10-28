import type { CreateInvitationRequest } from '@nextask/contracts';
import { createHash, randomBytes } from 'node:crypto';
import mongoose from 'mongoose';
import { AppError } from '../../lib/errors.js';
import type { BoardDocument } from '../boards/board.model.js';
import { BoardModel } from '../boards/board.model.js';
import type { UserDocument } from '../users/user.model.js';
import { normalizeEmail } from '../auth/auth.service.js';
import { InvitationModel } from './invitation.model.js';

const INVITATION_TTL_MS = 7 * 24 * 60 * 60 * 1000;

function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

export interface CreatedInvitation {
  token: string;
  path: string;
  expiresAt: string;
}

export async function createInvitation(
  board: BoardDocument,
  actor: UserDocument,
  input: CreateInvitationRequest,
): Promise<CreatedInvitation> {
  const token = randomBytes(32).toString('base64url');
  const expiresAt = new Date(Date.now() + INVITATION_TTL_MS);

  await InvitationModel.create({
    boardId: board._id,
    emailNormalized: input.email ? normalizeEmail(input.email) : null,
    tokenHash: hashToken(token),
    role: 'member',
    createdBy: actor._id,
    expiresAt,
    usedAt: null,
  });

  return {
    token,
    path: `/invitations/${token}`,
    expiresAt: expiresAt.toISOString(),
  };
}

export async function acceptInvitation(
  rawToken: string,
  user: UserDocument,
): Promise<{ board: BoardDocument; role: 'owner' | 'member' }> {
  if (!rawToken || rawToken.length > 200) {
    throw new AppError(404, 'INVITATION_INVALID', 'Lời mời không hợp lệ');
  }

  const tokenHash = hashToken(rawToken);
  const session = await mongoose.startSession();

  try {
    const result = await session.withTransaction(
      async () => {
        const invitation = await InvitationModel.findOne({ tokenHash }).session(session);
        if (!invitation) {
          throw new AppError(404, 'INVITATION_INVALID', 'Lời mời không hợp lệ');
        }

        if (invitation.emailNormalized && invitation.emailNormalized !== user.emailNormalized) {
          throw new AppError(
            403,
            'INVITATION_EMAIL_MISMATCH',
            'Lời mời không dành cho tài khoản này',
          );
        }

        const board = await BoardModel.findById(invitation.boardId).session(session);
        if (!board) {
          throw new AppError(404, 'INVITATION_INVALID', 'Lời mời không hợp lệ');
        }

        const existingMember = board.members.find((member) => member.userId.equals(user._id));

        if (existingMember) {
          if (!invitation.usedAt) {
            const markedUsed = await InvitationModel.findOneAndUpdate(
              { _id: invitation._id, usedAt: null },
              { $set: { usedAt: new Date() } },
              { returnDocument: 'after', session },
            );
            if (!markedUsed) {
              throw new AppError(404, 'INVITATION_INVALID', 'Lời mời không hợp lệ');
            }
          }
          return { board, role: existingMember.role };
        }

        if (invitation.usedAt || invitation.expiresAt.getTime() <= Date.now()) {
          throw new AppError(404, 'INVITATION_INVALID', 'Lời mời không hợp lệ');
        }

        const markedUsed = await InvitationModel.findOneAndUpdate(
          { _id: invitation._id, usedAt: null },
          { $set: { usedAt: new Date() } },
          { returnDocument: 'after', session },
        );
        if (!markedUsed) {
          throw new AppError(404, 'INVITATION_INVALID', 'Lời mời không hợp lệ');
        }

        const updatedBoard = await BoardModel.findOneAndUpdate(
          {
            _id: board._id,
            'members.userId': { $ne: user._id },
          },
          {
            $push: {
              members: {
                userId: user._id,
                role: 'member' as const,
                joinedAt: new Date(),
              },
            },
          },
          { returnDocument: 'after', session },
        );
        if (!updatedBoard) {
          throw new AppError(404, 'INVITATION_INVALID', 'Lời mời không hợp lệ');
        }

        return { board: updatedBoard, role: 'member' as const };
      },
      {
        readConcern: { level: 'snapshot' },
        writeConcern: { w: 'majority', j: true },
        readPreference: 'primary',
      },
    );

    if (!result) {
      throw new AppError(503, 'TRANSACTION_OUTCOME_UNKNOWN', 'Không xác định kết quả');
    }
    return result;
  } finally {
    await session.endSession();
  }
}
