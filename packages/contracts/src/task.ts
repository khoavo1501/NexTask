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

export const taskSchema = z.object({
  _id: objectIdSchema,
  boardId: objectIdSchema,
  columnId: z.string().min(1),
  order: z.string().min(1),
  title: z.string().min(1),
  description: z.string(),
  assigneeId: objectIdSchema.nullable(),
  labels: z.array(z.string()),
  priority: z.enum(['low', 'medium', 'high', 'urgent']),
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
  expectedVersion: z.number().int().positive(),
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
export type PromoteRequest = z.infer<typeof promoteRequestSchema>;
export type MoveTaskRequest = z.infer<typeof moveTaskRequestSchema>;
