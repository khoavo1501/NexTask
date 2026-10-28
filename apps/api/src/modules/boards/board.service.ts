import type { CreateBoardRequest } from '@nextask/contracts';
import { Types } from 'mongoose';
import { AppError } from '../../lib/errors.js';
import { BoardModel, DEFAULT_COLUMNS, type BoardDocument } from './board.model.js';

export async function listBoards(ownerId: Types.ObjectId): Promise<BoardDocument[]> {
  return BoardModel.find({ ownerId }).sort({ updatedAt: -1 }).exec();
}

export async function createBoard(
  ownerId: Types.ObjectId,
  input: CreateBoardRequest,
): Promise<BoardDocument> {
  return BoardModel.create({
    name: input.name,
    ownerId,
    columns: DEFAULT_COLUMNS.map((column) => ({ ...column })),
    settings: { votingLimit: 3, minVotes: 3, stalledAfterDays: 7 },
    version: 1,
  });
}

export async function getBoardForOwner(
  rawBoardId: string,
  ownerId: Types.ObjectId,
): Promise<BoardDocument> {
  if (!Types.ObjectId.isValid(rawBoardId)) {
    throw new AppError(404, 'NOT_FOUND', 'Không tìm thấy board');
  }

  const board = await BoardModel.findOne({ _id: rawBoardId, ownerId }).exec();
  if (!board) {
    throw new AppError(404, 'NOT_FOUND', 'Không tìm thấy board');
  }
  return board;
}
