import type { CookieOptions } from 'express';

export const SESSION_COOKIE_NAME = 'nextask_session';
export const SESSION_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;

export function sessionCookieOptions(secure: boolean): CookieOptions {
  return {
    httpOnly: true,
    sameSite: 'lax',
    secure,
    path: '/',
    maxAge: SESSION_MAX_AGE_MS,
  };
}
