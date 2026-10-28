import { z } from 'zod';
import { envelopeMetaSchema } from './envelope.js';

export const healthDataSchema = z.object({
  status: z.enum(['ok', 'degraded']),
  service: z.literal('nextask-api'),
  version: z.string().min(1),
  uptimeSeconds: z.number().nonnegative(),
  timestamp: z.string().datetime(),
  checks: z.object({
    mongo: z.object({
      status: z.enum(['ok', 'down']),
      latencyMs: z.number().nonnegative(),
      replicaSet: z.string().nullable(),
      primary: z.boolean(),
      reason: z.enum(['unreachable', 'replica_set_mismatch', 'not_primary']).optional(),
    }),
  }),
});

export const healthResponseSchema = z.object({
  data: healthDataSchema,
  meta: envelopeMetaSchema,
});

export type HealthData = z.infer<typeof healthDataSchema>;
export type HealthResponse = z.infer<typeof healthResponseSchema>;
