import {
  ALREADY_VOTED_CODE,
  NOT_VOTED_CODE,
  VOTE_LIMIT_REACHED_CODE,
  type VoteResultsDto,
} from '@nextask/contracts';
import mongoose, { Types } from 'mongoose';
import { AppError } from '../../lib/errors.js';
import type { BoardDocument } from '../boards/board.model.js';
import { ItemModel, type ItemDocument } from '../items/item.model.js';
import type { UserDocument } from '../users/user.model.js';
import { VoterBudgetModel, type VoterBudgetDocument } from './voter-budget.model.js';
import { ensureVoterBudget } from './voter-budget.service.js';

export interface VoteResult {
  item: ItemDocument;
  budget: VoterBudgetDocument;
}

function assertObjectId(value: string): void {
  if (!Types.ObjectId.isValid(value)) {
    throw new AppError(404, 'NOT_FOUND', 'Không tìm thấy item');
  }
}

export async function voteItem(input: {
  board: BoardDocument;
  itemId: string;
  actor: UserDocument;
}): Promise<VoteResult> {
  assertObjectId(input.itemId);
  const budget = await ensureVoterBudget(
    input.board._id,
    input.actor._id,
    input.board.settings.votingLimit,
  );
  const session = await mongoose.startSession();

  try {
    const result = await session.withTransaction(
      async () => {
        const item = await ItemModel.findOne({
          _id: input.itemId,
          boardId: input.board._id,
          type: 'note',
        }).session(session);
        if (!item) throw new AppError(404, 'NOT_FOUND', 'Không tìm thấy item');
        if (item.votes.some((vote) => vote.userId.equals(input.actor._id))) {
          throw new AppError(409, ALREADY_VOTED_CODE, 'Bạn đã vote item này');
        }

        const updatedItem = await ItemModel.findOneAndUpdate(
          {
            _id: item._id,
            boardId: input.board._id,
            'votes.userId': { $ne: input.actor._id },
          },
          {
            $push: {
              votes: { userId: input.actor._id, createdAt: new Date() },
            },
          },
          { returnDocument: 'after', session },
        ).exec();
        if (!updatedItem) {
          throw new AppError(409, ALREADY_VOTED_CODE, 'Bạn đã vote item này');
        }

        const updatedBudget = await VoterBudgetModel.findOneAndUpdate(
          {
            _id: budget._id,
            boardId: input.board._id,
            userId: input.actor._id,
            used: { $lt: budget.limit },
          },
          { $inc: { used: 1, version: 1 } },
          { returnDocument: 'after', session },
        ).exec();
        if (!updatedBudget) {
          throw new AppError(409, VOTE_LIMIT_REACHED_CODE, 'Bạn đã dùng hết phiếu');
        }

        return { item: updatedItem, budget: updatedBudget };
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

export async function getVoteResults(
  board: BoardDocument,
  viewerId: Types.ObjectId,
  limit: number,
): Promise<VoteResultsDto> {
  const [items, budgets] = await Promise.all([
    ItemModel.aggregate<{
      itemId: Types.ObjectId;
      shapeId: string;
      content: string;
      voteCount: number;
      voters: Types.ObjectId[];
      promotedTaskId: Types.ObjectId | null;
      createdAt: Date;
    }>([
      { $match: { boardId: board._id, type: 'note' } },
      {
        $project: {
          itemId: '$_id',
          shapeId: 1,
          content: 1,
          voteCount: { $size: '$votes' },
          voters: '$votes.userId',
          promotedTaskId: 1,
          createdAt: 1,
          _id: 0,
        },
      },
      { $sort: { voteCount: -1, createdAt: 1, itemId: 1 } },
      { $limit: limit },
    ]).exec(),
    VoterBudgetModel.find({ boardId: board._id }).sort({ used: -1, userId: 1 }).exec(),
  ]);

  const ensureViewer = await ensureVoterBudget(board._id, viewerId, board.settings.votingLimit);
  const usage = budgets.map((budget) => ({
    userId: budget.userId.toHexString(),
    used: budget.used,
    limit: budget.limit,
  }));
  const viewer = usage.find((entry) => entry.userId === viewerId.toHexString()) ?? {
    userId: viewerId.toHexString(),
    used: ensureViewer.used,
    limit: ensureViewer.limit,
  };

  return {
    items: items.map((item) => ({
      itemId: item.itemId.toHexString(),
      shapeId: item.shapeId,
      content: item.content,
      voteCount: item.voteCount,
      voters: item.voters.map((id) => id.toHexString()),
      promotedTaskId: item.promotedTaskId?.toHexString() ?? null,
      createdAt: item.createdAt.toISOString(),
    })),
    usage,
    viewer,
  };
}

export async function unvoteItem(input: {
  board: BoardDocument;
  itemId: string;
  actor: UserDocument;
}): Promise<VoteResult> {
  assertObjectId(input.itemId);
  const budget = await ensureVoterBudget(
    input.board._id,
    input.actor._id,
    input.board.settings.votingLimit,
  );
  const session = await mongoose.startSession();

  try {
    const result = await session.withTransaction(
      async () => {
        const item = await ItemModel.findOne({
          _id: input.itemId,
          boardId: input.board._id,
          type: 'note',
        }).session(session);
        if (!item) throw new AppError(404, 'NOT_FOUND', 'Không tìm thấy item');
        if (!item.votes.some((vote) => vote.userId.equals(input.actor._id))) {
          throw new AppError(409, NOT_VOTED_CODE, 'Bạn chưa vote item này');
        }

        const updatedItem = await ItemModel.findOneAndUpdate(
          {
            _id: item._id,
            boardId: input.board._id,
            'votes.userId': input.actor._id,
          },
          { $pull: { votes: { userId: input.actor._id } } },
          { returnDocument: 'after', session },
        ).exec();
        if (!updatedItem) {
          throw new AppError(409, NOT_VOTED_CODE, 'Bạn chưa vote item này');
        }

        const updatedBudget = await VoterBudgetModel.findOneAndUpdate(
          {
            _id: budget._id,
            boardId: input.board._id,
            userId: input.actor._id,
            used: { $gt: 0 },
          },
          { $inc: { used: -1, version: 1 } },
          { returnDocument: 'after', session },
        ).exec();
        if (!updatedBudget) {
          throw new AppError(409, NOT_VOTED_CODE, 'Không thể hoàn phiếu');
        }

        return { item: updatedItem, budget: updatedBudget };
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
