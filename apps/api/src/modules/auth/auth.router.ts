import type { ApiError, UserDto } from '@nextask/contracts';
import { loginRequestSchema, registerRequestSchema } from '@nextask/contracts';
import { Router, type Request, type Response } from 'express';
import { rateLimit } from 'express-rate-limit';
import { AppError } from '../../lib/errors.js';
import { loginUser, registerUser, serializeUser } from './auth.service.js';
import { createAuthenticate } from './auth.middleware.js';
import { SESSION_COOKIE_NAME, sessionCookieClearOptions, sessionCookieOptions } from './cookies.js';
import { signSessionToken } from './jwt.js';

interface AuthRouterOptions {
  jwtSecret: string;
  cookieSecure: boolean;
  authRateLimitMax: number;
}

export function createAuthRouter(options: AuthRouterOptions): Router {
  const router = Router();
  const authenticate = createAuthenticate(options.jwtSecret);
  const authLimiter = rateLimit({
    windowMs: 60_000,
    limit: options.authRateLimitMax,
    standardHeaders: true,
    legacyHeaders: false,
    handler: (request: Request, response: Response) => {
      const body: ApiError = {
        error: { code: 'RATE_LIMITED', message: 'Quá nhiều yêu cầu, thử lại sau' },
        meta: { requestId: request.requestId },
      };
      response.status(429).json(body);
    },
  });

  async function setSessionCookie(response: Response, user: { _id: { toHexString(): string } }) {
    const token = await signSessionToken(user._id.toHexString(), {
      secret: options.jwtSecret,
    });
    response.cookie(SESSION_COOKIE_NAME, token, sessionCookieOptions(options.cookieSecure));
  }

  router.post('/register', authLimiter, async (request, response) => {
    const input = registerRequestSchema.parse(request.body);
    const user = await registerUser(input);
    await setSessionCookie(response, user);

    const data: UserDto = serializeUser(user);
    response.status(201).json({
      data,
      meta: { requestId: request.requestId },
    });
  });

  router.post('/login', authLimiter, async (request, response) => {
    const input = loginRequestSchema.parse(request.body);
    const user = await loginUser(input);
    await setSessionCookie(response, user);

    const data: UserDto = serializeUser(user);
    response.json({
      data,
      meta: { requestId: request.requestId },
    });
  });

  router.post('/logout', (request, response) => {
    response.clearCookie(SESSION_COOKIE_NAME, sessionCookieClearOptions(options.cookieSecure));
    response.status(204).send();
  });

  router.get('/me', authenticate, (request, response) => {
    if (!request.user) {
      throw new AppError(401, 'UNAUTHENTICATED', 'Cần đăng nhập');
    }
    const data: UserDto = serializeUser(request.user);
    response.json({
      data,
      meta: { requestId: request.requestId },
    });
  });

  return router;
}
