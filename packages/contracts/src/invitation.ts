import { z } from 'zod';
import { boardSchema } from './board.js';
import { isoDateSchema } from './common.js';
import { envelopeMetaSchema } from './envelope.js';

export const createInvitationRequestSchema = z.object({
  email: z.string().email().max(254).optional(),
});

export const invitationCreateResponseSchema = z.object({
  data: z.object({
    token: z.string().min(1),
    path: z.string().min(1),
    expiresAt: isoDateSchema,
  }),
  meta: envelopeMetaSchema,
});

export const invitationAcceptResponseSchema = z.object({
  data: boardSchema,
  meta: envelopeMetaSchema,
});

export type CreateInvitationRequest = z.infer<typeof createInvitationRequestSchema>;
export type InvitationCreateResponse = z.infer<typeof invitationCreateResponseSchema>;
