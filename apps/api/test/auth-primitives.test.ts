import { describe, expect, it } from 'vitest';
import { hashPassword, verifyPassword } from '../src/modules/auth/password.js';
import { signSessionToken, verifySessionToken } from '../src/modules/auth/jwt.js';
import { SESSION_COOKIE_NAME, sessionCookieOptions } from '../src/modules/auth/cookies.js';

const secret = 'local-test-jwt-secret-at-least-32-bytes-long';

describe('auth primitives', () => {
  it('hash argon2id và verify đúng/sai', async () => {
    const hash = await hashPassword('correct horse battery staple');
    expect(hash).not.toContain('correct horse battery staple');
    await expect(verifyPassword(hash, 'correct horse battery staple')).resolves.toBe(true);
    await expect(verifyPassword(hash, 'wrong password')).resolves.toBe(false);
  });

  it('ký và verify JWT, trả userId', async () => {
    const token = await signSessionToken('000000000000000000000002', { secret });
    await expect(verifySessionToken(token, secret)).resolves.toBe('000000000000000000000002');
  });

  it('từ chối token hết hạn', async () => {
    const token = await signSessionToken('000000000000000000000002', {
      secret,
      ttl: '-1s',
    });
    await expect(verifySessionToken(token, secret)).rejects.toThrow();
  });

  it('từ chối secret sai', async () => {
    const token = await signSessionToken('000000000000000000000002', { secret });
    await expect(
      verifySessionToken(token, 'another-test-secret-at-least-32-bytes'),
    ).rejects.toThrow();
  });

  it('cookie có flag an toàn và tên ổn định', () => {
    expect(SESSION_COOKIE_NAME).toBe('nextask_session');
    expect(sessionCookieOptions(false)).toMatchObject({
      httpOnly: true,
      sameSite: 'lax',
      secure: false,
      path: '/',
      maxAge: 604800000,
    });
    expect(sessionCookieOptions(true).secure).toBe(true);
  });
});
