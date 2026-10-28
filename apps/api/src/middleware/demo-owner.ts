import type { NextFunction, Request, Response } from 'express';
import type { ObjectId } from 'mongoose';

export function createDemoOwnerMiddleware(ownerId: ObjectId) {
  return (request: Request, _response: Response, next: NextFunction): void => {
    request.ownerId = ownerId;
    next();
  };
}
