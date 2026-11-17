import type { Db, Document, ObjectId } from 'mongodb';
import { COLLECTION_VALIDATORS } from '../collection-validators.js';
import type { Migration, MigrationOptions } from '../migration-runner.js';

const VALIDATION = {
  validationLevel: 'strict',
  validationAction: 'error',
} as const;

interface BudgetBoard {
  _id: ObjectId;
  settings?: { votingLimit?: number };
  members?: Array<{ userId: ObjectId }>;
}

function requireValidator(name: 'voter_budgets'): Document {
  const validator = COLLECTION_VALIDATORS[name];
  if (!validator) throw new Error(`Thiếu validator ${name}`);
  return validator;
}

async function ensureBudgetsCollection(db: Db): Promise<void> {
  const validator = requireValidator('voter_budgets');
  const [existing] = await db
    .listCollections({ name: 'voter_budgets' }, { nameOnly: true })
    .toArray();

  if (!existing) {
    await db.createCollection('voter_budgets', { validator, ...VALIDATION });
  } else {
    await db.command({ collMod: 'voter_budgets', validator, ...VALIDATION });
  }

  await db
    .collection('voter_budgets')
    .createIndex(
      { boardId: 1, userId: 1 },
      { unique: true, name: 'voter_budgets_board_user_unique' },
    );
}

async function ensureReportIndexes(db: Db): Promise<void> {
  await db
    .collection('items')
    .createIndex({ boardId: 1, type: 1, promotedTaskId: 1 }, { name: 'items_board_type_promoted' });
  await db
    .collection('tasks')
    .createIndex(
      { boardId: 1, lifecycle: 1, createdAt: 1 },
      { name: 'tasks_board_lifecycle_created' },
    );
}

async function backfillBudgets(db: Db): Promise<void> {
  const boards = await db.collection<BudgetBoard>('boards').find({}).toArray();
  const now = new Date();

  for (const board of boards) {
    const boardId = board._id;
    const limit = Number(board.settings?.votingLimit ?? 3);
    const members = board.members ?? [];

    const usage = await db
      .collection('items')
      .aggregate<{ _id: ObjectId; used: number }>([
        { $match: { boardId, type: 'note' } },
        { $unwind: '$votes' },
        { $group: { _id: '$votes.userId', used: { $sum: 1 } } },
      ])
      .toArray();
    const usedByUser = new Map(usage.map((entry) => [String(entry._id), entry.used]));

    for (const member of members) {
      const userId = member.userId;
      await db.collection('voter_budgets').updateOne(
        { boardId, userId },
        {
          $setOnInsert: { boardId, userId, version: 1, createdAt: now },
          $set: { used: usedByUser.get(String(userId)) ?? 0, limit, updatedAt: now },
        },
        { upsert: true },
      );
    }
  }
}

export const phase6Migration: Migration = {
  name: '006-phase-6',
  async up(options: MigrationOptions) {
    const db = options.connection.db;
    if (!db) throw new Error('MongoDB connection is not ready');
    await ensureBudgetsCollection(db);
    await ensureReportIndexes(db);
    await backfillBudgets(db);
  },
};
