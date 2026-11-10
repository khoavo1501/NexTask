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

export const boardMemberSchema = z.object({
  userId: objectIdSchema,
  role: z.enum(['owner', 'member']),
  joinedAt: isoDateSchema,
});

export const boardSchema = z.object({
  _id: objectIdSchema,
  name: z.string().min(1),
  ownerId: objectIdSchema,
  members: z.array(boardMemberSchema),
  viewerRole: z.enum(['owner', 'member']),
  columns: z.array(boardColumnSchema),
  settings: boardSettingsSchema,
  version: z.number().int().positive(),
  createdAt: isoDateSchema,
  updatedAt: isoDateSchema,
});

export const createBoardRequestSchema = z.object({
  name: z.string().trim().min(1).max(80),
});

export const renameBoardRequestSchema = z.object({
  name: z.string().trim().min(1).max(80),
  expectedVersion: z.number().int().positive(),
});

export const updateColumnsRequestSchema = z
  .object({
    columns: z
      .array(
        z.object({
          id: z.string().min(1).max(64).optional(),
          name: z.string().trim().min(1).max(60),
          isDone: z.boolean(),
        }),
      )
      .min(1)
      .max(12),
    expectedVersion: z.number().int().positive(),
  })
  .superRefine((value, ctx) => {
    const ids = value.columns.flatMap((column) => (column.id ? [column.id] : []));
    if (new Set(ids).size !== ids.length) {
      ctx.addIssue({
        code: 'custom',
        message: 'Id cột bị lặp',
        path: ['columns'],
      });
    }
    if (value.columns.filter((column) => column.isDone).length !== 1) {
      ctx.addIssue({
        code: 'custom',
        message: 'Phải có đúng một cột Done',
        path: ['columns'],
      });
    }
  });

export const boardMemberDetailSchema = boardMemberSchema.extend({
  name: z.string(),
  email: z.string().email(),
});

export const boardResponseSchema = z.object({
  data: boardSchema,
  meta: envelopeMetaSchema,
});

export const boardsResponseSchema = z.object({
  data: z.array(boardSchema),
  meta: envelopeMetaSchema,
});

export const boardMembersResponseSchema = z.object({
  data: z.array(boardMemberDetailSchema),
  meta: envelopeMetaSchema,
});

export type BoardDto = z.infer<typeof boardSchema>;
export type BoardMemberDto = z.infer<typeof boardMemberSchema>;
export type BoardMemberDetailDto = z.infer<typeof boardMemberDetailSchema>;
export type CreateBoardRequest = z.infer<typeof createBoardRequestSchema>;
export type RenameBoardRequest = z.infer<typeof renameBoardRequestSchema>;
export type UpdateColumnsRequest = z.infer<typeof updateColumnsRequestSchema>;
