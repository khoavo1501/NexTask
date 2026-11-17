import { z } from 'zod';
import { objectIdSchema } from './common.js';
import { envelopeMetaSchema } from './envelope.js';
import { itemSchema } from './item.js';

export const ALREADY_VOTED_CODE = 'ALREADY_VOTED' as const;
export const NOT_VOTED_CODE = 'NOT_VOTED' as const;
export const VOTE_LIMIT_REACHED_CODE = 'VOTE_LIMIT_REACHED' as const;

export const voterBudgetSchema = z.object({
  used: z.number().int().nonnegative(),
  limit: z.number().int().nonnegative(),
});

export const voteResponseSchema = z.object({
  data: z.object({
    item: itemSchema,
    budget: voterBudgetSchema,
  }),
  meta: envelopeMetaSchema,
});

export const voteResultsQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(50),
});

export const voteResultItemSchema = z.object({
  itemId: objectIdSchema,
  shapeId: z.string().min(1),
  content: z.string(),
  voteCount: z.number().int().nonnegative(),
  voters: z.array(objectIdSchema),
  promotedTaskId: objectIdSchema.nullable(),
  createdAt: z.string().datetime(),
});

export const voteUsageSchema = z.object({
  userId: objectIdSchema,
  used: z.number().int().nonnegative(),
  limit: z.number().int().nonnegative(),
});

export const voteResultsResponseSchema = z.object({
  data: z.object({
    items: z.array(voteResultItemSchema),
    usage: z.array(voteUsageSchema),
    viewer: voteUsageSchema,
  }),
  meta: envelopeMetaSchema,
});

export type VoterBudgetDto = z.infer<typeof voterBudgetSchema>;
export type VoteResultsDto = z.infer<typeof voteResultsResponseSchema>['data'];
