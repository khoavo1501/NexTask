import { Types } from 'mongoose';
import { ItemModel } from '../items/item.model.js';
import { VoterBudgetModel, type VoterBudgetDocument } from './voter-budget.model.js';

async function countUsedVotes(boardId: Types.ObjectId, userId: Types.ObjectId): Promise<number> {
  const rows = await ItemModel.aggregate<{ used: number }>([
    { $match: { boardId, type: 'note' } },
    { $unwind: '$votes' },
    { $match: { 'votes.userId': userId } },
    { $count: 'used' },
  ]).exec();
  return rows[0]?.used ?? 0;
}

export async function ensureVoterBudget(
  boardId: Types.ObjectId,
  userId: Types.ObjectId,
  limit: number,
): Promise<VoterBudgetDocument> {
  const existing = await VoterBudgetModel.findOne({ boardId, userId }).exec();
  if (existing) return existing;

  const used = await countUsedVotes(boardId, userId);
  try {
    const created = await VoterBudgetModel.findOneAndUpdate(
      { boardId, userId },
      { $setOnInsert: { used, limit, version: 1 } },
      { upsert: true, returnDocument: 'after' },
    ).exec();
    if (!created) throw new Error('Không tạo được voter budget');
    return created;
  } catch (error) {
    const raced = await VoterBudgetModel.findOne({ boardId, userId }).exec();
    if (raced) return raced;
    throw error;
  }
}
