import type { NextFunction, Request, Response } from 'express';
import type { Types } from 'mongoose';

export function createDemoOwnerMiddleware(ownerId: Types.ObjectId) {
  return (request: Request, _response: Response, next: NextFunction): void => {
    request.ownerId = ownerId;
    next();
  };
}
