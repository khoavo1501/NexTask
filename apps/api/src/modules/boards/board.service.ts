import type {
  BoardMemberDetailDto,
  CreateBoardRequest,
  RenameBoardRequest,
  UpdateColumnsRequest,
} from '@nextask/contracts';
import { randomUUID } from 'node:crypto';
import { Types } from 'mongoose';
import { AppError } from '../../lib/errors.js';
import { columnNotEmpty, versionConflict } from '../../lib/versioning.js';
import { TaskModel } from '../tasks/task.model.js';
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
    { _id: board._id, version: input.expectedVersion },
    { $set: { name: input.name }, $inc: { version: 1 } },
    { returnDocument: 'after' },
  ).exec();
  if (!updated) {
    const current = await BoardModel.findById(board._id).select({ version: 1 }).exec();
    if (!current) {
      throw new AppError(404, 'NOT_FOUND', 'Không tìm thấy board');
    }
    throw versionConflict(current.version);
  }
  return updated;
}

export async function updateColumns(
  board: BoardDocument,
  input: UpdateColumnsRequest,
): Promise<BoardDocument> {
  if (board.version !== input.expectedVersion) {
    const current = await BoardModel.findById(board._id).select({ version: 1 }).exec();
    if (!current) {
      throw new AppError(404, 'NOT_FOUND', 'Không tìm thấy board');
    }
    throw versionConflict(current.version);
  }

  const currentIds = new Set(board.columns.map((column) => column.id));
  for (const column of input.columns) {
    if (column.id && !currentIds.has(column.id)) {
      throw new AppError(422, 'VALIDATION_ERROR', 'Cột không tồn tại trong board');
    }
  }

  const providedIds = new Set(
    input.columns.flatMap((column) => (column.id ? [column.id] : [])),
  );
  const removedIds = board.columns
    .filter((column) => !providedIds.has(column.id))
    .map((column) => column.id);

  if (removedIds.length > 0) {
    const counts = await TaskModel.aggregate<{ _id: string; taskCount: number }>([
      {
        $match: {
          boardId: board._id,
          lifecycle: 'active',
          columnId: { $in: removedIds },
        },
      },
      { $group: { _id: '$columnId', taskCount: { $sum: 1 } } },
    ]);
    for (const count of counts) {
      throw columnNotEmpty(count._id, count.taskCount);
    }
  }

  const usedIds = new Set(currentIds);
  const nextColumns = input.columns.map((column, index) => {
    let id = column.id;
    if (!id) {
      do {
        id = `col-${randomUUID()}`;
      } while (usedIds.has(id));
      usedIds.add(id);
    }
    return { id, name: column.name, order: index, isDone: column.isDone };
  });

  const updated = await BoardModel.findOneAndUpdate(
    { _id: board._id, version: input.expectedVersion },
    { $set: { columns: nextColumns }, $inc: { version: 1 } },
    { returnDocument: 'after' },
  ).exec();

  if (!updated) {
    const current = await BoardModel.findById(board._id).exec();
    if (!current) {
      throw new AppError(404, 'NOT_FOUND', 'Không tìm thấy board');
    }
    throw versionConflict(current.version);
  }
  return updated;
}

export async function listBoardMembers(board: BoardDocument): Promise<BoardMemberDetailDto[]> {  const users = await UserModel.find({
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
