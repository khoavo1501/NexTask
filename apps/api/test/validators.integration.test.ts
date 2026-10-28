import { Types } from 'mongoose';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { connectTestDb } from './helpers/test-db.js';

const collections = ['users', 'boards', 'items', 'tasks', 'invitations'] as const;
let connection: Awaited<ReturnType<typeof connectTestDb>>;

beforeAll(async () => {
  connection = await connectTestDb();
});

afterAll(async () => {
  await connection.close();
});

function db() {
  if (!connection.db) throw new Error('DB chưa kết nối');
  return connection.db;
}

describe('collection validators', () => {
  it('áp strict/error cho 5 collection nghiệp vụ', async () => {
    for (const name of collections) {
      const [info] = await db().listCollections({ name }).toArray();
      const options = (info as { options?: Record<string, unknown> } | undefined)?.options;
      expect(options?.validator, name).toBeDefined();
      expect(options?.validationLevel, name).toBe('strict');
      expect(options?.validationAction, name).toBe('error');
    }
  });

  it('users thiếu passwordHash bị từ chối', async () => {
    await expect(
      db()
        .collection('users')
        .insertOne({
          email: 'raw@example.com',
          emailNormalized: 'raw@example.com',
          name: 'Raw',
          createdAt: new Date(),
          updatedAt: new Date(),
        }),
    ).rejects.toMatchObject({ code: 121 });
  });

  it('boards sai role member bị từ chối', async () => {
    await expect(
      db()
        .collection('boards')
        .insertOne({
          name: 'Raw',
          ownerId: new Types.ObjectId(),
          members: [{ userId: new Types.ObjectId(), role: 'admin', joinedAt: new Date() }],
          columns: [],
          settings: { votingLimit: 3, minVotes: 3, stalledAfterDays: 7 },
          version: 1,
          createdAt: new Date(),
          updatedAt: new Date(),
        }),
    ).rejects.toMatchObject({ code: 121 });
  });

  it('items version 0 bị từ chối', async () => {
    await expect(
      db()
        .collection('items')
        .insertOne({
          boardId: new Types.ObjectId(),
          shapeId: 'shape:raw',
          type: 'note',
          content: '',
          style: {},
          props: {},
          position: { x: 1, y: 2 },
          size: { w: 10, h: 10 },
          rotation: 0,
          tldrawIndex: 'a0',
          parentFrameId: null,
          authorId: new Types.ObjectId(),
          votes: [],
          promotedTaskId: null,
          version: 0,
          createdAt: new Date(),
          updatedAt: new Date(),
        }),
    ).rejects.toMatchObject({ code: 121 });
  });

  it('tasks sai priority bị từ chối', async () => {
    await expect(
      db()
        .collection('tasks')
        .insertOne({
          boardId: new Types.ObjectId(),
          columnId: 'todo',
          order: 'a0',
          title: 'Raw',
          description: '',
          assigneeId: null,
          labels: [],
          priority: 'critical',
          dueDate: null,
          lifecycle: 'active',
          sourceItemId: null,
          origin: null,
          version: 1,
          createdBy: new Types.ObjectId(),
          createdAt: new Date(),
          updatedAt: new Date(),
        }),
    ).rejects.toMatchObject({ code: 121 });
  });

  it('invitations sai role bị từ chối', async () => {
    await expect(
      db()
        .collection('invitations')
        .insertOne({
          boardId: new Types.ObjectId(),
          emailNormalized: null,
          tokenHash: 'a'.repeat(64),
          role: 'owner',
          createdBy: new Types.ObjectId(),
          expiresAt: new Date(),
          usedAt: null,
          createdAt: new Date(),
          updatedAt: new Date(),
        }),
    ).rejects.toMatchObject({ code: 121 });
  });
});
