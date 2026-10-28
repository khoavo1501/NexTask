import type { Types } from 'mongoose';

declare global {
  namespace Express {
    interface Request {
      requestId: string;
      ownerId: Types.ObjectId;
    }
  }
}

export {};
