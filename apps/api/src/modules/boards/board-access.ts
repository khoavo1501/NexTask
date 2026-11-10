import type { NextFunction, Request, Response } from 'express';
import { AppError } from '../../lib/errors.js';
import { findByMember } from './board.service.js';

export async function loadBoardAccess(
  request: Request,
  _response: Response,
  next: NextFunction,
): Promise<void> {
  try {
    if (!request.user) {
      throw new AppError(401, 'UNAUTHENTICATED', 'Cần đăng nhập');
    }

    const boardId = request.params.boardId;
    if (typeof boardId !== 'string' || !boardId) {
      throw new AppError(404, 'NOT_FOUND', 'Không tìm thấy board');
    }

    const access = await findByMember(boardId, request.user._id);
    if (!access) {
      throw new AppError(404, 'NOT_FOUND', 'Không tìm thấy board');
    }

    request.board = access.board;
    request.boardRole = access.role;
    next();
  } catch (error) {
    next(error);
  }
}

export function requireOwner(request: Request, _response: Response, next: NextFunction): void {
  if (request.boardRole !== 'owner') {
    next(new AppError(403, 'FORBIDDEN', 'Chỉ Owner được thực hiện thao tác này'));
    return;
  }
  next();
}
