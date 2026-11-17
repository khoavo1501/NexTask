import { z } from 'zod';
import { isoDateSchema, objectIdSchema, unknownRecordSchema } from './common.js';
import { envelopeMetaSchema } from './envelope.js';

export const activityActionSchema = z.enum([
  'item.promoted',
  'item.demoted',
  'item.promote_undone',
]);

export const activityRefsSchema = z.object({
  itemId: objectIdSchema.nullable(),
  taskId: objectIdSchema.nullable(),
  columnId: z.string().min(1).nullable(),
});

export const activitySchema = z.object({
  _id: objectIdSchema,
  boardId: objectIdSchema,
  actorId: objectIdSchema,
  action: activityActionSchema,
  refs: activityRefsSchema,
  snapshot: unknownRecordSchema,
  undoableUntil: isoDateSchema.nullable(),
  createdAt: isoDateSchema,
});

export const activitiesResponseSchema = z.object({
  data: z.array(activitySchema),
  meta: envelopeMetaSchema,
});

export const activityListQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(50),
});

export type ActivityAction = z.infer<typeof activityActionSchema>;
export type ActivityDto = z.infer<typeof activitySchema>;
export type ActivityListQuery = z.infer<typeof activityListQuerySchema>;
