import type { NextFunction, Request, Response } from 'express';
import { Types } from 'mongoose';
import { AppError } from '../../lib/errors.js';
import { UserModel } from '../users/user.model.js';
import { SESSION_COOKIE_NAME } from './cookies.js';
import { verifySessionToken } from './jwt.js';

export function createAuthenticate(jwtSecret: string) {
  return async (request: Request, _response: Response, next: NextFunction): Promise<void> => {
    try {
      const token = request.cookies?.[SESSION_COOKIE_NAME] as string | undefined;
      if (!token) {
        throw new AppError(401, 'UNAUTHENTICATED', 'Cần đăng nhập');
      }

      const userId = await verifySessionToken(token, jwtSecret);
      if (!Types.ObjectId.isValid(userId)) {
        throw new AppError(401, 'UNAUTHENTICATED', 'Phiên đăng nhập không hợp lệ');
      }

      const user = await UserModel.findById(userId).exec();
      if (!user) {
        throw new AppError(401, 'UNAUTHENTICATED', 'Phiên đăng nhập không hợp lệ');
      }

      request.user = user;
      next();
    } catch (error) {
      if (error instanceof AppError) {
        next(error);
        return;
      }
      next(new AppError(401, 'UNAUTHENTICATED', 'Phiên đăng nhập không hợp lệ'));
    }
  };
}
