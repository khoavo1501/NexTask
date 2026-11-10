import { Types } from 'mongoose';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { ItemModel } from '../src/modules/items/item.model.js';
import { TaskModel } from '../src/modules/tasks/task.model.js';
import { UserModel } from '../src/modules/users/user.model.js';
import {
  runMigrations,
  MIGRATION_001_NAME,
  MIGRATION_002_NAME,
  MIGRATION_003_NAME,
  MIGRATION_004_NAME,
} from '../src/db/migration-runner.js';
import { COLLECTION_VALIDATORS } from '../src/db/collection-validators.js';
import { assertSchemaVersion } from '../src/db/schema-version.js';
import { connectMongo } from '../src/db/mongoose.js';
import { testLogger } from './helpers/test-db.js';

const legacyOwnerId = '000000000000000000000001';
const legacyBoardId = new Types.ObjectId();
const migrationTestUri =
  process.env.MONGODB_MIGRATION_TEST_URI ??
  'mongodb://localhost:27017/nextask_phase2_migration_test?directConnection=true';
const migrationEnv = {
  SEED_OWNER_EMAIL: 'owner@nextask.local',
  SEED_OWNER_PASSWORD: 'nextask-local-owner-2026',
  SEED_OWNER_NAME: 'Demo Owner',
};
let connection: Awaited<ReturnType<typeof connectMongo>>;

beforeAll(async () => {
  connection = await connectMongo({ uri: migrationTestUri, logger: testLogger });
  if (!connection.db) throw new Error('DB chưa kết nối');
  await connection.dropDatabase();

  await connection.db.collection('boards').insertOne({
    _id: legacyBoardId,
    name: 'Legacy',
    ownerId: new Types.ObjectId(legacyOwnerId),
    columns: [],
    settings: { votingLimit: 3, minVotes: 3, stalledAfterDays: 7 },
    version: 1,
    createdAt: new Date('2026-10-01T00:00:00.000Z'),
    updatedAt: new Date('2026-10-01T00:00:00.000Z'),
  });
  await ItemModel.create({
    boardId: legacyBoardId,
    shapeId: 'shape:legacy',
    type: 'note',
    content: 'Legacy note',
    style: {},
    props: {},
    position: { x: 1, y: 2 },
    size: { w: 100, h: 100 },
    rotation: 0,
    tldrawIndex: 'a0',
    parentFrameId: null,
    authorId: new Types.ObjectId(legacyOwnerId),
    votes: [],
    promotedTaskId: null,
    version: 9,
  });
  await TaskModel.create({
    boardId: legacyBoardId,
    columnId: 'todo',
    order: 'a0',
    title: 'Legacy task',
    description: 'Legacy task description',
    assigneeId: null,
    labels: [],
    priority: 'medium',
    dueDate: null,
    lifecycle: 'active',
    sourceItemId: null,
    origin: null,
    version: 4,
    createdBy: new Types.ObjectId(legacyOwnerId),
  });
  await TaskModel.create([
    {
      boardId: legacyBoardId,
      columnId: 'backlog',
      order: 'a0',
      title: 'Duplicate order 1',
      description: 'duplicate',
      assigneeId: null,
      labels: [],
      priority: 'medium',
      dueDate: null,
      lifecycle: 'active',
      sourceItemId: null,
      origin: null,
      version: 1,
      createdBy: new Types.ObjectId(legacyOwnerId),
    },
    {
      boardId: legacyBoardId,
      columnId: 'backlog',
      order: 'a0',
      title: 'Duplicate order 2',
      description: 'duplicate',
      assigneeId: null,
      labels: [],
      priority: 'medium',
      dueDate: null,
      lifecycle: 'active',
      sourceItemId: null,
      origin: null,
      version: 1,
      createdBy: new Types.ObjectId(legacyOwnerId),
    },
  ]);

  await runMigrations({ connection, env: migrationEnv });
});

afterAll(async () => {
  await connection.close();
});

