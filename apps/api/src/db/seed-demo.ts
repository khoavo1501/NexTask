import mongoose from 'mongoose';
import { pathToFileURL } from 'node:url';
import { loadEnv } from '../config/env.js';
import { loadRootEnvFile } from '../config/load-env-file.js';
import { createLogger } from '../lib/logger.js';
import { ActivityModel } from '../modules/activities/activity.model.js';
import { hashPassword } from '../modules/auth/password.js';
import { normalizeEmail } from '../modules/auth/auth.service.js';
import { BoardModel, DEFAULT_COLUMNS } from '../modules/boards/board.model.js';
import { ItemModel } from '../modules/items/item.model.js';
import { TaskModel } from '../modules/tasks/task.model.js';
import { UserModel, type UserDocument } from '../modules/users/user.model.js';
import { VoterBudgetModel } from '../modules/votes/voter-budget.model.js';
import { connectMongo } from './mongoose.js';

export const DEMO_BOARD_NAME = 'NexTask Demo Retro';
const DEMO_MEMBER_PASSWORD = 'demo-only-password-2026';

export interface SeedSummary {
  boardId: string;
  items: number;
  tasks: number;
  activities: number;
  budgets: number;
}

const demoMembers = [
  { email: 'demo.member1@nextask.local', name: 'Demo Member 1' },
  { email: 'demo.member2@nextask.local', name: 'Demo Member 2' },
];

const frames = [
  { shapeId: 'shape:seed-frame-start', name: 'Start', color: 'yellow', x: 0, y: 0 },
  { shapeId: 'shape:seed-frame-stop', name: 'Stop', color: 'red', x: 300, y: 0 },
  { shapeId: 'shape:seed-frame-continue', name: 'Continue', color: 'green', x: 600, y: 0 },
];

const notes = [
  {
    shapeId: 'shape:seed-start-1',
    content: 'Start: chia sẻ context sớm',
    color: 'yellow',
    frame: 'shape:seed-frame-start',
    x: 10,
    y: 40,
  },
  {
    shapeId: 'shape:seed-start-2',
    content: 'Start: chốt scope trong ngày',
    color: 'blue',
    frame: 'shape:seed-frame-start',
    x: 10,
    y: 260,
  },
  {
    shapeId: 'shape:seed-start-3',
    content: 'Start: demo sớm',
    color: 'green',
    frame: 'shape:seed-frame-start',
    x: 10,
    y: 480,
  },
  {
    shapeId: 'shape:seed-stop-1',
    content: 'Stop: họp quá dài',
    color: 'red',
    frame: 'shape:seed-frame-stop',
    x: 10,
    y: 40,
  },
  {
    shapeId: 'shape:seed-stop-2',
    content: 'Stop: task không có owner',
    color: 'yellow',
    frame: 'shape:seed-frame-stop',
    x: 10,
    y: 260,
  },
  {
    shapeId: 'shape:seed-stop-3',
    content: 'Stop: blocker không được nêu',
    color: 'blue',
    frame: 'shape:seed-frame-stop',
    x: 10,
    y: 480,
  },
  {
    shapeId: 'shape:seed-continue-1',
    content: 'Continue: pair review',
    color: 'green',
    frame: 'shape:seed-frame-continue',
    x: 10,
    y: 40,
  },
  {
    shapeId: 'shape:seed-continue-2',
    content: 'Continue: viết note ngắn',
    color: 'red',
    frame: 'shape:seed-frame-continue',
    x: 10,
    y: 260,
  },
  {
    shapeId: 'shape:seed-continue-3',
    content: 'Continue: cập nhật Kanban',
    color: 'yellow',
    frame: 'shape:seed-frame-continue',
    x: 10,
    y: 480,
  },
];

async function ensureUser(email: string, name: string): Promise<UserDocument> {
  const normalized = normalizeEmail(email);
  const existing = await UserModel.findOne({ emailNormalized: normalized }).exec();
  if (existing) return existing;
  return UserModel.create({
    email,
    emailNormalized: normalized,
    name,
    passwordHash: await hashPassword(DEMO_MEMBER_PASSWORD),
  });
}

