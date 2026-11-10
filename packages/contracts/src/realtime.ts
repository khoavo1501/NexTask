import { z } from 'zod';
import { isoDateSchema, objectIdSchema } from './common.js';

export const realtimeEventTypeSchema = z.enum([
  'item:created',
  'item:updated',
  'item:promoted',
  'item:demoted',
  'item:deleted',
  'task:created',
  'task:updated',
  'task:moved',
  'task:demoted',
  'board:resync',
]);

export const realtimeEventSchema = z.object({
  id: z.string().min(1),
  boardId: objectIdSchema,
  type: realtimeEventTypeSchema,
  version: z.number().int().nonnegative(),
  occurredAt: isoDateSchema,
  payload: z.unknown(),
});

export const presenceCursorSchema = z.object({
  x: z.number().min(0).max(1),
  y: z.number().min(0).max(1),
});

export const SOCKET_EVENTS = {
  boardJoin: 'board:join',
  boardLeave: 'board:leave',
  boardEvent: 'board:event',
  presenceList: 'presence:list',
  presenceCursor: 'presence:cursor',
} as const;

export interface PresenceParticipant {
  socketId: string;
  userId: string;
  name: string;
  color: string;
  cursor: { x: number; y: number } | null;
}

export type RealtimeEventType = z.infer<typeof realtimeEventTypeSchema>;
export type RealtimeEvent = z.infer<typeof realtimeEventSchema>;
