import { z } from 'zod';
import { isoDateSchema, objectIdSchema } from './common.js';
import { envelopeMetaSchema } from './envelope.js';
import { itemSchema } from './item.js';

export const taskOriginSchema = z.object({
  itemId: objectIdSchema,
  frameId: objectIdSchema.nullable(),
  position: z.object({ x: z.number(), y: z.number() }),
  voteCount: z.number().int().nonnegative(),
  authorId: objectIdSchema,
  itemCreatedAt: isoDateSchema,
});

export const taskPrioritySchema = z.enum(['low', 'medium', 'high', 'urgent']);

export const taskSchema = z.object({
  _id: objectIdSchema,
  boardId: objectIdSchema,
  columnId: z.string().min(1),
  order: z.string().min(1),
  title: z.string().min(1),
  description: z.string(),
  assigneeId: objectIdSchema.nullable(),
  labels: z.array(z.string()),
  priority: taskPrioritySchema,
  dueDate: isoDateSchema.nullable(),
  lifecycle: z.literal('active'),
  sourceItemId: objectIdSchema.nullable(),
  origin: taskOriginSchema.nullable(),
  version: z.number().int().positive(),
  createdBy: objectIdSchema,
  createdAt: isoDateSchema,
  updatedAt: isoDateSchema,
});

export const promoteRequestSchema = z.object({
  columnId: z.string().min(1),
  assignToMe: z.boolean().default(false),
  expectedItemVersion: z.number().int().positive(),
});

export const moveTaskRequestSchema = z.object({
  columnId: z.string().min(1),
  beforeTaskId: objectIdSchema.nullable().default(null),
  expectedVersion: z.number().int().positive(),
});

export const createTaskRequestSchema = z.object({
  columnId: z.string().min(1).max(50),
  title: z.string().trim().min(1).max(200),
  description: z.string().max(5000).optional(),
  assigneeId: objectIdSchema.nullable().optional(),
  labels: z.array(z.string().trim().min(1).max(50)).max(10).optional(),
  priority: taskPrioritySchema.optional(),
  dueDate: isoDateSchema.nullable().optional(),
});

export const updateTaskRequestSchema = z
  .object({
    title: z.string().trim().min(1).max(200).optional(),
    description: z.string().max(5000).optional(),
    assigneeId: objectIdSchema.nullable().optional(),
    labels: z.array(z.string().trim().min(1).max(50)).max(10).optional(),
    priority: taskPrioritySchema.optional(),
    dueDate: isoDateSchema.nullable().optional(),
    expectedVersion: z.number().int().positive(),
  })
  .refine(
    (value) =>
      value.title !== undefined ||
      value.description !== undefined ||
      value.assigneeId !== undefined ||
      value.labels !== undefined ||
      value.priority !== undefined ||
      value.dueDate !== undefined,
    { message: 'Cần ít nhất một trường để cập nhật' },
  );

export const taskListQuerySchema = z.object({
  columnId: z.string().min(1).max(50).optional(),
  assigneeId: z.union([objectIdSchema, z.literal('none')]).optional(),
  priority: taskPrioritySchema.optional(),
  labels: z.string().max(500).optional(),
  q: z.string().trim().max(100).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(100),
});

export const tasksListResponseSchema = z.object({
  data: z.array(taskSchema),
  meta: envelopeMetaSchema.extend({ hasMore: z.boolean() }),
});

export const tasksResponseSchema = z.object({
  data: z.array(taskSchema),
  meta: envelopeMetaSchema,
});

export const taskResponseSchema = z.object({
  data: taskSchema,
  meta: envelopeMetaSchema,
});

export const promoteResponseSchema = z.object({
  data: z.object({
    item: itemSchema,
    task: taskSchema,
  }),
  meta: envelopeMetaSchema,
});

export type TaskDto = z.infer<typeof taskSchema>;
export type TaskPriority = z.infer<typeof taskPrioritySchema>;
export type TaskListQuery = z.infer<typeof taskListQuerySchema>;
export type PromoteRequest = z.infer<typeof promoteRequestSchema>;
export type MoveTaskRequest = z.infer<typeof moveTaskRequestSchema>;
export type CreateTaskRequest = z.infer<typeof createTaskRequestSchema>;
export type UpdateTaskRequest = z.infer<typeof updateTaskRequestSchema>;
