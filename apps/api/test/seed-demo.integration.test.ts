import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { ActivityModel } from '../src/modules/activities/activity.model.js';
import { hashPassword } from '../src/modules/auth/password.js';
import { normalizeEmail } from '../src/modules/auth/auth.service.js';
import { BoardModel, DEFAULT_COLUMNS } from '../src/modules/boards/board.model.js';
import { ItemModel } from '../src/modules/items/item.model.js';
import { TaskModel } from '../src/modules/tasks/task.model.js';
import { UserModel } from '../src/modules/users/user.model.js';
import { VoterBudgetModel } from '../src/modules/votes/voter-budget.model.js';
import { getStalledIdeasReport } from '../src/modules/reports/report.service.js';
import { seedDemoBoard } from '../src/db/seed-demo.js';
import { cleanDb, connectTestDb } from './helpers/test-db.js';

const ownerEmail = 'owner@nextask.local';
let connection: Awaited<ReturnType<typeof connectTestDb>>;

beforeAll(async () => {
  connection = await connectTestDb();
});

beforeEach(async () => {
  await cleanDb();
});

afterAll(async () => {
  await connection.close();
});

async function setupOwner() {
  const owner = await UserModel.create({
    email: ownerEmail,
    emailNormalized: normalizeEmail(ownerEmail),
    name: 'Demo Owner',
    passwordHash: await hashPassword('nextask-local-owner-2026'),
  });
  const realBoard = await BoardModel.create({
    name: 'Real Board',
    ownerId: owner._id,
    members: [{ userId: owner._id, role: 'owner', joinedAt: new Date() }],
    columns: DEFAULT_COLUMNS.map((column) => ({ ...column })),
    settings: { votingLimit: 3, minVotes: 3, stalledAfterDays: 7 },
    version: 1,
  });
  return { owner, realBoard };
}

describe('seed demo', () => {
  it('idempotent và không đụng board thật', async () => {
    const { owner, realBoard } = await setupOwner();
    const first = await seedDemoBoard(ownerEmail);
    const demoBoard = await BoardModel.findOne({
      name: 'NexTask Demo Retro',
      ownerId: owner._id,
    }).exec();
    expect(demoBoard).not.toBeNull();
    const demoId = demoBoard!._id;
    const firstCounts = {
      items: await ItemModel.countDocuments({ boardId: demoId }),
      tasks: await TaskModel.countDocuments({ boardId: demoId }),
      activities: await ActivityModel.countDocuments({ boardId: demoId }),
      budgets: await VoterBudgetModel.countDocuments({ boardId: demoId }),
    };
    expect(firstCounts).toEqual({ items: 9, tasks: 5, activities: 4, budgets: 3 });
    expect(first.boardId).toBe(demoId.toHexString());

    const second = await seedDemoBoard(ownerEmail);
    const secondCounts = {
      items: await ItemModel.countDocuments({ boardId: demoId }),
      tasks: await TaskModel.countDocuments({ boardId: demoId }),
      activities: await ActivityModel.countDocuments({ boardId: demoId }),
      budgets: await VoterBudgetModel.countDocuments({ boardId: demoId }),
    };
    expect(secondCounts).toEqual(firstCounts);
    expect(second.boardId).toBe(first.boardId);
    expect(await BoardModel.countDocuments({ _id: realBoard._id })).toBe(1);
    expect(await ItemModel.countDocuments({ boardId: realBoard._id })).toBe(0);
  });

  it('đủ dữ liệu report và quota', async () => {
    const { owner } = await setupOwner();
    await seedDemoBoard(ownerEmail);
    const demo = await BoardModel.findOne({
      name: 'NexTask Demo Retro',
      ownerId: owner._id,
    }).exec();
    expect(demo).not.toBeNull();
    const report = await getStalledIdeasReport(demo!, {
      minVotes: 3,
      stalledDays: 7,
      limit: 50,
    });
    expect(
      report.unpromotedIdeas.some((idea) => idea.content.includes('Stop') && idea.voteCount === 3),
    ).toBe(true);
    expect(report.stalledTasks.some((task) => task.title.includes('kẹt'))).toBe(true);

    const budgets = await VoterBudgetModel.find({ boardId: demo!._id }).exec();
    const ownerBudget = budgets.find((budget) => budget.userId.equals(owner._id));
    expect(ownerBudget?.used).toBe(2);
    expect(budgets.every((budget) => budget.limit === 3)).toBe(true);
  });
});
