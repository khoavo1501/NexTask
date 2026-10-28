import type {
  BoardMemberDetailDto,
  CreateBoardRequest,
  RenameBoardRequest,
} from '@nextask/contracts';
import { Types } from 'mongoose';
import { AppError } from '../../lib/errors.js';
import { UserModel } from '../users/user.model.js';
import { BoardModel, DEFAULT_COLUMNS, type BoardDocument } from './board.model.js';

export type BoardRole = 'owner' | 'member';

export interface BoardWithRole {
  board: BoardDocument;
  role: BoardRole;
}

export async function listBoardsForUser(userId: Types.ObjectId): Promise<BoardWithRole[]> {
  const boards = await BoardModel.find({ 'members.userId': userId }).sort({ updatedAt: -1 }).exec();

  return boards.map((board) => {
    const member = board.members.find((entry) => entry.userId.equals(userId));
    return {
      board,
      role: member?.role ?? 'member',
    };
  });
}

export async function createBoard(
  userId: Types.ObjectId,
  input: CreateBoardRequest,
): Promise<BoardWithRole> {
  const board = await BoardModel.create({
    name: input.name,
    ownerId: userId,
    members: [{ userId, role: 'owner', joinedAt: new Date() }],
    columns: DEFAULT_COLUMNS.map((column) => ({ ...column })),
    settings: { votingLimit: 3, minVotes: 3, stalledAfterDays: 7 },
    version: 1,
  });
  return { board, role: 'owner' };
}

export async function findByMember(
  rawBoardId: string,
  userId: Types.ObjectId,
): Promise<BoardWithRole | null> {
  if (!Types.ObjectId.isValid(rawBoardId)) return null;

  const board = await BoardModel.findOne({
    _id: rawBoardId,
    'members.userId': userId,
  }).exec();
  if (!board) return null;

  const member = board.members.find((entry) => entry.userId.equals(userId));
  if (!member) return null;

  return { board, role: member.role };
}

export async function renameBoard(
  board: BoardDocument,
  input: RenameBoardRequest,
): Promise<BoardDocument> {
  const updated = await BoardModel.findOneAndUpdate(
    { _id: board._id },
    { $set: { name: input.name }, $inc: { version: 1 } },
    { returnDocument: 'after' },
  ).exec();
  if (!updated) {
    throw new AppError(404, 'NOT_FOUND', 'Không tìm thấy board');
  }
  return updated;
}

export async function listBoardMembers(board: BoardDocument): Promise<BoardMemberDetailDto[]> {
  const users = await UserModel.find({
    _id: { $in: board.members.map((member) => member.userId) },
  }).exec();
  const usersById = new Map(users.map((user) => [user._id.toHexString(), user]));

  return board.members
    .map((member) => {
      const user = usersById.get(member.userId.toHexString());
      if (!user) return null;
      return {
        userId: user._id.toHexString(),
        name: user.name,
        email: user.email,
        role: member.role,
        joinedAt: member.joinedAt.toISOString(),
      } satisfies BoardMemberDetailDto;
    })
    .filter((member): member is BoardMemberDetailDto => member !== null)
    .sort((a, b) =>
      a.role === b.role ? a.name.localeCompare(b.name) : a.role === 'owner' ? -1 : 1,
    );
}
