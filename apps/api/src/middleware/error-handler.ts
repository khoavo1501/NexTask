import type { ApiError } from '@nextask/contracts';
import type { ErrorRequestHandler, RequestHandler } from 'express';
import { ZodError } from 'zod';
import { AppError } from '../lib/errors.js';
import type { Logger } from '../lib/logger.js';

export const notFoundHandler: RequestHandler = (request, response) => {
  const body: ApiError = {
    error: { code: 'NOT_FOUND', message: 'Không tìm thấy tài nguyên' },
    meta: { requestId: request.requestId },
  };
  response.status(404).json(body);
};

export function createErrorHandler(logger: Logger): ErrorRequestHandler {
  return (error, request, response, _next) => {
    if (error instanceof ZodError) {
      const body: ApiError = {
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Dữ liệu không hợp lệ',
          details: { issues: error.issues },
        },
        meta: { requestId: request.requestId },
      };
      response.status(422).json(body);
      return;
    }

    if (error instanceof AppError) {
      const body: ApiError = {
        error: {
          code: error.code,
          message: error.message,
          ...(error.details === undefined ? {} : { details: error.details }),
        },
        meta: { requestId: request.requestId },
      };
      response.status(error.status).json(body);
      return;
    }

    if ((error as { code?: number }).code === 11_000) {
      const body: ApiError = {
        error: { code: 'ALREADY_PROMOTED', message: 'Item đã được promote' },
        meta: { requestId: request.requestId },
      };
      response.status(409).json(body);
      return;
    }

    logger.error({ err: error, requestId: request.requestId }, 'Unhandled request error');
    const body: ApiError = {
      error: { code: 'INTERNAL_ERROR', message: 'Đã xảy ra lỗi hệ thống' },
      meta: { requestId: request.requestId },
    };
    response.status(500).json(body);
  };
}
