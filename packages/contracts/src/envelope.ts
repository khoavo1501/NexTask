import { z } from 'zod';

export const envelopeMetaSchema = z.object({
  requestId: z.string().min(1),
});

export const apiErrorSchema = z.object({
  error: z.object({
    code: z.string().min(1),
    message: z.string().min(1),
    details: z.unknown().optional(),
  }),
  meta: envelopeMetaSchema,
});

export type ApiError = z.infer<typeof apiErrorSchema>;