export async function seedDemoBoard(ownerEmail: string): Promise<SeedSummary> {
  const owner = await UserModel.findOne({
    emailNormalized: normalizeEmail(ownerEmail),
  }).exec();
  if (!owner) throw new Error(`Không tìm thấy seed owner ${ownerEmail}`);

  const members = [owner];
  for (const member of demoMembers) {
    members.push(await ensureUser(member.email, member.name));
  }

  let board = await BoardModel.findOne({
    name: DEMO_BOARD_NAME,
    ownerId: owner._id,
  }).exec();
  if (!board) {
    board = await BoardModel.create({
      name: DEMO_BOARD_NAME,
      ownerId: owner._id,
      members: [{ userId: owner._id, role: 'owner', joinedAt: new Date() }],
      columns: DEFAULT_COLUMNS.map((column) => ({ ...column })),
      settings: { votingLimit: 3, minVotes: 3, stalledAfterDays: 7 },
      version: 1,
    });
  } else {
    await BoardModel.updateOne(
      { _id: board._id },
      {
        $set: {
          settings: { votingLimit: 3, minVotes: 3, stalledAfterDays: 7 },
          columns: DEFAULT_COLUMNS.map((column) => ({ ...column })),
        },
      },
    );
  }

  const existingMemberIds = new Set(board.members.map((member) => member.userId.toHexString()));
  const membersToAdd = members
    .filter((member) => !existingMemberIds.has(member._id.toHexString()))
    .map((member) => ({
      userId: member._id,
      role: 'member' as const,
      joinedAt: new Date(),
    }));
  if (membersToAdd.length > 0) {
    await BoardModel.updateOne({ _id: board._id }, { $push: { members: { $each: membersToAdd } } });
    board = await BoardModel.findById(board._id).exec();
    if (!board) throw new Error('Không đọc lại được board demo');
  }

  const ownerId = owner._id;
  const memberIds = members.map((member) => member._id);
  const session = await mongoose.startSession();
  try {
    await session.withTransaction(
      async () => {
        await ActivityModel.deleteMany({ boardId: board._id }, { session });
        await VoterBudgetModel.deleteMany({ boardId: board._id }, { session });
        await TaskModel.deleteMany({ boardId: board._id }, { session });
        await ItemModel.deleteMany({ boardId: board._id }, { session });

        const createdFrames = await ItemModel.create(
          frames.map((frame, index) => ({
            boardId: board._id,
            shapeId: frame.shapeId,
            type: 'frame' as const,
            content: '',
            style: { color: frame.color },
            props: { w: 220, h: 700, name: frame.name, color: frame.color },
            position: { x: frame.x, y: frame.y },
            size: { w: 220, h: 700 },
            rotation: 0,
            tldrawIndex: `a${index + 1}`,
            parentFrameId: null,
            authorId: ownerId,
            votes: [],
            promotedTaskId: null,
            version: 1,
          })),
          { session, ordered: true },
        );
        const frameByShape = new Map(createdFrames.map((frame) => [frame.shapeId, frame]));

        const createdItems = await ItemModel.create(
          notes.map((note, index) => {
            const parentFrame = frameByShape.get(note.frame);
            if (!parentFrame) throw new Error(`Thiếu frame ${note.frame}`);
            return {
              boardId: board._id,
              shapeId: note.shapeId,
              type: 'note' as const,
              content: note.content,
              style: { color: note.color },
              props: { color: note.color },
              position: { x: note.x, y: note.y },
              size: { w: 200, h: 200 },
              rotation: 0,
              tldrawIndex: `a${frames.length + index + 1}`,
              parentFrameId: parentFrame._id,
              authorId: ownerId,
              votes:
                note.shapeId === 'shape:seed-stop-2'
                  ? memberIds.map((userId) => ({ userId, createdAt: new Date() }))
                  : note.shapeId === 'shape:seed-continue-2'
                    ? [{ userId: ownerId, createdAt: new Date() }]
                    : [],
              promotedTaskId: null,
              version: 1,
            };
          }),
          { session, ordered: true },
        );
        const byShape = new Map(createdItems.map((item) => [item.shapeId, item]));

        const taskPayloads = [
          {
            shapeId: 'shape:seed-start-1',
            columnId: 'backlog',
            order: 'a0',
            assigneeId: null,
            priority: 'medium' as const,
            title: 'Demo: chia sẻ context sớm',
          },
          {
            shapeId: 'shape:seed-stop-1',
            columnId: 'todo',
            order: 'a0',
            assigneeId: ownerId,
            priority: 'medium' as const,
            title: 'Demo: họp quá dài',
          },
          {
            shapeId: 'shape:seed-continue-1',
            columnId: 'in-progress',
            order: 'a0',
            assigneeId: null,
            priority: 'high' as const,
            title: 'Demo: pair review',
          },
          {
            shapeId: 'shape:seed-start-2',
            columnId: 'todo',
            order: 'a1',
            assigneeId: null,
            priority: 'medium' as const,
            title: 'Demo: task bị kẹt',
          },
        ];
        const tasks = await TaskModel.create(
          [
            ...taskPayloads.map((payload) => {
              const item = byShape.get(payload.shapeId);
              if (!item) throw new Error(`Thiếu item ${payload.shapeId}`);
              return {
                boardId: board._id,
                columnId: payload.columnId,
                order: payload.order,
                title: payload.title,
                description: item.content,
                assigneeId: payload.assigneeId,
                labels: [],
                priority: payload.priority,
                dueDate: null,
                lifecycle: 'active' as const,
                sourceItemId: item._id,
                origin: {
                  itemId: item._id,
                  frameId: item.parentFrameId,
                  position: { x: item.position.x, y: item.position.y },
                  voteCount: item.votes.length,
                  authorId: item.authorId,
                  itemCreatedAt: item.createdAt,
                },
                demotedAt: null,
                demotedBy: null,
                version: 1,
                createdBy: ownerId,
              };
            }),
            {
              boardId: board._id,
              columnId: 'done',
              order: 'a0',
              title: 'Demo: chốt retro',
              description: 'Task tạo tay để demo cột Done',
              assigneeId: ownerId,
              labels: ['demo'],
              priority: 'low' as const,
              dueDate: null,
              lifecycle: 'active' as const,
              sourceItemId: null,
              origin: null,
              demotedAt: null,
              demotedBy: null,
              version: 1,
              createdBy: ownerId,
            },
          ],
          { session, ordered: true },
        );

        for (let index = 0; index < taskPayloads.length; index += 1) {
          const payload = taskPayloads[index];
          const task = tasks[index];
          const item = payload ? byShape.get(payload.shapeId) : undefined;
          if (!payload || !task || !item) throw new Error('Seed task/item thiếu');
          await ItemModel.updateOne(
            { _id: item._id },
            { $set: { promotedTaskId: task._id } },
            { session },
          );
        }

        await ActivityModel.create(
          tasks.slice(0, taskPayloads.length).map((task) => ({
            boardId: board._id,
            actorId: ownerId,
            action: 'item.promoted' as const,
            refs: {
              itemId: task.sourceItemId,
              taskId: task._id,
              columnId: task.columnId,
            },
            snapshot: {
              taskTitle: task.title,
              columnId: task.columnId,
              taskVersionAtPromote: task.version,
              itemVersionAtPromote: 1,
            },
            undoableUntil: null,
          })),
          { session, ordered: true },
        );

        await VoterBudgetModel.create(
          [
            { boardId: board._id, userId: ownerId, used: 2, limit: 3, version: 1 },
            { boardId: board._id, userId: memberIds[1]!, used: 1, limit: 3, version: 1 },
            { boardId: board._id, userId: memberIds[2]!, used: 1, limit: 3, version: 1 },
          ],
          { session, ordered: true },
        );
      },
      {
        readConcern: { level: 'snapshot' },
        writeConcern: { w: 'majority', j: true },
        readPreference: 'primary',
      },
    );
  } finally {
    await session.endSession();
  }

  const stalled = await TaskModel.findOne({
    boardId: board._id,
    title: 'Demo: task bị kẹt',
  }).exec();
  if (stalled) {
    await TaskModel.collection.updateOne(
      { _id: stalled._id },
      { $set: { createdAt: new Date(Date.now() - 10 * 24 * 60 * 60 * 1000) } },
    );
  }

  return {
    boardId: board._id.toHexString(),
    items: await ItemModel.countDocuments({ boardId: board._id }),
    tasks: await TaskModel.countDocuments({ boardId: board._id }),
    activities: await ActivityModel.countDocuments({ boardId: board._id }),
    budgets: await VoterBudgetModel.countDocuments({ boardId: board._id }),
  };
}

async function main(): Promise<void> {
  loadRootEnvFile();
  const env = loadEnv();
  const logger = createLogger(env.LOG_LEVEL);
  const connection = await connectMongo({ uri: env.MONGODB_URI, logger });
  try {
    const summary = await seedDemoBoard(env.SEED_OWNER_EMAIL ?? 'owner@nextask.local');
    logger.info(summary, 'Demo seed complete');
  } finally {
    await connection.close();
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error: unknown) => {
    console.error(error);
    process.exit(1);
  });
}
