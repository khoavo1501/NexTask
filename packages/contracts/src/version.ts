import { z } from 'zod';

export const VERSION_CONFLICT_CODE = 'VERSION_CONFLICT' as const;

export const versionConflictDetailsSchema = z.object({
  currentVersion: z.number().int().nonnegative(),
  shapeId: z.string().min(1).optional(),
});

export type VersionConflictDetails = z.infer<typeof versionConflictDetailsSchema>;
