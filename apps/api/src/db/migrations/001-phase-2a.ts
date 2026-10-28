import { Types } from 'mongoose';
import { hashPassword } from '../../modules/auth/password.js';
import { UserModel } from '../../modules/users/user.model.js';
import type { Migration, MigrationOptions } from '../migration-runner.js';

const LEGACY_OWNER_ID = '000000000000000000000001';

async function ensureIndexes(options: MigrationOptions): Promise<void> {
  const db = options.connection.db;
  if (!db) throw new Error('MongoDB connection is not ready');

  await Promise.all([
    db
      .collection('boards')
      .createIndex({ ownerId: 1, updatedAt: -1 }, { name: 'boards_owner_updated' }),
    db
      .collection('boards')
      .createIndex({ 'members.userId': 1, updatedAt: -1 }, { name: 'boards_member_updated' }),
    db
      .collection('items')
      .createIndex({ boardId: 1, shapeId: 1 }, { unique: true, name: 'items_board_shape_unique' }),
    db.collection('items').createIndex({ boardId: 1, type: 1 }, { name: 'items_board_type' }),
    db.collection('tasks').createIndex(
      { sourceItemId: 1 },
      {
        unique: true,
        partialFilterExpression: {
          sourceItemId: { $type: 'objectId' },
          lifecycle: 'active',
        },
        name: 'uniq_active_task_per_item',
      },
    ),
    db.collection('tasks').createIndex(
      { boardId: 1, columnId: 1, order: 1 },
      {
        partialFilterExpression: { lifecycle: 'active' },
        name: 'tasks_kanban_order',
      },
    ),
    db
      .collection('users')
      .createIndex({ emailNormalized: 1 }, { unique: true, name: 'users_email_normalized_unique' }),
    db
      .collection('invitations')
      .createIndex({ tokenHash: 1 }, { unique: true, name: 'invitations_token_hash_unique' }),
    db
      .collection('invitations')
      .createIndex({ boardId: 1, createdAt: -1 }, { name: 'invitations_board_created' }),
    db
      .collection('invitations')
      .createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0, name: 'invitations_expiry_ttl' }),
  ]);
}

async function seedLegacyOwner(options: MigrationOptions): Promise<void> {
  const db = options.connection.db;
  if (!db) throw new Error('MongoDB connection is not ready');

  const legacyOwnerObjectId = new Types.ObjectId(LEGACY_OWNER_ID);
  const legacyBoard = await db.collection('boards').findOne({ ownerId: legacyOwnerObjectId });
  if (!legacyBoard) return;

  const existingUser = await UserModel.findById(legacyOwnerObjectId).exec();
  if (existingUser) return;

  const email = options.env.SEED_OWNER_EMAIL;
  const password = options.env.SEED_OWNER_PASSWORD;
  if (!email || !password) {
    throw new Error('Legacy board found but SEED_OWNER_EMAIL/SEED_OWNER_PASSWORD are missing');
  }

  const emailNormalized = email.trim().toLowerCase();
  const emailOwner = await UserModel.findOne({ emailNormalized }).exec();
  if (emailOwner) {
    throw new Error(`Cannot seed owner: email ${emailNormalized} already belongs to another user`);
  }

  await UserModel.create({
    _id: legacyOwnerObjectId,
    email: email.trim(),
    emailNormalized,
    name: options.env.SEED_OWNER_NAME ?? 'Demo Owner',
    passwordHash: await hashPassword(password),
  });
}

async function backfillMembers(options: MigrationOptions): Promise<void> {
  const db = options.connection.db;
  if (!db) throw new Error('MongoDB connection is not ready');

  const boards = await db.collection('boards').find({}).toArray();
  for (const board of boards) {
    if (!board.ownerId) {
      throw new Error(`Board ${String(board._id)} is missing ownerId`);
    }

    const members = Array.isArray(board.members) ? board.members : [];
    const withoutOwner = members.filter(
      (member: { userId?: Types.ObjectId }) =>
        !member.userId || !member.userId.equals(board.ownerId),
    );
    const ownerMember = members.find(
      (member: { userId?: Types.ObjectId; role?: string }) =>
        member.userId?.equals(board.ownerId) && member.role === 'owner',
    );

    if (!ownerMember) {
      await db.collection('boards').updateOne(
        { _id: board._id },
        {
          $set: {
            members: [
              ...withoutOwner,
              {
                userId: board.ownerId,
                role: 'owner',
                joinedAt: board.createdAt ?? new Date(),
              },
            ],
          },
        },
      );
    }
  }

  for (const board of boards) {
    const owner = await UserModel.findById(board.ownerId).exec();
    if (!owner) {
      throw new Error(`Board ${String(board._id)} owner has no user document`);
    }
  }
}

export const phase2aMigration: Migration = {
  name: '001-phase-2a',
  async up(options) {
    await ensureIndexes(options);
    await seedLegacyOwner(options);
    await backfillMembers(options);
  },
};
