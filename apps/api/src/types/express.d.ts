import type { BoardDocument } from '../modules/boards/board.model.js';
import type { UserDocument } from '../modules/users/user.model.js';

declare global {
  namespace Express {
    interface Request {
      requestId: string;
      user?: UserDocument;
      board?: BoardDocument;
      boardRole?: 'owner' | 'member';
    }
  }
}

export {};
