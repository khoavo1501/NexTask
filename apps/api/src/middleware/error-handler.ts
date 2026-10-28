import type { ApiError } from '@nextask/contracts';
import type { ErrorRequestHandler, RequestHandler } from 'express';
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
    logger.error({ err: error, requestId: request.requestId }, 'Unhandled request error');
    const body: ApiError = {
      error: { code: 'INTERNAL_ERROR', message: 'Đã xảy ra lỗi hệ thống' },
      meta: { requestId: request.requestId },
    };
    response.status(500).json(body);
  };
}
