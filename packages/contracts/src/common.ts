import { z } from 'zod';

export const objectIdSchema = z.string().regex(/^[a-f0-9]{24}$/i, 'ObjectId không hợp lệ');
export const isoDateSchema = z.string().datetime();
export const unknownRecordSchema = z.record(z.string(), z.unknown());
