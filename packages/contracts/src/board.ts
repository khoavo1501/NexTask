import { z } from 'zod';
import { isoDateSchema, objectIdSchema } from './common.js';
import { envelopeMetaSchema } from './envelope.js';

export const boardColumnSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  order: z.number(),
  isDone: z.boolean(),
});

export const boardSettingsSchema = z.object({
  votingLimit: z.number().int().nonnegative(),
  minVotes: z.number().int().nonnegative(),
  stalledAfterDays: z.number().int().positive(),
});

export const boardSchema = z.object({
  _id: objectIdSchema,
  name: z.string().min(1),
  ownerId: objectIdSchema,
  columns: z.array(boardColumnSchema),
  settings: boardSettingsSchema,
  version: z.number().int().positive(),
  createdAt: isoDateSchema,
  updatedAt: isoDateSchema,
});

export const createBoardRequestSchema = z.object({
  name: z.string().trim().min(1).max(80),
});

export const boardResponseSchema = z.object({
  data: boardSchema,
  meta: envelopeMetaSchema,
});

export const boardsResponseSchema = z.object({
  data: z.array(boardSchema),
  meta: envelopeMetaSchema,
});

export type BoardDto = z.infer<typeof boardSchema>;
export type CreateBoardRequest = z.infer<typeof createBoardRequestSchema>;
