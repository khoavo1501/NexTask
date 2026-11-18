import { z } from 'zod';
import { isoDateSchema, objectIdSchema, unknownRecordSchema } from './common.js';
import { envelopeMetaSchema } from './envelope.js';

const pointSchema = z.object({ x: z.number(), y: z.number() });
const sizeSchema = z.object({ w: z.number().nonnegative(), h: z.number().nonnegative() });

export const itemSchema = z.object({
  _id: objectIdSchema,
  boardId: objectIdSchema,
  shapeId: z.string().min(1),
  type: z.enum(['note', 'frame']),
  content: z.string(),
  style: unknownRecordSchema,
  props: unknownRecordSchema,
  position: pointSchema,
  size: sizeSchema,
  rotation: z.number(),
  tldrawIndex: z.string().min(1),
  parentFrameId: objectIdSchema.nullable(),
  authorId: objectIdSchema,
  votes: z.array(
    z.object({
      userId: objectIdSchema,
      createdAt: isoDateSchema,
    }),
  ),
  promotedTaskId: objectIdSchema.nullable(),
  version: z.number().int().positive(),
  createdAt: isoDateSchema,
  updatedAt: isoDateSchema,
});

const syncItemBaseSchema = z.object({
  shapeId: z.string().min(1).max(200),
  position: pointSchema,
  tldrawIndex: z.string().min(1).max(100),
  parentShapeId: z.string().min(1).max(200).nullable().default(null),
  expectedVersion: z.number().int().nonnegative(),
});

const syncNoteItemInputSchema = syncItemBaseSchema.extend({
  type: z.literal('note'),
  content: z.string().max(10_000),
  style: unknownRecordSchema,
  props: unknownRecordSchema,
  size: sizeSchema,
  rotation: z.number(),
});

const syncFrameItemInputSchema = syncItemBaseSchema.extend({
  type: z.literal('frame'),
  style: unknownRecordSchema,
  props: z.object({
    w: z.number().positive(),
    h: z.number().positive(),
    name: z.string().min(1).max(200),
    color: z.string().min(1),
  }),
  size: sizeSchema,
  rotation: z.literal(0),
  parentShapeId: z.null().default(null),
});

export const syncItemInputSchema = z.discriminatedUnion('type', [
  syncNoteItemInputSchema,
  syncFrameItemInputSchema,
]);

export const syncDeletedItemInputSchema = z.object({
  shapeId: z.string().min(1).max(200),
  expectedVersion: z.number().int().positive(),
});

export const syncItemsRequestSchema = z
  .object({
    items: z.array(syncItemInputSchema).max(200),
    deleted: z.array(syncDeletedItemInputSchema).max(200).default([]),
  })
  .superRefine((value, ctx) => {
    const seen = new Set<string>();
    for (const entry of [...value.items, ...value.deleted]) {
      if (seen.has(entry.shapeId)) {
        ctx.addIssue({
          code: 'custom',
          message: `shapeId bị lặp: ${entry.shapeId}`,
          path: ['items'],
        });
        return;
      }
      seen.add(entry.shapeId);
    }
  });

export const itemsResponseSchema = z.object({
  data: z.array(itemSchema),
  meta: envelopeMetaSchema,
});

export type ItemDto = z.infer<typeof itemSchema>;
export type SyncItemInput = z.infer<typeof syncItemInputSchema>;
export type SyncDeletedItemInput = z.infer<typeof syncDeletedItemInputSchema>;
export type SyncItemsRequest = z.infer<typeof syncItemsRequestSchema>;
