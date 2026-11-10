import type { RequestHandler } from 'express';
import { AppError } from '../lib/errors.js';

const unsafeMethods = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

export function createOriginGuard(allowedOrigin: string): RequestHandler {
  return (request, _response, next) => {
    if (!unsafeMethods.has(request.method)) {
      next();
      return;
    }

    const origin = request.header('origin');
    if (origin && origin !== allowedOrigin) {
      next(new AppError(403, 'FORBIDDEN', 'Origin không được phép'));
      return;
    }

    next();
  };
}
