import { Types } from 'mongoose';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { connectMongo } from '../src/db/mongoose.js';
import {
  buildStalledTasksPipeline,
  buildUnpromotedIdeasPipeline,
} from '../src/modules/reports/report.pipeline.js';
import { testLogger } from './helpers/test-db.js';

let connection: Awaited<ReturnType<typeof connectMongo>>;

beforeAll(async () => {
  connection = await connectMongo({
    uri:
      process.env.MONGODB_EXPLAIN_URI ??
      'mongodb://localhost:27017/nextask_explain_v6?directConnection=true',
    logger: testLogger,
  });
  if (!connection.db) throw new Error('DB chưa kết nối');
  await connection.dropDatabase();
  await connection.db.collection('items').createIndex({
    boardId: 1,
    type: 1,
    promotedTaskId: 1,
  });
  await connection.db.collection('tasks').createIndex({ boardId: 1, lifecycle: 1, createdAt: 1 });
  const boardId = new Types.ObjectId();
  await connection.db.collection('items').insertMany(
    Array.from({ length: 1000 }, (_, index) => ({
      boardId,
      shapeId: `shape:explain-${index}`,
      type: 'note',
      content: `Idea ${index}`,
      style: {},
      props: {},
      position: { x: index, y: 0 },
      size: { w: 200, h: 200 },
      rotation: 0,
      tldrawIndex: `a${index}`,
      parentFrameId: null,
      authorId: new Types.ObjectId(),
      votes: [{ userId: new Types.ObjectId(), createdAt: new Date() }],
      promotedTaskId: null,
      version: 1,
      createdAt: new Date(),
      updatedAt: new Date(),
    })),
  );
  await connection.db.collection('tasks').insertMany(
    Array.from({ length: 1000 }, (_, index) => ({
      boardId,
      columnId: 'todo',
      order: `a${index}`,
      title: `Task ${index}`,
      description: '',
      assigneeId: null,
      labels: [],
      priority: 'medium',
      dueDate: null,
      lifecycle: 'active',
      sourceItemId: null,
      origin: null,
      version: 1,
      createdBy: new Types.ObjectId(),
      createdAt: new Date(Date.now() - 10 * 24 * 60 * 60 * 1000),
      updatedAt: new Date(),
    })),
  );
});

afterAll(async () => {
  if (!connection) return;
  if (connection.db) await connection.dropDatabase();
  await connection.close();
});

describe('report explain', () => {
  it('hai pipeline dùng report indexes', async () => {
    if (!connection.db) throw new Error('DB chưa kết nối');
    const boardId = (await connection.db.collection('items').findOne({}))?.boardId;
    if (!boardId) throw new Error('Thiếu item');

    const ideaExplain = await connection.db.command({
      explain: {
        aggregate: 'items',
        pipeline: buildUnpromotedIdeasPipeline({ boardId, minVotes: 1, limit: 50 }),
        cursor: {},
      },
      verbosity: 'executionStats',
    });
    const stalledExplain = await connection.db.command({
      explain: {
        aggregate: 'tasks',
        pipeline: buildStalledTasksPipeline({
          boardId,
          stalledDays: 7,
          limit: 50,
          doneColumnIds: ['done'],
        }),
        cursor: {},
      },
      verbosity: 'executionStats',
    });

    const ideaStats = (
      ideaExplain as {
        stages?: Array<{ $cursor?: { executionStats?: { totalDocsExamined?: number } } }>;
      }
    ).stages?.find((stage) => stage.$cursor);
    const stalledStats = (
      stalledExplain as {
        stages?: Array<{ $cursor?: { executionStats?: { totalDocsExamined?: number } } }>;
      }
    ).stages?.find((stage) => stage.$cursor);
    expect(ideaStats?.$cursor?.executionStats?.totalDocsExamined).toBeTypeOf('number');
    expect(stalledStats?.$cursor?.executionStats?.totalDocsExamined).toBeTypeOf('number');
  });
});
