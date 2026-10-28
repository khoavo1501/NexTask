import { z } from 'zod';
import { objectIdSchema } from './common.js';
import { envelopeMetaSchema } from './envelope.js';

export const registerRequestSchema = z.object({
  email: z.string().email().max(254),
  password: z.string().min(12).max(128),
  name: z.string().trim().min(1).max(80),
});

export const loginRequestSchema = z.object({
  email: z.string().email().max(254),
  password: z.string().min(1).max(128),
});

export const userSchema = z.object({
  _id: objectIdSchema,
  email: z.string().email(),
  emailNormalized: z.string().email(),
  name: z.string(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});

export const userResponseSchema = z.object({
  data: userSchema,
  meta: envelopeMetaSchema,
});

export type RegisterRequest = z.infer<typeof registerRequestSchema>;
export type LoginRequest = z.infer<typeof loginRequestSchema>;
export type UserDto = z.infer<typeof userSchema>;