describe('migration 2A', () => {
  it('backfill owner member và tạo seed owner', async () => {
    const owner = await UserModel.findById(legacyOwnerId).exec();
    expect(owner?.emailNormalized).toBe('owner@nextask.local');
    expect(owner?.passwordHash).not.toContain('nextask-local-owner-2026');

    if (!connection.db) throw new Error('DB chưa kết nối');
    const board = await connection.db.collection('boards').findOne({ _id: legacyBoardId });
    expect(board?.members).toEqual([
      expect.objectContaining({
        userId: new Types.ObjectId(legacyOwnerId),
        role: 'owner',
      }),
    ]);
  });

  it('idempotent và giữ item/task/version', async () => {
    const migrations = await runMigrations({ connection, env: migrationEnv });
    expect(migrations).not.toContain(MIGRATION_001_NAME);
    expect(migrations).not.toContain(MIGRATION_002_NAME);
    expect(migrations).not.toContain(MIGRATION_003_NAME);
    expect(migrations).not.toContain(MIGRATION_004_NAME);
    expect((await ItemModel.findOne({ shapeId: 'shape:legacy' }))?.version).toBe(9);
    expect((await TaskModel.findOne({ title: 'Legacy task' }))?.version).toBe(4);
    await expect(assertSchemaVersion(connection, MIGRATION_004_NAME)).resolves.toBeUndefined();
  });

  it('áp validator 002 cho cả 5 collection', async () => {
    if (!connection.db) throw new Error('DB chưa kết nối');

    for (const name of Object.keys(COLLECTION_VALIDATORS)) {
      const [info] = await connection.db.listCollections({ name }).toArray();
      const options = (info as { options?: Record<string, unknown> } | undefined)?.options;
      expect(options?.validator, name).toBeDefined();
      expect(options?.validationLevel, name).toBe('strict');
      expect(options?.validationAction, name).toBe('error');
    }
  });

  it('index cần thiết tồn tại', async () => {
    const indexes = await UserModel.collection.indexes();
    expect(indexes.some((index) => index.name === 'users_email_normalized_unique')).toBe(true);
  });

  it('003 backfill order trùng và tạo unique index', async () => {
    if (!connection.db) throw new Error('DB chưa kết nối');

    const tasks = await connection.db
      .collection('tasks')
      .find({ lifecycle: 'active' })
      .sort({ boardId: 1, columnId: 1, order: 1, _id: 1 })
      .toArray();
    const keys = tasks.map(
      (task) => `${String(task.boardId)}:${String(task.columnId)}:${task.order}`,
    );
    expect(new Set(keys).size).toBe(keys.length);

    const duplicates = await TaskModel.find({ title: /^Duplicate order/ })
      .sort({ _id: 1 })
      .exec();
    expect(duplicates.map((task) => task.version).sort()).toEqual([1, 2]);

    const indexes = await TaskModel.collection.indexes();
    const orderIndex = indexes.find((index) => index.name === 'tasks_kanban_order');
    expect(orderIndex).toMatchObject({
      unique: true,
      partialFilterExpression: { lifecycle: 'active' },
    });
    for (const name of ['tasks_board_assignee', 'tasks_board_priority', 'tasks_board_labels']) {
      expect(
        indexes.some((index) => index.name === name),
        name,
      ).toBe(true);
    }
  });

  it('004 tạo checkpoint collection/index và bật pre/post images', async () => {
    if (!connection.db) throw new Error('DB chưa kết nối');

    const [checkpointInfo] = await connection.db
      .listCollections({ name: 'change_stream_checkpoints' })
      .toArray();
    const checkpointOptions = (
      checkpointInfo as { options?: Record<string, unknown> } | undefined
    )?.options;
    expect(checkpointInfo).toBeDefined();
    expect(checkpointOptions?.validationLevel).toBe('strict');

    const indexes = await connection.db.collection('change_stream_checkpoints').indexes();
    const unique = indexes.find(
      (index) => index.name === 'change_stream_checkpoints_board_collection',
    );
    expect(unique).toMatchObject({ unique: true });

    for (const name of ['items', 'tasks']) {
      const [info] = await connection.db.listCollections({ name }).toArray();
      const options = (info as { options?: Record<string, unknown> } | undefined)?.options;
      expect(options?.changeStreamPreAndPostImages).toEqual({ enabled: true });
    }
  });
});
