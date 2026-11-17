import { z } from 'zod';
import { objectIdSchema } from './common.js';
import { envelopeMetaSchema } from './envelope.js';

export const reportQuerySchema = z.object({
  minVotes: z.coerce.number().int().min(0).max(1000).optional(),
  stalledDays: z.coerce.number().int().min(1).max(365).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
});

export const reportIdeaSchema = z.object({
  itemId: objectIdSchema,
  shapeId: z.string().min(1),
  content: z.string(),
  voteCount: z.number().int().nonnegative(),
  createdAt: z.string().datetime(),
});

export const reportTaskSchema = z.object({
  taskId: objectIdSchema,
  title: z.string(),
  columnId: z.string(),
  createdAt: z.string().datetime(),
  sourceItem: z
    .object({
      itemId: objectIdSchema,
      shapeId: z.string().min(1),
      content: z.string(),
    })
    .nullable(),
});

export const reportResponseSchema = z.object({
  data: z.object({
    unpromotedIdeas: z.array(reportIdeaSchema),
    stalledTasks: z.array(reportTaskSchema),
    summary: z.object({
      unpromotedIdeas: z.number().int().nonnegative(),
      stalledTasks: z.number().int().nonnegative(),
    }),
    params: z.object({
      minVotes: z.number().int().nonnegative(),
      stalledDays: z.number().int().positive(),
      limit: z.number().int().positive(),
    }),
  }),
  meta: envelopeMetaSchema,
});

export type StalledIdeasReportDto = z.infer<typeof reportResponseSchema>['data'];
