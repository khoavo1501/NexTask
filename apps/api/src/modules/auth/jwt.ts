import { SignJWT, jwtVerify } from 'jose';

const encoder = new TextEncoder();

export async function signSessionToken(
  userId: string,
  options: { secret: string; ttl?: string },
): Promise<string> {
  return new SignJWT({})
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject(userId)
    .setIssuer('nextask-api')
    .setAudience('nextask-web')
    .setIssuedAt()
    .setExpirationTime(options.ttl ?? '7d')
    .sign(encoder.encode(options.secret));
}

export async function verifySessionToken(token: string, secret: string): Promise<string> {
  const { payload } = await jwtVerify(token, encoder.encode(secret), {
    issuer: 'nextask-api',
    audience: 'nextask-web',
    algorithms: ['HS256'],
  });
  if (!payload.sub) {
    throw new Error('Token thiếu subject');
  }
  return payload.sub;
}
