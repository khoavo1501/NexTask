import type { ObjectId } from 'mongoose';

declare global {
  namespace Express {
    interface Request {
      requestId: string;
      ownerId: ObjectId;
    }
  }
}

export {};
