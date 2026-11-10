import { z } from 'zod';
import { activitySchema } from './activity.js';
import { objectIdSchema } from './common.js';
import { envelopeMetaSchema } from './envelope.js';
import { itemSchema } from './item.js';
import { taskSchema } from './task.js';

export const BATCH_PROMOTE_CONFLICT_CODE = 'BATCH_PROMOTE_CONFLICT' as const;
export const UNDO_NOT_AVAILABLE_CODE = 'UNDO_NOT_AVAILABLE' as const;
export const UNDO_NO_LONGER_SAFE_CODE = 'UNDO_NO_LONGER_SAFE' as const;

export const batchPromoteItemSchema = z.object({
  itemId: objectIdSchema,
  expectedItemVersion: z.number().int().positive(),
});

export const batchPromoteRequestSchema = z
  .object({
    columnId: z.string().min(1).max(50),
    assignToMe: z.boolean().default(false),
    items: z.array(batchPromoteItemSchema).min(1).max(100),
  })
  .superRefine((value, ctx) => {
    const seen = new Set<string>();
    for (const item of value.items) {
      if (seen.has(item.itemId)) {
        ctx.addIssue({
          code: 'custom',
          message: `itemId bị lặp: ${item.itemId}`,
          path: ['items'],
        });
        return;
      }
      seen.add(item.itemId);
    }
  });

export const batchPromoteConflictDetailsSchema = z.object({
  errors: z.array(
    z.object({
      itemId: objectIdSchema,
      shapeId: z.string().optional(),
      code: z.enum(['NOT_FOUND', 'ALREADY_PROMOTED', 'VERSION_CONFLICT', 'NOT_A_NOTE']),
      currentVersion: z.number().int().nonnegative().optional(),
      message: z.string().min(1),
    }),
  ),
});

export const batchPromoteResponseSchema = z.object({
  data: z.object({
    items: z.array(itemSchema),
    tasks: z.array(taskSchema),
    activities: z.array(activitySchema),
  }),
  meta: envelopeMetaSchema,
});

export const undoPromoteResponseSchema = z.object({
  data: z.object({
    task: taskSchema,
    item: itemSchema,
    activity: activitySchema,
  }),
  meta: envelopeMetaSchema,
});

export type BatchPromoteItem = z.infer<typeof batchPromoteItemSchema>;
export type BatchPromoteRequest = z.infer<typeof batchPromoteRequestSchema>;
export type BatchPromoteConflictDetails = z.infer<typeof batchPromoteConflictDetailsSchema>;
