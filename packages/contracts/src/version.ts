import { z } from 'zod';

export const VERSION_CONFLICT_CODE = 'VERSION_CONFLICT' as const;
export const ORDER_CONFLICT_CODE = 'ORDER_CONFLICT' as const;

export const versionConflictDetailsSchema = z.object({
  currentVersion: z.number().int().nonnegative(),
  shapeId: z.string().min(1).optional(),
});

export const orderConflictDetailsSchema = z.object({
  columnId: z.string().min(1),
});

export type VersionConflictDetails = z.infer<typeof versionConflictDetailsSchema>;
export type OrderConflictDetails = z.infer<typeof orderConflictDetailsSchema>;
