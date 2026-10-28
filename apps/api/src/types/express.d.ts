import type { Types } from 'mongoose';
import type { UserDocument } from '../modules/users/user.model.js';

declare global {
  namespace Express {
    interface Request {
      requestId: string;
      ownerId: Types.ObjectId;
      user?: UserDocument;
    }
  }
}

export {};
